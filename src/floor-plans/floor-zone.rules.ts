import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RESOURCE_TYPE_BY_ZONE_KIND, type FloorZoneKind } from '../common/constants';

export interface PlanBounds {
  width: number;
  height: number;
}

export interface ZoneBox {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoneDraft extends ZoneBox {
  id?: string;
  kind: FloorZoneKind;
  isReservable: boolean;
  resourceId?: string | null;
}

export interface LinkableResource {
  id: string;
  type: string;
  buildingId: string;
  isActive: boolean;
}

export interface ZoneSetContext {
  plan: PlanBounds & { buildingId: string };
  existingZoneIds: ReadonlySet<string>;
  resources: ReadonlyMap<string, LinkableResource>;
  linkedElsewhere: ReadonlySet<string>;
}

const RESOURCE_LABEL: Record<string, string> = {
  MEETING_ROOM: 'una sala de reuniones',
  AI_LAB: 'un laboratorio de IA',
};

function invalidResource(message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code: 'FLOOR_ZONE_RESOURCE_INVALID', message });
}

function resourceTaken(name: string): ConflictException {
  return new ConflictException({
    code: 'FLOOR_ZONE_RESOURCE_TAKEN',
    message: `El recurso de la zona "${name}" ya está enlazado a otra zona`,
  });
}

export function isInside(plan: PlanBounds, zone: ZoneBox): boolean {
  return (
    zone.width >= 1 &&
    zone.height >= 1 &&
    zone.x >= 0 &&
    zone.y >= 0 &&
    zone.x + zone.width <= plan.width &&
    zone.y + zone.height <= plan.height
  );
}

export function assertZonesFit(plan: PlanBounds, zones: readonly ZoneBox[]): void {
  const outside = zones.find((zone) => !isInside(plan, zone));
  if (outside) {
    throw new UnprocessableEntityException({
      code: 'FLOOR_ZONE_OUT_OF_BOUNDS',
      message: `La zona "${outside.name}" queda fuera del plano de ${plan.width} x ${plan.height}`,
    });
  }
}

function assertKnownIds(zones: readonly ZoneDraft[], existingZoneIds: ReadonlySet<string>) {
  const seen = new Set<string>();
  for (const zone of zones) {
    if (!zone.id) continue;
    if (!existingZoneIds.has(zone.id)) {
      throw new NotFoundException({
        code: 'FLOOR_ZONE_NOT_FOUND',
        message: `No existe la zona ${zone.id} en este plano`,
      });
    }
    if (seen.has(zone.id)) {
      throw new BadRequestException({
        code: 'DUPLICATE',
        message: `La zona ${zone.id} aparece dos veces`,
      });
    }
    seen.add(zone.id);
  }
}

function assertLink(zone: ZoneDraft, context: ZoneSetContext): void {
  const resourceId = zone.resourceId ?? null;
  const expectedType = RESOURCE_TYPE_BY_ZONE_KIND[zone.kind];
  if (!zone.isReservable) {
    if (resourceId !== null) {
      throw invalidResource(`La zona "${zone.name}" no es reservable y no puede tener un recurso`);
    }
    return;
  }
  if (!expectedType) {
    throw invalidResource(`La zona "${zone.name}" es decorativa o una etiqueta y no se reserva`);
  }
  const resource = resourceId ? context.resources.get(resourceId) : undefined;
  if (!resource || resource.type !== expectedType) {
    throw invalidResource(`La zona "${zone.name}" debe enlazar ${RESOURCE_LABEL[expectedType]}`);
  }
  if (!resource.isActive) {
    throw invalidResource(`El recurso de la zona "${zone.name}" está inactivo`);
  }
  if (resource.buildingId !== context.plan.buildingId) {
    throw invalidResource(`El recurso de la zona "${zone.name}" pertenece a otro edificio`);
  }
}

function assertResourcesFree(zones: readonly ZoneDraft[], linkedElsewhere: ReadonlySet<string>) {
  const used = new Set<string>();
  for (const zone of zones) {
    if (!zone.resourceId) continue;
    if (used.has(zone.resourceId) || linkedElsewhere.has(zone.resourceId)) {
      throw resourceTaken(zone.name);
    }
    used.add(zone.resourceId);
  }
}

export function assertValidZones(zones: readonly ZoneDraft[], context: ZoneSetContext): void {
  assertKnownIds(zones, context.existingZoneIds);
  assertZonesFit(context.plan, zones);
  for (const zone of zones) assertLink(zone, context);
  assertResourcesFree(zones, context.linkedElsewhere);
}

export function linkedResourceIds(zones: readonly ZoneDraft[]): string[] {
  return [...new Set(zones.flatMap((zone) => (zone.resourceId ? [zone.resourceId] : [])))];
}
