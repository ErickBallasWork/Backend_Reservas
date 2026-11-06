import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { ApprovalRoutingService } from './approval-routing.service';

const viewer = (id: string, roles: string[]): CurrentUserData => ({
  id,
  email: `${id}@tcs.com`,
  fullName: id,
  roles,
  spocBuildingIds: [],
});

describe('ApprovalRoutingService.managedOwnersFilter', () => {
  const service = new ApprovalRoutingService({} as PrismaService);

  it.each(['LIDER', 'SPOC_ADMIN'])('limits %s to their managed associates', (role) => {
    expect(service.managedOwnersFilter(viewer('manager', [role]))).toEqual({
      user: { managers: { some: { managerId: 'manager' } } },
    });
  });

  it.each(['ADMIN', 'SUPERADMIN'])('does not limit %s', (role) => {
    expect(service.managedOwnersFilter(viewer('boss', [role]))).toEqual({});
  });
});
