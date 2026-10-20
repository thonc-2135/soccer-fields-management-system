import type { INestApplication } from '@nestjs/common';
import { I18nValidationPipe } from 'nestjs-i18n';

/** Shared between main.ts and e2e tests so both run with identical behaviour. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
}
