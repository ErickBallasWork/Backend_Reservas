import { ForbiddenException } from '@nestjs/common';
import { PRIVILEGED_ROLES, SUPERADMIN_ROLE } from '../common/constants';

interface UserAccess {
  isActive: boolean;
  roles: readonly string[];
}

interface AccessChange {
  isActive?: boolean;
  roles?: readonly string[];
}

function hasPrivilegedRole(roles: readonly string[]): boolean {
  return roles.some((role) => PRIVILEGED_ROLES.includes(role));
}

export function assertCanManageRoles(
  actorRoles: readonly string[],
  currentRoles: readonly string[],
  requestedRoles?: readonly string[],
): void {
  if (actorRoles.includes(SUPERADMIN_ROLE)) return;
  if (hasPrivilegedRole(currentRoles) || (requestedRoles && hasPrivilegedRole(requestedRoles))) {
    throw new ForbiddenException({
      code: 'FORBIDDEN_ROLE_ASSIGNMENT',
      message: 'Solo un SUPERADMIN puede gestionar usuarios con rol ADMIN o SUPERADMIN',
    });
  }
}

export function removesSuperadminAccess(before: UserAccess, change: AccessChange): boolean {
  if (!before.isActive || !before.roles.includes(SUPERADMIN_ROLE)) return false;
  const deactivated = change.isActive === false;
  const roleDropped = change.roles !== undefined && !change.roles.includes(SUPERADMIN_ROLE);
  return deactivated || roleDropped;
}
