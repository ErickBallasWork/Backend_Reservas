import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FloorZone, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { GUARDED_TRANSACTION } from '../catalog/catalog-scopes';
import { isPrivileged } from '../catalog/catalog-visibility';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFloorPlanDto,
  FloorZoneInputDto,
  ListFloorPlansQueryDto,
  ReplaceFloorZonesDto,
  UpdateFloorPlanDto,
} from './dto/floor-plan.dto';
import { FloorPlanDetailDto, FloorPlanSummaryDto } from './dto/floor-plan-response.dto';
import {
  PLAN_WITH_ZONES,
  toPlanDetail,
  toPlanSummary,
  type PlanWithZones,
} from './floor-plan.mapper';
import { assertValidZones, assertZonesFit, linkedResourceIds } from './floor-zone.rules';

type ZoneFields = Pick<
  FloorZone,
  'name' | 'kind' | 'x' | 'y' | 'width' | 'height' | 'isReservable' | 'resourceId' | 'sortOrder'
>;

const ZONE_FIELDS: (keyof ZoneFields)[] = [
  'name',
  'kind',
  'x',
  'y',
  'width',
  'height',
  'isReservable',
  'resourceId',
  'sortOrder',
];

function planNotFound(id: string): NotFoundException {
  return new NotFoundException({
    code: 'FLOOR_PLAN_NOT_FOUND',
    message: `No existe el plano ${id}`,
  });
}

function zoneFields(zone: ZoneFields): ZoneFields {
  return {
    name: zone.name,
    kind: zone.kind,
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    isReservable: zone.isReservable,
    resourceId: zone.resourceId,
    sortOrder: zone.sortOrder,
  };
}

function fromInput(input: FloorZoneInputDto): ZoneFields {
  return zoneFields({ ...input, name: input.name.trim(), resourceId: input.resourceId ?? null });
}

function hasChanges(before: ZoneFields, after: ZoneFields): boolean {
  return ZONE_FIELDS.some((field) => before[field] !== after[field]);
}

function planFields(plan: { name: string; width: number; height: number; isActive: boolean }) {
  return { name: plan.name, width: plan.width, height: plan.height, isActive: plan.isActive };
}

