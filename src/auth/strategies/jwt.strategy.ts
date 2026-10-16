import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../../redis/redis.service.js';
import { UsersService } from '../../users/users.service.js';
import type { AuthenticatedRequestUser } from '../interfaces/authenticated-request-user.interface.js';
import type { JwtPayload } from '../interfaces/jwt-payload.interface.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedRequestUser> {
    if (await this.redisService.exists(`blacklist:${payload.jti}`)) {
      throw new UnauthorizedException('errors.UNAUTHORIZED');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive)
      throw new UnauthorizedException('errors.UNAUTHORIZED');

    return { user, jti: payload.jti, exp: payload.exp };
  }
}
