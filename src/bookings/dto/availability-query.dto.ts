import { ApiProperty } from '@nestjs/swagger';
import { IsDateOnly } from '../../common/validators/is-date-only.validator.js';

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2030-01-14' })
  @IsDateOnly()
  date: string;
}
