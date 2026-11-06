import { type Prisma } from '@prisma/client';
import { type PrismaService } from '../../prisma/prisma.service';
import { hashEndpoint, PushSubscriptionsService } from './push-subscriptions.service';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const dto = { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } };

function build() {
  const pushSubscription = {
    upsert: jest
      .fn<Promise<{ id: string }>, [Prisma.PushSubscriptionUpsertArgs]>()
      .mockResolvedValue({ id: 'sub-1' }),
    deleteMany: jest
      .fn<Promise<{ count: number }>, [Prisma.PushSubscriptionDeleteManyArgs]>()
      .mockResolvedValue({ count: 1 }),
  };
  const service = new PushSubscriptionsService({ pushSubscription } as unknown as PrismaService);
  return { service, pushSubscription };
}

describe('PushSubscriptionsService', () => {
  it('hashes the endpoint to a fixed length key', () => {
    expect(hashEndpoint(ENDPOINT)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEndpoint(ENDPOINT)).toBe(hashEndpoint(ENDPOINT));
    expect(hashEndpoint(`${ENDPOINT}x`)).not.toBe(hashEndpoint(ENDPOINT));
  });

  it('registers the device once per endpoint', async () => {
    const { service, pushSubscription } = build();

    await expect(service.register('u-1', dto, 'Chrome Android')).resolves.toEqual({
      id: 'sub-1',
    });

    const args = pushSubscription.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ endpointHash: hashEndpoint(ENDPOINT) });
    expect(args.create).toMatchObject({
      userId: 'u-1',
      endpoint: ENDPOINT,
      p256dh: 'p',
      auth: 'a',
      userAgent: 'Chrome Android',
    });
  });

  it('moves a device that signs in as someone else to the new user', async () => {
    const { service, pushSubscription } = build();

    await service.register('u-2', dto);

    expect(pushSubscription.upsert.mock.calls[0][0].update).toMatchObject({ userId: 'u-2' });
  });

  it('trims a very long user agent', async () => {
    const { service, pushSubscription } = build();

    await service.register('u-1', dto, 'x'.repeat(500));

    expect(pushSubscription.upsert.mock.calls[0][0].create.userAgent).toHaveLength(300);
  });

  it('only removes the subscriptions of the caller', async () => {
    const { service, pushSubscription } = build();

    await expect(service.remove('u-1', ENDPOINT)).resolves.toEqual({ removed: 1 });
    expect(pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1', endpointHash: hashEndpoint(ENDPOINT) },
    });
  });
});
