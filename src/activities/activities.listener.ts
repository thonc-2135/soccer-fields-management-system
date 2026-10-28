import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ActivitiesService } from './activities.service.js';
import {
  ACTIVITY_RECORD_EVENT,
  type ActivityRecordEvent,
} from './activity-events.js';

@Injectable()
export class ActivitiesListener {
  private readonly logger = new Logger(ActivitiesListener.name);

  constructor(private readonly activitiesService: ActivitiesService) {}

  @OnEvent(ACTIVITY_RECORD_EVENT, { async: true })
  async handle(event: ActivityRecordEvent): Promise<void> {
    try {
      await this.activitiesService.record(event);
    } catch (error) {
      // the timeline is a side effect; losing an entry must never break the action behind it
      this.logger.error(
        `Could not record ${event.type} for user ${event.userId}`,
        error as Error,
      );
    }
  }
}
