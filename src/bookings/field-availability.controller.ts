import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingsService } from './bookings.service.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';

@ApiTags('fields')
@Controller('fields')
export class FieldAvailabilityController {
  constructor(private readonly service: BookingsService) {}

  @Get(':id/availability')
  @ApiOperation({
    summary:
      'Slots of a day: AVAILABLE / PENDING / BOOKED / PAST, with the price of each',
    description: 'Public. Weekend prices already include the surcharge.',
  })
  availability(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.service.availability(id, query);
  }
}
