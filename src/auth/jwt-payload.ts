export interface JwtPayload {
  sub: string;
  email: string;
  did?: string;
}

export const JWT_ISSUER = 'reservas-api';
export const JWT_ALGORITHM = 'HS256';
