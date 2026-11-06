import { loadAppConfig } from './app-config';

const SECRET = 'x'.repeat(32);

function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    DATABASE_URL: 'sqlserver://localhost:1433;database=reservas_test',
    CORS_ORIGINS: 'http://localhost:3000',
    JWT_SECRET: SECRET,
    ALLOWED_EMAIL_DOMAINS: 'tcs.com,pichincha.com',
    ...overrides,
  };
}

function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return baseEnv({
    NODE_ENV: 'production',
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
    expect(config.auth.jwtExpiresInSeconds).toBe(15 * 60);
    expect(config.auth.deviceIdleDays).toBe(30);
    expect(config.auth.demoLoginEnabled).toBe(false);
    expect(config.notifications.extraChannels).toEqual([]);
    expect(config.jobs.jobKey).toBeNull();
  });

  it('treats empty values as missing', () => {
    const config = loadAppConfig(baseEnv({ DEMO_LOGIN_ENABLED: '', JOB_KEY: '', PORT: '' }));

    expect(config.auth.demoLoginEnabled).toBe(false);
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

  it.each(['DATABASE_URL', 'CORS_ORIGINS', 'JWT_SECRET', 'ALLOWED_EMAIL_DOMAINS'])(
    'rejects a missing %s',
    (name) => {
      const env = baseEnv();
      delete env[name];

      expect(() => loadAppConfig(env)).toThrow(name);
    },
  );

  it('rejects a short JWT secret', () => {
    expect(() => loadAppConfig(baseEnv({ JWT_SECRET: 'short' }))).toThrow('JWT_SECRET');
  });

  it.each(['yes', '1', 'TRUE'])('rejects the non strict boolean "%s"', (value) => {
    expect(() => loadAppConfig(baseEnv({ DEMO_LOGIN_ENABLED: value }))).toThrow(
      'DEMO_LOGIN_ENABLED',
    );
  });

  it('rejects unknown notification channels', () => {
    expect(() => loadAppConfig(baseEnv({ NOTIFY_CHANNELS: 'EMAIL,SMS' }))).toThrow(
      'NOTIFY_CHANNELS',
    );
  });

  it('rejects an invalid time zone', () => {
    expect(() => loadAppConfig(baseEnv({ APP_TIME_ZONE: 'Ecuador' }))).toThrow('APP_TIME_ZONE');
  });

  it('enables the demo login only when asked outside production', () => {
    expect(loadAppConfig(baseEnv({ DEMO_LOGIN_ENABLED: 'true' })).auth.demoLoginEnabled).toBe(true);
  });

  it('rejects the demo login in production', () => {
    expect(() => loadAppConfig(productionEnv({ DEMO_LOGIN_ENABLED: 'true' }))).toThrow(
      'DEMO_LOGIN_ENABLED: must be false in production',
    );
  });

  it('disables swagger in production unless it is enabled explicitly', () => {
    expect(loadAppConfig(productionEnv()).server.swaggerEnabled).toBe(false);
    expect(loadAppConfig(productionEnv({ SWAGGER_ENABLED: 'true' })).server.swaggerEnabled).toBe(
      true,
    );
  });

  it('reports every invalid variable at once', () => {
    expect(() => loadAppConfig({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });
});