@Injectable()
export class FloorPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListFloorPlansQueryDto): Promise<FloorPlanSummaryDto[]> {
    const plans = await this.prisma.floorPlan.findMany({
      where: {
        ...(query.buildingId ? { buildingId: query.buildingId } : {}),
        ...(query.includeInactive ? {} : { isActive: true, building: { isActive: true } }),
      },
      include: { building: { select: { name: true } } },
      orderBy: [{ building: { name: 'asc' } }, { level: 'asc' }],
    });
    return plans.map(toPlanSummary);
  }

  async findVisible(actor: CurrentUserData, id: string): Promise<PlanWithZones> {
    const plan = await this.prisma.floorPlan.findUnique({
      where: { id },
      include: PLAN_WITH_ZONES,
    });
    const hidden = plan && !isPrivileged(actor) && (!plan.isActive || !plan.building.isActive);
    if (!plan || hidden) throw planNotFound(id);
    return plan;
  }

  async get(actor: CurrentUserData, id: string): Promise<FloorPlanDetailDto> {
    return toPlanDetail(await this.findVisible(actor, id));
  }

  async create(actor: CurrentUserData, dto: CreateFloorPlanDto): Promise<FloorPlanDetailDto> {
    const building = await this.prisma.building.findUnique({ where: { id: dto.buildingId } });
    if (!building) {
      throw new NotFoundException({
        code: 'BUILDING_NOT_FOUND',
        message: `No existe el edificio ${dto.buildingId}`,
      });
    }
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.floorPlan
        .create({
          data: {
            buildingId: dto.buildingId,
            level: dto.level ?? 0,
            name: dto.name.trim(),
            width: dto.width,
            height: dto.height,
          },
        })
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw new ConflictException({
              code: 'FLOOR_PLAN_ALREADY_EXISTS',
              message: 'El edificio ya tiene un plano en ese piso',
            });
          }
          throw error;
        });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'FLOOR_PLAN_CREATED',
          entity: 'FloorPlan',
          entityId: created.id,
          details: created,
        },
        tx,
      );
      return created;
    });
    return this.get(actor, plan.id);
  }

  async update(
    actor: CurrentUserData,
    id: string,
    dto: UpdateFloorPlanDto,
  ): Promise<FloorPlanDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.floorPlan.findUnique({ where: { id }, include: { zones: true } });
      if (!before) throw planNotFound(id);
      const data: Prisma.FloorPlanUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.width !== undefined) data.width = dto.width;
      if (dto.height !== undefined) data.height = dto.height;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      assertZonesFit(
        { width: dto.width ?? before.width, height: dto.height ?? before.height },
        before.zones,
      );
      const after = await tx.floorPlan.update({ where: { id }, data });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'FLOOR_PLAN_UPDATED',
          entity: 'FloorPlan',
          entityId: id,
          details: { before: planFields(before), after: planFields(after) },
        },
        tx,
      );
    }, GUARDED_TRANSACTION);
    return this.get(actor, id);
  }

  async replaceZones(
    actor: CurrentUserData,
    id: string,
    dto: ReplaceFloorZonesDto,
  ): Promise<FloorPlanDetailDto> {
    await this.prisma
      .$transaction(async (tx) => {
        const plan = await tx.floorPlan.findUnique({ where: { id }, include: { zones: true } });
        if (!plan) throw planNotFound(id);
        const resourceIds = linkedResourceIds(dto.zones);
        const [resources, linkedElsewhere] = resourceIds.length
          ? await Promise.all([
              tx.resource.findMany({
                where: { id: { in: resourceIds } },
                select: { id: true, type: true, buildingId: true, isActive: true },
              }),
              tx.floorZone.findMany({
                where: { resourceId: { in: resourceIds }, floorPlanId: { not: id } },
                select: { resourceId: true },
              }),
            ])
          : [[], []];
        assertValidZones(dto.zones, {
          plan,
          existingZoneIds: new Set(plan.zones.map((zone) => zone.id)),
          resources: new Map(resources.map((resource) => [resource.id, resource])),
          linkedElsewhere: new Set(linkedElsewhere.flatMap((zone) => zone.resourceId ?? [])),
        });
        await this.applyZones(tx, actor, plan.id, plan.zones, dto.zones);
      }, GUARDED_TRANSACTION)
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) {
          throw new ConflictException({
            code: 'FLOOR_ZONE_RESOURCE_TAKEN',
            message: 'Uno de los recursos ya está enlazado a otra zona',
          });
        }
        throw error;
      });
    return this.get(actor, id);
  }

  private async applyZones(
    tx: Prisma.TransactionClient,
    actor: CurrentUserData,
    floorPlanId: string,
    current: FloorZone[],
    inputs: FloorZoneInputDto[],
  ): Promise<void> {
    const kept = new Set(inputs.flatMap((input) => input.id ?? []));
    const removed = current.filter((zone) => !kept.has(zone.id));
    const byId = new Map(current.map((zone) => [zone.id, zone]));
    const log = (action: string, entityId: string, details: unknown) =>
      this.audit.log({ userId: actor.id, action, entity: 'FloorZone', entityId, details }, tx);

    if (removed.length > 0) {
      await tx.floorZone.deleteMany({ where: { id: { in: removed.map((zone) => zone.id) } } });
      for (const zone of removed) await log('FLOOR_ZONE_DELETED', zone.id, zone);
    }

    const relinked = inputs.flatMap((input) => {
      const before = input.id ? byId.get(input.id) : undefined;
      const moves = before?.resourceId && before.resourceId !== (input.resourceId ?? null);
      return moves && before ? [before.id] : [];
    });
    if (relinked.length > 0) {
      // Frees the old links first so a resource can move between zones without hitting the unique index.
      await tx.floorZone.updateMany({
        where: { id: { in: relinked } },
        data: { resourceId: null },
      });
    }

    for (const input of inputs) {
      const after = fromInput(input);
      const before = input.id ? byId.get(input.id) : undefined;
      if (!before) {
        const created = await tx.floorZone.create({ data: { ...after, floorPlanId } });
        await log('FLOOR_ZONE_CREATED', created.id, created);
        continue;
      }
      if (!hasChanges(zoneFields(before), after)) continue;
      await tx.floorZone.update({ where: { id: before.id }, data: after });
      await log('FLOOR_ZONE_UPDATED', before.id, { before: zoneFields(before), after });
    }
  }
}
