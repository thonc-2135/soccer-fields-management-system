import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequestUser } from '../interfaces/authenticated-request-user.interface.js';

/** Lets guests through; if a valid token is sent the user is attached to the request. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedRequestUser>(
    _err: unknown,
    user: TUser | false,
  ): TUser | undefined {
    return user === false ? undefined : user;
  }
}
