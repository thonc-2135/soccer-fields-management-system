import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { IsDateOnly } from '../../common/validators/is-date-only.validator.js';
import { IsTimeOfDay } from '../../common/validators/is-time-of-day.validator.js';

export const MAX_SLOTS_PER_BOOKING = 3;

export class CreateBookingDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  fieldId: number;

  @ApiProperty({ example: '2030-01-14' })
  @IsDateOnly()
  date: string;

  @ApiProperty({
    example: '18:00',
    description: 'Start of a slot, see GET /fields/:id/availability',
  })
  @IsTimeOfDay()
  startTime: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    maximum: MAX_SLOTS_PER_BOOKING,
    description: 'Consecutive slots',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  @Max(MAX_SLOTS_PER_BOOKING, { message: m('validation.MAX') })
  slots: number = 1;

  @ApiPropertyOptional({ example: 'SALE10' })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(50, { message: m('validation.MAX_LENGTH') })
  voucherCode?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(255, { message: m('validation.MAX_LENGTH') })
  note?: string;
}
