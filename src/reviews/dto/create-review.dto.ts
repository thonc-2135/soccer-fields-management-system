import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { MAX_REVIEW_LENGTH } from '../reviews.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  @Max(5, { message: m('validation.MAX') })
  rating: number;

  @ApiProperty({ example: 'Mặt sân đẹp, chủ sân nhiệt tình' })
  @Transform(trim)
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  @MaxLength(MAX_REVIEW_LENGTH, { message: m('validation.MAX_LENGTH') })
  content: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  @Max(5, { message: m('validation.MAX') })
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  @MaxLength(MAX_REVIEW_LENGTH, { message: m('validation.MAX_LENGTH') })
  content?: string;
}
