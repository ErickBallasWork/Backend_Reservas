import { Prisma } from '@prisma/client';
import { CurrentUserData } from '../common/current-user/current-user.types';

// Lo que hay que incluir al leer un usuario para armar request.user
export const USER_WITH_ROLES = {
  roles: { include: { role: true } },
} satisfies Prisma.UserInclude;

interface UserWithRoles {
  id: string;
  email: string;
  fullName: string;
  roles: { buildingId: string | null; role: { name: string } }[];
}

/** Convierte un usuario de la base (con sus roles) en el objeto que va en request.user. */
export function toCurrentUser(user: UserWithRoles): CurrentUserData {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: [...new Set(user.roles.map((r) => r.role.name))],
    spocBuildingIds: user.roles
      .filter((r) => r.role.name === 'SPOC_EDIFICIO' && r.buildingId !== null)
      .map((r) => r.buildingId as string),
  };
}
