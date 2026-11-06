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
import { CatalogLookupService } from './catalog-lookup.service';
import { CreateResourceDto, ListResourcesQueryDto, UpdateResourceDto } from './dto/resource.dto';

/** Salas, laboratorios de IA y laptops (RF-01, RF-02). */
@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: CatalogLookupService,
    private readonly audit: AuditService,
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

  /** Devuelve el laboratorio si existe y es de tipo AI_LAB. */
  private async getLab(labId: string) {
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
    return lab;
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
      const lab = await this.getLab(dto.parentResourceId);
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
      const building = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
      if (!building) {
        throw new NotFoundException({
          code: 'BUILDING_NOT_FOUND',
          message: `No existe el edificio ${dto.buildingId}`,
        });
      }
      buildingId = building.id;
    }

    const resource = await this.prisma.resource.create({
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
    });
    await this.audit.log({
      userId: actor.id,
      action: 'RESOURCE_CREATED',
      entity: 'Resource',
      entityId: resource.id,
      details: resource,
    });
    return resource;
  }

  async update(actor: CurrentUserData, id: string, dto: UpdateResourceDto) {
    const before = await this.get(id);
    const data: Prisma.ResourceUncheckedUpdateInput = {};

    // Mover una laptop a otro laboratorio
    if (dto.parentResourceId !== undefined && dto.parentResourceId !== before.parentResourceId) {
      if (before.type !== 'LAPTOP') {
        throw new BadRequestException({
          code: 'PARENT_NOT_ALLOWED',
          message: 'Solo las laptops tienen parentResourceId',
        });
      }
      const lab = await this.getLab(dto.parentResourceId);
      await this.lookup.assertNoFutureReservations({ resourceId: id }, 'La laptop');
      data.parentResourceId = lab.id;
      data.buildingId = lab.buildingId;
    }

    // Inactivar: no puede tener reservas futuras (si es laboratorio, tampoco sus laptops)
    if (dto.isActive === false && before.isActive) {
      const where: Prisma.ReservationWhereInput =
        before.type === 'AI_LAB'
          ? { OR: [{ resourceId: id }, { resource: { parentResourceId: id } }] }
          : { resourceId: id };
      await this.lookup.assertNoFutureReservations(where, 'El recurso');
    }

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.capacity !== undefined && before.type !== 'LAPTOP') data.capacity = dto.capacity;
    if (dto.equipment !== undefined) data.equipment = dto.equipment.trim();
    if (dto.rules !== undefined) data.rules = dto.rules.trim();
    if (dto.assetTag !== undefined && before.type === 'LAPTOP') data.assetTag = dto.assetTag.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const after = await this.prisma.resource.update({ where: { id }, data });
    await this.audit.log({
      userId: actor.id,
      action: 'RESOURCE_UPDATED',
      entity: 'Resource',
      entityId: id,
      details: {
        before: {
          name: before.name,
          capacity: before.capacity,
          parentResourceId: before.parentResourceId,
          isActive: before.isActive,
        },
        after,
      },
    });
    return after;
  }

  /** Reservas futuras que se verían afectadas al inactivar (HU-05). */
  async futureReservations(id: string) {
    const resource = await this.get(id);
    const where: Prisma.ReservationWhereInput =
      resource.type === 'AI_LAB'
        ? { OR: [{ resourceId: id }, { resource: { parentResourceId: id } }] }
        : { resourceId: id };
    return this.lookup.futureReservations(where);
  }
}
