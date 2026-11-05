// Configuración de autenticación leída del .env (se lee al usarla, después de cargar el .env).

/** demo = acepta además la cabecera x-demo-user y POST /auth/demo (solo desarrollo). */
export function authMode(): 'demo' | 'google' {
  return process.env.AUTH_MODE === 'google' ? 'google' : 'demo';
}

/** Dominios de correo permitidos, por ejemplo "tcs.com" o "tcs.com,pichincha.com". */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS || 'tcs.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** true = solo cuentas corporativas de Google Workspace (el token trae "hd" con el dominio). */
export function requireGoogleWorkspace(): boolean {
  return process.env.GOOGLE_REQUIRE_HD === 'true';
}

/** false = solo entran usuarios que el Administrador dio de alta antes. */
export function autoCreateUsers(): boolean {
  return process.env.AUTO_CREATE_USERS !== 'false';
}

export function jwtExpiresInSeconds(): number {
  const hours = Number(process.env.JWT_EXPIRES_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 3600;
}

const DEV_SECRET = 'solo-para-desarrollo-cambia-este-secreto-en-el-env-0001';

export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Define JWT_SECRET (mínimo 32 caracteres) para producción');
  }
  return secret || DEV_SECRET;
}
