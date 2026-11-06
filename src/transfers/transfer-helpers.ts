import { Prisma } from '@prisma/client';
import { TransferStatus } from '../common/constants';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Cierra (EXPIRED) las solicitudes de cesión pendientes de una reserva y avisa a quienes las pidieron.
 * Se usa cuando la reserva ya no se puede ceder: su dueño la canceló, el SPOC la movió, ya empezó
 * o se cedió a otra persona. Recibe "tx" para guardarse en la misma transacción que ese cambio.
 * Es una función suelta (no un service) para que reservas, reasignaciones y sanciones la usen
 * sin crear dependencias circulares entre módulos.
 */
export async function closePendingTransfers(
  tx: Prisma.TransactionClient,
  notifications: NotificationsService,
  reservationId: string,
  notice: { title: string; message: string },
): Promise<number> {
  const pending = await tx.transferRequest.findMany({
    where: { reservationId, status: TransferStatus.PENDING },
    select: { id: true, requesterId: true },
  });
  if (pending.length === 0) return 0;

  await tx.transferRequest.updateMany({
    where: { id: { in: pending.map((p) => p.id) }, status: TransferStatus.PENDING },
    data: { status: TransferStatus.EXPIRED, respondedAt: new Date() },
  });
  for (const request of pending) {
    await notifications.notify(
      { userId: request.requesterId, type: 'TRANSFER_EXPIRED', title: notice.title, message: notice.message },
      tx,
    );
  }
  return pending.length;
}