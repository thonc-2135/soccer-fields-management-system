import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListReviewsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5,
    description: 'Only this rating',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  @Max(5, { message: m('validation.MAX') })
  rating?: number;
}
