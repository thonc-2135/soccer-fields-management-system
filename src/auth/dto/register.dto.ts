import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';
import { IsStrongPassword } from '../../common/validators/is-strong-password.validator.js';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  @IsString({ message: m('validation.IS_STRING') })
  @MinLength(2, { message: m('validation.MIN_LENGTH') })
  @MaxLength(100, { message: m('validation.MAX_LENGTH') })
  name: string;

  @ApiProperty({ example: 'a@example.com' })
  @IsEmail({}, { message: m('validation.EMAIL_INVALID') })
  @MaxLength(150, { message: m('validation.MAX_LENGTH') })
  email: string;

  @ApiProperty({
    example: 'Passw0rd!',
    description: '>= 8 chars, at least 3 of: lower, upper, digit, special',
  })
  @IsStrongPassword()
  @MaxLength(72, { message: m('validation.MAX_LENGTH') })
  password: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  @MaxLength(20, { message: m('validation.MAX_LENGTH') })
  phone?: string;
}
