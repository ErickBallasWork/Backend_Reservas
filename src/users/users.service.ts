import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { USER_WITH_ROLES } from '../auth/current-user.mapper';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/user.dto';
import { RoleRowsService } from './role-rows.service';
import { assertCanManageRoles, removesSuperadminAccess } from './role-assignment.policy';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roleRows: RoleRowsService,
  ) {}

  async me(user: CurrentUserData) {
    const activeSanction = await this.prisma.sanction.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      select: { id: true, reason: true, startDate: true },
    });
    return { ...user, activeSanction };
  }

  listRoles() {
    return this.prisma.role.findMany({ orderBy: { id: 'asc' } });
  }

  async list() {
    const users = await this.prisma.user.findMany({
      include: { roles: { include: { role: true, building: { select: { name: true } } } } },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      department: u.department,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      roles: u.roles.map((r) => ({
        role: r.role.name,
        buildingId: r.buildingId,
        building: r.building?.name ?? null,
      })),
    }));
  }

  async update(admin: CurrentUserData, id: string, dto: UpdateUserDto) {
    const before = await this.get(id);
    const beforeRoles = before.roles.map((r) => r.role.name);
    const requestedRoles = dto.roles?.map((r) => r.role);
    assertCanManageRoles(admin.roles, beforeRoles, requestedRoles);
    await this.assertKeepsASuperadmin(
      id,
      { isActive: before.isActive, roles: beforeRoles },
      {
        isActive: dto.isActive,
        roles: requestedRoles,
      },
    );
    const rows = dto.roles ? await this.roleRows.resolve(dto.roles) : null;

    await this.prisma.$transaction(async (tx) => {
      if (rows) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: rows.map((r) => ({ ...r, userId: id })) });
      }
      const data: Prisma.UserUpdateInput = {};
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      if (dto.department !== undefined) data.department = dto.department.trim();
      await tx.user.update({ where: { id }, data });
      if (dto.isActive === false) {
        await tx.device.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.log(
        {
          userId: admin.id,
          action: 'USER_UPDATED',
          entity: 'User',
          entityId: id,
          details: {
            before: { isActive: before.isActive, roles: before.roles.map((r) => r.role.name) },
            after: { isActive: dto.isActive ?? before.isActive, roles: dto.roles ?? 'sin cambios' },
          },
        },
        tx,
      );
    });
    return this.get(id);
  }

  private async assertKeepsASuperadmin(
    id: string,
    before: { isActive: boolean; roles: string[] },
    change: { isActive?: boolean; roles?: string[] },
  ) {
    if (!removesSuperadminAccess(before, change)) return;
    const others = await this.prisma.user.count({
      where: { id: { not: id }, isActive: true, roles: { some: { role: { name: 'SUPERADMIN' } } } },
    });
    if (others === 0) {
      throw new ConflictException({
        code: 'LAST_SUPERADMIN',
        message: 'Debe quedar al menos un SUPERADMIN activo',
      });
    }
  }

  private async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: USER_WITH_ROLES });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `No existe el usuario ${id}`,
      });
    }
    return user;
  }
}
