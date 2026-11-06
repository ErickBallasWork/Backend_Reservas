import { Prisma } from '@prisma/client';
import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type AppConfigService } from '../config/app-config.service';
import { type NotificationsService } from '../notifications/notifications.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type RoleRowsService } from '../users/role-rows.service';
import { hashSecret } from '../common/secret-hash';
import { AccessRequestsService } from './access-requests.service';

const SECRET = 'a'.repeat(43);
const ACTOR: CurrentUserData = {
  id: 'superadmin-id',
  email: 'root@tcs.com',
  fullName: 'Root',
  roles: ['SUPERADMIN'],
  spocBuildingIds: [],
};

function build(bootstrapSuperadmin: { email: string; autoApprove: boolean } | null = null) {
  const accessRequest = {
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'req-id', decidedBy: null }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  const user = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([{ id: 'superadmin-id' }]),
    create: jest.fn().mockResolvedValue({ id: 'new-user-id' }),
  };
  const userRole = { createMany: jest.fn(), count: jest.fn().mockResolvedValue(1) };
  const device = { count: jest.fn().mockResolvedValue(0) };
  const tx = { accessRequest, user, userRole, device };
  const prisma = {
    accessRequest,
    user,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const audit = { log: jest.fn() };
  const notifications = {
    notify: jest.fn(),
    resolveForAccessRequest: jest.fn().mockResolvedValue(undefined),
  };
  const roleRows = { resolve: jest.fn().mockResolvedValue([{ roleId: 1, buildingId: null }]) };
  const service = new AccessRequestsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    notifications as unknown as NotificationsService,
    {
      auth: { allowedEmailDomains: ['tcs.com', 'pichincha.com'], bootstrapSuperadmin },
      server: { timeZone: 'America/Guayaquil' },
    } as unknown as AppConfigService,
    roleRows as unknown as RoleRowsService,
  );
  return { service, accessRequest, user, userRole, device, audit, notifications, roleRows };
}

const createDto = {
  email: ' Ana@TCS.com ',
  fullName: 'Ana Pérez',
  deviceSecret: SECRET,
  deviceLabel: 'Chrome en Windows',
};

describe('AccessRequestsService.create', () => {
  it('rejects a domain that is not allowed', async () => {
    const { service, accessRequest } = build();

    await expect(service.create({ ...createDto, email: 'ana@gmail.com' })).rejects.toMatchObject({
      response: { code: 'DOMAIN_NOT_ALLOWED' },
    });
    expect(accessRequest.create).not.toHaveBeenCalled();
  });

  it('creates a NEW_USER request, hashes the secret and notifies the SUPERADMINs', async () => {
    const { service, accessRequest, notifications, audit } = build();
    accessRequest.create.mockResolvedValue({
      id: 'req-id',
      fullName: 'Ana Pérez',
      email: 'ana@tcs.com',
    });

    const result = await service.create(createDto);

    expect(result).toEqual({ requestId: 'req-id' });
    expect(accessRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'ana@tcs.com',
        kind: 'NEW_USER',
        deviceSecretHash: hashSecret(SECRET),
      }) as unknown,
    });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ACCESS_REQUEST', accessRequestId: 'req-id' }),
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('creates a NEW_DEVICE request for an existing user and keeps their name', async () => {
    const { service, accessRequest, user } = build();
    user.findUnique.mockResolvedValue({ id: 'u', fullName: 'Ana Existente', department: 'TI' });
    accessRequest.create.mockResolvedValue({ id: 'req-id', fullName: 'Ana Existente' });

    await service.create(createDto);

    expect(accessRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'NEW_DEVICE',
        fullName: 'Ana Existente',
      }) as unknown,
    });
  });

  it('refuses a second pending request for the same email', async () => {
    const { service, accessRequest } = build();
    accessRequest.findFirst.mockResolvedValueOnce({ id: 'other' });

    await expect(service.create(createDto)).rejects.toMatchObject({
      response: { code: 'ACCESS_REQUEST_PENDING' },
    });
  });

  it('maps the unique index violation of a concurrent request to the same error', async () => {
    const { service, accessRequest } = build();
    accessRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.create(createDto)).rejects.toMatchObject({
      response: { code: 'ACCESS_REQUEST_PENDING' },
    });
  });

  it('blocks a new request during the cooldown after a rejection', async () => {
    const { service, accessRequest } = build();
    accessRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ decidedAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

    await expect(service.create(createDto)).rejects.toMatchObject({
      response: { code: 'ACCESS_REQUEST_COOLDOWN' },
    });
  });

  it('allows a new request once the cooldown is over', async () => {
    const { service, accessRequest } = build();
    accessRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ decidedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    accessRequest.create.mockResolvedValue({ id: 'req-id', fullName: 'Ana Pérez' });

    await expect(service.create(createDto)).resolves.toEqual({ requestId: 'req-id' });
  });
});

