import { Prisma } from '@prisma/client';
import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { type FloorZoneInputDto } from './dto/floor-plan.dto';
import { FloorPlansService } from './floor-plans.service';

const PLAN_ID = 'plan-1';
const BUILDING_ID = 'building-1';

function actor(...roles: string[]): CurrentUserData {
  return { id: 'u1', email: 'u@tcs.com', fullName: 'U', roles, spocBuildingIds: [] };
}

const admin = actor('ADMIN');
const associate = actor('ASOCIADO');

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function storedZone(overrides: Record<string, unknown> = {}) {
  return {
    id: 'zone-1',
    floorPlanId: PLAN_ID,
    name: 'Board',
    kind: 'ROOM',
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    isReservable: true,
    resourceId: 'room',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function input(overrides: Partial<FloorZoneInputDto> = {}): FloorZoneInputDto {
  return {
    id: 'zone-1',
    name: 'Board',
    kind: 'ROOM',
    x: 0,
    y: 0,
    width: 50,
    height: 20,
    isReservable: true,
    resourceId: 'room',
    sortOrder: 0,
    ...overrides,
  };
}

function build(options: { planActive?: boolean; buildingActive?: boolean } = {}) {
  const zones = [storedZone()];
  const stored = {
    id: PLAN_ID,
    buildingId: BUILDING_ID,
    level: 0,
    name: 'Planta principal',
    width: 100,
    height: 50,
    isActive: options.planActive ?? true,
    building: { name: 'Amazonas Plaza', isActive: options.buildingActive ?? true },
    zones: zones.map((zone) => ({
      ...zone,
      resource: {
        id: 'room',
        name: 'Sala Board',
        type: 'MEETING_ROOM',
        capacity: 12,
        isActive: true,
        children: [],
      },
    })),
  };
  const tx = {
    floorPlan: {
      findUnique: jest.fn().mockResolvedValue({ ...stored, zones }),
      create: jest.fn((args: { data: object }) => Promise.resolve({ id: PLAN_ID, ...args.data })),
      update: jest.fn((args: { data: object }) => Promise.resolve({ ...stored, ...args.data })),
    },
    floorZone: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn((args: { data: object }) =>
        Promise.resolve({ id: 'new-zone', ...args.data }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    resource: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'room', type: 'MEETING_ROOM', buildingId: BUILDING_ID, isActive: true },
        { id: 'room-2', type: 'MEETING_ROOM', buildingId: BUILDING_ID, isActive: true },
      ]),
    },
  };
  const prisma = {
    floorPlan: {
      findMany: jest.fn().mockResolvedValue([stored]),
      findUnique: jest.fn().mockResolvedValue(stored),
    },
    building: { findUnique: jest.fn().mockResolvedValue({ id: BUILDING_ID }) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new FloorPlansService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma, tx, audit };
}

function actions(audit: { log: jest.Mock }) {
  return audit.log.mock.calls.map(([entry]: [{ action: string }]) => entry.action);
}

describe('FloorPlansService.list', () => {
  it('hides inactive plans and plans of inactive buildings by default', async () => {
    const { service, prisma } = build();

    await service.list({});

    expect(prisma.floorPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, building: { isActive: true } } }),
    );
  });

  it('returns every plan of a building when inactive ones are requested', async () => {
    const { service, prisma } = build();

    const plans = await service.list({ buildingId: BUILDING_ID, includeInactive: true });

    expect(prisma.floorPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { buildingId: BUILDING_ID } }),
    );
    expect(plans[0]).toEqual({
      id: PLAN_ID,
      buildingId: BUILDING_ID,
      buildingName: 'Amazonas Plaza',
      level: 0,
      name: 'Planta principal',
      width: 100,
      height: 50,
      isActive: true,
    });
  });
});

describe('FloorPlansService.get', () => {
  it('maps the zones with their resource and no seats for a room', async () => {
    const { service } = build();

    const plan = await service.get(associate, PLAN_ID);

    expect(plan.zones[0]).toMatchObject({
      id: 'zone-1',
      kind: 'ROOM',
      resourceId: 'room',
      resource: { id: 'room', type: 'MEETING_ROOM', capacity: 12, isActive: true },
      seats: [],
    });
  });

  it.each([
    ['an inactive plan', { planActive: false }],
    ['a plan of an inactive building', { buildingActive: false }],
  ])('returns 404 to an associate for %s', async (_, options) => {
    const { service } = build(options);

    await expect(service.get(associate, PLAN_ID)).rejects.toMatchObject({
      response: { code: 'FLOOR_PLAN_NOT_FOUND' },
    });
  });

  it('shows an inactive plan to an administrator', async () => {
    const { service } = build({ planActive: false });

    await expect(service.get(admin, PLAN_ID)).resolves.toMatchObject({ isActive: false });
  });

  it('returns 404 for an unknown plan', async () => {
    const { service, prisma } = build();
    prisma.floorPlan.findUnique.mockResolvedValueOnce(null);

    await expect(service.get(admin, 'missing')).rejects.toMatchObject({
      response: { code: 'FLOOR_PLAN_NOT_FOUND' },
    });
  });
});

