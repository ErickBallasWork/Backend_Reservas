import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceManagedAssociatesDto } from './dto/managed-associates.dto';
import { assertValidAssignment } from './managed-associates.policy';

@Injectable()
export class ManagedAssociatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(managerId: string) {
    await this.getManager(managerId);
    const rows = await this.prisma.managedAssociate.findMany({
      where: { managerId },
      select: {
        associate: { select: { id: true, email: true, fullName: true, department: true } },
      },
      orderBy: { associate: { fullName: 'asc' } },
    });
    return rows.map((row) => row.associate);
  }

  async replace(actor: CurrentUserData, managerId: string, dto: ReplaceManagedAssociatesDto) {
    const manager = await this.getManager(managerId);
    const associateIds = [...new Set(dto.associateIds)];
    assertValidAssignment(
      managerId,
      manager.roles.map((r) => r.role.name),
      associateIds,
    );
    await this.assertAssociatesAreActive(associateIds);

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.managedAssociate.findMany({
        where: { managerId },
        select: { associateId: true },
      });
      await tx.managedAssociate.deleteMany({ where: { managerId } });
      await tx.managedAssociate.createMany({
        data: associateIds.map((associateId) => ({
          managerId,
          associateId,
          createdById: actor.id,
        })),
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'MANAGED_ASSOCIATES_REPLACED',
          entity: 'User',
          entityId: managerId,
          details: { before: before.map((row) => row.associateId), after: associateIds },
        },
        tx,
      );
    });
    return this.list(managerId);
  }

  private async getManager(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roles: { select: { role: { select: { name: true } } } } },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `No existe el usuario ${id}`,
      });
    }
    return user;
  }

  private async assertAssociatesAreActive(associateIds: string[]): Promise<void> {
    if (associateIds.length === 0) return;
    const found = await this.prisma.user.count({
      where: { id: { in: associateIds }, isActive: true },
    });
    if (found !== associateIds.length) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Alguno de los asociados no existe o está desactivado',
      });
    }
  }
}
