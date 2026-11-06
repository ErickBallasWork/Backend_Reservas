import type { PrismaClient } from '@prisma/client';
import { approveSuperadminRequest } from './bootstrap-approval';

function superadmin(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-id',
    email: 'root@tcs.com',
    isActive: true,
    roles: [{ role: { name: 'SUPERADMIN' } }],
    ...overrides,
  };
}

function build(user: unknown, request: unknown = { id: 'req-id', kind: 'NEW_DEVICE' }) {
  const tx = {
    accessRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    accessRequest: { findFirst: jest.fn().mockResolvedValue(request) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { prisma: prisma as unknown as PrismaClient, tx };
}

describe('approveSuperadminRequest', () => {
  it('approves the pending request of a SUPERADMIN and audits it as a system action', async () => {
    const { prisma, tx } = build(superadmin());

    const result = await approveSuperadminRequest(prisma, ' Root@TCS.com ');

    expect(result).toEqual({ requestId: 'req-id' });
    expect(tx.accessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-id', status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: expect.any(Date) as unknown },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        action: 'ACCESS_REQUEST_APPROVED',
        entityId: 'req-id',
      }) as unknown,
    });
  });

  it('refuses a user that is not a SUPERADMIN', async () => {
    const { prisma, tx } = build(superadmin({ roles: [{ role: { name: 'ADMIN' } }] }));

    await expect(approveSuperadminRequest(prisma, 'root@tcs.com')).rejects.toThrow(
      'is not a SUPERADMIN',
    );
    expect(tx.accessRequest.updateMany).not.toHaveBeenCalled();
  });

  it.each([null, superadmin({ isActive: false })])(
    'refuses an unknown or inactive user',
    async (user) => {
      const { prisma } = build(user);

      await expect(approveSuperadminRequest(prisma, 'root@tcs.com')).rejects.toThrow(
        'no active user',
      );
    },
  );

  it('asks the person to request access first when nothing is pending', async () => {
    const { prisma } = build(superadmin(), null);

    await expect(approveSuperadminRequest(prisma, 'root@tcs.com')).rejects.toThrow(
      'no pending access request',
    );
  });

  it('fails when someone resolved the request in the meantime', async () => {
    const { prisma, tx } = build(superadmin());
    tx.accessRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(approveSuperadminRequest(prisma, 'root@tcs.com')).rejects.toThrow(
      'resolved by someone else',
    );
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
