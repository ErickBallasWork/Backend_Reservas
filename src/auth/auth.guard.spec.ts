import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type JwtService } from '@nestjs/jwt';
import { type Role } from '../common/constants';
import { type AppConfigService } from '../config/app-config.service';
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

function buildGuard(demoLoginEnabled = false) {
  const findUser = jest.fn();
  const findDevice = jest.fn();
  const jwt = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: findUser }, device: { findUnique: findDevice } };
  const guard = new AuthGuard(
    new Reflector(),
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
    { auth: { demoLoginEnabled } } as unknown as AppConfigService,
  );
  return { guard, findUser, findDevice, jwt };
}

function activeUser(roles: string[]) {
  return {
    id: 'user-id',
    email: 'a@tcs.com',
    fullName: 'A',
    isActive: true,
    roles: roles.map((name) => ({ buildingId: null, role: { name } })),
  };
}

const bearer = { authorization: 'Bearer ok' };

describe('AuthGuard', () => {
  it('rejects a request without a token', async () => {
    const { guard } = buildGuard();

    await expect(guard.canActivate(contextWith({}))).rejects.toMatchObject({
      response: { code: 'NO_TOKEN' },
    });
  });

  it('ignores the legacy x-demo-user header', async () => {
    const { guard, findUser } = buildGuard(true);

    await expect(
      guard.canActivate(contextWith({ 'x-demo-user': 'admin@demo.com' })),
    ).rejects.toMatchObject({ response: { code: 'NO_TOKEN' } });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('rejects a token that fails verification', async () => {
    const { guard, jwt } = buildGuard();
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));

    await expect(
      guard.canActivate(contextWith({ authorization: 'Bearer bad' })),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_TOKEN' },
    });
  });

  describe('device sessions', () => {
    it('accepts a token of an approved device', async () => {
      const { guard, jwt, findUser, findDevice } = buildGuard();
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com', did: 'device-id' });
      findDevice.mockResolvedValue({ revokedAt: null });
      findUser.mockResolvedValue(activeUser(['ASOCIADO']));

      await expect(guard.canActivate(contextWith(bearer))).resolves.toBe(true);
    });

    it('rejects a token of a revoked device even if the token has not expired', async () => {
      const { guard, jwt, findDevice } = buildGuard();
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com', did: 'device-id' });
      findDevice.mockResolvedValue({ revokedAt: new Date() });

      await expect(guard.canActivate(contextWith(bearer))).rejects.toMatchObject({
        response: { code: 'DEVICE_NOT_AUTHORIZED' },
      });
    });

    it('rejects a token of an unknown device', async () => {
      const { guard, jwt, findDevice } = buildGuard();
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com', did: 'gone' });
      findDevice.mockResolvedValue(null);

      await expect(guard.canActivate(contextWith(bearer))).rejects.toMatchObject({
        response: { code: 'DEVICE_NOT_AUTHORIZED' },
      });
    });

    it('rejects a token without a device when the demo login is off', async () => {
      const { guard, jwt } = buildGuard(false);
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com' });

      await expect(guard.canActivate(contextWith(bearer))).rejects.toMatchObject({
        response: { code: 'INVALID_TOKEN' },
      });
    });

    it('accepts a token without a device when the demo login is on', async () => {
      const { guard, jwt, findUser } = buildGuard(true);
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com' });
      findUser.mockResolvedValue(activeUser(['ASOCIADO']));

      await expect(guard.canActivate(contextWith(bearer))).resolves.toBe(true);
    });
  });

  it('rejects a valid token of a deactivated user', async () => {
    const { guard, jwt, findUser } = buildGuard(true);
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com' });
    findUser.mockResolvedValue({ ...activeUser([]), isActive: false });

    await expect(guard.canActivate(contextWith(bearer))).rejects.toMatchObject({
      response: { code: 'USER_INACTIVE' },
    });
  });

  describe('role checks', () => {
    async function canActivateAs(userRoles: string[], required: Role[]) {
      const { guard, jwt, findUser } = buildGuard(true);
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-id', email: 'a@tcs.com' });
      findUser.mockResolvedValue(activeUser(userRoles));
      return guard.canActivate(contextWith(bearer, required));
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
