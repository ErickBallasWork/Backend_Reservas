import { type EnvironmentVariables, type NodeEnv, validateEnvironment } from './environment';

export interface ServerConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  trustProxyHops: number;
  timeZone: string;
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  deviceIdleDays: number;
  allowedEmailDomains: string[];
  demoLoginEnabled: boolean;
}

export interface JobsConfig {
  jobKey: string | null;
  noShowEnforcedFrom: Date | null;
}

export interface AppConfig {
  server: ServerConfig;
  auth: AuthConfig;
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
      trustProxyHops: env.TRUST_PROXY_HOPS,
      timeZone: env.APP_TIME_ZONE,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      jwtExpiresInSeconds: env.JWT_EXPIRES_MINUTES * SECONDS_PER_MINUTE,
      deviceIdleDays: env.DEVICE_IDLE_DAYS,
      allowedEmailDomains: env.ALLOWED_EMAIL_DOMAINS,
      demoLoginEnabled: env.DEMO_LOGIN_ENABLED,
    },
    jobs: {
      jobKey: env.JOB_KEY ?? null,
      noShowEnforcedFrom: env.NO_SHOW_ENFORCED_FROM ? new Date(env.NO_SHOW_ENFORCED_FROM) : null,
    },
  };
}

export function loadAppConfig(raw: Record<string, unknown>): AppConfig {
  return toAppConfig(validateEnvironment(raw));
}
