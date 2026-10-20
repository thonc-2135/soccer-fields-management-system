import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class ActivateQueryDto {
  @ApiProperty()
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  token: string;
}
