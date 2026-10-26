import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldsModule } from '../fields/fields.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { VouchersModule } from '../vouchers/vouchers.module.js';
import { AdminBookingsController } from './admin/admin-bookings.controller.js';
import { AdminBookingsService } from './admin/admin-bookings.service.js';
import { BookingTasksService } from './booking-tasks.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { BookingPriceItem } from './entities/booking-price-item.entity.js';
import { BookingSlot } from './entities/booking-slot.entity.js';
import { Booking } from './entities/booking.entity.js';
import { FieldAvailabilityController } from './field-availability.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSlot, BookingPriceItem]),
    FieldsModule,
    VouchersModule,
    SettingsModule,
    MailModule,
  ],
  controllers: [
    BookingsController,
    FieldAvailabilityController,
    AdminBookingsController,
  ],
  providers: [BookingsService, AdminBookingsService, BookingTasksService],
  exports: [TypeOrmModule, BookingsService],
})
export class BookingsModule {}
