import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JwtService } from '@nestjs/jwt';
import { type Role } from '../common/constants';
import { type PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decorator';

function contextWith(headers: Record<string, string>, requiredRoles?: Role[]): ExecutionContext {
  const request = { headers };
  const handler = () => undefined;
  if (requiredRoles) Roles(...requiredRoles)(handler);
  return {
    getHandler: () => handler,
    getClass: () => AuthGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function buildGuard() {
  const findUnique = jest.fn();
  const jwt = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique } };
  const guard = new AuthGuard(
    new Reflector(),
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
  );
  return { guard, findUnique, jwt };
}

describe('AuthGuard', () => {
  it('rejects a request without a token', async () => {
    const { guard } = buildGuard();

    await expect(guard.canActivate(contextWith({}))).rejects.toMatchObject({
      response: { code: 'NO_TOKEN' },
    });
  });

  it('ignores the legacy x-demo-user header', async () => {
    const { guard, findUnique } = buildGuard();

    await expect(
      guard.canActivate(contextWith({ 'x-demo-user': 'admin@demo.com' })),
    ).rejects.toMatchObject({ response: { code: 'NO_TOKEN' } });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token that fails verification', async () => {
    const { guard, jwt } = buildGuard();
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));

    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer bad' })),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOKEN' } });
  });

  it('rejects a valid token of a deactivated user', async () => {
    const { guard, jwt, findUnique } = buildGuard();
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com' });
    findUnique.mockResolvedValue({ id: 'user-id', isActive: false, roles: [] });

    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer ok' })),
    ).rejects.toMatchObject({ response: { code: 'USER_INACTIVE' } });
  });

  describe('role checks', () => {
    async function canActivateAs(userRoles: string[], required: Role[]) {
      const { guard, jwt, findUnique } = buildGuard();
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com' });
      findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'a@tcs.com',
        fullName: 'A',
        isActive: true,
        roles: userRoles.map((name) => ({ buildingId: null, role: { name } })),
      });
      return guard.canActivate(contextWith({ authorization: 'Bearer ok' }, required));
    }

    it('lets a SUPERADMIN through any role requirement', async () => {
      await expect(canActivateAs(['SUPERADMIN'], ['LIDER'])).resolves.toBe(true);
    });

    it('does not let an ADMIN through a requirement for another role', async () => {
      await expect(canActivateAs(['ADMIN'], ['LIDER'])).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_ROLE' },
      });
    });

    it('lets a user through when they hold a required role', async () => {
      await expect(canActivateAs(['ASOCIADO', 'LIDER'], ['LIDER'])).resolves.toBe(true);
    });
  });
});
