import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { I18nService } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import {
  MAIL_QUEUE,
  MailJob,
  type ActivationMailData,
} from './mail.constants.js';
import { MailerService } from './mailer.service.js';

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

@Injectable()
@Processor(MAIL_QUEUE)
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailer: MailerService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {}

  @Process(MailJob.ACTIVATION)
  async sendActivation(job: Job<ActivationMailData>): Promise<void> {
    const { to, name, link, lang } = job.data;
    const hours = Number(this.config.get('ACTIVATION_TOKEN_TTL_HOURS', 24));
    const t = (key: string, args: Record<string, unknown> = {}) =>
      this.i18n.t(`mail.${key}` as never, {
        lang,
        args: { name, hours, ...args },
      }) as string;

    await this.mailer.send({
      to,
      subject: t('ACTIVATION_SUBJECT'),
      text: `${t('ACTIVATION_GREETING')}\n${t('ACTIVATION_BODY')}\n${link}\n${t('ACTIVATION_EXPIRES')}`,
      html: `<p>${escapeHtml(t('ACTIVATION_GREETING'))}</p>
<p>${escapeHtml(t('ACTIVATION_BODY'))}</p>
<p><a href="${escapeHtml(link)}">${escapeHtml(t('ACTIVATION_BUTTON'))}</a></p>
<p>${escapeHtml(t('ACTIVATION_EXPIRES'))}<br>${escapeHtml(t('ACTIVATION_IGNORE'))}</p>`,
    });
    this.logger.log(`Activation mail sent to ${to}`);
  }
}