describe('AccessRequestsService.status', () => {
  it('answers only to the device that created the request', async () => {
    const { service, accessRequest } = build();
    accessRequest.findUnique.mockResolvedValue({
      status: 'REJECTED',
      decisionComment: 'No corresponde',
      deviceSecretHash: hashSecret(SECRET),
    });

    await expect(service.status({ requestId: 'req-id', deviceSecret: SECRET })).resolves.toEqual({
      status: 'REJECTED',
      decisionComment: 'No corresponde',
    });
    await expect(
      service.status({ requestId: 'req-id', deviceSecret: 'b'.repeat(43) }),
    ).rejects.toMatchObject({ response: { code: 'ACCESS_REQUEST_NOT_FOUND' } });
  });
});

describe('AccessRequestsService.approve', () => {
  const pending = {
    id: 'req-id',
    email: 'ana@tcs.com',
    fullName: 'Ana',
    department: null,
    kind: 'NEW_USER',
    status: 'PENDING',
  };

  it('creates the user with ASOCIADO by default and audits the decision', async () => {
    const { service, accessRequest, user, userRole, audit, roleRows } = build();
    accessRequest.findUnique.mockResolvedValue(pending);

    await service.approve(ACTOR, 'req-id', {});

    expect(roleRows.resolve).toHaveBeenCalledWith([{ role: 'ASOCIADO' }]);
    expect(user.create).toHaveBeenCalled();
    expect(userRole.createMany).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_REQUEST_APPROVED', userId: ACTOR.id }),
      expect.anything(),
    );
  });

  it('does not create a user for an existing one', async () => {
    const { service, accessRequest, user } = build();
    accessRequest.findUnique.mockResolvedValue({ ...pending, kind: 'NEW_DEVICE' });
    user.findUnique.mockResolvedValue({ id: 'u', isActive: true });

    await service.approve(ACTOR, 'req-id', {});

    expect(user.create).not.toHaveBeenCalled();
  });

  it.each(['approve', 'reject'] as const)('clears the superadmin notices on %s', async (action) => {
    const { service, accessRequest, notifications } = build();
    accessRequest.findUnique.mockResolvedValue(pending);

    if (action === 'approve') await service.approve(ACTOR, 'req-id', {});
    else await service.reject(ACTOR, 'req-id', { comment: 'No corresponde' });

    expect(notifications.resolveForAccessRequest).toHaveBeenCalledWith('req-id', expect.anything());
  });

  it('refuses to approve a device of a deactivated user', async () => {
    const { service, accessRequest, user } = build();
    accessRequest.findUnique.mockResolvedValue(pending);
    user.findUnique.mockResolvedValue({ id: 'u', isActive: false });

    await expect(service.approve(ACTOR, 'req-id', {})).rejects.toMatchObject({
      response: { code: 'USER_INACTIVE' },
    });
  });

  it('refuses roles for an existing user', async () => {
    const { service, accessRequest, user } = build();
    accessRequest.findUnique.mockResolvedValue(pending);
    user.findUnique.mockResolvedValue({ id: 'u', isActive: true });

    await expect(
      service.approve(ACTOR, 'req-id', { roles: [{ role: 'ADMIN' }] }),
    ).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
  });

  it('refuses a request that was already resolved', async () => {
    const { service, accessRequest } = build();
    accessRequest.findUnique.mockResolvedValue({ ...pending, status: 'APPROVED' });

    await expect(service.approve(ACTOR, 'req-id', {})).rejects.toMatchObject({
      response: { code: 'ALREADY_RESOLVED' },
    });
  });

  it('loses the race when someone else decides first', async () => {
    const { service, accessRequest } = build();
    accessRequest.findUnique.mockResolvedValue(pending);
    accessRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approve(ACTOR, 'req-id', {})).rejects.toMatchObject({
      response: { code: 'ALREADY_RESOLVED' },
    });
  });
});

