import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class CreateFieldTypeDto {
  @ApiProperty({ example: 'Sân 7' })
  @IsString({ message: m('validation.IS_STRING') })
  @MinLength(1, { message: m('validation.MIN_LENGTH') })
  @MaxLength(100, { message: m('validation.MAX_LENGTH') })
  name: string;

  @ApiProperty({ example: 14, description: 'Players on the pitch' })
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  @Max(50, { message: m('validation.MAX') })
  capacity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(1000, { message: m('validation.MAX_LENGTH') })
  description?: string;
}

export class UpdateFieldTypeDto extends PartialType(CreateFieldTypeDto) {}
