import 'reflect-metadata';
import { plainToInstance, Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBoolean,
  IsEmail,
  IsFQDN,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  Max,
  Min,
  MinLength,
  ValidateIf,
  type ValidationError,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export const AUTH_MODES = ['demo', 'google'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export const EXTRA_NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL'] as const;
export type ExtraNotificationChannel = (typeof EXTRA_NOTIFICATION_CHANNELS)[number];

const MIN_SECRET_LENGTH = 32;

function toBoolean({ value }: TransformFnParams): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function toList(normalize: (item: string) => string) {
  return ({ value }: TransformFnParams): unknown =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => normalize(item.trim()))
          .filter(Boolean)
      : value;
}

export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @Transform(toList((origin) => origin))
  @ArrayNotEmpty()
  @IsUrl({ require_tld: false, require_protocol: true }, { each: true })
  CORS_ORIGINS!: string[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED?: boolean;

  @IsTimeZone()
  APP_TIME_ZONE = 'America/Guayaquil';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsIn(AUTH_MODES)
  AUTH_MODE!: AuthMode;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH)
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  JWT_EXPIRES_HOURS = 8;

  @ValidateIf((env: EnvironmentVariables) => env.AUTH_MODE === 'google')
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID?: string;

  @Transform(toBoolean)
  @IsBoolean()
  GOOGLE_REQUIRE_HD = false;

  @Transform(toList((domain) => domain.toLowerCase()))
  @ArrayNotEmpty()
  @IsFQDN({}, { each: true })
  ALLOWED_EMAIL_DOMAINS!: string[];

  @Transform(toBoolean)
  @IsBoolean()
  AUTO_CREATE_USERS = true;

  @IsOptional()
  @IsEmail()
  DEMO_DEFAULT_USER?: string;

  @Transform(toList((channel) => channel.toUpperCase()))
  @IsIn(EXTRA_NOTIFICATION_CHANNELS, { each: true })
  NOTIFY_CHANNELS: ExtraNotificationChannel[] = [];

  @IsOptional()
  @IsString()
  @MinLength(MIN_SECRET_LENGTH)
  JOB_KEY?: string;
}

function withoutEmptyValues(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
}

function describe(errors: ValidationError[]): string[] {
  return errors.map(
    (error) => `${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
  );
}

function crossFieldErrors(env: EnvironmentVariables): string[] {
  const errors: string[] = [];
  if (env.NODE_ENV === 'production' && env.AUTH_MODE !== 'google') {
    errors.push('AUTH_MODE: must be "google" in production');
  }
  if (env.DEMO_DEFAULT_USER && env.AUTH_MODE !== 'demo') {
    errors.push('DEMO_DEFAULT_USER: only allowed when AUTH_MODE is "demo"');
  }
  return errors;
}

export function validateEnvironment(raw: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, withoutEmptyValues(raw), {
    exposeDefaultValues: true,
  });
  const errors = [...describe(validateSync(env)), ...crossFieldErrors(env)];
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return env;
}
