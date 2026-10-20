import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '../common/enums/role.enum.js';
import { hashPassword } from '../common/utils/password.util.js';
import { RedisService } from '../redis/redis.service.js';
import type { User } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { RefreshTokensService } from './refresh-tokens.service.js';

describe('AuthService', () => {
  let service: AuthService;
  const usersService = {
    existsByEmail: vi.fn(),
    create: vi.fn(),
    findByEmailWithPassword: vi.fn(),
    findById: vi.fn(),
  };
  const redis = { setWithTtl: vi.fn() };
  const refreshTokens = {
    issue: vi.fn().mockResolvedValue('refresh-token'),
    consume: vi.fn(),
    revoke: vi.fn(),
  };
  const jwt = { sign: vi.fn().mockReturnValue('token') };

  const makeUser = async (over: Partial<User> = {}): Promise<User> =>
    ({
      id: 1,
      name: 'A',
      email: 'a@x.com',
      password: await hashPassword('Passw0rd!'),
      role: Role.USER,
      isActive: true,
      ...over,
    }) as User;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: RedisService, useValue: redis },
        { provide: JwtService, useValue: jwt },
        { provide: RefreshTokensService, useValue: refreshTokens },
        {
          provide: ConfigService,
          useValue: { get: (_: string, d: unknown) => d },
        },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    it('rejects an email that is already registered', async () => {
      usersService.existsByEmail.mockResolvedValue(true);
      await expect(
        service.register({
          name: 'A',
          email: 'A@x.com',
          password: 'Passw0rd!',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.existsByEmail).toHaveBeenCalledWith('a@x.com');
    });

    it('stores a hashed password and never returns it', async () => {
      usersService.existsByEmail.mockResolvedValue(false);
      usersService.create.mockImplementation(async (d) => ({
        id: 2,
        role: Role.USER,
        isActive: false,
        ...d,
      }));
      const res = await service.register({
        name: 'A',
        email: 'a@x.com',
        password: 'Passw0rd!',
      });
      expect(usersService.create.mock.calls[0][0].password).not.toBe(
        'Passw0rd!',
      );
      expect(res).not.toHaveProperty('password');
      expect(res.isActive).toBe(false);
    });
  });

  describe('login', () => {
    it('returns a token for valid credentials', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(await makeUser());
      const res = await service.login({
        email: 'a@x.com',
        password: 'Passw0rd!',
      });
      expect(res).toMatchObject({
        accessToken: 'token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      });
    });

    it('rejects unknown email and wrong password with the same error', async () => {
      usersService.findByEmailWithPassword.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'n@x.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      usersService.findByEmailWithPassword.mockResolvedValueOnce(
        await makeUser(),
      );
      await expect(
        service.login({ email: 'a@x.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects inactive accounts with 403', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(
        await makeUser({ isActive: false }),
      );
      await expect(
        service.login({ email: 'a@x.com', password: 'Passw0rd!' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('refresh', () => {
    it('rotates: consumes the old token and issues a new pair', async () => {
      refreshTokens.consume.mockResolvedValue(1);
      usersService.findById.mockResolvedValue(await makeUser());
      const res = await service.refresh({ refreshToken: 'old' });
      expect(refreshTokens.consume).toHaveBeenCalledWith('old');
      expect(res).toMatchObject({
        accessToken: 'token',
        refreshToken: 'refresh-token',
      });
    });

    it('propagates an invalid/reused token error', async () => {
      refreshTokens.consume.mockRejectedValue(new UnauthorizedException());
      await expect(
        service.refresh({ refreshToken: 'bad' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the account was deactivated meanwhile', async () => {
      refreshTokens.consume.mockResolvedValue(1);
      usersService.findById.mockResolvedValue(
        await makeUser({ isActive: false }),
      );
      await expect(
        service.refresh({ refreshToken: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  it('logout blacklists the token until it expires', async () => {
    const exp = Math.floor(Date.now() / 1000) + 100;
    await service.logout('jti-1', exp, 'rt');
    expect(refreshTokens.revoke).toHaveBeenCalledWith('rt');
    expect(redis.setWithTtl).toHaveBeenCalledWith(
      'blacklist:jti-1',
      '1',
      expect.any(Number),
    );
  });
});
