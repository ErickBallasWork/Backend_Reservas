import { NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type PrismaService } from '../prisma/prisma.service';
import { type AppConfigService } from '../config/app-config.service';
import { NotificationsQueryDto } from './dto/notifications-query.dto';
import { NotificationsService } from './notifications.service';

const STORED = {
  id: 'n-1',
  type: 'RESERVATION_CONFIRMED',
  title: 'Reserva confirmada',
  message: 'Tu reserva quedó confirmada.',
  isRead: false,
  createdAt: new Date('2026-11-11T15:00:00Z'),
};

function build(pushEnabled = false) {
  const notification = {
    createMany: jest
      .fn<Promise<unknown>, [Prisma.NotificationCreateManyArgs]>()
      .mockResolvedValue({}),
    findMany: jest
      .fn<Promise<unknown[]>, [Prisma.NotificationFindManyArgs]>()
      .mockResolvedValue([STORED]),
    count: jest.fn<Promise<number>, [Prisma.NotificationCountArgs]>().mockResolvedValue(1),
    findFirst: jest
      .fn<Promise<unknown>, [Prisma.NotificationFindFirstArgs]>()
      .mockResolvedValue(STORED),
    update: jest
      .fn<Promise<unknown>, [Prisma.NotificationUpdateArgs]>()
      .mockResolvedValue({ ...STORED, isRead: true }),
    updateMany: jest
      .fn<Promise<{ count: number }>, [Prisma.NotificationUpdateManyArgs]>()
      .mockResolvedValue({ count: 3 }),
  };
  const service = new NotificationsService(
    { notification } as unknown as PrismaService,
    { push: pushEnabled ? { publicKey: 'k' } : null } as unknown as AppConfigService,
  );
  return { service, notification };
}

function query(overrides: Partial<NotificationsQueryDto> = {}): NotificationsQueryDto {
  return Object.assign(new NotificationsQueryDto(), overrides);
}

describe('NotificationsService', () => {
  it('stores an in-app notice that is already delivered', async () => {
    const { service, notification } = build();

    await service.notify({
      userId: 'u-1',
      type: 'RESERVATION_CONFIRMED',
      title: 'Reserva confirmada',
      message: 'Tu reserva quedó confirmada.',
    });

    const { data } = notification.createMany.mock.calls[0][0];
    expect(data).toEqual([
      expect.objectContaining({ userId: 'u-1', channel: 'IN_APP', status: 'SENT' }),
    ]);
  });

  it('also queues a push delivery when web push is configured', async () => {
    const { service, notification } = build(true);

    await service.notify({
      userId: 'u-1',
      type: 'RESERVATION_CONFIRMED',
      title: 'Reserva confirmada',
      message: 'Sala A',
    });

    const { data } = notification.createMany.mock.calls[0][0];
    expect(data).toEqual([
      expect.objectContaining({ channel: 'IN_APP', status: 'SENT' }),
      expect.objectContaining({ channel: 'PUSH', status: 'PENDING', userId: 'u-1' }),
    ]);
  });

  it('lists only my in-app notices and hides the delivery internals', async () => {
    const { service, notification } = build();

    const page = await service.listMine('u-1', query());

    const args = notification.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ userId: 'u-1', channel: 'IN_APP' });
    expect(args.select).not.toHaveProperty('userId');
    expect(args.select).not.toHaveProperty('attempts');
    expect(page).toMatchObject({ total: 1, unread: 1, items: [STORED] });
  });

  it('keeps the unread total independent of the unread filter', async () => {
    const { service, notification } = build();

    await service.listMine('u-1', query({ unreadOnly: true }));

    const wheres = notification.count.mock.calls.map(([args]) => args.where);
    expect(wheres).toHaveLength(2);
    expect(wheres[0]).toEqual(wheres[1]);
    expect(wheres[0]).toMatchObject({ userId: 'u-1', isRead: false });
  });

  it('rejects marking a notice that belongs to someone else', async () => {
    const { service, notification } = build();
    notification.findFirst.mockResolvedValue(null);

    await expect(service.markRead('u-1', 'n-9')).rejects.toBeInstanceOf(NotFoundException);
    expect(notification.update).not.toHaveBeenCalled();
  });

  it('does not write when the notice is already read', async () => {
    const { service, notification } = build();
    notification.findFirst.mockResolvedValue({ ...STORED, isRead: true });

    await service.markRead('u-1', 'n-1');

    expect(notification.update).not.toHaveBeenCalled();
  });

  it('marks every unread notice of the user as read', async () => {
    const { service, notification } = build();

    await expect(service.markAllRead('u-1')).resolves.toEqual({ updated: 3 });
    expect(notification.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: 'u-1',
      channel: 'IN_APP',
      isRead: false,
    });
  });

  it('hides notices whose validity already ended', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-11T15:00:00Z') });
    const { service, notification } = build();

    await service.listMine('u-1', query());
    await service.unreadCount('u-1');
    jest.useRealTimers();

    const expected = {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date('2026-11-11T15:00:00Z') } }],
    };
    expect(notification.findMany.mock.calls[0][0].where).toMatchObject(expected);
    expect(notification.count.mock.calls.at(-1)?.[0].where).toMatchObject(expected);
  });

  it('stores the reservation, the event time and the expiry for the card', async () => {
    const { service, notification } = build();
    const eventAt = new Date('2026-11-12T15:00:00Z');

    await service.notify({
      userId: 'u-1',
      type: 'RESERVATION_REMINDER',
      title: 'Tu reserva empieza pronto',
      message: 'Sala A',
      reservationId: 'res-1',
      eventAt,
      expiresAt: eventAt,
    });

    expect(notification.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ reservationId: 'res-1', eventAt, expiresAt: eventAt }),
    ]);
  });

  it('resolves only the unread notices of the given types for a reservation', async () => {
    const { service, notification } = build();

    await service.resolveForReservation('res-1', ['RESERVATION_REMINDER'], {
      notification,
    } as never);

    expect(notification.updateMany.mock.calls[0][0]).toEqual({
      where: {
        reservationId: 'res-1',
        type: { in: ['RESERVATION_REMINDER'] },
        channel: 'IN_APP',
        isRead: false,
      },
      data: { isRead: true },
    });
  });

  it('resolves the notices of an access request once it is decided', async () => {
    const { service, notification } = build();

    await service.resolveForAccessRequest('req-1', { notification } as never);

    expect(notification.updateMany.mock.calls[0][0].where).toEqual({
      accessRequestId: 'req-1',
      channel: 'IN_APP',
      isRead: false,
    });
  });
});
