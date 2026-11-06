import { type Prisma } from '@prisma/client';
import { type AppConfigService } from '../../config/app-config.service';
import { DEFAULT_RESERVATION_RULES } from '../../config/reservation-rules.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { type NotificationsService, type NotifyInput } from '../notifications.service';
import { RemindersService } from './reminders.service';

const NOW = new Date('2026-11-11T14:30:00Z');
const START = new Date('2026-11-11T15:00:00Z');

function due(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    userId: 'owner',
    startDateTime: START,
    endDateTime: new Date('2026-11-11T16:00:00Z'),
    resource: { type: 'MEETING_ROOM', name: 'Sala Board', parent: null },
    ...overrides,
  };
}

function build(options: { found?: unknown[]; claimed?: number } = {}) {
  const tx = {
    reservation: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.ReservationUpdateManyArgs]>()
        .mockResolvedValue({ count: options.claimed ?? 1 }),
    },
  };
  const findMany = jest
    .fn<Promise<unknown[]>, [Prisma.ReservationFindManyArgs]>()
    .mockResolvedValue(options.found ?? [due()]);
  const prisma = {
    reservation: { findMany },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const notifications = {
    notify: jest.fn<Promise<void>, [NotifyInput, unknown]>().mockResolvedValue(undefined),
  };
  const service = new RemindersService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    { current: () => DEFAULT_RESERVATION_RULES },
    { server: { timeZone: 'America/Guayaquil' } } as unknown as AppConfigService,
  );
  return { service, tx, findMany, notifications };
}

describe('RemindersService.sendDue', () => {
  it('looks for confirmed reservations that start within the lead time and were not reminded', async () => {
    const { service, findMany } = build();

    await service.sendDue(NOW);

    const [query] = findMany.mock.calls[0];
    expect(query.where).toEqual({
      status: 'CONFIRMED',
      reminderSentAt: null,
      startDateTime: { gt: NOW, lte: new Date('2026-11-11T15:30:00Z') },
    });
  });

  it('creates a reminder that disappears when the reservation starts', async () => {
    const { service, notifications, tx } = build();

    const result = await service.sendDue(NOW);

    expect(result).toEqual({ reminded: 1 });
    const [notice, client] = notifications.notify.mock.calls[0];
    expect(client).toBe(tx);
    expect(notice).toMatchObject({
      userId: 'owner',
      reservationId: 'res-1',
      type: 'RESERVATION_REMINDER',
      eventAt: START,
      expiresAt: START,
    });
    expect(notice.message).toContain('Sala Board');
    expect(notice.message).toContain('15 min');
  });

  it('claims the reminder with a guard so two instances never send it twice', async () => {
    const { service, tx } = build();

    await service.sendDue(NOW);

    expect(tx.reservation.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-1', status: 'CONFIRMED', reminderSentAt: null },
      data: { reminderSentAt: NOW },
    });
  });

  it('does not notify when another instance already claimed the reservation', async () => {
    const { service, notifications } = build({ claimed: 0 });

    const result = await service.sendDue(NOW);

    expect(result).toEqual({ reminded: 0 });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('does nothing when no reservation is due', async () => {
    const { service, notifications } = build({ found: [] });

    await expect(service.sendDue(NOW)).resolves.toEqual({ reminded: 0 });
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
