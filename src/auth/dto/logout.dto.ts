import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Revoked together with the access token when provided',
  })
  @IsOptional()
  @IsString({ message: m('validation.IS_STRING') })
  refreshToken?: string;
}
