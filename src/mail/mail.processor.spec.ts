import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { MockInstance } from 'vitest';
import type { Job } from 'bull';
import type { ActivationMailData } from './mail.constants.js';
import { MailProcessor } from './mail.processor.js';
import { MailTemplatesService } from './mail-templates.service.js';
import { MailerService } from './mailer.service.js';

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let warn: MockInstance;
  let error: MockInstance;
  const mailer = { send: vi.fn() };
  const templates = { activation: vi.fn() };
  const data: ActivationMailData = {
    to: 'a@x.com',
    name: 'An',
    link: 'http://x',
    lang: 'en',
  };
  const job = (over: Partial<Job<ActivationMailData>> = {}) =>
    ({
      id: 1,
      name: 'activation',
      data,
      attemptsMade: 0,
      opts: { attempts: 3 },
      ...over,
    }) as Job<ActivationMailData>;

  beforeEach(async () => {
    vi.clearAllMocks();
    templates.activation.mockReturnValue({
      subject: 'S',
      text: 'T',
      html: 'H',
    });
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MailProcessor,
        { provide: MailerService, useValue: mailer },
        { provide: MailTemplatesService, useValue: templates },
      ],
    }).compile();
    processor = moduleRef.get(MailProcessor);
  });

  it('sends the rendered mail to the recipient', async () => {
    await processor.sendActivation(job());
    expect(mailer.send).toHaveBeenCalledWith({
      to: 'a@x.com',
      subject: 'S',
      text: 'T',
      html: 'H',
    });
  });

  it('logs and rethrows SMTP errors so Bull can retry', async () => {
    mailer.send.mockRejectedValue(new Error('smtp down'));
    await expect(processor.sendActivation(job())).rejects.toThrow('smtp down');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
  });

  it('reports a give-up only after the last attempt', () => {
    processor.onFailed(job({ attemptsMade: 1 }), new Error('x'));
    expect(error).not.toHaveBeenCalled();
    processor.onFailed(job({ attemptsMade: 3 }), new Error('x'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Giving up'));
  });
});
