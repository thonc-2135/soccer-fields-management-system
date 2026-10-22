import { Matches } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

/** `HH:mm`, 24h. */
export const IsTimeOfDay = () =>
  Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: i18nValidationMessage('validation.IS_TIME'),
  });
