import { ForbiddenException } from '@nestjs/common';
import { PRIVILEGED_ROLES } from '../common/constants';
import { type CurrentUserData } from '../common/current-user/current-user.types';

export type DecisionRoute = 'ALLOWED' | 'OWN_REQUEST' | 'NOT_ROUTED';

export function routeDecision(
  approver: CurrentUserData,
  ownerId: string,
  assignedLeaderIds: readonly string[],
): DecisionRoute {
  if (approver.id === ownerId) return 'OWN_REQUEST';
  if (assignedLeaderIds.includes(approver.id)) return 'ALLOWED';
  const isFallbackApprover = approver.roles.some((role) => PRIVILEGED_ROLES.includes(role));
  if (assignedLeaderIds.length === 0 && isFallbackApprover) return 'ALLOWED';
  return 'NOT_ROUTED';
}

export function assertRouted(route: DecisionRoute): void {
  if (route === 'OWN_REQUEST') {
    throw new ForbiddenException({
      code: 'CANNOT_APPROVE_OWN',
      message: 'No puedes decidir tu propia solicitud',
    });
  }
  if (route === 'NOT_ROUTED') {
    throw new ForbiddenException({
      code: 'NOT_YOUR_APPROVAL',
      message: 'Esta solicitud le corresponde a otra persona',
    });
  }
}
