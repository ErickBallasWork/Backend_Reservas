import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { type RoleRowsService } from './role-rows.service';
import { UsersService } from './users.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function actor(...roles: string[]): CurrentUserData {
  return { id: 'actor-id', email: 'a@tcs.com', fullName: 'Actor', roles, spocBuildingIds: [] };
}

function dbUser(isActive: boolean, ...roles: string[]) {
  return {
    id: USER_ID,
    email: 'u@tcs.com',
    fullName: 'U',
    department: null,
    isActive,
    lastLoginAt: null,
    roles: roles.map((name) => ({ buildingId: null, role: { name }, building: null })),
  };
}

function build(current: ReturnType<typeof dbUser>) {
  const tx = {
    userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { update: jest.fn() },
    device: { updateMany: jest.fn() },
    managedAssociate: { deleteMany: jest.fn() },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(current),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const audit = { log: jest.fn() };
  const roleRows = { resolve: jest.fn().mockResolvedValue([{ roleId: 1, buildingId: null }]) };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    roleRows as unknown as RoleRowsService,
  );
  return { service, tx, prisma };
}

describe('UsersService.update', () => {
  it('revokes every device of a user who is deactivated', async () => {
    const { service, tx } = build(dbUser(true, 'ASOCIADO'));

    await service.update(actor('ADMIN'), USER_ID, { isActive: false });

    expect(tx.device.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });

  it('keeps the devices when the user stays active', async () => {
    const { service, tx } = build(dbUser(true, 'ASOCIADO'));

    await service.update(actor('ADMIN'), USER_ID, { department: 'TI' });

    expect(tx.device.updateMany).not.toHaveBeenCalled();
  });

  it('clears the associates in charge when the user stops being a manager', async () => {
    const { service, tx } = build(dbUser(true, 'ASOCIADO', 'LIDER'));

    await service.update(actor('ADMIN'), USER_ID, { roles: [{ role: 'ASOCIADO' }] });

    expect(tx.managedAssociate.deleteMany).toHaveBeenCalledWith({ where: { managerId: USER_ID } });
  });

  it('keeps the associates in charge while the user is still a manager', async () => {
    const { service, tx } = build(dbUser(true, 'ASOCIADO', 'LIDER'));

    await service.update(actor('ADMIN'), USER_ID, {
      roles: [{ role: 'ASOCIADO' }, { role: 'SPOC_ADMIN' }],
    });

    expect(tx.managedAssociate.deleteMany).not.toHaveBeenCalled();
  });

  it('stops an ADMIN from changing a SUPERADMIN', async () => {
    const { service, tx } = build(dbUser(true, 'SUPERADMIN'));

    await expect(
      service.update(actor('ADMIN'), USER_ID, { isActive: false }),
    ).rejects.toMatchObject({
      response: { code: 'FORBIDDEN_ROLE_ASSIGNMENT' },
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses to deactivate the last active SUPERADMIN', async () => {
    const { service, prisma, tx } = build(dbUser(true, 'SUPERADMIN'));
    prisma.user.count.mockResolvedValue(0);

    await expect(
      service.update(actor('SUPERADMIN'), USER_ID, { isActive: false }),
    ).rejects.toMatchObject({ response: { code: 'LAST_SUPERADMIN' } });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('lets a SUPERADMIN deactivate another SUPERADMIN when one remains', async () => {
    const { service, tx } = build(dbUser(true, 'SUPERADMIN'));

    await service.update(actor('SUPERADMIN'), USER_ID, { isActive: false });

    expect(tx.user.update).toHaveBeenCalled();
  });
});
