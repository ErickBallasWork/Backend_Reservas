import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { rethrowNameTaken } from './catalog-errors';
import { CatalogLookupService } from './catalog-lookup.service';
import { GUARDED_TRANSACTION, reservationsOfBuilding } from './catalog-scopes';
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
      throw new NotFoundException({
        code: 'BUILDING_NOT_FOUND',
        message: `No existe el edificio ${id}`,
      });
    }
    return building;
  }

  async create(actor: CurrentUserData, dto: CreateBuildingDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const building = await tx.building.create({
          data: { name: dto.name.trim(), address: dto.address?.trim() },
        });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'BUILDING_CREATED',
            entity: 'Building',
            entityId: building.id,
            details: building,
          },
          tx,
        );
        return building;
      });
    } catch (error) {
      return rethrowNameTaken(error, 'building');
    }
  }

  async update(actor: CurrentUserData, id: string, dto: UpdateBuildingDto) {
    const before = await this.get(id);
    const data: Prisma.BuildingUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.address !== undefined) data.address = dto.address.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isActive === false && before.isActive) {
          await this.lookup.assertNoFutureReservations(
            reservationsOfBuilding(id),
            'El edificio',
            tx,
          );
        }
        const after = await tx.building.update({ where: { id }, data });
        await this.audit.log(
          {
            userId: actor.id,
            action: 'BUILDING_UPDATED',
            entity: 'Building',
            entityId: id,
            details: {
              before: { name: before.name, address: before.address, isActive: before.isActive },
              after,
            },
          },
          tx,
        );
        return after;
      }, GUARDED_TRANSACTION);
    } catch (error) {
      return rethrowNameTaken(error, 'building');
    }
  }
}
