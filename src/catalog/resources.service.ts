import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { rethrowNameTaken } from './catalog-errors';
import { CatalogLookupService } from './catalog-lookup.service';
import { GUARDED_TRANSACTION, reservationsOfResource } from './catalog-scopes';
import { CreateResourceDto, ListResourcesQueryDto, UpdateResourceDto } from './dto/resource.dto';
import { LabLaptopSlotsService } from './lab-laptop-slots.service';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly audit: AuditService,
    private readonly labLaptopSlots: LabLaptopSlotsService,
  ) {}

  list(query: ListResourcesQueryDto) {
    const where: Prisma.ResourceWhereInput = {
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.parentResourceId ? { parentResourceId: query.parentResourceId } : {}),
      ...(query.minCapacity ? { capacity: { gte: query.minCapacity } } : {}),
      ...(query.includeInactive ? {} : { isActive: true }),
    };
    return this.prisma.resource.findMany({
      where,
      include: {
        building: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: {
        building: { select: { id: true, name: true, isActive: true } },
        parent: { select: { id: true, name: true } },
        children: { orderBy: { name: 'asc' } },
      },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `No existe el recurso ${id}`,
      });
    }
    return resource;
  }

  private async getActiveLab(labId: string) {
    const lab = await this.prisma.resource.findUnique({ where: { id: labId } });
    if (!lab) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `No existe el recurso ${labId}`,
      });
    }
    if (lab.type !== 'AI_LAB') {
      throw new UnprocessableEntityException({
        code: 'WRONG_RESOURCE_TYPE',
        message: 'Una laptop solo puede pertenecer a un laboratorio de IA',
      });
    }
    if (!lab.isActive) {
      throw new UnprocessableEntityException({
        code: 'PARENT_INACTIVE',
        message: 'El laboratorio está inactivo. Reactívalo primero',
      });
    }
    return lab;
  }

  private async getActiveBuilding(buildingId: string) {
    const building = await this.prisma.building.findUnique({ where: { id: buildingId } });
    if (!building) {
      throw new NotFoundException({
        code: 'BUILDING_NOT_FOUND',
        message: `No existe el edificio ${buildingId}`,
      });
    }
    if (!building.isActive) {
      throw new UnprocessableEntityException({
        code: 'BUILDING_INACTIVE',
        message: 'El edificio está inactivo',
      });
    }
    return building;
  }

  async create(actor: CurrentUserData, dto: CreateResourceDto) {
    let buildingId: string;
    let parentResourceId: string | null = null;
    let capacity = dto.capacity ?? 1;

    if (dto.type === 'LAPTOP') {
      if (!dto.parentResourceId) {
        throw new BadRequestException({
          code: 'LAB_REQUIRED',
          message: 'Una laptop necesita parentResourceId (su laboratorio de IA)',
        });
      }
      const lab = await this.getActiveLab(dto.parentResourceId);
      buildingId = lab.buildingId;
      parentResourceId = lab.id;
      capacity = 1;
    } else {
      if (!dto.buildingId) {
        throw new BadRequestException({ code: 'BUILDING_REQUIRED', message: 'Indica buildingId' });
      }
      if (dto.parentResourceId) {
        throw new BadRequestException({
          code: 'PARENT_NOT_ALLOWED',
          message: 'Solo las laptops tienen parentResourceId',
        });
      }
      if (dto.capacity === undefined) {
        throw new BadRequestException({
          code: 'CAPACITY_REQUIRED',
          message: 'Indica la capacidad (número de personas)',
        });
      }
      buildingId = (await this.getActiveBuilding(dto.buildingId)).id;
    }

    return this.prisma.$transaction(async (tx) => {
      const resource = await tx.resource
        .create({
          data: {
            type: dto.type,
            buildingId,
            parentResourceId,
            name: dto.name.trim(),
            capacity,
            equipment: dto.equipment?.trim(),
            rules: dto.rules?.trim(),
            assetTag: dto.type === 'LAPTOP' ? dto.assetTag?.trim() : null,
          },
        })
        .catch((error: unknown) => rethrowNameTaken(error, 'resource'));
      if (parentResourceId) {
        await this.labLaptopSlots.blockInFutureLabReservations(tx, resource.id, parentResourceId);
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'RESOURCE_CREATED',
          entity: 'Resource',
          entityId: resource.id,
          details: resource,
        },
        tx,
      );
      return resource;
    }, GUARDED_TRANSACTION);
  }

  async update(actor: CurrentUserData, id: string, dto: UpdateResourceDto) {
    const before = await this.get(id);
    const data: Prisma.ResourceUncheckedUpdateInput = {};
    let newLabId: string | null = null;
    let newBuildingId: string | null = null;

    if (dto.parentResourceId !== undefined && dto.parentResourceId !== before.parentResourceId) {
      if (before.type !== 'LAPTOP') {
        throw new BadRequestException({
          code: 'PARENT_NOT_ALLOWED',
          message: 'Solo las laptops tienen parentResourceId',
        });
      }
      const lab = await this.getActiveLab(dto.parentResourceId);
      newLabId = lab.id;
      data.parentResourceId = lab.id;
      data.buildingId = lab.buildingId;
    }

    if (dto.buildingId !== undefined && dto.buildingId !== before.buildingId) {
      if (before.type === 'LAPTOP') {
        throw new BadRequestException({
          code: 'BUILDING_NOT_ALLOWED',
          message: 'La laptop toma el edificio de su laboratorio',
        });
      }
      newBuildingId = (await this.getActiveBuilding(dto.buildingId)).id;
      data.buildingId = newBuildingId;
    }

    const deactivates = dto.isActive === false && before.isActive;
    const reactivates = dto.isActive === true && !before.isActive;
    if (reactivates && before.parentResourceId) {
      await this.getActiveLab(before.parentResourceId);
    }

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.capacity !== undefined && before.type !== 'LAPTOP') data.capacity = dto.capacity;
    if (dto.equipment !== undefined) data.equipment = dto.equipment.trim();
    if (dto.rules !== undefined) data.rules = dto.rules.trim();
    if (dto.assetTag !== undefined && before.type === 'LAPTOP') data.assetTag = dto.assetTag.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.$transaction(async (tx) => {
      if (newLabId || newBuildingId || deactivates) {
        await this.lookup.assertNoFutureReservations(
          reservationsOfResource(before),
          before.type === 'LAPTOP' ? 'La laptop' : 'El recurso',
          tx,
        );
      }
      const after = await tx.resource
        .update({ where: { id }, data })
        .catch((error: unknown) => rethrowNameTaken(error, 'resource'));

      if (before.type === 'AI_LAB' && newBuildingId) {
        await tx.resource
          .updateMany({ where: { parentResourceId: id }, data: { buildingId: newBuildingId } })
          .catch((error: unknown) => rethrowNameTaken(error, 'resource'));
      }
      if (before.type === 'AI_LAB' && deactivates) {
        await tx.resource.updateMany({
          where: { parentResourceId: id, isActive: true },
          data: { isActive: false },
        });
      }
      if (after.parentResourceId && after.isActive && (newLabId || reactivates)) {
        await this.labLaptopSlots.blockInFutureLabReservations(tx, id, after.parentResourceId);
      }

      await this.audit.log(
        {
          userId: actor.id,
          action: 'RESOURCE_UPDATED',
          entity: 'Resource',
          entityId: id,
          details: {
            before: {
              name: before.name,
              capacity: before.capacity,
              buildingId: before.buildingId,
              parentResourceId: before.parentResourceId,
              isActive: before.isActive,
            },
            after,
          },
        },
        tx,
      );
      return after;
    }, GUARDED_TRANSACTION);
  }

  async futureReservations(id: string) {
    const resource = await this.get(id);
    return this.lookup.futureReservations(reservationsOfResource(resource));
  }
}
