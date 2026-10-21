import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export const MAX_PAGE_SIZE = 50;

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  @Max(MAX_PAGE_SIZE, { message: m('validation.MAX') })
  limit: number = 10;
}

export const buildMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});
