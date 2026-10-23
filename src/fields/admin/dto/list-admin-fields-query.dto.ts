import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { FieldStatus } from '../../../common/enums/field-status.enum.js';

export class ListAdminFieldsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Name or address, accent-insensitive' })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(100, { message: m('validation.MAX_LENGTH') })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  keyword?: string;

  @ApiPropertyOptional({ enum: FieldStatus })
  @IsOptional()
  @IsEnum(FieldStatus, { message: m('validation.IS_IN') })
  status?: FieldStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  typeId?: number;
}
