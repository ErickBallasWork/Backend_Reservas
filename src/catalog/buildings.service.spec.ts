import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { BuildingsService } from './buildings.service';
import { type CatalogLookupService } from './catalog-lookup.service';

const BUILDING_ID = 'building-1';

const actor: CurrentUserData = {
  id: 'admin',
  email: 'a@tcs.com',
  fullName: 'Admin',
  roles: ['ADMIN'],
  spocBuildingIds: [],
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('duplicate', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

function build(isActive = true) {
  const current = { id: BUILDING_ID, name: 'Torre', address: null, isActive, resources: [] };
  const tx = {
    building: {
      create: jest.fn((args: { data: object }) => Promise.resolve({ id: 'new', ...args.data })),
      update: jest.fn((args: { data: object }) => Promise.resolve({ ...current, ...args.data })),
    },
  };
  const prisma = {
    building: { findUnique: jest.fn().mockResolvedValue(current) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const lookup = {
    assertNoFutureReservations: jest.fn().mockResolvedValue(undefined),
    futureReservations: jest.fn().mockResolvedValue([]),
  };
  const audit = { log: jest.fn() };
  const service = new BuildingsService(
    prisma as unknown as PrismaService,
    lookup as unknown as CatalogLookupService,
    audit as unknown as AuditService,
  );
  return { service, tx, lookup, audit };
}

describe('BuildingsService.update', () => {
  it('blocks deactivating a building with future reservations', async () => {
    const { service, lookup, tx } = build();
    lookup.assertNoFutureReservations.mockRejectedValueOnce(
      new ConflictException({ code: 'HAS_FUTURE_RESERVATIONS', message: 'x' }),
    );

    await expect(service.update(actor, BUILDING_ID, { isActive: false })).rejects.toMatchObject({
      response: { code: 'HAS_FUTURE_RESERVATIONS' },
    });
    expect(tx.building.update).not.toHaveBeenCalled();
  });

  it('checks the reservations of every resource of the building', async () => {
    const { service, lookup } = build();

    await service.update(actor, BUILDING_ID, { isActive: false });

    expect(lookup.assertNoFutureReservations).toHaveBeenCalledWith(
      { resource: { buildingId: BUILDING_ID } },
      'El edificio',
      expect.anything(),
    );
  });

  it('does not check reservations when the building is reactivated', async () => {
    const { service, lookup } = build(false);

    await service.update(actor, BUILDING_ID, { isActive: true });

    expect(lookup.assertNoFutureReservations).not.toHaveBeenCalled();
  });

  it('reports a duplicated building name', async () => {
    const { service, tx } = build();
    tx.building.update.mockRejectedValueOnce(uniqueViolation());

    await expect(service.update(actor, BUILDING_ID, { name: 'Otra' })).rejects.toMatchObject({
      response: { code: 'BUILDING_NAME_TAKEN' },
    });
  });

  it('writes the audit entry in the same transaction', async () => {
    const { service, audit, tx } = build();

    await service.update(actor, BUILDING_ID, { address: 'Av. 1' });

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BUILDING_UPDATED' }),
      tx,
    );
  });
});

describe('BuildingsService.create', () => {
  it('reports a duplicated building name', async () => {
    const { service, tx } = build();
    tx.building.create.mockRejectedValueOnce(uniqueViolation());

    await expect(service.create(actor, { name: 'Torre' })).rejects.toMatchObject({
      response: { code: 'BUILDING_NAME_TAKEN' },
    });
  });
});

describe('BuildingsService.futureReservations', () => {
  it('lists the reservations of the resources of the building', async () => {
    const { service, lookup } = build();

    await service.futureReservations(BUILDING_ID);

    expect(lookup.futureReservations).toHaveBeenCalledWith({
      resource: { buildingId: BUILDING_ID },
    });
  });
});
