import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { escapeHtml } from '../common/utils/escape-html.util.js';
import type { ActivationMailData } from './mail.constants.js';
import type { MailMessage } from './mailer.service.js';

export type MailContent = Omit<MailMessage, 'to'>;

/** Builds the subject / text / html of each email, translated to the recipient's language. */
@Injectable()
export class MailTemplatesService {
  constructor(
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {}

  activation({ name, link, lang }: ActivationMailData): MailContent {
    const hours = Number(this.config.get('ACTIVATION_TOKEN_TTL_HOURS', 24));
    const t = (key: string) =>
      this.i18n.t(`mail.${key}` as never, {
        lang,
        args: { name, hours },
      }) as string;

    const greeting = t('ACTIVATION_GREETING');
    const body = t('ACTIVATION_BODY');
    const button = t('ACTIVATION_BUTTON');
    const expires = t('ACTIVATION_EXPIRES');
    const ignore = t('ACTIVATION_IGNORE');

    return {
      subject: t('ACTIVATION_SUBJECT'),
      text: [greeting, body, link, expires, ignore].join('\n'),
      html: [
        `<p>${escapeHtml(greeting)}</p>`,
        `<p>${escapeHtml(body)}</p>`,
        `<p><a href="${escapeHtml(link)}">${escapeHtml(button)}</a></p>`,
        `<p>${escapeHtml(expires)}<br>${escapeHtml(ignore)}</p>`,
      ].join('\n'),
    };
  }
}
