import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { USER_WITH_ROLES } from '../auth/current-user.mapper';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, RoleAssignmentDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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

  /** Convierte la lista de roles pedida en filas de USER_ROLE (valida rol y edificio). */
  private async toRoleRows(roles: RoleAssignmentDto[]) {
    const all = await this.prisma.role.findMany();
    const idByName = new Map<string, number>(all.map((r) => [r.name, r.id]));
    const rows: { roleId: number; buildingId: string | null }[] = [];
    for (const r of roles) {
      const roleId = idByName.get(r.role);
      if (roleId === undefined) {
        throw new BadRequestException({
          code: 'ROLE_NOT_FOUND',
          message: `El rol ${r.role} no existe. ¿Corriste el seed?`,
        });
      }
      let buildingId: string | null = null;
      if (r.role === 'SPOC_EDIFICIO') {
        if (!r.buildingId) {
          throw new BadRequestException({
            code: 'BUILDING_REQUIRED',
            message: 'El rol SPOC_EDIFICIO necesita buildingId',
          });
        }
        const building = await this.prisma.building.findUnique({ where: { id: r.buildingId } });
        if (!building) {
          throw new NotFoundException({
            code: 'BUILDING_NOT_FOUND',
            message: `No existe el edificio ${r.buildingId}`,
          });
        }
        buildingId = building.id;
      }
      rows.push({ roleId, buildingId });
    }
    return rows;
  }

  /** El Administrador da de alta a un usuario antes de que entre (útil con AUTO_CREATE_USERS=false). */
  async create(admin: CurrentUserData, dto: CreateUserDto) {
    const roles: RoleAssignmentDto[] = dto.roles ?? [{ role: 'ASOCIADO' }];
    const rows = await this.toRoleRows(roles);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.trim().toLowerCase(),
          fullName: dto.fullName.trim(),
          department: dto.department?.trim(),
        },
      });
      await tx.userRole.createMany({ data: rows.map((r) => ({ ...r, userId: created.id })) });
      await this.audit.log(
        {
          userId: admin.id,
          action: 'USER_CREATED',
          entity: 'User',
          entityId: created.id,
          details: { email: created.email, roles },
        },
        tx,
      );
      return created;
    });
    return this.get(user.id);
  }

  /** Activar o desactivar, cambiar departamento y asignar roles (HU de asignación de roles). */
  async update(admin: CurrentUserData, id: string, dto: UpdateUserDto) {
    const before = await this.get(id);
    const rows = dto.roles ? await this.toRoleRows(dto.roles) : null;

    await this.prisma.$transaction(async (tx) => {
      if (rows) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: rows.map((r) => ({ ...r, userId: id })) });
      }
      const data: Prisma.UserUpdateInput = {};
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      if (dto.department !== undefined) data.department = dto.department.trim();
      await tx.user.update({ where: { id }, data });
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
