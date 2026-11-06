import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PRIVILEGED_ROLES } from '../common/constants';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { Db } from '../common/db.types';
import { PrismaService } from '../prisma/prisma.service';

const ACTIVE_LEADER: Prisma.UserWhereInput = {
  isActive: true,
  roles: { some: { role: { name: 'LIDER' } } },
};

@Injectable()
export class ApprovalRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async assignedLeaderIds(ownerId: string, db: Db = this.prisma): Promise<string[]> {
    const links = await db.managedAssociate.findMany({
      where: { associateId: ownerId, manager: ACTIVE_LEADER },
      select: { managerId: true },
    });
    return links.map((link) => link.managerId);
  }

  async recipientIds(ownerId: string, db: Db = this.prisma): Promise<string[]> {
    const assigned = await this.assignedLeaderIds(ownerId, db);
    if (assigned.length > 0) return assigned;
    const fallback = await db.user.findMany({
      where: {
        isActive: true,
        id: { not: ownerId },
        roles: { some: { role: { name: { in: [...PRIVILEGED_ROLES] } } } },
      },
      select: { id: true },
    });
    return fallback.map((user) => user.id);
  }

  managedOwnersFilter(viewer: CurrentUserData): Prisma.ReservationWhereInput {
    if (viewer.roles.some((role) => PRIVILEGED_ROLES.includes(role))) return {};
    return { user: { managers: { some: { managerId: viewer.id } } } };
  }

  pendingOwnersFilter(approver: CurrentUserData): Prisma.ReservationWhereInput {
    const routes: Prisma.ReservationWhereInput[] = [];
    if (approver.roles.includes('LIDER')) {
      routes.push({ user: { managers: { some: { managerId: approver.id } } } });
    }
    if (approver.roles.some((role) => PRIVILEGED_ROLES.includes(role))) {
      routes.push({ user: { managers: { none: { manager: ACTIVE_LEADER } } } });
    }
    return { userId: { not: approver.id }, OR: routes.length > 0 ? routes : [{ id: { in: [] } }] };
  }
}
