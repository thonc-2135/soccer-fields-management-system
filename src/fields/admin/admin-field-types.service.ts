import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldType } from '../entities/field-type.entity.js';
import { Field } from '../entities/field.entity.js';
import type {
  CreateFieldTypeDto,
  UpdateFieldTypeDto,
} from './dto/field-type.dto.js';

@Injectable()
export class AdminFieldTypesService {
  constructor(
    @InjectRepository(FieldType) private readonly types: Repository<FieldType>,
    @InjectRepository(Field) private readonly fields: Repository<Field>,
  ) {}

  async create(dto: CreateFieldTypeDto): Promise<FieldType> {
    await this.assertNameFree(dto.name);
    return this.types.save(
      this.types.create({
        name: dto.name,
        capacity: dto.capacity,
        description: dto.description ?? null,
      }),
    );
  }

  async update(id: number, dto: UpdateFieldTypeDto): Promise<FieldType> {
    const type = await this.get(id);
    if (dto.name !== undefined && dto.name !== type.name)
      await this.assertNameFree(dto.name);
    return this.types.save(Object.assign(type, dto));
  }

  async remove(id: number): Promise<void> {
    await this.get(id);
    // soft-deleted fields still reference the type (FK), so they count too
    if (
      await this.fields.exists({ where: { typeId: id }, withDeleted: true })
    ) {
      throw new ConflictException('errors.FIELD_TYPE_IN_USE');
    }
    await this.types.delete({ id });
  }

  private async get(id: number): Promise<FieldType> {
    const type = await this.types.findOne({ where: { id } });
    if (!type) throw new NotFoundException('errors.FIELD_TYPE_NOT_FOUND');
    return type;
  }

  private async assertNameFree(name: string): Promise<void> {
    if (await this.types.exists({ where: { name } }))
      throw new ConflictException('errors.FIELD_TYPE_NAME_TAKEN');
  }
}
