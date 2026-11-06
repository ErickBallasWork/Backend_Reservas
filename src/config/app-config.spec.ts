import { loadAppConfig } from './app-config';

const SECRET = 'x'.repeat(32);

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: 'sqlserver://localhost:1433;database=reservas_test',
    CORS_ORIGINS: 'http://localhost:3000',
    AUTH_MODE: 'demo',
    JWT_SECRET: SECRET,
    ALLOWED_EMAIL_DOMAINS: 'tcs.com,pichincha.com',
    ...overrides,
  };
}

function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return baseEnv({
    NODE_ENV: 'production',
    AUTH_MODE: 'google',
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    ...overrides,
  });
}

describe('loadAppConfig', () => {
  it('applies defaults for optional variables', () => {
    const config = loadAppConfig(baseEnv());

    expect(config.server).toEqual({
      nodeEnv: 'development',
      isProduction: false,
      port: 3001,
      corsOrigins: ['http://localhost:3000'],
      swaggerEnabled: true,
      timeZone: 'America/Guayaquil',
    });
    expect(config.auth.jwtExpiresInSeconds).toBe(8 * 3600);
    expect(config.auth.autoCreateUsers).toBe(true);
    expect(config.auth.requireGoogleWorkspace).toBe(false);
    expect(config.notifications.extraChannels).toEqual([]);
    expect(config.jobs.jobKey).toBeNull();
  });

  it('treats empty values as missing', () => {
    const config = loadAppConfig(baseEnv({ GOOGLE_CLIENT_ID: '', JOB_KEY: '', PORT: '' }));

    expect(config.auth.googleClientId).toBeNull();
    expect(config.jobs.jobKey).toBeNull();
    expect(config.server.port).toBe(3001);
  });

  it('parses comma separated lists', () => {
    const config = loadAppConfig(
      baseEnv({
        CORS_ORIGINS: 'http://localhost:3000, https://app.example.com',
        ALLOWED_EMAIL_DOMAINS: ' TCS.com ,pichincha.com,',
        NOTIFY_CHANNELS: 'email, push',
      }),
    );

    expect(config.server.corsOrigins).toEqual(['http://localhost:3000', 'https://app.example.com']);
    expect(config.auth.allowedEmailDomains).toEqual(['tcs.com', 'pichincha.com']);
    expect(config.notifications.extraChannels).toEqual(['EMAIL', 'PUSH']);
  });

  it.each(['DATABASE_URL', 'CORS_ORIGINS', 'AUTH_MODE', 'JWT_SECRET', 'ALLOWED_EMAIL_DOMAINS'])(
    'rejects a missing %s',
    (name) => {
      const env = baseEnv();
      delete env[name];

      expect(() => loadAppConfig(env)).toThrow(name);
    },
  );

  it('rejects an unknown auth mode instead of falling back to demo', () => {
    expect(() => loadAppConfig(baseEnv({ AUTH_MODE: 'Google' }))).toThrow('AUTH_MODE');
  });

  it('rejects a short JWT secret', () => {
    expect(() => loadAppConfig(baseEnv({ JWT_SECRET: 'short' }))).toThrow('JWT_SECRET');
  });

  it.each(['yes', '1', 'TRUE'])('rejects the non strict boolean "%s"', (value) => {
    expect(() => loadAppConfig(baseEnv({ AUTO_CREATE_USERS: value }))).toThrow('AUTO_CREATE_USERS');
  });

  it('rejects unknown notification channels', () => {
    expect(() => loadAppConfig(baseEnv({ NOTIFY_CHANNELS: 'EMAIL,SMS' }))).toThrow(
      'NOTIFY_CHANNELS',
    );
  });

  it('rejects an invalid time zone', () => {
    expect(() => loadAppConfig(baseEnv({ APP_TIME_ZONE: 'Ecuador' }))).toThrow('APP_TIME_ZONE');
  });

  it('requires GOOGLE_CLIENT_ID when the auth mode is google', () => {
    expect(() => loadAppConfig(baseEnv({ AUTH_MODE: 'google' }))).toThrow('GOOGLE_CLIENT_ID');
  });

  it('rejects the demo auth mode in production', () => {
    expect(() => loadAppConfig(productionEnv({ AUTH_MODE: 'demo' }))).toThrow(
      'AUTH_MODE: must be "google" in production',
    );
  });

  it('rejects a demo default user outside the demo auth mode', () => {
    expect(() =>
      loadAppConfig(productionEnv({ DEMO_DEFAULT_USER: 'ana.asociado@demo.com' })),
    ).toThrow('DEMO_DEFAULT_USER');
  });

  it('disables swagger in production unless it is enabled explicitly', () => {
    expect(loadAppConfig(productionEnv()).server.swaggerEnabled).toBe(false);
    expect(loadAppConfig(productionEnv({ SWAGGER_ENABLED: 'true' })).server.swaggerEnabled).toBe(
      true,
    );
  });

  it('reports every invalid variable at once', () => {
    expect(() => loadAppConfig({})).toThrow(/DATABASE_URL[\s\S]*AUTH_MODE[\s\S]*JWT_SECRET/);
  });
});
