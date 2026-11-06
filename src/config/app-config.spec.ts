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
    JOB_KEY: SECRET,
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
      trustProxyHops: 0,
      timeZone: 'America/Guayaquil',
    });
    expect(config.auth.jwtExpiresInSeconds).toBe(15 * 60);
    expect(config.auth.deviceIdleDays).toBe(30);
    expect(config.auth.demoLoginEnabled).toBe(false);
    expect(config.jobs.jobKey).toBeNull();
    expect(config.jobs.noShowEnforcedFrom).toBeNull();
  });

  it('treats empty values as missing', () => {
    const config = loadAppConfig(baseEnv({ DEMO_LOGIN_ENABLED: '', JOB_KEY: '', PORT: '' }));

    expect(config.auth.demoLoginEnabled).toBe(false);
    expect(config.jobs.jobKey).toBeNull();
    expect(config.server.port).toBe(3001);
  });

  it('parses the no-show enforcement date', () => {
    const config = loadAppConfig(baseEnv({ NO_SHOW_ENFORCED_FROM: '2026-11-15T00:00:00Z' }));

    expect(config.jobs.noShowEnforcedFrom).toEqual(new Date('2026-11-15T00:00:00Z'));
  });

  it('rejects an invalid no-show enforcement date', () => {
    expect(() => loadAppConfig(baseEnv({ NO_SHOW_ENFORCED_FROM: 'tomorrow' }))).toThrow(
      'NO_SHOW_ENFORCED_FROM',
    );
  });

  it('parses comma separated lists', () => {
    const config = loadAppConfig(
      baseEnv({
        CORS_ORIGINS: 'http://localhost:3000, https://app.example.com',
        ALLOWED_EMAIL_DOMAINS: ' TCS.com ,pichincha.com,',
      }),
    );

    expect(config.server.corsOrigins).toEqual(['http://localhost:3000', 'https://app.example.com']);
    expect(config.auth.allowedEmailDomains).toEqual(['tcs.com', 'pichincha.com']);
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

  it('rejects more proxy hops than a deployment can have', () => {
    expect(() => loadAppConfig(baseEnv({ TRUST_PROXY_HOPS: '9' }))).toThrow('TRUST_PROXY_HOPS');
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

  it('requires the job key in production', () => {
    expect(() => loadAppConfig(productionEnv({ JOB_KEY: '' }))).toThrow(
      'JOB_KEY: is required in production',
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
