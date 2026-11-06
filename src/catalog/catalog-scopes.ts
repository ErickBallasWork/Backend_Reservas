import { Prisma } from '@prisma/client';
import { type ResourceType } from '../common/constants';

interface ScopedResource {
  id: string;
  type: string;
}

export function reservationsOfBuilding(buildingId: string): Prisma.ReservationWhereInput {
  return { resource: { buildingId } };
}

export function reservationsOfResource(resource: ScopedResource): Prisma.ReservationWhereInput {
  const type = resource.type as ResourceType;
  if (type === 'AI_LAB') {
    return { OR: [{ resourceId: resource.id }, { resource: { parentResourceId: resource.id } }] };
  }
  if (type === 'LAPTOP') {
    return { OR: [{ resourceId: resource.id }, { slots: { some: { resourceId: resource.id } } }] };
  }
  return { resourceId: resource.id };
}

export const GUARDED_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
};
