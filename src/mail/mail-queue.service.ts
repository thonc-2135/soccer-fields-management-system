import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import {
  MAIL_QUEUE,
  MailJob,
  type ActivationMailData,
  type BookingApprovedMailData,
  type BookingCancelledMailData,
  type BookingExpiredMailData,
  type BookingRejectedMailData,
} from './mail.constants.js';

/** Producer side: request handlers only enqueue, the processor does the SMTP work. */
@Injectable()
export class MailQueueService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue) {}

  async sendActivation(data: ActivationMailData): Promise<void> {
    await this.queue.add(MailJob.ACTIVATION, data);
  }

  async sendBookingCancelled(data: BookingCancelledMailData): Promise<void> {
    await this.queue.add(MailJob.BOOKING_CANCELLED, data);
  }

  async sendBookingApproved(data: BookingApprovedMailData): Promise<void> {
    await this.queue.add(MailJob.BOOKING_APPROVED, data);
  }

  async sendBookingRejected(data: BookingRejectedMailData): Promise<void> {
    await this.queue.add(MailJob.BOOKING_REJECTED, data);
  }

  async sendBookingsExpired(items: BookingExpiredMailData[]): Promise<void> {
    if (!items.length) return;
    await this.queue.addBulk(
      items.map((data) => ({ name: MailJob.BOOKING_EXPIRED, data })),
    );
  }
}
