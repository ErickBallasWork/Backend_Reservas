import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from '../common/db.types';
import { toSkipTake } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './audit-query.dto';

export interface AuditEntry {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db?: Db): Promise<void> {
    const client = db ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        details: entry.details === undefined ? null : JSON.stringify(entry.details),
      },
    });
  }

  async list(query: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { eventDate: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      // Id is a BIGINT, which JSON cannot represent.
      items: items.map((item) => ({
        ...item,
        id: item.id.toString(),
        details: item.details ? JSON.parse(item.details) : null,
      })),
    };
  }
}
