import { toLocalSlot } from '../../operating-hours/operating-calendar';
import { RuleViolation } from '../time-rules';

export const MAX_SERIES_OCCURRENCES = 12;
export const MAX_SERIES_SPAN_DAYS = 90;

const DAY_MS = 86_400_000;

export interface WeeklyRecurrence {
  intervalWeeks: number;
  weekdays: readonly number[];
  occurrenceCount?: number;
  until?: string;
}

function parseDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function localToInstant(dateKey: string, minuteOfDay: number, timeZone: string): Date {
  const wall = parseDateKey(dateKey) + minuteOfDay * 60_000;
  let guess = wall;
  for (let attempt = 0; attempt < 2; attempt++) {
    const local = toLocalSlot(new Date(guess), timeZone);
    guess += wall - (parseDateKey(local.dateKey) + local.minuteOfDay * 60_000);
  }
  return new Date(guess);
}

export function expandWeekly(
  firstStart: Date,
  recurrence: WeeklyRecurrence,
  timeZone: string,
): Date[] {
  if (recurrence.occurrenceCount === undefined && recurrence.until === undefined) {
    throw new RuleViolation(
      'SERIES_LIMIT_REQUIRED',
      'Indica cuántas veces se repite o hasta qué fecha',
    );
  }
  const first = toLocalSlot(firstStart, timeZone);
  if (!recurrence.weekdays.includes(first.dayOfWeek)) {
    throw new RuleViolation(
      'SERIES_START_NOT_IN_WEEKDAYS',
      'El día de la primera reserva debe estar entre los días de la serie',
    );
  }
  if (recurrence.until !== undefined && recurrence.until < first.dateKey) {
    throw new RuleViolation('INVALID_RANGE', 'La fecha final no puede ser anterior al inicio');
  }

  const firstDay = parseDateKey(first.dateKey);
  const mondayOffset = (first.dayOfWeek + 6) % 7;
  const limit = recurrence.occurrenceCount ?? MAX_SERIES_OCCURRENCES + 1;
  const starts: Date[] = [];

  for (let offset = 0; offset <= MAX_SERIES_SPAN_DAYS && starts.length < limit; offset++) {
    const day = new Date(firstDay + offset * DAY_MS);
    const dateKey = day.toISOString().slice(0, 10);
    if (recurrence.until !== undefined && dateKey > recurrence.until) break;
    const weekIndex = Math.floor((offset + mondayOffset) / 7);
    if (weekIndex % recurrence.intervalWeeks !== 0) continue;
    if (!recurrence.weekdays.includes(day.getUTCDay())) continue;
    starts.push(localToInstant(dateKey, first.minuteOfDay, timeZone));
  }

  if (starts.length > MAX_SERIES_OCCURRENCES) {
    throw new RuleViolation(
      'SERIES_TOO_LONG',
      `Una serie no puede tener más de ${MAX_SERIES_OCCURRENCES} reservas`,
    );
  }
  if (recurrence.occurrenceCount !== undefined && starts.length < recurrence.occurrenceCount) {
    throw new RuleViolation(
      'SERIES_TOO_LONG',
      `Una serie no puede extenderse más de ${MAX_SERIES_SPAN_DAYS} días`,
    );
  }
  return starts;
}
