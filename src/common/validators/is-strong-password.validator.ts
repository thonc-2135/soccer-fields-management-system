import { applyDecorators } from '@nestjs/common';
import { MinLength, ValidateBy } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

/** At least 3 of: lowercase, uppercase, digit, special character. */
export function hasEnoughCharacterClasses(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    CHARACTER_CLASSES.filter((re) => re.test(value)).length >= 3
  );
}

/** Password: min 8 chars and at least 3 of 4 character classes. */
export function IsStrongPassword() {
  return applyDecorators(
    MinLength(8, {
      message: i18nValidationMessage('validation.PASSWORD_MIN_LENGTH'),
    }),
    ValidateBy({
      name: 'passwordCharacterClasses',
      validator: {
        validate: hasEnoughCharacterClasses,
        defaultMessage: i18nValidationMessage('validation.PASSWORD_WEAK'),
      },
    }),
  );
}
