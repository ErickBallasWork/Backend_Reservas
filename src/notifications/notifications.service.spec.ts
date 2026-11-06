import { NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type PrismaService } from '../prisma/prisma.service';
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

function build() {
  const notification = {
    create: jest.fn<Promise<unknown>, [Prisma.NotificationCreateArgs]>().mockResolvedValue({}),
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
  const service = new NotificationsService({ notification } as unknown as PrismaService);
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

    const { data } = notification.create.mock.calls[0][0];
    expect(data).toMatchObject({ userId: 'u-1', channel: 'IN_APP', status: 'SENT' });
  });

  it('lists only my in-app notices and hides the delivery internals', async () => {
    const { service, notification } = build();

    const page = await service.listMine('u-1', query());

    const args = notification.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: 'u-1', channel: 'IN_APP' });
    expect(args.select).not.toHaveProperty('userId');
    expect(args.select).not.toHaveProperty('attempts');
    expect(page).toMatchObject({ total: 1, unread: 1, items: [STORED] });
  });

  it('keeps the unread total independent of the unread filter', async () => {
    const { service, notification } = build();

    await service.listMine('u-1', query({ unreadOnly: true }));

    const wheres = notification.count.mock.calls.map(([args]) => args.where);
    expect(wheres).toEqual([
      { userId: 'u-1', channel: 'IN_APP', isRead: false },
      { userId: 'u-1', channel: 'IN_APP', isRead: false },
    ]);
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
    expect(notification.updateMany.mock.calls[0][0].where).toEqual({
      userId: 'u-1',
      channel: 'IN_APP',
      isRead: false,
    });
  });
});
