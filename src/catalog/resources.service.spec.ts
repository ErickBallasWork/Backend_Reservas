import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { type CatalogLookupService } from './catalog-lookup.service';
import { type LabLaptopSlotsService } from './lab-laptop-slots.service';
import { ResourcesService } from './resources.service';

const BUILDING_A = 'building-a';
const BUILDING_B = 'building-b';
const LAB_1 = 'lab-1';
const LAB_2 = 'lab-2';
const LAPTOP = 'laptop-1';
const ROOM = 'room-1';

const actor: CurrentUserData = {
  id: 'admin',
  email: 'a@tcs.com',
  fullName: 'Admin',
  roles: ['ADMIN'],
  spocBuildingIds: [],
};

interface ResourceRow {
  id: string;
  type: string;
  buildingId: string;
  parentResourceId: string | null;
  isActive: boolean;
  name: string;
  capacity: number;
}

function row(overrides: Partial<ResourceRow> & Pick<ResourceRow, 'id' | 'type'>): ResourceRow {
  return {
    buildingId: BUILDING_A,
    parentResourceId: null,
    isActive: true,
    name: overrides.id,
    capacity: 1,
    ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function build(rows: ResourceRow[], buildings = [{ id: BUILDING_B, isActive: true }]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const tx = {
    resource: {
      create: jest.fn((args: { data: Partial<ResourceRow> }) =>
        Promise.resolve({ id: 'new-resource', isActive: true, ...args.data }),
      ),
      update: jest.fn((args: { where: { id: string }; data: Partial<ResourceRow> }) =>
        Promise.resolve({ ...byId.get(args.where.id), ...args.data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    resource: {
      findUnique: jest.fn((args: { where: { id: string } }) =>
        Promise.resolve(byId.get(args.where.id) ?? null),
      ),
    },
    building: {
      findUnique: jest.fn((args: { where: { id: string } }) =>
        Promise.resolve(buildings.find((b) => b.id === args.where.id) ?? null),
      ),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const lookup = {
    assertNoFutureReservations: jest.fn().mockResolvedValue(undefined),
    futureReservations: jest.fn().mockResolvedValue([]),
  };
  const labLaptopSlots = { blockInFutureLabReservations: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn() };
  const service = new ResourcesService(
    prisma as unknown as PrismaService,
    lookup as unknown as CatalogLookupService,
    audit as unknown as AuditService,
    labLaptopSlots as unknown as LabLaptopSlotsService,
  );
  return { service, tx, lookup, labLaptopSlots, audit };
}

const lab1 = row({ id: LAB_1, type: 'AI_LAB', capacity: 10 });
const lab2 = row({ id: LAB_2, type: 'AI_LAB', capacity: 10 });
const laptop = row({ id: LAPTOP, type: 'LAPTOP', parentResourceId: LAB_1 });
const room = row({ id: ROOM, type: 'MEETING_ROOM', capacity: 8 });

describe('ResourcesService.create', () => {
  it('blocks a new laptop in the future full lab reservations', async () => {
    const { service, labLaptopSlots, tx } = build([lab1]);

    await service.create(actor, { type: 'LAPTOP', name: 'Laptop 9', parentResourceId: LAB_1 });

    expect(tx.resource.create).toHaveBeenCalled();
    expect(labLaptopSlots.blockInFutureLabReservations).toHaveBeenCalledWith(
      tx,
      'new-resource',
      LAB_1,
    );
  });

  it('does not touch lab slots when a room is created', async () => {
    const { service, labLaptopSlots } = build([], [{ id: BUILDING_B, isActive: true }]);

    await service.create(actor, {
      type: 'MEETING_ROOM',
      name: 'Sala 3',
      buildingId: BUILDING_B,
      capacity: 4,
    });

    expect(labLaptopSlots.blockInFutureLabReservations).not.toHaveBeenCalled();
  });

  it('rejects a laptop in an inactive lab', async () => {
    const { service, tx } = build([{ ...lab1, isActive: false }]);

    await expect(
      service.create(actor, { type: 'LAPTOP', name: 'Laptop 9', parentResourceId: LAB_1 }),
    ).rejects.toMatchObject({ response: { code: 'PARENT_INACTIVE' } });
    expect(tx.resource.create).not.toHaveBeenCalled();
  });

  it('rejects a room in an inactive building', async () => {
    const { service } = build([], [{ id: BUILDING_B, isActive: false }]);

    await expect(
      service.create(actor, {
        type: 'MEETING_ROOM',
        name: 'Sala 3',
        buildingId: BUILDING_B,
        capacity: 4,
      }),
    ).rejects.toMatchObject({ response: { code: 'BUILDING_INACTIVE' } });
  });

  it('reports a duplicated name within the building', async () => {
    const { service, tx } = build([], [{ id: BUILDING_B, isActive: true }]);
    tx.resource.create.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.create(actor, {
        type: 'MEETING_ROOM',
        name: 'Sala 3',
        buildingId: BUILDING_B,
        capacity: 4,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ResourcesService.update on laptops', () => {
  it('blocks moving a laptop that has future reservations', async () => {
    const { service, lookup, tx } = build([lab1, lab2, laptop]);
    lookup.assertNoFutureReservations.mockRejectedValueOnce(
      new ConflictException({ code: 'HAS_FUTURE_RESERVATIONS', message: 'x' }),
    );

    await expect(service.update(actor, LAPTOP, { parentResourceId: LAB_2 })).rejects.toMatchObject({
      response: { code: 'HAS_FUTURE_RESERVATIONS' },
    });
    expect(tx.resource.update).not.toHaveBeenCalled();
  });

  it('looks for the full lab reservations that hold the laptop through slots', async () => {
    const { service, lookup } = build([lab1, lab2, laptop]);

    await service.update(actor, LAPTOP, { parentResourceId: LAB_2 });

    expect(lookup.assertNoFutureReservations).toHaveBeenCalledWith(
      { OR: [{ resourceId: LAPTOP }, { slots: { some: { resourceId: LAPTOP } } }] },
      'La laptop',
      expect.anything(),
    );
  });

  it('blocks the moved laptop in the future reservations of the new lab', async () => {
    const { service, labLaptopSlots, tx } = build([lab1, lab2, laptop]);

    await service.update(actor, LAPTOP, { parentResourceId: LAB_2 });

    expect(labLaptopSlots.blockInFutureLabReservations).toHaveBeenCalledWith(tx, LAPTOP, LAB_2);
  });

  it('does not move a laptop into an inactive lab', async () => {
    const { service } = build([lab1, { ...lab2, isActive: false }, laptop]);

    await expect(service.update(actor, LAPTOP, { parentResourceId: LAB_2 })).rejects.toMatchObject({
      response: { code: 'PARENT_INACTIVE' },
    });
  });

  it('blocks a reactivated laptop in the future reservations of its lab', async () => {
    const { service, labLaptopSlots, tx } = build([lab1, { ...laptop, isActive: false }]);

    await service.update(actor, LAPTOP, { isActive: true });

    expect(labLaptopSlots.blockInFutureLabReservations).toHaveBeenCalledWith(tx, LAPTOP, LAB_1);
  });

  it('does not reactivate a laptop whose lab is inactive', async () => {
    const { service } = build([
      { ...lab1, isActive: false },
      { ...laptop, isActive: false },
    ]);

    await expect(service.update(actor, LAPTOP, { isActive: true })).rejects.toMatchObject({
      response: { code: 'PARENT_INACTIVE' },
    });
  });

  it('does not touch lab slots on a plain edit', async () => {
    const { service, labLaptopSlots } = build([lab1, laptop]);

    await service.update(actor, LAPTOP, { assetTag: 'TAG-1' });

    expect(labLaptopSlots.blockInFutureLabReservations).not.toHaveBeenCalled();
  });

  it('refuses to set the building of a laptop directly', async () => {
    const { service } = build([lab1, laptop]);

    await expect(service.update(actor, LAPTOP, { buildingId: BUILDING_B })).rejects.toMatchObject({
      response: { code: 'BUILDING_NOT_ALLOWED' },
    });
  });
});

describe('ResourcesService.update on labs and rooms', () => {
  it('blocks deactivating a lab that has future reservations', async () => {
    const { service, lookup, tx } = build([lab1]);
    lookup.assertNoFutureReservations.mockRejectedValueOnce(
      new ConflictException({ code: 'HAS_FUTURE_RESERVATIONS', message: 'x' }),
    );

    await expect(service.update(actor, LAB_1, { isActive: false })).rejects.toMatchObject({
      response: { code: 'HAS_FUTURE_RESERVATIONS' },
    });
    expect(tx.resource.update).not.toHaveBeenCalled();
    expect(tx.resource.updateMany).not.toHaveBeenCalled();
  });

  it('deactivates the laptops of a lab that is deactivated', async () => {
    const { service, tx } = build([lab1]);

    await service.update(actor, LAB_1, { isActive: false });

    expect(tx.resource.updateMany).toHaveBeenCalledWith({
      where: { parentResourceId: LAB_1, isActive: true },
      data: { isActive: false },
    });
  });

  it('keeps the laptops inactive when the lab is reactivated', async () => {
    const { service, tx } = build([{ ...lab1, isActive: false }]);

    await service.update(actor, LAB_1, { isActive: true });

    expect(tx.resource.updateMany).not.toHaveBeenCalled();
  });

  it('does not delete anything when deactivating', async () => {
    const { service, tx } = build([room]);

    await service.update(actor, ROOM, { isActive: false });

    expect(tx.resource.update).toHaveBeenCalledWith({
      where: { id: ROOM },
      data: { isActive: false },
    });
  });

  it('blocks moving a room that has future reservations', async () => {
    const { service, lookup, tx } = build([room]);
    lookup.assertNoFutureReservations.mockRejectedValueOnce(
      new ConflictException({ code: 'HAS_FUTURE_RESERVATIONS', message: 'x' }),
    );

    await expect(service.update(actor, ROOM, { buildingId: BUILDING_B })).rejects.toMatchObject({
      response: { code: 'HAS_FUTURE_RESERVATIONS' },
    });
    expect(tx.resource.update).not.toHaveBeenCalled();
  });

  it('moves a lab together with its laptops', async () => {
    const { service, tx } = build([lab1]);

    await service.update(actor, LAB_1, { buildingId: BUILDING_B });

    expect(tx.resource.update).toHaveBeenCalledWith({
      where: { id: LAB_1 },
      data: { buildingId: BUILDING_B },
    });
    expect(tx.resource.updateMany).toHaveBeenCalledWith({
      where: { parentResourceId: LAB_1 },
      data: { buildingId: BUILDING_B },
    });
  });

  it('does not move a room to an inactive building', async () => {
    const { service } = build([room], [{ id: BUILDING_B, isActive: false }]);

    await expect(service.update(actor, ROOM, { buildingId: BUILDING_B })).rejects.toMatchObject({
      response: { code: 'BUILDING_INACTIVE' },
    });
  });

  it('does not move a room to a building that does not exist', async () => {
    const { service } = build([room], []);

    await expect(service.update(actor, ROOM, { buildingId: BUILDING_B })).rejects.toMatchObject({
      response: { code: 'BUILDING_NOT_FOUND' },
    });
  });

  it('reports a name that already exists in the target building', async () => {
    const { service, tx } = build([room]);
    tx.resource.update.mockRejectedValueOnce(uniqueViolation());

    await expect(service.update(actor, ROOM, { buildingId: BUILDING_B })).rejects.toMatchObject({
      response: { code: 'RESOURCE_NAME_TAKEN' },
    });
  });

  it('writes an audit entry in the same transaction', async () => {
    const { service, audit, tx } = build([room]);

    await service.update(actor, ROOM, { name: 'Sala Nueva' });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESOURCE_UPDATED', entityId: ROOM }),
      tx,
    );
  });
});
