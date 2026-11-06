import { type Prisma } from '@prisma/client';
import {
  FLOOR_RESOURCE_TYPES,
  FLOOR_ZONE_KINDS,
  type FloorResourceType,
  type FloorZoneKind,
} from '../common/constants';
import {
  type FloorPlanDetailDto,
  type FloorPlanSummaryDto,
  type FloorZoneDto,
  type FloorZoneResourceDto,
} from './dto/floor-plan-response.dto';

export const PLAN_WITH_ZONES = {
  building: { select: { name: true, isActive: true } },
  zones: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      resource: {
        select: {
          id: true,
          name: true,
          type: true,
          capacity: true,
          isActive: true,
          children: {
            where: { type: 'LAPTOP', isActive: true },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          },
        },
      },
    },
  },
} satisfies Prisma.FloorPlanInclude;

export type PlanWithZones = Prisma.FloorPlanGetPayload<{ include: typeof PLAN_WITH_ZONES }>;
export type ZoneWithResource = PlanWithZones['zones'][number];

type PlanWithBuilding = Prisma.FloorPlanGetPayload<{
  include: { building: { select: { name: true } } };
}>;

export function toFloorResourceType(value: string): FloorResourceType | undefined {
  return FLOOR_RESOURCE_TYPES.find((type) => type === value);
}

export function toFloorZoneKind(value: string): FloorZoneKind {
  return FLOOR_ZONE_KINDS.find((kind) => kind === value) ?? 'DECORATIVE';
}

export function toPlanSummary(plan: PlanWithBuilding): FloorPlanSummaryDto {
  return {
    id: plan.id,
    buildingId: plan.buildingId,
    buildingName: plan.building.name,
    level: plan.level,
    name: plan.name,
    width: plan.width,
    height: plan.height,
    isActive: plan.isActive,
  };
}

function toZoneResource(zone: ZoneWithResource): FloorZoneResourceDto | null {
  const type = zone.resource ? toFloorResourceType(zone.resource.type) : undefined;
  if (!zone.resource || !type) return null;
  const { id, name, capacity, isActive } = zone.resource;
  return { id, name, type, capacity, isActive };
}

export function toZone(zone: ZoneWithResource): FloorZoneDto {
  const resource = toZoneResource(zone);
  return {
    id: zone.id,
    name: zone.name,
    kind: toFloorZoneKind(zone.kind),
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    isReservable: zone.isReservable,
    sortOrder: zone.sortOrder,
    resourceId: zone.resourceId,
    resource,
    seats:
      resource?.type === 'AI_LAB'
        ? (zone.resource?.children ?? []).map((laptop) => ({
            resourceId: laptop.id,
            name: laptop.name,
          }))
        : [],
  };
}

export function toPlanDetail(plan: PlanWithZones): FloorPlanDetailDto {
  return { ...toPlanSummary(plan), zones: plan.zones.map(toZone) };
}
