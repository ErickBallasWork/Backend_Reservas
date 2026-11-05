// Fechas legibles para los mensajes de aviso, en la hora de Ecuador (o APP_TIME_ZONE).
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: process.env.APP_TIME_ZONE || 'America/Guayaquil',
  }).format(date);
}
