import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import {
  MAIL_QUEUE,
  MailJob,
  type ActivationMailData,
} from './mail.constants.js';

/** Producer side: request handlers only enqueue, the processor does the SMTP work. */
@Injectable()
export class MailQueueService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue) {}

  async sendActivation(data: ActivationMailData): Promise<void> {
    await this.queue.add(MailJob.ACTIVATION, data);
  }
}
