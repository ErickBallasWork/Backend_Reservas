import {
  type AuthMode,
  type EnvironmentVariables,
  type ExtraNotificationChannel,
  type NodeEnv,
  validateEnvironment,
} from './environment';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  timeZone: string;
}

export interface AuthConfig {
  mode: AuthMode;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  googleClientId: string | null;
  requireGoogleWorkspace: boolean;
  allowedEmailDomains: string[];
  autoCreateUsers: boolean;
  demoDefaultUser: string | null;
}

export interface NotificationsConfig {
  extraChannels: ExtraNotificationChannel[];
}

export interface JobsConfig {
  jobKey: string | null;
}

export interface AppConfig {
  server: ServerConfig;
  auth: AuthConfig;
  notifications: NotificationsConfig;
  jobs: JobsConfig;
}

const SECONDS_PER_HOUR = 3600;

export function toAppConfig(env: EnvironmentVariables): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  return {
    server: {
      nodeEnv: env.NODE_ENV,
      isProduction,
      port: env.PORT,
      corsOrigins: env.CORS_ORIGINS,
      swaggerEnabled: env.SWAGGER_ENABLED ?? !isProduction,
      timeZone: env.APP_TIME_ZONE,
    },
    auth: {
      mode: env.AUTH_MODE,
      jwtSecret: env.JWT_SECRET,
      jwtExpiresInSeconds: env.JWT_EXPIRES_HOURS * SECONDS_PER_HOUR,
      googleClientId: env.GOOGLE_CLIENT_ID ?? null,
      requireGoogleWorkspace: env.GOOGLE_REQUIRE_HD,
      allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS,
      autoCreateUsers: env.AUTO_CREATE_USERS,
      demoDefaultUser: env.DEMO_DEFAULT_USER?.toLowerCase() ?? null,
    },
    notifications: { extraChannels: env.NOTIFY_CHANNELS },
    jobs: { jobKey: env.JOB_KEY ?? null },
  };
}

export function loadAppConfig(raw: Record<string, unknown>): AppConfig {
  return toAppConfig(validateEnvironment(raw));
}
