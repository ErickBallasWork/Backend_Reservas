import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { assertValidAssignment, canManageAssociates } from './managed-associates.policy';
import { ManagedAssociatesService } from './managed-associates.service';

const ACTOR: CurrentUserData = {
  id: 'admin-id',
  email: 'admin@tcs.com',
  fullName: 'Admin',
  roles: ['ADMIN'],
  spocBuildingIds: [],
};

const MANAGER_ID = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';
const LUIS = '33333333-3333-4333-8333-333333333333';

function codeOf(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return (error as { response: { code: string } }).response.code;
  }
  return null;
}

describe('canManageAssociates', () => {
  it.each(['SPOC_ADMIN', 'LIDER'])('accepts %s', (role) => {
    expect(canManageAssociates(['ASOCIADO', role])).toBe(true);
  });

  it.each(['ASOCIADO', 'ADMIN', 'SPOC_EDIFICIO', 'SUPERADMIN'])('rejects %s alone', (role) => {
    expect(canManageAssociates([role])).toBe(false);
  });
});

describe('assertValidAssignment', () => {
  it('rejects a manager without a managing role', () => {
    expect(codeOf(() => assertValidAssignment(MANAGER_ID, ['ASOCIADO'], [ANA]))).toBe(
      'NOT_A_MANAGER',
    );
  });

  it('rejects assigning a person to themselves', () => {
    expect(codeOf(() => assertValidAssignment(MANAGER_ID, ['LIDER'], [ANA, MANAGER_ID]))).toBe(
      'CANNOT_MANAGE_SELF',
    );
  });

  it('accepts a valid assignment', () => {
    expect(codeOf(() => assertValidAssignment(MANAGER_ID, ['LIDER'], [ANA, LUIS]))).toBeNull();
  });
});

function build(managerRoles: string[] = ['LIDER']) {
  const managedAssociate = {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  };
  const user = {
    findUnique: jest.fn().mockResolvedValue({
      id: MANAGER_ID,
      roles: managerRoles.map((name) => ({ role: { name } })),
    }),
    count: jest.fn((args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(args.where.id.in.length),
    ),
  };
  const tx = { managedAssociate };
  const prisma = {
    managedAssociate,
    user,
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const audit = { log: jest.fn() };
  const service = new ManagedAssociatesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, managedAssociate, user, audit };
}

describe('ManagedAssociatesService.replace', () => {
  it('replaces the list and audits before and after', async () => {
    const { service, managedAssociate, audit } = build();
    managedAssociate.findMany.mockResolvedValueOnce([{ associateId: LUIS }]);

    await service.replace(ACTOR, MANAGER_ID, { associateIds: [ANA] });

    expect(managedAssociate.deleteMany).toHaveBeenCalledWith({ where: { managerId: MANAGER_ID } });
    expect(managedAssociate.createMany).toHaveBeenCalledWith({
      data: [{ managerId: MANAGER_ID, associateId: ANA, createdById: ACTOR.id }],
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MANAGED_ASSOCIATES_REPLACED',
        details: { before: [LUIS], after: [ANA] },
      }),
      expect.anything(),
    );
  });

  it('ignores duplicated ids', async () => {
    const { service, managedAssociate, user } = build();
    user.count.mockResolvedValue(1);

    await service.replace(ACTOR, MANAGER_ID, { associateIds: [ANA, ANA] });

    expect(managedAssociate.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ associateId: ANA }) as unknown],
    });
  });

  it('can clear the list', async () => {
    const { service, managedAssociate, user } = build();

    await service.replace(ACTOR, MANAGER_ID, { associateIds: [] });

    expect(user.count).not.toHaveBeenCalled();
    expect(managedAssociate.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('refuses a manager that cannot have associates', async () => {
    const { service, managedAssociate } = build(['ASOCIADO']);

    await expect(service.replace(ACTOR, MANAGER_ID, { associateIds: [ANA] })).rejects.toMatchObject(
      {
        response: { code: 'NOT_A_MANAGER' },
      },
    );
    expect(managedAssociate.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses associates that do not exist or are deactivated', async () => {
    const { service, user, managedAssociate } = build();
    user.count.mockResolvedValue(1);

    await expect(
      service.replace(ACTOR, MANAGER_ID, { associateIds: [ANA, LUIS] }),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
    expect(managedAssociate.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses an unknown manager', async () => {
    const { service, user } = build();
    user.findUnique.mockResolvedValue(null);

    await expect(service.replace(ACTOR, MANAGER_ID, { associateIds: [] })).rejects.toMatchObject({
      response: { code: 'USER_NOT_FOUND' },
    });
  });
});
