import { type Prisma } from '@prisma/client';
import { type AppConfigService } from '../../config/app-config.service';
import { type PrismaService } from '../../prisma/prisma.service';
import { MAX_PUSH_ATTEMPTS, PushDispatcherService } from './push-dispatcher.service';
import { type PushOutcome, type PushSender } from './push-sender';

function pushRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    userId: 'u-1',
    title: 'Tu reserva fue reasignada',
    message: 'Sala A',
    attempts: 0,
    ...overrides,
  };
}

function subscription(id: string) {
  return { id, userId: 'u-1', endpoint: `https://push.example/${id}`, p256dh: 'p', auth: 'a' };
}

interface BuildOptions {
  rows?: unknown[];
  claimed?: number;
  subscriptions?: unknown[];
  enabled?: boolean;
}

function build(options: BuildOptions = {}) {
  const notification = {
    findMany: jest
      .fn<Promise<unknown[]>, [Prisma.NotificationFindManyArgs]>()
      .mockResolvedValue(options.rows ?? [pushRow()]),
    updateMany: jest
      .fn<Promise<{ count: number }>, [Prisma.NotificationUpdateManyArgs]>()
      .mockResolvedValue({ count: options.claimed ?? 1 }),
    update: jest.fn<Promise<unknown>, [Prisma.NotificationUpdateArgs]>().mockResolvedValue({}),
  };
  const pushSubscription = {
    findMany: jest.fn().mockResolvedValue(options.subscriptions ?? [subscription('s-1')]),
    delete: jest.fn().mockResolvedValue({}),
  };
  const send = jest.fn<Promise<PushOutcome>, [unknown, string]>().mockResolvedValue('delivered');
  const service = new PushDispatcherService(
    { notification, pushSubscription } as unknown as PrismaService,
    { send } as unknown as PushSender,
    { push: options.enabled === false ? null : { publicKey: 'k' } } as unknown as AppConfigService,
  );
  return { service, notification, pushSubscription, send };
}

describe('PushDispatcherService.dispatchPending', () => {
  it('does nothing when web push is not configured', async () => {
    const { service, notification } = build({ enabled: false });

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(notification.findMany).not.toHaveBeenCalled();
  });

  it('only reads pending push rows that still have attempts left', async () => {
    const { service, notification } = build();

    await service.dispatchPending();

    expect(notification.findMany.mock.calls[0][0].where).toEqual({
      channel: 'PUSH',
      status: 'PENDING',
      attempts: { lt: MAX_PUSH_ATTEMPTS },
    });
  });

  it('claims the row by its attempt counter so two instances never deliver it twice', async () => {
    const { service, notification } = build();

    await service.dispatchPending();

    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n-1', status: 'PENDING', attempts: 0 },
      data: { attempts: { increment: 1 } },
    });
  });

  it('skips a row another instance already claimed', async () => {
    const { service, send } = build({ claimed: 0 });

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the title, a short body and the destination to every device of the user', async () => {
    const { service, send } = build({ subscriptions: [subscription('s-1'), subscription('s-2')] });

    await service.dispatchPending();

    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[0][1])).toEqual({
      title: 'Tu reserva fue reasignada',
      body: 'Sala A',
      url: '/notifications',
      tag: 'n-1',
    });
  });

  it('marks the row as sent once a device was reached', async () => {
    const { service, notification } = build();

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { status: 'SENT', sentAt: expect.any(Date) as unknown },
    });
  });

  it('closes the row without sending when the user has no devices', async () => {
    const { service, send, notification } = build({ subscriptions: [] });

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(notification.update).toHaveBeenCalled();
  });

  it('forgets a device the push service reports as gone', async () => {
    const { service, send, pushSubscription } = build({
      subscriptions: [subscription('s-1'), subscription('s-2')],
    });
    send.mockResolvedValueOnce('gone').mockResolvedValueOnce('delivered');

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
  });

  it('keeps the row pending for another try after a transient failure', async () => {
    const { service, send, notification } = build();
    send.mockRejectedValue(new Error('timeout'));

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(notification.update).not.toHaveBeenCalled();
  });

  it('fails the row once the attempts are exhausted', async () => {
    const { service, send, notification } = build({
      rows: [pushRow({ attempts: MAX_PUSH_ATTEMPTS - 1 })],
    });
    send.mockRejectedValue(new Error('timeout'));

    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, failed: 1 });
    expect(notification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { status: 'FAILED' },
    });
  });
});
