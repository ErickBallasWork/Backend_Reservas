import {
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
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  deviceIdleDays: number;
  allowedEmailDomains: string[];
  demoLoginEnabled: boolean;
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

const SECONDS_PER_MINUTE = 60;

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
      jwtSecret: env.JWT_SECRET,
      jwtExpiresInSeconds: env.JWT_EXPIRES_MINUTES * SECONDS_PER_MINUTE,
      deviceIdleDays: env.DEVICE_IDLE_DAYS,
      allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS,
      demoLoginEnabled: env.DEMO_LOGIN_ENABLED,
    },
    notifications: { extraChannels: env.NOTIFY_CHANNELS },
    jobs: { jobKey: env.JOB_KEY ?? null },
  };
}

export function loadAppConfig(raw: Record<string, unknown>): AppConfig {
  return toAppConfig(validateEnvironment(raw));
}
