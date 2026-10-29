import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ActivityType } from '../common/enums/activity-type.enum.js';

export const ACTIVITY_RECORD_EVENT = 'activity.record';

export interface ActivityRecordEvent {
  /** Owner of the timeline the entry appears in. */
  userId: number;
  type: ActivityType;
  fieldId?: number | null;
  /** What `refId` points to: `booking`, `review`, `comment`. */
  refType?: string;
  refId?: number;
  metadata?: Record<string, unknown>;
}

/** Fire and forget: the entry is written by a listener, so a failure never affects the request. */
export function emitActivity(
  emitter: EventEmitter2,
  event: ActivityRecordEvent,
): void {
  emitter.emit(ACTIVITY_RECORD_EVENT, event);
}
