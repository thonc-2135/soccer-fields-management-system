import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { buildMeta } from '../../common/dto/pagination-query.dto.js';
import { FieldStatus } from '../../common/enums/field-status.enum.js';
import type { PaginatedResult } from '../../common/interceptors/response.interceptor.js';
import { escapeLike } from '../../common/utils/escape-like.util.js';
import { FilesService } from '../../files/files.service.js';
import { MAX_FILES_PER_REQUEST } from '../../files/image-upload.options.js';
import { FieldImage } from '../entities/field-image.entity.js';
import { FieldPrice } from '../entities/field-price.entity.js';
import { FieldType } from '../entities/field-type.entity.js';
import { Field } from '../entities/field.entity.js';
import { FieldsService } from '../fields.service.js';
import { toHHmm, type FieldDetail } from '../mappers/field-response.mapper.js';
import {
  openingHoursValid,
  priceWindowsError,
  type TimeWindow,
} from '../utils/price-windows.util.js';
import type { CreateFieldDto, UpdateFieldDto } from './dto/create-field.dto.js';
import type { ListAdminFieldsQueryDto } from './dto/list-admin-fields-query.dto.js';
import type { PriceWindowDto } from './dto/price-window.dto.js';

export const MAX_IMAGES_PER_FIELD = 10;

export interface AdminFieldListItem {
  id: number;
  name: string;
  address: string;
  status: FieldStatus;
  type: { id: number; name: string };
  openTime: string;
  closeTime: string;
  thumbnail: string | null;
  avgRating: number;
  reviewCount: number;
  createdAt: Date;
}

@Injectable()
export class AdminFieldsService {
  constructor(
    @InjectRepository(Field) private readonly fields: Repository<Field>,
    @InjectRepository(FieldImage)
    private readonly images: Repository<FieldImage>,
    private readonly dataSource: DataSource,
    private readonly fieldsService: FieldsService,
    private readonly files: FilesService,
  ) {}

  async create(dto: CreateFieldDto): Promise<FieldDetail> {
    const open = dto.openTime ?? '06:00';
    const close = dto.closeTime ?? '23:00';
    this.assertHoursAndPrices(open, close, dto.prices);
    if (dto.typeId !== undefined && dto.type)
      throw new BadRequestException('errors.FIELD_TYPE_AMBIGUOUS');
    if (dto.typeId === undefined && !dto.type)
      throw new BadRequestException('errors.FIELD_TYPE_REQUIRED');

    const id = await this.dataSource.transaction(async (m) => {
      const typeId = dto.type
        ? await this.createType(m, dto.type)
        : await this.requireType(m, dto.typeId!);
      const field = await m.save(
        m.create(Field, {
          typeId,
          name: dto.name,
          description: dto.description ?? null,
          address: dto.address,
          openTime: open,
          closeTime: close,
          status: dto.status ?? FieldStatus.ACTIVE,
        }),
      );
      await this.insertPrices(m, field.id, dto.prices);
      return field.id;
    });
    return this.fieldsService.findDetail(id, undefined, false);
  }

