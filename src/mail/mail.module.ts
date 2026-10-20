import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { MAIL_QUEUE } from './mail.constants.js';
import { MailProcessor } from './mail.processor.js';
import { MailQueueService } from './mail-queue.service.js';
import { MailerService } from './mailer.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailerService, MailQueueService, MailProcessor],
  exports: [MailQueueService],
})
export class MailModule {}
