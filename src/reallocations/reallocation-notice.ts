import { formatDate } from '../common/format';

const NOTIFICATION_MESSAGE_LIMIT = 1000;
const SEPARATOR = ' — ';

interface NoticePlacement {
  roomLabel: string;
  startDateTime: Date;
  endDateTime: Date;
}

export interface ReallocationNoticeInput {
  previous: NoticePlacement;
  next: NoticePlacement;
  justification: string;
  inSeries: boolean;
  timeZone: string;
}

function describePlacement(placement: NoticePlacement, timeZone: string): string {
  const start = formatDate(placement.startDateTime, timeZone);
  const end = formatDate(placement.endDateTime, timeZone);
  return `${placement.roomLabel}, del ${start} al ${end}`;
}

export function buildReallocationNotice(input: ReallocationNoticeInput): string {
  const { previous, next, timeZone } = input;
  const head = [
    'Tu reserva fue reasignada.',
    `Antes: ${describePlacement(previous, timeZone)}`,
    `Ahora: ${describePlacement(next, timeZone)}`,
  ].join(SEPARATOR);
  const tail = [
    ...(input.inSeries ? ['Solo cambia esta fecha de tu serie'] : []),
    'Si no puedes asistir, puedes cancelarla sin el mínimo de anticipación',
  ].join(SEPARATOR);
  const prefix = `${head}${SEPARATOR}Motivo: `;
  const suffix = `${SEPARATOR}${tail}`;
  const room = NOTIFICATION_MESSAGE_LIMIT - prefix.length - suffix.length;
  const justification =
    input.justification.length <= room
      ? input.justification
      : `${input.justification.slice(0, Math.max(room - 1, 0))}…`;
  return `${prefix}${justification}${suffix}`;
}
