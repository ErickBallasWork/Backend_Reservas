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
