import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPushPayload } from './push-payload';
import { PushSender } from './push-sender';

export const MAX_PUSH_ATTEMPTS = 3;
const BATCH_SIZE = 50;

interface PendingPush {
  id: string;
  userId: string;
  title: string;
  message: string;
}

@Injectable()
export class PushDispatcherService {
  private readonly logger = new Logger(PushDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: PushSender,
    private readonly appConfig: AppConfigService,
  ) {}

  async dispatchPending(): Promise<{ sent: number; failed: number }> {
    if (!this.appConfig.push) return { sent: 0, failed: 0 };
    const pending = await this.prisma.notification.findMany({
      where: { channel: 'PUSH', status: 'PENDING', attempts: { lt: MAX_PUSH_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    let sent = 0;
    let failed = 0;
    for (const notification of pending) {
      // Only the instance that moves the attempt counter first delivers this row.
      const claimed = await this.prisma.notification.updateMany({
        where: { id: notification.id, status: 'PENDING', attempts: notification.attempts },
        data: { attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue;

      if (await this.deliver(notification)) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        sent++;
      } else if (notification.attempts + 1 >= MAX_PUSH_ATTEMPTS) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'FAILED' },
        });
        failed++;
      }
    }
    return { sent, failed };
  }

  private async deliver(notification: PendingPush): Promise<boolean> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: notification.userId },
    });
    if (subscriptions.length === 0) return true;

    const payload = buildPushPayload(notification);
    let reached = 0;
    let transientFailures = 0;
    for (const subscription of subscriptions) {
      try {
        const outcome = await this.sender.send(subscription, payload);
        if (outcome === 'delivered') reached++;
        else await this.prisma.pushSubscription.delete({ where: { id: subscription.id } });
      } catch (error) {
        transientFailures++;
        this.logger.warn(`Push to ${subscription.id} failed: ${String(error)}`);
      }
    }
    return reached > 0 || transientFailures === 0;
  }
}
