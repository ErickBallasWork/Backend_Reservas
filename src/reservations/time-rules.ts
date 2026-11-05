// Reglas de tiempo y franjas. Son funciones puras (sin base de datos) para poder probarlas fácil.
// Todas las fechas se manejan en UTC.

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

/** true si la fecha cae justo en el borde de una franja (por ejemplo 10:00 o 10:30 con franjas de 30 min). */
export function isAlignedToSlot(date: Date, slotMinutes: number): boolean {
  return date.getTime() % (slotMinutes * MINUTE) === 0;
}

/** Valida una reserva nueva o reasignada. Lanza RuleViolation con un código si algo no cumple. */
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

/** Inicio de cada franja entre start (incluido) y end (excluido). */
export function buildSlotStarts(start: Date, end: Date, slotMinutes: number): Date[] {
  const step = slotMinutes * MINUTE;
  const starts: Date[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    starts.push(new Date(t));
  }
  return starts;
}

/** Se puede cancelar si faltan al menos cancelMinHours para el inicio (RF-05). */
export function canCancel(start: Date, now: Date, cancelMinHours: number): boolean {
  return start.getTime() - now.getTime() >= cancelMinHours * HOUR;
}

/** El check-in se acepta desde beforeMin minutos antes hasta afterMin minutos después del inicio. */
export function isWithinCheckInWindow(
  start: Date,
  now: Date,
  beforeMin: number,
  afterMin: number,
): boolean {
  const t = now.getTime();
  return t >= start.getTime() - beforeMin * MINUTE && t <= start.getTime() + afterMin * MINUTE;
}

/** Divide una lista en grupos (SQL Server acepta un máximo de parámetros por consulta). */
export function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}
