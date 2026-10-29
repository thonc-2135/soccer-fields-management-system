import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { MAX_COMMENT_LENGTH } from '../reviews.constants.js';

export class CreateCommentDto {
  @ApiProperty({ example: 'Mình cũng thấy vậy' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  @MaxLength(MAX_COMMENT_LENGTH, { message: m('validation.MAX_LENGTH') })
  content: string;

  @ApiPropertyOptional({
    description:
      'Comment being replied to. Replies are kept two levels deep: replying to a reply attaches to the same root comment.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  parentId?: number;
}
