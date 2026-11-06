import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { hashSecret } from '../common/secret-hash';
import { type AppConfigService } from '../config/app-config.service';
import { type PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { type SessionService } from './session.service';

const SECRET = 'a'.repeat(43);
const REFRESH = 'r'.repeat(64);
const DAY_MS = 24 * 60 * 60 * 1000;

const actor: CurrentUserData = {
  id: 'root',
  email: 'root@tcs.com',
  fullName: 'Root',
  roles: ['SUPERADMIN'],
  spocBuildingIds: [],
};

function dbUser(isActive = true) {
  return {
    id: 'user-id',
    email: 'ana@tcs.com',
    fullName: 'Ana',
    isActive,
    roles: [{ buildingId: null, role: { name: 'ASOCIADO' } }],
  };
}

function build(superadminTestLoginEnabled = false) {
  const accessRequest = {
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const user = { findUnique: jest.fn(), update: jest.fn() };
  const device = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest
      .fn<Promise<{ id: string }>, [{ data: { refreshTokenHash: string } }]>()
      .mockResolvedValue({ id: 'device-id' }),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const tx = { accessRequest, user, device };
  const prisma = {
    accessRequest,
    user,
    device,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const audit = { log: jest.fn() };
  const sessions = {
    issueForDevice: jest
      .fn<Promise<unknown>, [unknown, string, string]>()
      .mockResolvedValue({ accessToken: 'jwt', refreshToken: 'next' }),
  };
  const service = new DevicesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    sessions as unknown as SessionService,
    {
      auth: {
        deviceIdleDays: 30,
        superadminTestLoginEnabled,
        bootstrapSuperadmin: { email: 'admin@tcs.com', autoApprove: false },
      },
    } as unknown as AppConfigService,
  );
  return { service, accessRequest, user, device, audit, sessions };
}

describe('DevicesService.redeem', () => {
  const approved = {
    id: 'req-id',
    email: 'ana@tcs.com',
    status: 'APPROVED',
    deviceLabel: 'Chrome',
    deviceSecretHash: hashSecret(SECRET),
  };

  it('enrolls the device once and returns a session with a refresh token', async () => {
    const { service, accessRequest, user, device, sessions, audit } = build();
    accessRequest.findUnique.mockResolvedValue(approved);
    user.findUnique.mockResolvedValue(dbUser());

    const session = await service.redeem({ requestId: 'req-id', deviceSecret: SECRET });

    expect(session).toMatchObject({ refreshToken: 'next' });
    expect(device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-id', label: 'Chrome' }) as unknown,
    });
    expect(sessions.issueForDevice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-id' }),
      'device-id',
      expect.any(String),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEVICE_ENROLLED' }),
      expect.anything(),
    );
  });

  it('never stores the refresh token itself', async () => {
    const { service, accessRequest, user, device, sessions } = build();
    accessRequest.findUnique.mockResolvedValue(approved);
    user.findUnique.mockResolvedValue(dbUser());

    await service.redeem({ requestId: 'req-id', deviceSecret: SECRET });

    const issuedToken = sessions.issueForDevice.mock.calls[0][2];
    const stored = device.create.mock.calls[0][0].data;
    expect(stored.refreshTokenHash).toBe(hashSecret(issuedToken));
    expect(stored.refreshTokenHash).not.toBe(issuedToken);
  });

  it('answers not found to a device that does not own the request', async () => {
    const { service, accessRequest } = build();
    accessRequest.findUnique.mockResolvedValue(approved);

    await expect(
      service.redeem({ requestId: 'req-id', deviceSecret: 'b'.repeat(43) }),
    ).rejects.toMatchObject({ response: { code: 'ACCESS_REQUEST_NOT_FOUND' } });
  });

  it.each(['PENDING', 'REJECTED'])('refuses a %s request', async (status) => {
    const { service, accessRequest } = build();
    accessRequest.findUnique.mockResolvedValue({ ...approved, status });

    await expect(
      service.redeem({ requestId: 'req-id', deviceSecret: SECRET }),
    ).rejects.toMatchObject({
      response: { code: 'ACCESS_REQUEST_NOT_APPROVED' },
    });
  });

  it('refuses to redeem the same approval twice', async () => {
    const { service, accessRequest, user } = build();
    accessRequest.findUnique.mockResolvedValue(approved);
    user.findUnique.mockResolvedValue(dbUser());
    accessRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.redeem({ requestId: 'req-id', deviceSecret: SECRET }),
    ).rejects.toMatchObject({
      response: { code: 'ACCESS_REQUEST_REDEEMED' },
    });
  });

  it('refuses a deactivated user', async () => {
    const { service, accessRequest, user } = build();
    accessRequest.findUnique.mockResolvedValue(approved);
    user.findUnique.mockResolvedValue(dbUser(false));

    await expect(
      service.redeem({ requestId: 'req-id', deviceSecret: SECRET }),
    ).rejects.toMatchObject({
      response: { code: 'USER_INACTIVE' },
    });
  });
});

