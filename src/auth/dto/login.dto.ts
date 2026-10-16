import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class LoginDto {
  @ApiProperty({ example: 'a@example.com' })
  @IsEmail({}, { message: m('validation.EMAIL_INVALID') })
  email: string;

  @ApiProperty()
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  password: string;
}
