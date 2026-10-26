import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../../../common/enums/booking-status.enum.js';
import { IsDateOnly } from '../../../common/validators/is-date-only.validator.js';

export const ADMIN_BOOKING_SORTS = [
  'createdAt:desc',
  'createdAt:asc',
  'date:desc',
  'date:asc',
] as const;
export type AdminBookingSort = (typeof ADMIN_BOOKING_SORTS)[number];

export class ListAdminBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus, { message: m('validation.IS_IN') })
  status?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  fieldId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  userId?: number;

  @ApiPropertyOptional({ example: '2030-01-01', description: 'Play date from' })
  @IsOptional()
  @IsDateOnly()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2030-01-31', description: 'Play date to' })
  @IsOptional()
  @IsDateOnly()
  toDate?: string;

  @ApiPropertyOptional({
    example: '2030-01-01',
    description: 'Booked (created) from',
  })
  @IsOptional()
  @IsDateOnly()
  createdFrom?: string;

  @ApiPropertyOptional({
    example: '2030-01-31',
    description: 'Booked (created) to',
  })
  @IsOptional()
  @IsDateOnly()
  createdTo?: string;

  @ApiPropertyOptional({ description: "Matches the user's name or email" })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(100, { message: m('validation.MAX_LENGTH') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  keyword?: string;

  @ApiPropertyOptional({
    enum: ADMIN_BOOKING_SORTS,
    default: 'createdAt:desc',
  })
  @IsOptional()
  @IsIn(ADMIN_BOOKING_SORTS, { message: m('validation.IS_IN') })
  sort: AdminBookingSort = 'createdAt:desc';
}