describe('DevicesService.refresh', () => {
  const liveDevice = {
    id: 'device-id',
    revokedAt: null,
    expiresAt: new Date(Date.now() + DAY_MS),
    user: dbUser(),
  };

  it('rotates the refresh token and slides the idle expiry', async () => {
    const { service, device } = build();
    device.findUnique.mockResolvedValue(liveDevice);

    await service.refresh({ refreshToken: REFRESH });

    expect(device.updateMany).toHaveBeenCalledWith({
      where: { id: 'device-id', refreshTokenHash: hashSecret(REFRESH), revokedAt: null },
      data: expect.objectContaining({
        previousRefreshTokenHash: hashSecret(REFRESH),
        expiresAt: expect.any(Date) as unknown,
      }) as unknown,
    });
  });

  it('returns a different refresh token than the one presented', async () => {
    const { service, device, sessions } = build();
    device.findUnique.mockResolvedValue(liveDevice);

    await service.refresh({ refreshToken: REFRESH });

    expect(sessions.issueForDevice.mock.calls[0][2]).not.toBe(REFRESH);
  });

  it.each([
    ['revoked', { revokedAt: new Date() }],
    ['idle for too long', { expiresAt: new Date(Date.now() - 1000) }],
  ])('refuses a device that is %s', async (_label, override) => {
    const { service, device } = build();
    device.findUnique.mockResolvedValue({ ...liveDevice, ...override });

    await expect(service.refresh({ refreshToken: REFRESH })).rejects.toMatchObject({
      response: { code: 'DEVICE_NOT_AUTHORIZED' },
    });
  });

  it('refuses a deactivated user', async () => {
    const { service, device } = build();
    device.findUnique.mockResolvedValue({ ...liveDevice, user: dbUser(false) });

    await expect(service.refresh({ refreshToken: REFRESH })).rejects.toMatchObject({
      response: { code: 'USER_INACTIVE' },
    });
  });

  it('refuses when another request rotated the token first', async () => {
    const { service, device } = build();
    device.findUnique.mockResolvedValue(liveDevice);
    device.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh({ refreshToken: REFRESH })).rejects.toMatchObject({
      response: { code: 'DEVICE_NOT_AUTHORIZED' },
    });
  });

  describe('reuse of a rotated token', () => {
    it('revokes the device when an old token comes back after the grace period', async () => {
      const { service, device, audit } = build();
      device.findUnique.mockResolvedValue(null);
      device.findFirst.mockResolvedValue({
        id: 'device-id',
        userId: 'user-id',
        rotatedAt: new Date(Date.now() - 5 * 60 * 1000),
      });

      await expect(service.refresh({ refreshToken: REFRESH })).rejects.toMatchObject({
        response: { code: 'DEVICE_NOT_AUTHORIZED' },
      });
      expect(device.update).toHaveBeenCalledWith({
        where: { id: 'device-id' },
        data: { revokedAt: expect.any(Date) as unknown },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DEVICE_TOKEN_REUSE_DETECTED' }),
        expect.anything(),
      );
    });

    it('only refuses, without revoking, inside the grace period of two parallel tabs', async () => {
      const { service, device } = build();
      device.findUnique.mockResolvedValue(null);
      device.findFirst.mockResolvedValue({
        id: 'device-id',
        userId: 'user-id',
        rotatedAt: new Date(Date.now() - 2000),
      });

      await expect(service.refresh({ refreshToken: REFRESH })).rejects.toMatchObject({
        response: { code: 'DEVICE_NOT_AUTHORIZED' },
      });
      expect(device.update).not.toHaveBeenCalled();
    });

    it('refuses an unknown token', async () => {
      const { service, device } = build();
      device.findUnique.mockResolvedValue(null);
      device.findFirst.mockResolvedValue(null);

      await expect(service.refresh({ refreshToken: REFRESH })).rejects.toMatchObject({
        response: { code: 'DEVICE_NOT_AUTHORIZED' },
      });
      expect(device.update).not.toHaveBeenCalled();
    });
  });
});