describe('AccessRequestsService.reject', () => {
  it('stores the trimmed comment and audits the decision', async () => {
    const { service, accessRequest, audit } = build();
    accessRequest.findUnique.mockResolvedValue({
      id: 'req-id',
      email: 'ana@tcs.com',
      status: 'PENDING',
    });

    await service.reject(ACTOR, 'req-id', { comment: '  No corresponde  ' });

    expect(accessRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-id', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'REJECTED',
        decisionComment: 'No corresponde',
      }) as unknown,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_REQUEST_REJECTED' }),
      expect.anything(),
    );
  });
});

describe('AccessRequestsService.create bootstrap auto-approval', () => {
  const ADMIN_EMAIL = 'admin@tcs.com';
  const dto = { ...createDto, email: ADMIN_EMAIL };

  function buildAdmin(autoApprove = true, createdAgoHours = 1) {
    const ctx = build({ email: ADMIN_EMAIL, autoApprove });
    ctx.user.findUnique.mockResolvedValue({
      id: 'admin-id',
      email: ADMIN_EMAIL,
      fullName: 'Admin',
      department: null,
      isActive: true,
      createdAt: new Date(Date.now() - createdAgoHours * 60 * 60 * 1000),
    });
    ctx.accessRequest.create.mockResolvedValue({ id: 'req-id', fullName: 'Admin' });
    ctx.accessRequest.count = jest.fn().mockResolvedValue(0);
    return ctx;
  }

  function createdStatus(accessRequest: { create: jest.Mock }): unknown {
    const [[args]] = accessRequest.create.mock.calls as [[{ data: { status?: string } }]];
    return args.data.status;
  }

  it('approves the first device of the initial SUPERADMIN inside the window', async () => {
    const { service, accessRequest, audit, notifications } = buildAdmin();

    await service.create(dto);

    expect(createdStatus(accessRequest)).toBe('APPROVED');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACCESS_REQUEST_APPROVED',
        details: expect.objectContaining({ source: 'bootstrap-auto-approve' }) as unknown,
      }),
      expect.anything(),
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('leaves the request pending when the flag is off', async () => {
    const { service, accessRequest } = buildAdmin(false);

    await service.create(dto);

    expect(createdStatus(accessRequest)).toBeUndefined();
  });

  it('leaves the request pending after the 24 h window', async () => {
    const { service, accessRequest } = buildAdmin(true, 25);

    await service.create(dto);

    expect(createdStatus(accessRequest)).toBeUndefined();
  });

  it('leaves the request pending when the user already had a device', async () => {
    const { service, accessRequest, device } = buildAdmin();
    device.count.mockResolvedValue(1);

    await service.create(dto);

    expect(createdStatus(accessRequest)).toBeUndefined();
  });

  it('leaves the request pending when the user is not a SUPERADMIN', async () => {
    const { service, accessRequest, userRole } = buildAdmin();
    userRole.count.mockResolvedValue(0);

    await service.create(dto);

    expect(createdStatus(accessRequest)).toBeUndefined();
  });

  it('never auto-approves another email', async () => {
    const ctx = build({ email: ADMIN_EMAIL, autoApprove: true });
    ctx.user.findUnique.mockResolvedValue({ id: 'u', fullName: 'Ana', department: null });
    ctx.accessRequest.create.mockResolvedValue({ id: 'req-id', fullName: 'Ana' });

    await ctx.service.create(createDto);

    expect(createdStatus(ctx.accessRequest)).toBeUndefined();
  });
});
