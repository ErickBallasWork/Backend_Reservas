import { formatDate } from '../../common/format';

export interface ReminderNoticeInput {
  label: string;
  startDateTime: Date;
  endDateTime: Date;
  checkinBeforeMin: number;
  timeZone: string;
}

export const REMINDER_TITLE = 'Tu reserva empieza pronto';

export function buildReminderNotice(input: ReminderNoticeInput): string {
  const start = formatDate(input.startDateTime, input.timeZone);
  const end = formatDate(input.endDateTime, input.timeZone);
  return `${input.label}, del ${start} al ${end}. Registra tu uso desde ${input.checkinBeforeMin} min antes del inicio.`;
}