  async findAll(
    q: ListAdminFieldsQueryDto,
  ): Promise<PaginatedResult<AdminFieldListItem>> {
    const qb = this.fields
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.type', 't');
    if (q.keyword) {
      qb.andWhere(
        '(immutable_unaccent(f.name) ILIKE immutable_unaccent(:kw) OR immutable_unaccent(f.address) ILIKE immutable_unaccent(:kw))',
        { kw: `%${escapeLike(q.keyword)}%` },
      );
    }
    if (q.status) qb.andWhere('f.status = :status', { status: q.status });
    if (q.typeId) qb.andWhere('f.type_id = :typeId', { typeId: q.typeId });

    const [rows, total] = await qb
      .orderBy('f.created_at', 'DESC')
      .addOrderBy('f.id', 'DESC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getManyAndCount();

    const thumbnails = await this.fieldsService.thumbnailsFor(
      rows.map((r) => r.id),
    );
    return {
      data: rows.map((f) => ({
        id: f.id,
        name: f.name,
        address: f.address,
        status: f.status,
        type: { id: f.type.id, name: f.type.name },
        openTime: toHHmm(f.openTime),
        closeTime: toHHmm(f.closeTime),
        thumbnail: thumbnails.get(f.id) ?? null,
        avgRating: f.avgRating,
        reviewCount: f.reviewCount,
        createdAt: f.createdAt,
      })),
      meta: buildMeta(q.page, q.limit, total),
    };
  }

  findOne(id: number): Promise<FieldDetail> {
    return this.fieldsService.findDetail(id, undefined, false);
  }

  async update(id: number, dto: UpdateFieldDto): Promise<FieldDetail> {
    const field = await this.getField(id);
    const open = dto.openTime ?? toHHmm(field.openTime);
    const close = dto.closeTime ?? toHHmm(field.closeTime);

    await this.dataSource.transaction(async (m) => {
      if (dto.typeId !== undefined) await this.requireType(m, dto.typeId);

      // hours and prices must stay consistent, so check them against the final state
      const prices: TimeWindow[] =
        dto.prices ?? (await m.find(FieldPrice, { where: { fieldId: id } }));
      this.assertHoursAndPrices(open, close, prices);

      const columns = {
        name: dto.name,
        description: dto.description,
        address: dto.address,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
        status: dto.status,
        typeId: dto.typeId,
      };
      // undefined values are skipped by TypeORM; with nothing to change there is no UPDATE
      if (Object.values(columns).some((v) => v !== undefined)) {
        await m.update(Field, { id }, columns);
      }
      if (dto.prices) await this.replacePricesIn(m, id, dto.prices);
    });
    return this.fieldsService.findDetail(id, undefined, false);
  }

  async replacePrices(
    id: number,
    prices: PriceWindowDto[],
  ): Promise<FieldDetail> {
    const field = await this.getField(id);
    this.assertHoursAndPrices(
      toHHmm(field.openTime),
      toHHmm(field.closeTime),
      prices,
    );
    await this.dataSource.transaction((m) =>
      this.replacePricesIn(m, id, prices),
    );
    return this.fieldsService.findDetail(id, undefined, false);
  }

  /** Soft delete; refused while a PENDING / APPROVED booking in the future still depends on it. */
  async remove(id: number): Promise<void> {
    await this.getField(id);
    await this.dataSource.transaction(async (manager) => {
      // booking creation share-locks the field row, so after this lock every in-flight booking is visible below
      await manager
        .createQueryBuilder(Field, 'field')
        .where('field.id = :id', { id })
        .setLock('pessimistic_write')
        .getOne();
      const blocking = await manager.query(
        `SELECT 1 FROM bookings
         WHERE field_id = $1 AND status IN ('PENDING', 'APPROVED') AND booking_date >= CURRENT_DATE
         LIMIT 1`,
        [id],
      );
      if (blocking.length)
        throw new UnprocessableEntityException(
          'errors.FIELD_HAS_ACTIVE_BOOKINGS',
        );
      await manager.softDelete(Field, { id });
    });
  }

  async addImages(
    id: number,
    files: Express.Multer.File[],
  ): Promise<FieldImage[]> {
    await this.getField(id);
    if (!files?.length) throw new BadRequestException('errors.NO_FILES');
    const existing = await this.images.count({ where: { fieldId: id } });
    if (existing + files.length > MAX_IMAGES_PER_FIELD) {
      throw new UnprocessableEntityException('errors.TOO_MANY_IMAGES');
    }
    if (files.length > MAX_FILES_PER_REQUEST)
      throw new BadRequestException('errors.TOO_MANY_IMAGES');

    const urls: string[] = [];
    try {
      for (const file of files)
        urls.push(await this.files.saveImage(file.buffer, `fields/${id}`));
      return await this.dataSource.transaction(async (m) => {
        const { max } = (
          await m.query(
            `SELECT COALESCE(MAX(sort_order), 0) AS max FROM field_images WHERE field_id = $1`,
            [id],
          )
        )[0] as { max: number };
        const hasThumbnail = await m.exists(FieldImage, {
          where: { fieldId: id, isThumbnail: true },
        });
        return m.save(
          urls.map((url, i) =>
            m.create(FieldImage, {
              fieldId: id,
              url,
              sortOrder: Number(max) + i + 1,
              isThumbnail: !hasThumbnail && i === 0,
            }),
          ),
        );
      });
    } catch (err) {
      await Promise.allSettled(urls.map((u) => this.files.deleteByUrl(u))); // no orphan files
      throw err;
    }
  }

  async removeImage(fieldId: number, imageId: number): Promise<void> {
    const image = await this.getImage(fieldId, imageId);
    await this.dataSource.transaction(async (m) => {
      await m.delete(FieldImage, { id: imageId });
      if (image.isThumbnail) {
        // promote the next image so the field keeps a thumbnail
        const next = await m.findOne(FieldImage, {
          where: { fieldId },
          order: { sortOrder: 'ASC', id: 'ASC' },
        });
        if (next)
          await m.update(FieldImage, { id: next.id }, { isThumbnail: true });
      }
    });
    await this.files.deleteByUrl(image.url);
  }

  async setThumbnail(fieldId: number, imageId: number): Promise<void> {
    await this.getImage(fieldId, imageId);
    await this.dataSource.transaction(async (m) => {
      await m.update(FieldImage, { fieldId }, { isThumbnail: false });
      await m.update(FieldImage, { id: imageId }, { isThumbnail: true });
    });
  }

  private async getField(id: number): Promise<Field> {
    const field = await this.fields.findOne({ where: { id } });
    if (!field) throw new NotFoundException('errors.FIELD_NOT_FOUND');
    return field;
  }

  private async getImage(
    fieldId: number,
    imageId: number,
  ): Promise<FieldImage> {
    const image = await this.images.findOne({
      where: { id: imageId, fieldId },
    });
    if (!image) throw new NotFoundException('errors.IMAGE_NOT_FOUND');
    return image;
  }

  private assertHoursAndPrices(
    open: string,
    close: string,
    prices: TimeWindow[],
  ): void {
    if (!openingHoursValid(open, close))
      throw new UnprocessableEntityException('errors.INVALID_OPENING_HOURS');
    const problem = priceWindowsError(prices, open, close);
    if (problem)
      throw new UnprocessableEntityException(`errors.PRICE_WINDOWS_${problem}`);
  }

  private async replacePricesIn(
    m: EntityManager,
    fieldId: number,
    prices: PriceWindowDto[],
  ): Promise<void> {
    await m.delete(FieldPrice, { fieldId });
    await this.insertPrices(m, fieldId, prices);
  }

  private async insertPrices(
    m: EntityManager,
    fieldId: number,
    prices: PriceWindowDto[],
  ): Promise<void> {
    await m.insert(
      FieldPrice,
      prices.map((p) => ({
        fieldId,
        startTime: p.startTime,
        endTime: p.endTime,
        price: p.price,
      })),
    );
  }

  private async requireType(m: EntityManager, typeId: number): Promise<number> {
    if (!(await m.exists(FieldType, { where: { id: typeId } }))) {
      throw new NotFoundException('errors.FIELD_TYPE_NOT_FOUND');
    }
    return typeId;
  }

  private async createType(
    m: EntityManager,
    dto: { name: string; capacity: number; description?: string },
  ): Promise<number> {
    if (await m.exists(FieldType, { where: { name: dto.name } })) {
      throw new ConflictException('errors.FIELD_TYPE_NAME_TAKEN');
    }
    const type = await m.save(
      m.create(FieldType, {
        name: dto.name,
        capacity: dto.capacity,
        description: dto.description ?? null,
      }),
    );
    return type.id;
  }
}
