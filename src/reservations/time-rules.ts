const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export class RuleViolation extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RuleViolation';
    this.code = code;
  }
}

export interface TimeRuleOptions {
  slotMinutes: number;
  minAdvanceHours: number;
  maxDurationHours: number;
}

export function isAlignedToSlot(date: Date, slotMinutes: number): boolean {
  return date.getTime() % (slotMinutes * MINUTE) === 0;
}

export function validateReservationTimes(
  start: Date,
  end: Date,
  now: Date,
  options: TimeRuleOptions,
): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new RuleViolation('INVALID_DATE', 'Las fechas no son válidas');
  }
  if (end.getTime() <= start.getTime()) {
    throw new RuleViolation('END_BEFORE_START', 'La hora de fin debe ser posterior a la de inicio');
  }
  if (!isAlignedToSlot(start, options.slotMinutes) || !isAlignedToSlot(end, options.slotMinutes)) {
    throw new RuleViolation(
      'NOT_ALIGNED',
      `Las horas deben coincidir con franjas de ${options.slotMinutes} minutos (por ejemplo 10:00 o 10:30)`,
    );
  }
  if (start.getTime() <= now.getTime()) {
    throw new RuleViolation('START_IN_PAST', 'La reserva debe empezar en el futuro');
  }
  if (start.getTime() - now.getTime() < options.minAdvanceHours * HOUR) {
    throw new RuleViolation(
      'MIN_ADVANCE',
      `Debes reservar con al menos ${options.minAdvanceHours} horas de anticipación`,
    );
  }
  if (end.getTime() - start.getTime() > options.maxDurationHours * HOUR) {
    throw new RuleViolation(
      'MAX_DURATION',
      `Una reserva no puede durar más de ${options.maxDurationHours} horas seguidas`,
    );
  }
}

export function buildSlotStarts(start: Date, end: Date, slotMinutes: number): Date[] {
  const step = slotMinutes * MINUTE;
  const starts: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    starts.push(new Date(t));
  }
  return starts;
}

export function canCancel(start: Date, now: Date, cancelMinHours: number): boolean {
  return start.getTime() - now.getTime() >= cancelMinHours * HOUR;
}

export function canCancelReservation(
  start: Date,
  now: Date,
  cancelMinHours: number,
  reallocated: boolean,
): boolean {
  if (reallocated) return start.getTime() > now.getTime();
  return canCancel(start, now, cancelMinHours);
}

export function isWithinCheckInWindow(
  start: Date,
  now: Date,
  beforeMin: number,
  afterMin: number,
): boolean {
  const t = now.getTime();
  return t >= start.getTime() - beforeMin * MINUTE && t <= start.getTime() + afterMin * MINUTE;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}
