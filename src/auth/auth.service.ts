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
import type { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

export interface LoginResponse {
  accessToken: string;
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
    // TODO: queue the activation email (@nestjs/bull)
    return toUserResponse(user);
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmailWithPassword(
      dto.email.toLowerCase(),
    );
    const matches = user
      ? await comparePassword(dto.password, user.password)
      : false;
    if (!user || !matches)
      throw new UnauthorizedException('errors.INVALID_CREDENTIALS');
    if (!user.isActive) throw new ForbiddenException('errors.ACCOUNT_INACTIVE');

    return {
      accessToken: this.issueToken(user),
      expiresIn: this.expiresInSeconds(),
      user: toUserResponse(user),
    };
  }

  async logout(jti: string, exp: number): Promise<void> {
    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    await this.redisService.setWithTtl(`blacklist:${jti}`, '1', ttlSeconds);
  }

  private issueToken(user: User): string {
    const payload: Pick<JwtPayload, 'sub' | 'jti'> = {
      sub: user.id,
      jti: randomUUID(),
    };
    return this.jwtService.sign(payload);
  }

  private expiresInSeconds(): number {
    return Number(this.config.get('JWT_EXPIRES_IN', 3600));
  }
}
