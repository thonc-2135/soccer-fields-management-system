import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { I18nContext } from 'nestjs-i18n';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../common/enums/role.enum.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { User } from '../../users/entities/user.entity.js';
import { AdminBookingsService } from './admin-bookings.service.js';
import { CalendarQueryDto } from './dto/calendar-query.dto.js';
import { ListAdminBookingsQueryDto } from './dto/list-admin-bookings-query.dto.js';
import { RejectBookingDto } from './dto/reject-booking.dto.js';

@ApiTags('admin / bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly service: AdminBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'All bookings with filters' })
  findAll(@Query() query: ListAdminBookingsQueryDto) {
    return this.service.findAll(query);
  }

  // declared before `:id` so "calendar" is not parsed as an id
  @Get('calendar')
  @ApiOperation({
    summary: 'Bookings of a date range (max 62 days) for a calendar view',
  })
  calendar(@Query() query: CalendarQueryDto) {
    return this.service.calendar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One booking, including customer details' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Approve a PENDING booking; emails the customer',
  })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: User) {
    return this.service.approve(id, admin, I18nContext.current()?.lang ?? 'en');
  }

  @Patch(':id/reject')
  @ApiOperation({
    summary:
      'Reject a PENDING booking with a reason; frees the slots and emails the customer',
  })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectBookingDto,
    @CurrentUser() admin: User,
  ) {
    return this.service.reject(
      id,
      dto.reason,
      admin,
      I18nContext.current()?.lang ?? 'en',
    );
  }
}
