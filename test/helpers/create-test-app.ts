import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import {
  MailerService,
  type MailMessage,
} from '../../src/mail/mailer.service.js';

/** Collects mails instead of talking to an SMTP server. */
export class FakeMailer {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  /** Waits for the queue worker to deliver a mail to `to` (jobs run asynchronously via Bull). */
  async waitFor(to: string, timeoutMs = 5000): Promise<MailMessage> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.messages.filter((m) => m.to === to).at(-1);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`No mail received for ${to} within ${timeoutMs}ms`);
  }
}

// Requires Postgres + Redis (see docker-compose.yml). DB_NAME defaults to the *_test database.
process.env.DB_NAME ??= 'soccer_fields_test';
// separate Bull namespace: a dev server on the same Redis must not pick up the tests' mail jobs
process.env.BULL_PREFIX ??= 'bull-e2e';

export async function createTestApp(): Promise<{
  app: INestApplication;
  mailer: FakeMailer;
}> {
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailerService)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, mailer };
}

export const tokenFromMail = (mail: MailMessage): string => {
  const match = /token=([A-Za-z0-9_-]+)/.exec(mail.text ?? '');
  if (!match) throw new Error('No token found in mail');
  return match[1];
};
