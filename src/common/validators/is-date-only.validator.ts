import { applyDecorators } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** Calendar date `YYYY-MM-DD` (no time part). */
export const IsDateOnly = () =>
  applyDecorators(
    IsISO8601(
      { strict: true },
      { message: i18nValidationMessage('validation.IS_DATE') },
    ),
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: i18nValidationMessage('validation.IS_DATE'),
    }),
  );
