import { createHash, timingSafeEqual } from 'node:crypto';
import { ACCESS_REQUEST_COOLDOWN_DAYS } from '../common/constants';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export function isAllowedDomain(email: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.includes(emailDomain(email));
}

export function cooldownEndsAt(rejectedAt: Date): Date {
  return new Date(rejectedAt.getTime() + ACCESS_REQUEST_COOLDOWN_DAYS * MS_PER_DAY);
}

export function hashDeviceSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function matchesDeviceSecret(secret: string, storedHash: string): boolean {
  const actual = Buffer.from(hashDeviceSecret(secret));
  const expected = Buffer.from(storedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
