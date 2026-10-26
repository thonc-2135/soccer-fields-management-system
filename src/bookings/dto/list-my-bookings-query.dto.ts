import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { BookingStatus } from '../../common/enums/booking-status.enum.js';
import { IsDateOnly } from '../../common/validators/is-date-only.validator.js';

export class ListMyBookingsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus, { message: m('validation.IS_IN') })
  status?: BookingStatus;

  @ApiPropertyOptional({
    example: '2030-01-01',
    description: 'Play date from (inclusive)',
  })
  @IsOptional()
  @IsDateOnly()
  fromDate?: string;

  @ApiPropertyOptional({
    example: '2030-01-31',
    description: 'Play date to (inclusive)',
  })
  @IsOptional()
  @IsDateOnly()
  toDate?: string;
}
