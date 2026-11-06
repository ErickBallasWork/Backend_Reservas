import type { PrismaClient } from '@prisma/client';
import { SUPERADMIN_ROLE } from '../common/constants';

export async function approveSuperadminRequest(
  prisma: PrismaClient,
  rawEmail: string,
): Promise<{ requestId: string }> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: { roles: { include: { role: true } } },
  });
  if (!user?.isActive) {
    throw new Error(`There is no active user with the email ${email}`);
  }
  if (!user.roles.some((entry) => entry.role.name === SUPERADMIN_ROLE)) {
    throw new Error(`${email} is not a SUPERADMIN: approve the request from the inbox instead`);
  }

  const request = await prisma.accessRequest.findFirst({
    where: { email, status: 'PENDING' },
    orderBy: { requestedAt: 'desc' },
  });
  if (!request) {
    throw new Error(`There is no pending access request for ${email}: ask for access first`);
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.accessRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: new Date() },
    });
    if (count === 0) throw new Error('The request was resolved by someone else');
    await tx.auditLog.create({
      data: {
        userId: null,
        action: 'ACCESS_REQUEST_APPROVED',
        entity: 'AccessRequest',
        entityId: request.id,
        details: JSON.stringify({ email, kind: request.kind, source: 'bootstrap-command' }),
      },
    });
  });
  return { requestId: request.id };
}
