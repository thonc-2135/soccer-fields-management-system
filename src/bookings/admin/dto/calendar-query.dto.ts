import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { IsDateOnly } from '../../../common/validators/is-date-only.validator.js';

export class CalendarQueryDto {
  @ApiProperty({ example: '2030-01-01', description: 'First day (inclusive)' })
  @IsDateOnly()
  from: string;

  @ApiProperty({
    example: '2030-01-31',
    description: 'Last day (inclusive), at most 62 days after `from`',
  })
  @IsDateOnly()
  to: string;

  @ApiPropertyOptional({ description: 'Only this field' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  fieldId?: number;
}
