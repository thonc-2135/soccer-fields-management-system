import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { MailTemplatesService } from './mail-templates.service.js';

describe('MailTemplatesService', () => {
  let service: MailTemplatesService;
  const i18n = {
    t: vi.fn(
      (
        key: string,
        opts: { lang: string; args: { name: string; hours: number } },
      ) => `${opts.lang}:${key}:${opts.args.name}:${opts.args.hours}`,
    ),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailTemplatesService,
        { provide: I18nService, useValue: i18n },
        {
          provide: ConfigService,
          useValue: { get: (_: string, d: unknown) => d },
        },
      ],
    }).compile();
    service = moduleRef.get(MailTemplatesService);
  });

  it('renders the activation mail in the requested language', () => {
    const mail = service.activation({
      to: 'a@x.com',
      name: 'An',
      link: 'http://localhost:3000/api/v1/auth/activate?token=abc',
      lang: 'vi',
    });
    expect(mail.subject).toBe('vi:mail.ACTIVATION_SUBJECT:An:24');
    expect(mail.text).toContain(
      'http://localhost:3000/api/v1/auth/activate?token=abc',
    );
    expect(mail.html).toContain(
      '<a href="http://localhost:3000/api/v1/auth/activate?token=abc">',
    );
  });

  it('escapes user supplied values in the html body', () => {
    const mail = service.activation({
      to: 'a@x.com',
      name: '<script>alert(1)</script>',
      link: 'http://x/?a=1&b="2"',
      lang: 'en',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('a=1&amp;b=&quot;2&quot;');
  });
});
