import { Prisma } from '@prisma/client';
import { chunk } from './time-rules';

/**
 * Inserta una fila por cada recurso y cada franja. Si alguna ya existe, SQL Server la rechaza por
 * la clave única (ResourceId, SlotStart) y Prisma lanza el error P2002: así es imposible reservar
 * dos veces lo mismo, aunque dos personas lo intenten en el mismo instante.
 */
export async function insertSlots(
  tx: Prisma.TransactionClient,
  reservationId: string,
  resourceIds: string[],
  slotStarts: Date[],
  slotMinutes: number,
): Promise<number> {
  // Siempre en el mismo orden (recurso y luego hora) para que dos transacciones simultáneas
  // tomen los bloqueos en el mismo orden y no se traben entre sí (deadlock).
  const rows = [...resourceIds].sort().flatMap((resourceId) =>
    slotStarts.map((slotStart) => ({
      reservationId,
      resourceId,
      slotStart,
      slotEnd: new Date(slotStart.getTime() + slotMinutes * 60_000),
    })),
  );
  // 4 columnas por fila: 400 filas = 1600 parámetros, por debajo del límite de 2100 de SQL Server.
  for (const group of chunk(rows, 400)) {
    await tx.reservationSlot.createMany({ data: group });
  }
  return rows.length;
}
