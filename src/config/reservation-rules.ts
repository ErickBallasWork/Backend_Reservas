// Reglas de reserva leídas del .env, con valores por defecto.
// Se leen en cada llamada para que un cambio en el .env aplique al reiniciar sin tocar código.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export interface ReservationRules {
  slotMinutes: number;
  minAdvanceHours: number;
  maxDurationHours: number;
  cancelMinHours: number;
  checkinBeforeMin: number;
  checkinAfterMin: number;
}

export function reservationRules(): ReservationRules {
  return {
    slotMinutes: num('SLOT_MINUTES', 30),
    minAdvanceHours: num('MIN_ADVANCE_HOURS', 24),
    maxDurationHours: num('MAX_DURATION_HOURS', 48),
    cancelMinHours: num('CANCEL_MIN_HOURS', 24),
    checkinBeforeMin: num('CHECKIN_BEFORE_MIN', 15),
    checkinAfterMin: num('CHECKIN_AFTER_MIN', 15),
  };
}
