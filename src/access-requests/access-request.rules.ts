import {
  ACCESS_REQUEST_COOLDOWN_DAYS,
  BOOTSTRAP_AUTO_APPROVE_WINDOW_HOURS,
} from '../common/constants';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

export function isAllowedDomain(email: string, allowedDomains: readonly string[]): boolean {
  return allowedDomains.includes(emailDomain(email));
}

export function cooldownEndsAt(rejectedAt: Date): Date {
  return new Date(rejectedAt.getTime() + ACCESS_REQUEST_COOLDOWN_DAYS * MS_PER_DAY);
}

export function isBootstrapWindowOpen(userCreatedAt: Date, now: Date = new Date()): boolean {
  const elapsed = now.getTime() - userCreatedAt.getTime();
  return elapsed >= 0 && elapsed <= BOOTSTRAP_AUTO_APPROVE_WINDOW_HOURS * MS_PER_HOUR;
}
