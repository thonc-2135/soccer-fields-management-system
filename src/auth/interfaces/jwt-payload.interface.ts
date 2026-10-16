export interface JwtPayload {
  sub: number;
  jti: string;
  iat: number;
  exp: number;
}
