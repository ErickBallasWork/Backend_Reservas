import { HttpException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type PrismaService } from '../prisma/prisma.service';
import { SpocAgendaQueryDto } from './dto/spoc-agenda.dto';
import { parseAgendaRange, SpocAgendaService } from './spoc-agenda.service';

const spoc: CurrentUserData = {
  id: 'spoc',
  email: 'spoc@tcs.com',
  fullName: 'Spoc',
  roles: ['SPOC_EDIFICIO'],
  spocBuildingIds: ['north', 'south'],
};

const query = (overrides: Partial<SpocAgendaQueryDto> = {}) =>
  Object.assign(new SpocAgendaQueryDto(), {
    from: '2026-11-12T05:00:00Z',
    to: '2026-11-13T05:00:00Z',
    ...overrides,
  });

function build() {
  const prisma = {
    building: {
      findMany: jest.fn<Promise<unknown[]>, [Prisma.BuildingFindManyArgs]>().mockResolvedValue([
        { id: 'north', name: 'Norte', resources: [{ id: 'room-a', name: 'Sala A', capacity: 8 }] },
        { id: 'south', name: 'Sur', resources: [] },
      ]),
    },
    reservation: {
      findMany: jest.fn<Promise<unknown[]>, [Prisma.ReservationFindManyArgs]>().mockResolvedValue([
        {
          id: 'res-1',
          resourceId: 'room-a',
          status: 'CONFIRMED',
          user: { fullName: 'Owner' },
          _count: { reallocations: 1 },
        },
        {
          id: 'res-2',
          resourceId: 'room-a',
          status: 'PENDING_APPROVAL',
          user: { fullName: 'Other' },
          _count: { reallocations: 0 },
        },
      ]),
    },
  };
  return { service: new SpocAgendaService(prisma as unknown as PrismaService), prisma };
}

function rangeCode(overrides: Partial<SpocAgendaQueryDto>): string | null {
  try {
    parseAgendaRange(query(overrides));
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse();
      return typeof body === 'object' && 'code' in body ? String(body.code) : null;
    }
  }
  return null;
}

describe('parseAgendaRange', () => {
  it('rejects an end that is not after the start', () => {
    expect(rangeCode({ to: '2026-11-12T05:00:00Z' })).toBe('INVALID_RANGE');
  });

  it('rejects a range longer than 8 days', () => {
    expect(rangeCode({ to: '2026-11-21T06:00:00Z' })).toBe('RANGE_TOO_LONG');
  });

  it('accepts a week', () => {
    expect(rangeCode({ to: '2026-11-19T05:00:00Z' })).toBeNull();
  });
});

describe('SpocAgendaService.get', () => {
  it('shows the first assigned building when none is requested', async () => {
    const { service, prisma } = build();

    const agenda = await service.get(spoc, query());

    expect(agenda.buildingId).toBe('north');
    const { where } = prisma.reservation.findMany.mock.calls[0][0];
    expect(where?.resource).toEqual({ buildingId: 'north', type: 'MEETING_ROOM' });
  });

  it('limits the buildings to the ones the SPOC manages', async () => {
    const { service, prisma } = build();

    await service.get(spoc, query());

    const { where } = prisma.building.findMany.mock.calls[0][0];
    expect(where).toEqual({ isActive: true, id: { in: ['north', 'south'] } });
  });

  it('lets a SUPERADMIN see every active building', async () => {
    const { service, prisma } = build();

    await service.get({ ...spoc, roles: ['SUPERADMIN'], spocBuildingIds: [] }, query());

    expect(prisma.building.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('refuses a building the SPOC does not manage', async () => {
    const { service } = build();

    await expect(service.get(spoc, query({ buildingId: 'other' }))).rejects.toMatchObject({
      response: { code: 'NOT_YOUR_BUILDING' },
    });
  });

  it('refuses a SPOC without buildings', async () => {
    const { service, prisma } = build();
    prisma.building.findMany.mockResolvedValue([]);

    await expect(service.get({ ...spoc, spocBuildingIds: [] }, query())).rejects.toMatchObject({
      response: { code: 'NOT_YOUR_BUILDING' },
    });
  });

  it('flags the reservations that were already moved and exposes only the owner name', async () => {
    const { service } = build();

    const agenda = await service.get(spoc, query());

    expect(agenda.reservations.map((item) => item.reallocated)).toEqual([true, false]);
    expect(agenda.reservations[0].owner).toEqual({ fullName: 'Owner' });
    expect(agenda.buildings[0].rooms).toEqual([{ id: 'room-a', name: 'Sala A', capacity: 8 }]);
  });

  it('lists only reservations that overlap the range and still matter', async () => {
    const { service, prisma } = build();

    await service.get(spoc, query());

    const { where } = prisma.reservation.findMany.mock.calls[0][0];
    expect(where?.status).toEqual({ in: ['CONFIRMED', 'PENDING_APPROVAL', 'CHECKED_IN'] });
    expect(where?.startDateTime).toEqual({ lt: new Date('2026-11-13T05:00:00Z') });
    expect(where?.endDateTime).toEqual({ gt: new Date('2026-11-12T05:00:00Z') });
  });
});
