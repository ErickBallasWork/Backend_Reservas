import {
  type FloorResourceType,
  type FloorState,
  type FloorStateReason,
} from '../common/constants';
import { type FloorSeatStatusDto, type FloorZoneStatusDto } from './dto/floor-plan-response.dto';

export interface StatusResource {
  id: string;
  type: string;
  capacity: number;
  isActive: boolean;
  laptopIds: readonly string[];
}

export interface StatusZone {
  id: string;
  isReservable: boolean;
  resource: StatusResource | null;
}

export interface StatusFilter {
  type?: FloorResourceType;
  minCapacity?: number;
}

export interface StatusInput {
  zones: readonly StatusZone[];
  busyResourceIds: ReadonlySet<string>;
  mineResourceIds: ReadonlySet<string>;
  closedResourceIds: ReadonlySet<string>;
  filter: StatusFilter;
}

export interface FloorStatus {
  zones: FloorZoneStatusDto[];
  seats: FloorSeatStatusDto[];
}

interface Verdict {
  state: FloorState;
  reason: FloorStateReason | null;
}

const isLab = (resource: StatusResource | null) => resource?.type === 'AI_LAB';

function outOfFilterReason(resource: StatusResource, input: StatusInput): FloorStateReason | null {
  const { type, minCapacity } = input.filter;
  if (type && resource.type !== type) return 'TYPE';
  if (minCapacity && resource.capacity < minCapacity) return 'CAPACITY';
  if (input.closedResourceIds.has(resource.id)) return 'CLOSED';
  return null;
}

function zoneVerdict(zone: StatusZone, input: StatusInput): Verdict {
  const { resource } = zone;
  if (!zone.isReservable || !resource) return { state: 'NOT_RESERVABLE', reason: null };
  if (!resource.isActive) return { state: 'NOT_RESERVABLE', reason: 'INACTIVE' };
  if (input.mineResourceIds.has(resource.id)) return { state: 'MINE', reason: null };
  const reason = outOfFilterReason(resource, input);
  if (reason) return { state: 'OUT_OF_FILTER', reason };
  const busy = [resource.id, ...(isLab(resource) ? resource.laptopIds : [])].some((id) =>
    input.busyResourceIds.has(id),
  );
  return { state: busy ? 'OCCUPIED' : 'FREE', reason: null };
}

function seatState(
  laptopId: string,
  lab: StatusResource,
  zoneState: FloorState,
  input: StatusInput,
): FloorState {
  if (zoneState === 'NOT_RESERVABLE') return 'NOT_RESERVABLE';
  if (input.mineResourceIds.has(laptopId) || input.mineResourceIds.has(lab.id)) return 'MINE';
  if (zoneState === 'OUT_OF_FILTER') return 'OUT_OF_FILTER';
  if (input.busyResourceIds.has(laptopId) || input.busyResourceIds.has(lab.id)) return 'OCCUPIED';
  return 'FREE';
}

export function computeFloorStatus(input: StatusInput): FloorStatus {
  const zones: FloorZoneStatusDto[] = [];
  const seats: FloorSeatStatusDto[] = [];
  for (const zone of input.zones) {
    const verdict = zoneVerdict(zone, input);
    const lab = isLab(zone.resource) ? zone.resource : null;
    zones.push({
      zoneId: zone.id,
      state: verdict.state,
      reason: verdict.reason,
      totalSeats: lab ? lab.laptopIds.length : null,
      freeSeats: lab ? lab.laptopIds.filter((id) => !input.busyResourceIds.has(id)).length : null,
    });
    if (!lab) continue;
    for (const laptopId of lab.laptopIds) {
      seats.push({ resourceId: laptopId, state: seatState(laptopId, lab, verdict.state, input) });
    }
  }
  return { zones, seats };
}

export function statusResourceIds(zones: readonly StatusZone[]): string[] {
  return zones.flatMap((zone) =>
    zone.resource ? [zone.resource.id, ...zone.resource.laptopIds] : [],
  );
}
