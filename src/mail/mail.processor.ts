import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  MAIL_QUEUE,
  MailJob,
  type ActivationMailData,
} from './mail.constants.js';
import { MailTemplatesService } from './mail-templates.service.js';
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
    try {
      await this.mailer.send({
        to: job.data.to,
        ...this.templates.activation(job.data),
      });
    } catch (err) {
      this.logger.warn(
        `Activation mail to ${job.data.to} failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1}): ${(err as Error).message}`,
      );
      throw err; // rethrow so Bull retries with the configured backoff
    }
    this.logger.log(`Activation mail sent to ${job.data.to}`);
  }

  /** Called after every failed attempt; only the last one is an actual give-up. */
  @OnQueueFailed()
  onFailed(job: Job<ActivationMailData>, err: Error): void {
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      this.logger.error(
        `Giving up on ${job.name} job ${job.id} for ${job.data.to} after ${job.attemptsMade} attempts: ${err.message}`,
      );
    }
  }
}