describe('DevicesService.logout', () => {
  it('revokes the device that owns the token, current or just rotated', async () => {
    const { service, device } = build();

    await service.logout({ refreshToken: REFRESH });

    expect(device.updateMany).toHaveBeenCalledWith({
      where: {
        revokedAt: null,
        OR: [
          { refreshTokenHash: hashSecret(REFRESH) },
          { previousRefreshTokenHash: hashSecret(REFRESH) },
        ],
      },
      data: { revokedAt: expect.any(Date) as unknown },
    });
  });
});

describe('DevicesService.revoke', () => {
  it('revokes a device and audits who did it', async () => {
    const { service, device, audit } = build();
    device.findUnique.mockResolvedValue({ id: 'device-id', userId: 'user-id', revokedAt: null });

    await service.revoke(actor, 'device-id');

    expect(device.update).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEVICE_REVOKED', userId: 'root' }),
      expect.anything(),
    );
  });

  it('is idempotent for an already revoked device', async () => {
    const { service, device, audit } = build();
    device.findUnique.mockResolvedValue({ id: 'device-id', userId: 'u', revokedAt: new Date() });

    await service.revoke(actor, 'device-id');

    expect(device.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('fails for an unknown device', async () => {
    const { service, device } = build();
    device.findUnique.mockResolvedValue(null);

    await expect(service.revoke(actor, 'gone')).rejects.toMatchObject({
      response: { code: 'DEVICE_NOT_FOUND' },
    });
  });
});

describe('DevicesService.loginSuperadminForTests', () => {
  const EMAIL = 'admin@tcs.com';
  const login = { email: ' Admin@TCS.com ', password: EMAIL };
  const superadmin = {
    ...dbUser(),
    email: EMAIL,
    roles: [{ buildingId: null, role: { name: 'SUPERADMIN' } }],
  };

  it('is not available when the flag is off', async () => {
    const { service, user } = build(false);

    await expect(service.loginSuperadminForTests(login)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it('enrolls a device and returns a session with a refresh token', async () => {
    const { service, user, device, sessions, audit } = build(true);
    user.findUnique.mockResolvedValue(superadmin);

    const session = await service.loginSuperadminForTests(login);

    expect(session).toMatchObject({ refreshToken: 'next' });
    expect(device.create).toHaveBeenCalledTimes(1);
    expect(sessions.issueForDevice).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL }),
      'device-id',
      expect.any(String),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUPERADMIN_TEST_LOGIN' }),
      expect.anything(),
    );
  });

  it.each([
    ['a wrong password', { email: EMAIL, password: 'other' }],
    ['another email', { email: 'ana@tcs.com', password: 'ana@tcs.com' }],
  ])('rejects %s', async (_name, body) => {
    const { service, user, device } = build(true);
    user.findUnique.mockResolvedValue(superadmin);

    await expect(service.loginSuperadminForTests(body)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(device.create).not.toHaveBeenCalled();
  });

  it('rejects a user that is not an active SUPERADMIN', async () => {
    const { service, user } = build(true);
    user.findUnique.mockResolvedValue({ ...superadmin, roles: [] });

    await expect(service.loginSuperadminForTests(login)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });
});
