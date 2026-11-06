const MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface DailyWindow {
  dayOfWeek: number;
  opensAtMinute: number;
  closesAtMinute: number;
}

export interface OperatingCalendar {
  windows: readonly DailyWindow[] | null;
  closedDates: ReadonlySet<string>;
}

export interface LocalSlot {
  start: Date;
  dateKey: string;
  dayOfWeek: number;
  minuteOfDay: number;
}

export interface OpenWindow {
  start: Date;
  end: Date;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function toLocalSlot(start: Date, timeZone: string): LocalSlot {
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(start)) parts[part.type] = part.value;
  return {
    start,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    dayOfWeek: WEEKDAYS[parts.weekday] ?? 0,
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function toLocalSlots(starts: readonly Date[], timeZone: string): LocalSlot[] {
  return starts.map((start) => toLocalSlot(start, timeZone));
}

export function isSlotOpen(slot: LocalSlot, slotMinutes: number, calendar: OperatingCalendar) {
  if (calendar.closedDates.has(slot.dateKey)) return false;
  if (calendar.windows === null) return true;
  return calendar.windows.some(
    (window) =>
      window.dayOfWeek === slot.dayOfWeek &&
      window.opensAtMinute <= slot.minuteOfDay &&
      slot.minuteOfDay + slotMinutes <= window.closesAtMinute,
  );
}

export function findClosedSlot(
  slots: readonly LocalSlot[],
  slotMinutes: number,
  calendar: OperatingCalendar,
): LocalSlot | null {
  return slots.find((slot) => !isSlotOpen(slot, slotMinutes, calendar)) ?? null;
}

export function toOpenWindows(
  slots: readonly LocalSlot[],
  slotMinutes: number,
  calendar: OperatingCalendar,
): OpenWindow[] {
  const windows: OpenWindow[] = [];
  const step = slotMinutes * MINUTE;
  for (const slot of slots) {
    if (!isSlotOpen(slot, slotMinutes, calendar)) continue;
    const end = new Date(slot.start.getTime() + step);
    const last = windows[windows.length - 1];
    if (last && last.end.getTime() === slot.start.getTime()) last.end = end;
    else windows.push({ start: slot.start, end });
  }
  return windows;
}

export function parseTimeOfDay(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTimeOfDay(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const minutes = String(minute % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function findWindowProblem(
  windows: readonly DailyWindow[],
  slotMinutes: number,
): string | null {
  for (const window of windows) {
    if (window.opensAtMinute >= window.closesAtMinute) {
      return 'La hora de cierre debe ser posterior a la de apertura';
    }
    if (window.closesAtMinute > MINUTES_PER_DAY) return 'El cierre no puede pasar de las 24:00';
    if (window.opensAtMinute % slotMinutes !== 0 || window.closesAtMinute % slotMinutes !== 0) {
      return `Las horas deben coincidir con franjas de ${slotMinutes} minutos`;
    }
  }
  const sorted = [...windows].sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAtMinute - b.opensAtMinute,
  );
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    if (
      previous.dayOfWeek === sorted[i].dayOfWeek &&
      previous.closesAtMinute > sorted[i].opensAtMinute
    ) {
      return 'Los horarios de un mismo día no pueden traslaparse';
    }
  }
  return null;
}
