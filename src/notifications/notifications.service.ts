import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from '../common/db.types';
import { toSkipTake } from '../common/pagination.dto';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsQueryDto } from './notifications-query.dto';

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  message: string;
}

interface ChannelSender {
  send(input: { email: string; title: string; message: string }): Promise<void>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly senders: Record<string, ChannelSender> = {
    EMAIL: this.simulatedSender('e-mail'),
    PUSH: this.simulatedSender('push'),
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  private simulatedSender(channel: string): ChannelSender {
    return {
      send: ({ email, title }) => {
        this.logger.log(`[simulated] ${channel} to ${email}: ${title}`);
        return Promise.resolve();
      },
    };
  }

  async notify(input: NotifyInput, db?: Db): Promise<void> {
    const client = db ?? this.prisma;
    const now = new Date();
    await client.notification.createMany({
      data: [
        { ...input, channel: 'IN_APP', status: 'SENT', sentAt: now },
        ...this.appConfig.notifications.extraChannels.map((channel) => ({
          ...input,
          channel,
          status: 'PENDING',
        })),
      ],
    });
  }

  async listMine(userId: string, query: NotificationsQueryDto) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: 'IN_APP',
      ...(query.unreadOnly ? { isRead: false } : {}),
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, channel: 'IN_APP', isRead: false } }),
    ]);
    return { total, unread, page: query.page, pageSize: query.pageSize, items };
  }

  async unreadCount(userId: string) {
    const unread = await this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', isRead: false },
    });
    return { unread };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, channel: 'IN_APP' },
    });
    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'El aviso no existe',
      });
    }
    if (notification.isRead) return notification;
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  async processPending(limit = 50) {
    const pending = await this.prisma.notification.findMany({
      where: { channel: { not: 'IN_APP' }, status: 'PENDING', attempts: { lt: 3 } },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let sent = 0;
    let failed = 0;
    for (const notification of pending) {
      const sender = this.senders[notification.channel];
      try {
        if (!sender) throw new Error(`Channel ${notification.channel} is not configured`);
        await sender.send({
          email: notification.user.email,
          title: notification.title,
          message: notification.message,
        });
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
        });
        sent++;
      } catch (error) {
        const attempts = notification.attempts + 1;
        this.logger.warn(`Could not send ${notification.id}: ${String(error)}`);
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { attempts, status: attempts >= 3 ? 'FAILED' : 'PENDING' },
        });
        failed++;
      }
    }
    return { processed: pending.length, sent, failed };
  }
}
