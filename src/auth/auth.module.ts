import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { AccountTokensService } from './account-tokens.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AccountToken } from './entities/account-token.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    UsersModule,
    MailModule,
    TypeOrmModule.forFeature([RefreshToken, AccountToken]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: Number(config.get('JWT_EXPIRES_IN', 900)) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokensService,
    AccountTokensService,
    JwtStrategy,
  ],
})
export class AuthModule {}
