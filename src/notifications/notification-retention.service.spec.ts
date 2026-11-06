import { type Prisma } from '@prisma/client';
import { type PrismaService } from '../prisma/prisma.service';
import { NotificationRetentionService } from './notification-retention.service';

const NOW = new Date('2026-11-11T03:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function ids(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `n-${index}` }));
}

function build(batches: number[]) {
  const findMany = jest.fn<Promise<{ id: string }[]>, [Prisma.NotificationFindManyArgs]>();
  for (const size of batches) findMany.mockResolvedValueOnce(ids(size));
  findMany.mockResolvedValue([]);
  const deleteMany = jest
    .fn<Promise<{ count: number }>, [Prisma.NotificationDeleteManyArgs]>()
    .mockImplementation(({ where }) =>
      Promise.resolve({ count: (where?.id as { in: string[] }).in.length }),
    );
  const service = new NotificationRetentionService({
    notification: { findMany, deleteMany },
  } as unknown as PrismaService);
  return { service, findMany, deleteMany };
}

describe('NotificationRetentionService.purge', () => {
  it('removes read notices after 30 days, any notice after 90 and delivery rows after 7', async () => {
    const { service, findMany } = build([]);

    await service.purge(NOW);

    expect(findMany.mock.calls[0][0].where).toEqual({
      OR: [
        {
          channel: 'IN_APP',
          isRead: true,
          createdAt: { lt: new Date(NOW.getTime() - 30 * DAY_MS) },
        },
        { channel: 'IN_APP', createdAt: { lt: new Date(NOW.getTime() - 90 * DAY_MS) } },
        { channel: { not: 'IN_APP' }, createdAt: { lt: new Date(NOW.getTime() - 7 * DAY_MS) } },
      ],
    });
  });

  it('deletes in batches until a short batch comes back', async () => {
    const { service, deleteMany } = build([500, 120]);

    const result = await service.purge(NOW);

    expect(result).toEqual({ purged: 620 });
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  it('stops after the per-run cap even when more rows remain', async () => {
    const { service, findMany } = build(Array.from({ length: 30 }, () => 500));

    await service.purge(NOW);

    expect(findMany).toHaveBeenCalledTimes(20);
  });

  it('reports zero when nothing expired', async () => {
    const { service, deleteMany } = build([]);

    await expect(service.purge(NOW)).resolves.toEqual({ purged: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
