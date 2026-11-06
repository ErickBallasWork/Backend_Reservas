export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}
