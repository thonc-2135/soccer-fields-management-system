import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  comparePassword,
  hashPassword,
} from '../common/utils/password.util.js';
import { RedisService } from '../redis/redis.service.js';
import type { User } from '../users/entities/user.entity.js';
import {
  toUserResponse,
  type UserResponse,
} from '../users/mappers/user-response.mapper.js';
import { UsersService } from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { RefreshTokensService } from './refresh-tokens.service.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

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
  ) {}

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
    // TODO(B5): queue the activation email (@nestjs/bull)
    return toUserResponse(user);
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
