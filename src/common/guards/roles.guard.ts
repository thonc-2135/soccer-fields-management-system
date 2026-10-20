import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedRequestUser } from '../../auth/interfaces/authenticated-request-user.interface.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { Role } from '../enums/role.enum.js';

/** Use after JwtAuthGuard: `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN)`. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    const auth = context.switchToHttp().getRequest<Request>().user as
      AuthenticatedRequestUser | undefined;
    if (!auth || !required.includes(auth.user.role)) {
      throw new ForbiddenException('errors.FORBIDDEN');
    }
    return true;
  }
}
