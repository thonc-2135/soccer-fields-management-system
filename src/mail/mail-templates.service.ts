import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { I18nService } from 'nestjs-i18n';
import { escapeHtml } from '../common/utils/escape-html.util.js';
import type {
  ActivationMailData,
  BookingApprovedMailData,
  BookingCancelledMailData,
  BookingExpiredMailData,
  BookingMailData,
  BookingRejectedMailData,
} from './mail.constants.js';
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

  bookingCancelled(data: BookingCancelledMailData): MailContent {
    return this.bookingNotice(data, 'BOOKING_CANCELLED');
  }

  bookingApproved(data: BookingApprovedMailData): MailContent {
    return this.bookingNotice(data, 'BOOKING_APPROVED');
  }

  bookingRejected(data: BookingRejectedMailData): MailContent {
    return this.bookingNotice(data, 'BOOKING_REJECTED', {
      reason: data.reason,
    });
  }

  bookingExpired(data: BookingExpiredMailData): MailContent {
    return this.bookingNotice(data, 'BOOKING_EXPIRED');
  }

  /** Greeting + one paragraph, both looked up as `mail.<prefix>_SUBJECT` / `mail.<prefix>_BODY`. */
  private bookingNotice(
    { name, fieldName, date, startTime, endTime, lang }: BookingMailData,
    prefix: string,
    extraArgs: Record<string, string> = {},
  ): MailContent {
    const translate = (key: string) =>
      this.i18n.t(`mail.${key}` as never, {
        lang,
        args: {
          name,
          field: fieldName,
          date,
          start: startTime,
          end: endTime,
          ...extraArgs,
        },
      }) as string;

    const greeting = translate('GREETING');
    const body = translate(`${prefix}_BODY`);
    return {
      subject: translate(`${prefix}_SUBJECT`),
      text: [greeting, body].join('\n'),
      html: [
        `<p>${escapeHtml(greeting)}</p>`,
        `<p>${escapeHtml(body)}</p>`,
      ].join('\n'),
    };
  }
}
