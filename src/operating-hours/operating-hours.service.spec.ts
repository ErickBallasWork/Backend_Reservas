import { BadRequestException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { CurrentUserData } from '../common/current-user/current-user.types';
import type { AppConfigService } from '../config/app-config.service';
import type { ReservationRulesService } from '../config/reservation-rules.service';
import type { PrismaService } from '../prisma/prisma.service';
import { RuleViolation } from '../reservations/time-rules';
import { toLocalSlots } from './operating-calendar';
import { OperatingHoursService, resolveSchedule } from './operating-hours.service';

const LAB = 'lab-1';
const LAPTOP = 'laptop-1';
const ROOM = 'room-1';

const office = (resourceId: string | null, closesAtMinute = 1080) =>
  [1, 2, 3, 4, 5].map((dayOfWeek) => ({
    resourceId,
    dayOfWeek,
    opensAtMinute: 480,
    closesAtMinute,
  }));

describe('resolveSchedule', () => {
  it('prefers the resource own schedule', () => {
    const rows = [...office(null), ...office(ROOM, 600)];

    const resolved = resolveSchedule(rows, { id: ROOM, parentResourceId: null });

    expect(resolved.source).toBe('OWN');
    expect(resolved.windows?.every((w) => w.closesAtMinute === 600)).toBe(true);
  });

  it('lets a laptop inherit the schedule of its lab before the global one', () => {
    const rows = [...office(null), ...office(LAB, 720)];

    const resolved = resolveSchedule(rows, { id: LAPTOP, parentResourceId: LAB });

    expect(resolved.source).toBe('PARENT');
    expect(resolved.windows?.[0].closesAtMinute).toBe(720);
  });

  it('falls back to the global schedule', () => {
    const resolved = resolveSchedule(office(null), { id: ROOM, parentResourceId: null });

    expect(resolved.source).toBe('GLOBAL');
  });

  it('is open 24/7 when nothing is configured', () => {
    const resolved = resolveSchedule([], { id: ROOM, parentResourceId: null });

    expect(resolved).toEqual({ source: 'ALWAYS_OPEN', windows: null });
  });
});

describe('OperatingHoursService', () => {
  const admin: CurrentUserData = {
    id: 'admin',
    email: 'admin@tcs.com',
    fullName: 'Admin',
    roles: ['ADMIN'],
    spocBuildingIds: [],
  };

  function build(
    rows: ReturnType<typeof office>,
    closed: { resourceId: string | null; date: Date }[] = [],
  ) {
    const tx = {
      operatingHours: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      operatingHours: { findMany: jest.fn().mockResolvedValue(rows) },
      closedDate: { findMany: jest.fn().mockResolvedValue(closed) },
      resource: {
        findUnique: jest.fn().mockResolvedValue({ id: ROOM, parentResourceId: null }),
      },
      $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const audit = { log: jest.fn() };
    const service = new OperatingHoursService(
      prisma as unknown as PrismaService,
      { server: { timeZone: 'America/Guayaquil' } } as unknown as AppConfigService,
      audit as unknown as AuditService,
      { current: () => ({ slotMinutes: 30 }) } as unknown as ReservationRulesService,
    );
    return { service, prisma, tx, audit };
  }

  const slots = (iso: string) => toLocalSlots([new Date(iso)], 'America/Guayaquil');

  it('accepts a slot inside the global schedule', async () => {
    const { service } = build(office(null));

    await expect(
      service.assertOpen({ id: ROOM, parentResourceId: null }, slots('2026-11-12T15:00:00Z')),
    ).resolves.toBeUndefined();
  });

  it('rejects a slot outside the schedule with a stable code', async () => {
    const { service } = build(office(null));

    await expect(
      service.assertOpen({ id: ROOM, parentResourceId: null }, slots('2026-11-14T15:00:00Z')),
    ).rejects.toMatchObject({ code: 'OUTSIDE_OPERATING_HOURS' });
    await expect(
      service.assertOpen({ id: ROOM, parentResourceId: null }, slots('2026-11-14T15:00:00Z')),
    ).rejects.toBeInstanceOf(RuleViolation);
  });

  it('rejects a slot on a date closed for every resource', async () => {
    const { service } = build([], [{ resourceId: null, date: new Date('2026-11-12T00:00:00Z') }]);

    await expect(
      service.assertOpen({ id: ROOM, parentResourceId: null }, slots('2026-11-12T15:00:00Z')),
    ).rejects.toMatchObject({ code: 'OUTSIDE_OPERATING_HOURS' });
  });

  it('applies a date closed for another resource only to that resource', async () => {
    const { service } = build(
      [],
      [{ resourceId: 'other', date: new Date('2026-11-12T00:00:00Z') }],
    );

    await expect(
      service.assertOpen({ id: ROOM, parentResourceId: null }, slots('2026-11-12T15:00:00Z')),
    ).resolves.toBeUndefined();
  });

  it('replaces the schedule and audits it', async () => {
    const { service, tx, audit } = build([]);

    await service.replace(admin, {
      windows: [{ dayOfWeek: 1, opensAt: '08:00', closesAt: '18:00' }],
    });

    expect(tx.operatingHours.deleteMany).toHaveBeenCalledWith({ where: { resourceId: null } });
    expect(tx.operatingHours.createMany).toHaveBeenCalledWith({
      data: [{ dayOfWeek: 1, opensAtMinute: 480, closesAtMinute: 1080, resourceId: null }],
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OPERATING_HOURS_REPLACED' }),
      tx,
    );
  });

  it('removes the schedule when the list is empty', async () => {
    const { service, tx } = build([]);

    await service.replace(admin, { resourceId: ROOM, windows: [] });

    expect(tx.operatingHours.deleteMany).toHaveBeenCalledWith({ where: { resourceId: ROOM } });
    expect(tx.operatingHours.createMany).not.toHaveBeenCalled();
  });

  it('rejects overlapping windows without touching the database', async () => {
    const { service, prisma } = build([]);

    await expect(
      service.replace(admin, {
        windows: [
          { dayOfWeek: 1, opensAt: '08:00', closesAt: '12:00' },
          { dayOfWeek: 1, opensAt: '11:30', closesAt: '18:00' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
