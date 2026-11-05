import { SetMetadata } from '@nestjs/common';
import { Role } from '../common/constants';

export const ROLES_KEY = 'roles';

/**
 * Restringe una ruta a ciertos roles. El ADMIN siempre pasa.
 * Uso:  @Roles('LIDER')  o  @Roles('SPOC_ADMIN', 'LIDER')
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
