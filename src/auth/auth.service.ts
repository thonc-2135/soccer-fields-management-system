import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { I18nContext } from 'nestjs-i18n';
import {
  comparePassword,
  hashPassword,
} from '../common/utils/password.util.js';
import { MailQueueService } from '../mail/mail-queue.service.js';
import { RedisService } from '../redis/redis.service.js';
import type { User } from '../users/entities/user.entity.js';
import {
  toUserResponse,
  type UserResponse,
} from '../users/mappers/user-response.mapper.js';
import { UsersService } from '../users/users.service.js';
import { AccountTokensService } from './account-tokens.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { ResendActivationDto } from './dto/resend-activation.dto.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

/** Min seconds between two activation mails for the same address. */
const RESEND_ACTIVATION_COOLDOWN_SECONDS = 60;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly accountTokens: AccountTokensService,
    private readonly mailQueue: MailQueueService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  async register(dto: RegisterDto): Promise<UserResponse> {
    const email = dto.email.toLowerCase();
    if (await this.usersService.existsByEmail(email)) {
      throw new ConflictException('errors.EMAIL_TAKEN');
    }
    const user = await this.usersService.create({
      name: dto.name,
      email,
      phone: dto.phone ?? null,
      password: await hashPassword(dto.password),
    });
    await this.sendActivationMail(user);
    return toUserResponse(user);
  }

  async activate(token: string): Promise<void> {
    await this.accountTokens.activate(token);
  }

  /**
   * Always resolves the same way whether or not the email exists / is already
   * active, so the endpoint cannot be used to discover registered addresses.
   */
  async resendActivation(dto: ResendActivationDto): Promise<void> {
    const email = dto.email.toLowerCase();
    const allowed = await this.redisService.setIfAbsent(
      `activation-mail:${email}`,
      '1',
      RESEND_ACTIVATION_COOLDOWN_SECONDS,
    );
    if (!allowed)
      throw new HttpException(
        'errors.RESEND_TOO_SOON',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const user = await this.usersService.findByEmail(email);
    if (user && !user.isActive) await this.sendActivationMail(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.usersService.findByEmailWithPassword(
      dto.email.toLowerCase(),
    );
    const matches = user
      ? await comparePassword(dto.password, user.password)
      : false;
    if (!user || !matches)
      throw new UnauthorizedException('errors.INVALID_CREDENTIALS');
    if (!user.isActive) throw new ForbiddenException('errors.ACCOUNT_INACTIVE');

    return this.issueTokens(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokens> {
    const userId = await this.refreshTokens.consume(dto.refreshToken);
    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive)
      throw new UnauthorizedException('errors.UNAUTHORIZED');
    return this.issueTokens(user);
  }

  async logout(jti: string, exp: number, refreshToken?: string): Promise<void> {
    if (refreshToken) await this.refreshTokens.revoke(refreshToken);
    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    await this.redisService.setWithTtl(`blacklist:${jti}`, '1', ttlSeconds);
  }

  private async sendActivationMail(user: User): Promise<void> {
    try {
      const token = await this.accountTokens.issueActivation(user.id);
      const base = this.config.get<string>('APP_URL', 'http://localhost:3000');
      await this.mailQueue.sendActivation({
        to: user.email,
        name: user.name,
        link: `${base}/api/v1/auth/activate?token=${token}`,
        lang: I18nContext.current()?.lang ?? 'en',
      });
    } catch (err) {
      // The account exists already; the user can request another mail via resend-activation.
      this.logger.error(
        `Could not queue activation mail for user ${user.id}`,
        err as Error,
      );
    }
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    return {
      accessToken: this.issueToken(user),
      refreshToken: await this.refreshTokens.issue(user.id),
      expiresIn: this.expiresInSeconds(),
      user: toUserResponse(user),
    };
  }

  private issueToken(user: User): string {
    const payload: Pick<JwtPayload, 'sub' | 'jti'> = {
      sub: user.id,
      jti: randomUUID(),
    };
    return this.jwtService.sign(payload);
  }

  private expiresInSeconds(): number {
    return Number(this.config.get('JWT_EXPIRES_IN', 900));
  }
}
