import {
  Body,
  Controller,
  Get,
  HttpCode,
  Query,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserResponse } from '../users/mappers/user-response.mapper.js';
import { toUserResponse } from '../users/mappers/user-response.mapper.js';
import type { User } from '../users/entities/user.entity.js';
import { AuthService, type AuthTokens } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ActivateQueryDto } from './dto/activate-query.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendActivationDto } from './dto/resend-activation.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register an account (inactive until activated by email)',
  })
  register(@Body() dto: RegisterDto): Promise<UserResponse> {
    return this.authService.register(dto);
  }

  @Get('activate')
  @ApiOperation({ summary: 'Activate an account using the link sent by email' })
  async activate(
    @Query() query: ActivateQueryDto,
  ): Promise<{ activated: true }> {
    await this.authService.activate(query.token);
    return { activated: true };
  }

  @Post('resend-activation')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send the activation email again (max once per minute per email)',
  })
  async resendActivation(
    @Body() dto: ResendActivationDto,
  ): Promise<{ sent: true }> {
    await this.authService.resendActivation(dto);
    return { sent: true };
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login' })
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Exchange a refresh token for a new access + refresh token (rotation)',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout (blacklists the current token)' })
  logout(
    @CurrentUser('jti') jti: string,
    @CurrentUser('exp') exp: number,
    @Body() dto: LogoutDto,
  ): Promise<void> {
    return this.authService.logout(jti, exp, dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Current account' })
  me(@CurrentUser() user: User): UserResponse {
    return toUserResponse(user);
  }
}
