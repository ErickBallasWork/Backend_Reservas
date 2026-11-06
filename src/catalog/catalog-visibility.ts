import { ForbiddenException } from '@nestjs/common';
import { PRIVILEGED_ROLES } from '../common/constants';
import { type CurrentUserData } from '../common/current-user/current-user.types';

export function assertMayListInactive(actor: CurrentUserData, includeInactive?: boolean): void {
  if (includeInactive && !actor.roles.some((role) => PRIVILEGED_ROLES.includes(role))) {
    throw new ForbiddenException({
      code: 'FORBIDDEN_ROLE',
      message: 'Solo un administrador puede ver los recursos inactivos',
    });
  }
}
