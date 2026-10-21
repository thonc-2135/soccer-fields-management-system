import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const FIELD_SORTS = [
  'createdAt:desc',
  'name:asc',
  'price:asc',
  'price:desc',
  'rating:desc',
] as const;
export type FieldSort = (typeof FIELD_SORTS)[number];

const toIntList = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value !== ''
    ? value.split(',').map((v) => Number(v.trim()))
    : undefined;

export class ListFieldsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches field name or address' })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(100, { message: m('validation.MAX_LENGTH') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  keyword?: string;

  @ApiPropertyOptional({
    description: 'Field type id(s), comma separated: 1,2',
    type: String,
  })
  @IsOptional()
  @Transform(toIntList)
  @IsArray({ message: m('validation.IS_INT') })
  @ArrayMaxSize(20, { message: m('validation.MAX') })
  @IsInt({ each: true, message: m('validation.IS_INT') })
  typeId?: number[];

  @ApiPropertyOptional({
    description:
      'Keep fields whose price range reaches at least this value (VND/hour)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: m('validation.IS_INT') })
  @Min(0, { message: m('validation.MIN') })
  minPrice?: number;

  @ApiPropertyOptional({
    description:
      'Keep fields whose cheapest price is at most this value (VND/hour)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: m('validation.IS_INT') })
  @Min(0, { message: m('validation.MIN') })
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: m('validation.IS_INT') })
  @Min(0, { message: m('validation.MIN') })
  @Max(5, { message: m('validation.MAX') })
  minRating?: number;

  @ApiPropertyOptional({
    example: '2026-11-01',
    description: 'Only fields with a free slot that day',
  })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: m('validation.IS_DATE') })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: m('validation.IS_DATE') })
  date?: string;

  @ApiPropertyOptional({
    example: '18:00',
    description:
      'With `date`: only fields where the slot starting at this time is free',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: m('validation.IS_TIME') })
  startTime?: string;

  @ApiPropertyOptional({ enum: FIELD_SORTS, default: 'createdAt:desc' })
  @IsOptional()
  @IsIn(FIELD_SORTS, { message: m('validation.IS_IN') })
  sort: FieldSort = 'createdAt:desc';
}
