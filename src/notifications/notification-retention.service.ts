import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const READ_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 90;
export const DELIVERY_RETENTION_DAYS = 7;
const BATCH_SIZE = 500;
const MAX_BATCHES_PER_RUN = 20;

@Injectable()
export class NotificationRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async purge(now = new Date()): Promise<{ purged: number }> {
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const expired: Prisma.NotificationWhereInput = {
      OR: [
        { channel: 'IN_APP', isRead: true, createdAt: { lt: daysAgo(READ_RETENTION_DAYS) } },
        { channel: 'IN_APP', createdAt: { lt: daysAgo(MAX_RETENTION_DAYS) } },
        { channel: { not: 'IN_APP' }, createdAt: { lt: daysAgo(DELIVERY_RETENTION_DAYS) } },
      ],
    };

    let purged = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const rows = await this.prisma.notification.findMany({
        where: expired,
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      const { count } = await this.prisma.notification.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      purged += count;
      if (rows.length < BATCH_SIZE) break;
    }
    return { purged };
  }
}
