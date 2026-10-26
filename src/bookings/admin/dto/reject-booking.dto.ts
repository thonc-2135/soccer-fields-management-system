import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { i18nValidationMessage as m } from 'nestjs-i18n';

export class RejectBookingDto {
  @ApiProperty({
    example: 'The pitch is being repaired that day',
    description: 'Sent to the customer in the rejection email',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: m('validation.IS_STRING') })
  @IsNotEmpty({ message: m('validation.NOT_EMPTY') })
  @MaxLength(255, { message: m('validation.MAX_LENGTH') })
  reason: string;
}
