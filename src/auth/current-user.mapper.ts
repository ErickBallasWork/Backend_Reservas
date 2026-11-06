import { type Prisma } from '@prisma/client';
import { type CurrentUserData } from '../common/current-user/current-user.types';

export const USER_WITH_ROLES = {
  roles: { include: { role: true } },
} satisfies Prisma.UserInclude;

interface UserWithRoles {
  id: string;
  email: string;
  fullName: string;
  roles: { buildingId: string | null; role: { name: string } }[];
}

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
