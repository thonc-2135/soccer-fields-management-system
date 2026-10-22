import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { IsTimeOfDay } from '../../../common/validators/is-time-of-day.validator.js';

export class PriceWindowDto {
  @ApiProperty({ example: '17:00' })
  @IsTimeOfDay()
  startTime: string;

  @ApiProperty({ example: '21:00' })
  @IsTimeOfDay()
  endTime: string;

  @ApiProperty({ example: 350000, description: 'VND per hour' })
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(0, { message: m('validation.MIN') })
  @Max(100_000_000, { message: m('validation.MAX') })
  price: number;
}
