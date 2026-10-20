import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  I18nContext,
  I18nValidationException,
  type I18nService,
} from 'nestjs-i18n';

interface ErrorItem {
  field: string;
  message: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const lang = I18nContext.current(host)?.lang ?? 'en';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'errors.INTERNAL_SERVER_ERROR';
    let errors: ErrorItem[] | undefined;

    if (exception instanceof I18nValidationException) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'errors.VALIDATION_FAILED';
      errors = this.flattenValidation(exception, lang);
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : (body as { message?: unknown }).message;
      message =
        typeof raw === 'string'
          ? raw
          : Array.isArray(raw)
            ? String(raw[0])
            : exception.message;
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message: this.translate(message, lang),
      ...(errors && { errors }),
    });
  }

  private flattenValidation(
    ex: I18nValidationException,
    lang: string,
  ): ErrorItem[] {
    const out: ErrorItem[] = [];
    const walk = (
      errs: I18nValidationException['errors'],
      prefix = '',
    ): void => {
      for (const e of errs) {
        const field = prefix + e.property;
        for (const raw of Object.values(e.constraints ?? {})) {
          out.push({ field, message: this.translateValidation(raw, lang) });
        }
        if (e.children?.length) walk(e.children, `${field}.`);
      }
    };
    walk(ex.errors);
    return out;
  }

  /** Constraint messages look like `key|{"args":...}` (see i18nValidationMessage). */
  private translateValidation(raw: string, lang: string): string {
    const [key, args] = raw.split('|');
    return this.i18n.t(key as never, {
      lang,
      args: args ? JSON.parse(args) : undefined,
    }) as string;
  }

  private translate(key: string, lang: string): string {
    if (!/^[a-z]+\.[A-Z_]+$/.test(key)) return key; // already a plain message
    return this.i18n.t(key as never, { lang }) as string;
  }
}
