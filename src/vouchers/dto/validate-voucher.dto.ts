import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class ValidateVoucherDto {
  @ApiProperty({ example: 'SALE10' })
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  @MaxLength(50, { message: m('validation.MAX_LENGTH') })
  code: string;

  @ApiProperty({
    example: 500000,
    description: 'Order amount in VND before discount',
  })
  @Type(() => Number)
  @IsInt({ message: m('validation.IS_INT') })
  @Min(0, { message: m('validation.MIN') })
  amount: number;
}
