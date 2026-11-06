import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { chunk } from '../reservations/time-rules';

const IDS_PER_QUERY = 500;

@Injectable()
export class BusySlotsReader {
  constructor(private readonly prisma: PrismaService) {}

  async byResource(resourceIds: string[], from: Date, to: Date): Promise<Map<string, string[]>> {
    const busy = new Map<string, string[]>();
    for (const id of resourceIds) busy.set(id, []);
    // Chunked to stay under the SQL Server 2100 parameter limit.
    for (const ids of chunk(resourceIds, IDS_PER_QUERY)) {
      const slots = await this.prisma.reservationSlot.findMany({
        where: { resourceId: { in: ids }, slotStart: { gte: from, lt: to } },
        select: { resourceId: true, slotStart: true },
        orderBy: { slotStart: 'asc' },
      });
      for (const slot of slots) busy.get(slot.resourceId)?.push(slot.slotStart.toISOString());
    }
    return busy;
  }
}
