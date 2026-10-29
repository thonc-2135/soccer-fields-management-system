import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ActivityType } from '../../common/enums/activity-type.enum.js';
import { IsDateOnly } from '../../common/validators/is-date-only.validator.js';

export class ListActivitiesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ActivityType })
  @IsOptional()
  @IsEnum(ActivityType, { message: m('validation.IS_IN') })
  type?: ActivityType;

  @ApiPropertyOptional({
    example: '2030-01-01',
    description: 'From (inclusive)',
  })
  @IsOptional()
  @IsDateOnly()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2030-01-31', description: 'To (inclusive)' })
  @IsOptional()
  @IsDateOnly()
  toDate?: string;
}
