const MINUTE_MS = 60_000;

export const REALLOCATION_MIN_NOTICE_MINUTES = 30;

export function wasReallocatedWithShortNotice(
  start: Date,
  reallocatedAt: Date | undefined,
  minNoticeMinutes: number = REALLOCATION_MIN_NOTICE_MINUTES,
): boolean {
  if (!reallocatedAt) return false;
  return start.getTime() - reallocatedAt.getTime() < minNoticeMinutes * MINUTE_MS;
}
