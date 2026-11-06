const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export interface RateLimit {
  limit: number;
  ttl: number;
}

export const RATE_LIMITS = {
  global: { limit: 120, ttl: MINUTE_MS },
  accessRequest: { limit: 5, ttl: HOUR_MS },
  accessRequestStatus: { limit: 40, ttl: MINUTE_MS },
  deviceSession: { limit: 10, ttl: 10 * MINUTE_MS },
  refresh: { limit: 30, ttl: MINUTE_MS },
  logout: { limit: 30, ttl: MINUTE_MS },
  demoLogin: { limit: 10, ttl: MINUTE_MS },
} satisfies Record<string, RateLimit>;

export function limitFor(name: Exclude<keyof typeof RATE_LIMITS, 'global'>) {
  return { default: RATE_LIMITS[name] };
}
