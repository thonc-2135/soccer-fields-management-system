import type { EventEmitter2 } from '@nestjs/event-emitter';
import { emitActivity } from '../activities/activity-events.js';
import type { ActivityType } from '../common/enums/activity-type.enum.js';
import type { Booking } from './entities/booking.entity.js';

type ActivityBooking = Pick<
  Booking,
  'id' | 'userId' | 'fieldId' | 'bookingDate' | 'startTime' | 'endTime'
>;

/** Adds a booking event to the timeline of the customer who owns the booking. */
export function emitBookingActivity(
  events: EventEmitter2,
  type: ActivityType,
  booking: ActivityBooking,
  extraMetadata: Record<string, unknown> = {},
): void {
  emitActivity(events, {
    userId: booking.userId,
    type,
    fieldId: booking.fieldId,
    refType: 'booking',
    refId: booking.id,
    metadata: {
      date: booking.bookingDate,
      startTime: booking.startTime.slice(0, 5),
      endTime: booking.endTime.slice(0, 5),
      ...extraMetadata,
    },
  });
}
