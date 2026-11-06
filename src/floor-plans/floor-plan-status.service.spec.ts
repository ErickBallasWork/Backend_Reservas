import { type BusySlotsReader } from '../availability/busy-slots.reader';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { ReservationRulesService } from '../config/reservation-rules.service';
import {
  type ScheduleBook,
  type OperatingHoursService,
} from '../operating-hours/operating-hours.service';
import { type PrismaService } from '../prisma/prisma.service';
import { FloorPlanStatusService } from './floor-plan-status.service';
import { type FloorPlansService } from './floor-plans.service';

const PLAN_ID = 'plan-1';
const FROM = '2026-11-12T15:00:00.000Z';
const TO = '2026-11-12T17:00:00.000Z';

const user: CurrentUserData = {
  id: 'ana',
  email: 'ana@tcs.com',
  fullName: 'Ana',
  roles: ['ASOCIADO'],
  spocBuildingIds: [],
};

function zone(id: string, resource: Record<string, unknown> | null) {
  return { id, isReservable: resource !== null, resource };
}

function build(closedDates: string[] = []) {
  const plan = {
    id: PLAN_ID,
    zones: [
      zone('z-room', {
        id: 'room',
        type: 'MEETING_ROOM',
        capacity: 12,
        isActive: true,
        children: [],
      }),
      zone('z-lab', {
        id: 'lab',
        type: 'AI_LAB',
        capacity: 8,
        isActive: true,
        children: [{ id: 'lap-1' }, { id: 'lap-2' }],
      }),
      zone('z-deco', null),
    ],
  };
  const floorPlans = { findVisible: jest.fn().mockResolvedValue(plan) };
  const busySlots = {
    byResource: jest.fn().mockResolvedValue(
      new Map([
        ['room', [FROM]],
        ['lab', []],
        ['lap-1', []],
        ['lap-2', ['2026-11-12T16:00:00.000Z']],
      ]),
    ),
  };
  const prisma = {
    reservation: { findMany: jest.fn().mockResolvedValue([{ resourceId: 'lap-2' }]) },
  };
  const book: ScheduleBook = {
    calendarFor: () => ({ windows: null, closedDates: new Set(closedDates) }),
  };
  const operatingHours = {
    timeZone: 'America/Guayaquil',
    loadBook: jest.fn().mockResolvedValue(book),
  };
  const service = new FloorPlanStatusService(
    prisma as unknown as PrismaService,
    floorPlans as unknown as FloorPlansService,
    busySlots as unknown as BusySlotsReader,
    operatingHours as unknown as OperatingHoursService,
    new ReservationRulesService(),
  );
  return { service, floorPlans, busySlots, prisma, operatingHours };
}

describe('FloorPlanStatusService.status', () => {
  it('combines busy slots, my reservations and the plan zones', async () => {
    const { service } = build();

    const result = await service.status(user, PLAN_ID, { from: FROM, to: TO });

    expect(result).toEqual({
      floorPlanId: PLAN_ID,
      from: FROM,
      to: TO,
      zones: [
        { zoneId: 'z-room', state: 'OCCUPIED', reason: null, totalSeats: null, freeSeats: null },
        { zoneId: 'z-lab', state: 'OCCUPIED', reason: null, totalSeats: 2, freeSeats: 1 },
        {
          zoneId: 'z-deco',
          state: 'NOT_RESERVABLE',
          reason: null,
          totalSeats: null,
          freeSeats: null,
        },
      ],
      seats: [
        { resourceId: 'lap-1', state: 'FREE' },
        { resourceId: 'lap-2', state: 'MINE' },
      ],
    });
  });

  it('reads the busy slots of every resource in one call', async () => {
    const { service, busySlots, prisma, operatingHours } = build();

    await service.status(user, PLAN_ID, { from: FROM, to: TO });

    expect(busySlots.byResource).toHaveBeenCalledTimes(1);
    expect(busySlots.byResource).toHaveBeenCalledWith(
      ['room', 'lab', 'lap-1', 'lap-2'],
      new Date(FROM),
      new Date(TO),
    );
    expect(prisma.reservation.findMany).toHaveBeenCalledTimes(1);
    expect(operatingHours.loadBook).toHaveBeenCalledTimes(1);
  });

  it('looks only for my blocking reservations overlapping the range', async () => {
    const { service, prisma } = build();

    await service.status(user, PLAN_ID, { from: FROM, to: TO });

    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'ana',
        resourceId: { in: ['room', 'lab', 'lap-1', 'lap-2'] },
        status: { in: ['PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN'] },
        startDateTime: { lt: new Date(TO) },
        endDateTime: { gt: new Date(FROM) },
      },
      select: { resourceId: true },
    });
  });

  it('aligns the start of the busy window to the slot that contains it', async () => {
    const { service, busySlots } = build();

    await service.status(user, PLAN_ID, { from: '2026-11-12T15:10:00.000Z', to: TO });

    expect(busySlots.byResource).toHaveBeenCalledWith(
      expect.any(Array),
      new Date(FROM),
      new Date(TO),
    );
  });

  it('puts the resources closed in the range out of the filter', async () => {
    const { service } = build(['2026-11-12']);

    const result = await service.status(user, PLAN_ID, { from: FROM, to: TO });

    expect(result.zones[0]).toMatchObject({ state: 'OUT_OF_FILTER', reason: 'CLOSED' });
  });

  it('applies the type and capacity filters', async () => {
    const { service } = build();

    const result = await service.status(user, PLAN_ID, {
      from: FROM,
      to: TO,
      type: 'AI_LAB',
      minCapacity: 10,
    });

    expect(result.zones[0]).toMatchObject({ state: 'OUT_OF_FILTER', reason: 'TYPE' });
    expect(result.zones[1]).toMatchObject({ state: 'OUT_OF_FILTER', reason: 'CAPACITY' });
  });

  it.each([
    ['ends before it starts', TO, FROM],
    ['is empty', FROM, FROM],
    ['is longer than 48 hours', FROM, '2026-11-14T15:30:00.000Z'],
  ])('rejects a range that %s', async (_, from, to) => {
    const { service, floorPlans } = build();

    await expect(service.status(user, PLAN_ID, { from, to })).rejects.toMatchObject({
      response: { code: 'FLOOR_PLAN_RANGE_INVALID' },
    });
    expect(floorPlans.findVisible).not.toHaveBeenCalled();
  });

  it('accepts a range of exactly 48 hours', async () => {
    const { service } = build();

    await expect(
      service.status(user, PLAN_ID, { from: FROM, to: '2026-11-14T15:00:00.000Z' }),
    ).resolves.toMatchObject({ floorPlanId: PLAN_ID });
  });
});
