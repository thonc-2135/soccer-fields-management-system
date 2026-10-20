import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class ResendActivationDto {
  @ApiProperty({ example: 'a@example.com' })
  @IsEmail({}, { message: m('validation.EMAIL_INVALID') })
  email: string;
}
