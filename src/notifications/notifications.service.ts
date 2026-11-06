import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NotificationType } from '../common/constants';
import { Db } from '../common/db.types';
import { toSkipTake } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsQueryDto } from './dto/notifications-query.dto';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
}

const RESPONSE_FIELDS = {
  id: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput, db?: Db): Promise<void> {
    const client = db ?? this.prisma;
    await client.notification.create({
      data: { ...input, channel: 'IN_APP', status: 'SENT', sentAt: new Date() },
    });
  }

  async listMine(userId: string, query: NotificationsQueryDto) {
    const mine: Prisma.NotificationWhereInput = { userId, channel: 'IN_APP' };
    const where = query.unreadOnly ? { ...mine, isRead: false } : mine;
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: RESPONSE_FIELDS,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...mine, isRead: false } }),
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
    const where = { id, userId, channel: 'IN_APP' };
    const notification = await this.prisma.notification.findFirst({
      where,
      select: RESPONSE_FIELDS,
    });
    if (!notification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'El aviso no existe',
      });
    }
    if (notification.isRead) return notification;
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
      select: RESPONSE_FIELDS,
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }
}
