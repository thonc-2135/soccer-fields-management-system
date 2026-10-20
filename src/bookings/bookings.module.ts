import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity.js';
import { BookingSlot } from './entities/booking-slot.entity.js';
import { BookingPriceItem } from './entities/booking-price-item.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingSlot, BookingPriceItem])],
  exports: [TypeOrmModule],
})
export class BookingsModule {}
