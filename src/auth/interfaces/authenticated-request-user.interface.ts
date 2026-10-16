import type { User } from '../../users/entities/user.entity.js';

export interface AuthenticatedRequestUser {
  user: User;
  jti: string;
  exp: number;
}
