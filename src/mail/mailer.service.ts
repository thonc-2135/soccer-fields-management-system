import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/** Thin nodemailer wrapper. SMTP settings come from MAIL_* env vars (Mailpit in dev). */
@Injectable()
export class MailerService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const user = config.get<string>('MAIL_USER');
    this.from = config.get<string>(
      'MAIL_FROM',
      'Soccer Fields <no-reply@soccer-fields.local>',
    );
    this.transporter = createTransport({
      host: config.get<string>('MAIL_HOST', 'localhost'),
      port: Number(config.get('MAIL_PORT', 1025)),
      secure: config.get('MAIL_SECURE', 'false') === 'true',
      auth: user
        ? { user, pass: config.get<string>('MAIL_PASSWORD') }
        : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}
