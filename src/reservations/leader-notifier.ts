import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalRoutingService } from './approval-routing.service';

export interface ApprovalRequest {
  requesterId: string;
  requesterName: string;
  label: string;
  count?: number;
}

@Injectable()
export class LeaderNotifier {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly routing: ApprovalRoutingService,
  ) {}

  async requestApproval(tx: Prisma.TransactionClient, request: ApprovalRequest) {
    const count = request.count ?? 1;
    const message =
      count > 1
        ? `${request.requesterName} solicitó ${count} entrenamientos de ${request.label}.`
        : `${request.requesterName} solicitó ${request.label} para un entrenamiento.`;
    const recipients = await this.routing.recipientIds(request.requesterId, tx);
    for (const userId of recipients) {
      await this.notifications.notify(
        { userId, type: 'APPROVAL_REQUESTED', title: 'Entrenamiento por aprobar', message },
        tx,
      );
    }
  }
}
