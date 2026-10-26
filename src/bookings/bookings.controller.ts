import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { I18nContext } from 'nestjs-i18n';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { User } from '../users/entities/user.entity.js';
import { BookingsService } from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ListMyBookingsQueryDto } from './dto/list-my-bookings-query.dto.js';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Post('preview')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Validate and price a booking (voucher included) without creating it',
  })
  preview(@Body() dto: CreateBookingDto, @CurrentUser() user: User) {
    return this.service.preview(dto, user);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a booking (status PENDING until an admin approves)',
    description:
      'A slot already held by another PENDING/APPROVED booking returns 409.',
  })
  create(@Body() dto: CreateBookingDto, @CurrentUser() user: User) {
    return this.service.create(dto, user);
  }

  @Get('me')
  @ApiOperation({ summary: 'My bookings, newest first' })
  findMine(@Query() query: ListMyBookingsQueryDto, @CurrentUser() user: User) {
    return this.service.findMine(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my bookings' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.getDetail(id, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary:
      'Cancel a booking that is still PENDING; sends a notification email',
  })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.service.cancel(id, user, I18nContext.current()?.lang ?? 'en');
  }
}