describe('FloorPlansService.create', () => {
  const dto = { buildingId: BUILDING_ID, name: ' Planta principal ', width: 900, height: 600 };

  it('creates the plan on level 0 and audits it in the transaction', async () => {
    const { service, tx, audit } = build();

    await service.create(admin, dto);

    expect(tx.floorPlan.create).toHaveBeenCalledWith({
      data: {
        buildingId: BUILDING_ID,
        level: 0,
        name: 'Planta principal',
        width: 900,
        height: 600,
      },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FLOOR_PLAN_CREATED', entity: 'FloorPlan' }),
      tx,
    );
  });

  it('reports a second plan on the same level', async () => {
    const { service, tx } = build();
    tx.floorPlan.create.mockRejectedValueOnce(uniqueViolation());

    await expect(service.create(admin, dto)).rejects.toMatchObject({
      response: { code: 'FLOOR_PLAN_ALREADY_EXISTS' },
    });
  });

  it('rejects an unknown building', async () => {
    const { service, prisma } = build();
    prisma.building.findUnique.mockResolvedValueOnce(null);

    await expect(service.create(admin, dto)).rejects.toMatchObject({
      response: { code: 'BUILDING_NOT_FOUND' },
    });
  });
});

describe('FloorPlansService.update', () => {
  it('rejects shrinking the plan below a zone', async () => {
    const { service, tx } = build();

    await expect(service.update(admin, PLAN_ID, { width: 40 })).rejects.toMatchObject({
      response: { code: 'FLOOR_ZONE_OUT_OF_BOUNDS' },
    });
    expect(tx.floorPlan.update).not.toHaveBeenCalled();
  });

  it('audits the before and after values', async () => {
    const { service, tx, audit } = build();

    await service.update(admin, PLAN_ID, { name: 'Piso 1', isActive: false });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FLOOR_PLAN_UPDATED',
        details: {
          before: { name: 'Planta principal', width: 100, height: 50, isActive: true },
          after: { name: 'Piso 1', width: 100, height: 50, isActive: false },
        },
      }),
      tx,
    );
  });

  it('returns 404 for an unknown plan', async () => {
    const { service, tx } = build();
    tx.floorPlan.findUnique.mockResolvedValueOnce(null);

    await expect(service.update(admin, PLAN_ID, { name: 'X' })).rejects.toMatchObject({
      response: { code: 'FLOOR_PLAN_NOT_FOUND' },
    });
  });
});

describe('FloorPlansService.replaceZones', () => {
  it('deletes the zones missing from the payload and audits the deleted row', async () => {
    const { service, tx, audit } = build();

    await service.replaceZones(admin, PLAN_ID, { zones: [] });

    expect(tx.floorZone.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['zone-1'] } } });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FLOOR_ZONE_DELETED',
        entity: 'FloorZone',
        entityId: 'zone-1',
        details: expect.objectContaining({ name: 'Board', resourceId: 'room' }) as unknown,
      }),
      tx,
    );
  });

  it('creates zones without id and updates the changed ones', async () => {
    const { service, tx, audit } = build();
    const label = input({ id: undefined, name: 'Pasillo', kind: 'LABEL', isReservable: false });

    await service.replaceZones(admin, PLAN_ID, {
      zones: [input({ name: 'Board grande' }), { ...label, resourceId: null }],
    });

    expect(tx.floorZone.update).toHaveBeenCalledWith({
      where: { id: 'zone-1' },
      data: expect.objectContaining({ name: 'Board grande' }) as unknown,
    });
    expect(tx.floorZone.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Pasillo',
        floorPlanId: PLAN_ID,
        resourceId: null,
      }) as unknown,
    });
    expect(actions(audit)).toEqual(['FLOOR_ZONE_UPDATED', 'FLOOR_ZONE_CREATED']);
  });

  it('skips the zones that did not change', async () => {
    const { service, tx, audit } = build();

    await service.replaceZones(admin, PLAN_ID, { zones: [input()] });

    expect(tx.floorZone.update).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('frees the old link before moving a resource to another zone', async () => {
    const { service, tx } = build();

    await service.replaceZones(admin, PLAN_ID, {
      zones: [
        input({ resourceId: 'room-2' }),
        input({ id: undefined, name: 'Nueva', x: 50, resourceId: 'room' }),
      ],
    });

    expect(tx.floorZone.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['zone-1'] } },
      data: { resourceId: null },
    });
    expect(tx.floorZone.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.floorZone.create.mock.invocationCallOrder[0],
    );
  });

  it('rejects a resource linked in another plan', async () => {
    const { service, tx } = build();
    tx.floorZone.findMany.mockResolvedValueOnce([{ resourceId: 'room' }]);

    await expect(service.replaceZones(admin, PLAN_ID, { zones: [input()] })).rejects.toMatchObject({
      response: { code: 'FLOOR_ZONE_RESOURCE_TAKEN' },
    });
    expect(tx.floorZone.deleteMany).not.toHaveBeenCalled();
  });

  it('reports a link taken concurrently as FLOOR_ZONE_RESOURCE_TAKEN', async () => {
    const { service, tx } = build();
    tx.floorZone.update.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.replaceZones(admin, PLAN_ID, { zones: [input({ name: 'Otro' })] }),
    ).rejects.toMatchObject({ response: { code: 'FLOOR_ZONE_RESOURCE_TAKEN' } });
  });

  it('rejects an unknown zone id', async () => {
    const { service } = build();

    await expect(
      service.replaceZones(admin, PLAN_ID, { zones: [input({ id: 'zone-x' })] }),
    ).rejects.toMatchObject({ response: { code: 'FLOOR_ZONE_NOT_FOUND' } });
  });

  it('looks up the resources only when a zone links one', async () => {
    const { service, tx } = build();

    await service.replaceZones(admin, PLAN_ID, {
      zones: [input({ id: undefined, kind: 'LABEL', isReservable: false, resourceId: null })],
    });

    expect(tx.resource.findMany).not.toHaveBeenCalled();
  });
});
