import type { Prisma } from '@prisma/client';
import { TransferStatus } from '../common/constants';
import type { NotificationsService } from '../notifications/notifications.service';

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
      {
        userId: request.requesterId,
        type: 'TRANSFER_EXPIRED',
        title: notice.title,
        message: notice.message,
      },
      tx,
    );
  }
  return pending.length;
}
