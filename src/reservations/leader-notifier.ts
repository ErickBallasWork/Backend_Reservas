import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LeaderNotifier {
  constructor(private readonly notifications: NotificationsService) {}

  async requestApproval(tx: Prisma.TransactionClient, requester: string, label: string) {
    const leaders = await tx.userRole.findMany({
      where: { role: { name: 'LIDER' }, user: { isActive: true } },
      select: { userId: true },
    });
    for (const userId of [...new Set<string>(leaders.map((l) => l.userId))]) {
      await this.notifications.notify(
        {
          userId,
          type: 'APPROVAL_REQUESTED',
          title: 'Entrenamiento por aprobar',
          message: `${requester} solicitó ${label} para un entrenamiento.`,
        },
        tx,
      );
    }
  }
}
