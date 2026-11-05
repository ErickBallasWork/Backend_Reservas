import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogLookupService } from './catalog-lookup.service';
import { CreateBuildingDto, UpdateBuildingDto } from './dto/building.dto';

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly audit: AuditService,
  ) {}

  list(includeInactive = false) {
    return this.prisma.building.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string) {
    const building = await this.prisma.building.findUnique({
      where: { id },
      include: {
        resources: { where: { parentResourceId: null }, orderBy: { name: 'asc' } },
      },
    });
    if (!building) {
      throw new NotFoundException({ code: 'BUILDING_NOT_FOUND', message: `No existe el edificio ${id}` });
    }
    return building;
  }

  async create(actor: CurrentUserData, dto: CreateBuildingDto) {
    const building = await this.prisma.building.create({
      data: { name: dto.name.trim(), address: dto.address?.trim() },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'BUILDING_CREATED',
      entity: 'Building',
      entityId: building.id,
      details: building,
    });
    return building;
  }

  async update(actor: CurrentUserData, id: string, dto: UpdateBuildingDto) {
    const before = await this.get(id);
    if (dto.isActive === false && before.isActive) {
      await this.lookup.assertNoFutureReservations({ resource: { buildingId: id } }, 'El edificio');
    }
    const data: Prisma.BuildingUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.address !== undefined) data.address = dto.address.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const after = await this.prisma.building.update({ where: { id }, data });
    await this.audit.log({
      userId: actor.id,
      action: 'BUILDING_UPDATED',
      entity: 'Building',
      entityId: id,
      details: {
        before: { name: before.name, address: before.address, isActive: before.isActive },
        after,
      },
    });
    return after;
  }
}
