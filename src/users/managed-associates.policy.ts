import { BadRequestException } from '@nestjs/common';
import { MANAGER_ROLES } from '../common/constants';

export function canManageAssociates(roles: readonly string[]): boolean {
  return roles.some((role) => MANAGER_ROLES.includes(role));
}

export function assertValidAssignment(
  managerId: string,
  managerRoles: readonly string[],
  associateIds: readonly string[],
): void {
  if (!canManageAssociates(managerRoles)) {
    throw new BadRequestException({
      code: 'NOT_A_MANAGER',
      message:
        'Solo un SPOC Administrativo o un Líder de Conocimiento puede tener asociados a cargo',
    });
  }
  if (associateIds.includes(managerId)) {
    throw new BadRequestException({
      code: 'CANNOT_MANAGE_SELF',
      message: 'Una persona no puede estar a cargo de sí misma',
    });
  }
}
