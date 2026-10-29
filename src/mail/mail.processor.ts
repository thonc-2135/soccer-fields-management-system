import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  MAIL_QUEUE,
  MailJob,
  type ActivationMailData,
  type BookingApprovedMailData,
  type BookingCancelledMailData,
  type BookingExpiredMailData,
  type BookingRejectedMailData,
  type MailJobData,
} from './mail.constants.js';
import {
  MailTemplatesService,
  type MailContent,
} from './mail-templates.service.js';
import { MailerService } from './mailer.service.js';

@Injectable()
@Processor(MAIL_QUEUE)
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailer: MailerService,
    private readonly templates: MailTemplatesService,
  ) {}

  @Process(MailJob.ACTIVATION)
  async sendActivation(job: Job<ActivationMailData>): Promise<void> {
    await this.deliver(job, this.templates.activation(job.data));
  }

  @Process(MailJob.BOOKING_CANCELLED)
  async sendBookingCancelled(
    job: Job<BookingCancelledMailData>,
  ): Promise<void> {
    await this.deliver(job, this.templates.bookingCancelled(job.data));
  }

  @Process(MailJob.BOOKING_APPROVED)
  async sendBookingApproved(job: Job<BookingApprovedMailData>): Promise<void> {
    await this.deliver(job, this.templates.bookingApproved(job.data));
  }

  @Process(MailJob.BOOKING_REJECTED)
  async sendBookingRejected(job: Job<BookingRejectedMailData>): Promise<void> {
    await this.deliver(job, this.templates.bookingRejected(job.data));
  }

  @Process(MailJob.BOOKING_EXPIRED)
  async sendBookingExpired(job: Job<BookingExpiredMailData>): Promise<void> {
    await this.deliver(job, this.templates.bookingExpired(job.data));
  }

  /** Called after every failed attempt; only the last one is an actual give-up. */
  @OnQueueFailed()
  onFailed(job: Job<MailJobData>, error: Error): void {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `Giving up on ${job.name} job ${job.id} for ${job.data.to} after ${job.attemptsMade} attempts: ${error.message}`,
      );
    }
  }

  private async deliver(
    job: Job<MailJobData>,
    content: MailContent,
  ): Promise<void> {
    try {
      await this.mailer.send({ to: job.data.to, ...content });
    } catch (error) {
      this.logger.warn(
        `${job.name} mail to ${job.data.to} failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}): ${(error as Error).message}`,
      );
      throw error; // rethrow so Bull retries with the configured backoff
    }
    this.logger.log(`${job.name} mail sent to ${job.data.to}`);
  }
}
