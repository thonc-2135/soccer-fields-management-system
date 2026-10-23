import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { FieldStatus } from '../../../common/enums/field-status.enum.js';
import { IsTimeOfDay } from '../../../common/validators/is-time-of-day.validator.js';
import { CreateFieldTypeDto } from './field-type.dto.js';
import { PriceWindowDto } from './price-window.dto.js';

export class CreateFieldDto {
  @ApiProperty({ example: 'Sân Mỹ Đình A1' })
  @IsString({ message: m('validation.IS_STRING') })
  @MinLength(2, { message: m('validation.MIN_LENGTH') })
  @MaxLength(150, { message: m('validation.MAX_LENGTH') })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(5000, { message: m('validation.MAX_LENGTH') })
  description?: string;

  @ApiProperty({ example: 'Đường Lê Đức Thọ, Mỹ Đình 1, Nam Từ Liêm, Hà Nội' })
  @IsString({ message: m('validation.IS_STRING') })
  @MinLength(2, { message: m('validation.MIN_LENGTH') })
  @MaxLength(255, { message: m('validation.MAX_LENGTH') })
  address: string;

  @ApiPropertyOptional({
    example: '06:00',
    default: '06:00',
    description: 'Not earlier than 06:00',
  })
  @IsOptional()
  @IsTimeOfDay()
  openTime?: string;

  @ApiPropertyOptional({
    example: '23:00',
    default: '23:00',
    description: 'Not later than 23:00',
  })
  @IsOptional()
  @IsTimeOfDay()
  closeTime?: string;

  @ApiPropertyOptional({ enum: FieldStatus, default: FieldStatus.ACTIVE })
  @IsOptional()
  @IsEnum(FieldStatus, { message: m('validation.IS_IN') })
  status?: FieldStatus;

  @ApiPropertyOptional({
    description: 'Existing field type. Send either `typeId` or `type`.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(1, { message: m('validation.MIN') })
  typeId?: number;

  @ApiPropertyOptional({
    type: CreateFieldTypeDto,
    description: 'Create a new field type together with the field',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateFieldTypeDto)
  type?: CreateFieldTypeDto;

  @ApiProperty({
    type: [PriceWindowDto],
    description:
      'Price per hour by time window; must cover the opening hours without gaps or overlaps',
  })
  @IsArray({ message: m('validation.IS_ARRAY') })
  @ArrayMinSize(1, { message: m('validation.MIN') })
  @ArrayMaxSize(12, { message: m('validation.MAX') })
  @ValidateNested({ each: true })
  @Type(() => PriceWindowDto)
  prices: PriceWindowDto[];
}

export class UpdateFieldDto extends PartialType(
  OmitType(CreateFieldDto, ['type'] as const),
) {}
