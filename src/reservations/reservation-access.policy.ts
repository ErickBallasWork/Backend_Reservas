import { PRIVILEGED_ROLES, Status } from '../common/constants';
import { type CurrentUserData } from '../common/current-user/current-user.types';

export interface ReservationAccessTarget {
  userId: string;
  status: string;
  resourceBuildingId: string;
  ownerIsManagedBy: boolean;
}

export function canViewReservation(
  user: CurrentUserData,
  target: ReservationAccessTarget,
): boolean {
  if (target.userId === user.id) return true;
  if (user.roles.some((role) => PRIVILEGED_ROLES.includes(role))) return true;
  if (
    user.roles.includes('SPOC_EDIFICIO') &&
    user.spocBuildingIds.includes(target.resourceBuildingId)
  ) {
    return true;
  }
  if (user.roles.includes('SPOC_ADMIN') && target.ownerIsManagedBy) return true;
  if (user.roles.includes('LIDER')) {
    return target.ownerIsManagedBy || target.status === Status.PENDING_APPROVAL;
  }
  return false;
}
