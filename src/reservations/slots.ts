import { Prisma } from '@prisma/client';
import { chunk } from './time-rules';

export async function insertSlots(
  tx: Prisma.TransactionClient,
  reservationId: string,
  resourceIds: string[],
  slotStarts: Date[],
  slotMinutes: number,
): Promise<number> {
  // A fixed insert order across transactions avoids deadlocks.
  const rows = [...resourceIds].sort().flatMap((resourceId) =>
    slotStarts.map((slotStart) => ({
      reservationId,
      resourceId,
      slotStart,
      slotEnd: new Date(slotStart.getTime() + slotMinutes * 60_000),
    })),
  );
  // 4 params per row keeps each insert under the 2100 param limit.
  for (const group of chunk(rows, 400)) {
    await tx.reservationSlot.createMany({ data: group });
  }
  return rows.length;
}
