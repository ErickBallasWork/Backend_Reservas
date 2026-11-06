import { type Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { BLOCKING_STATUSES } from '../common/constants';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { insertSlots } from '../reservations/slots';

@Injectable()
export class LabLaptopSlotsService {
  constructor(private readonly reservationRules: ReservationRulesService) {}

  async blockInFutureLabReservations(
    db: Prisma.TransactionClient,
    laptopId: string,
    labId: string,
  ): Promise<void> {
    const now = new Date();
    const { slotMinutes } = this.reservationRules.current();
    const labReservations = await db.reservation.findMany({
      where: {
        resourceId: labId,
        reservationType: 'FULL_LAB',
        status: { in: BLOCKING_STATUSES },
        endDateTime: { gt: now },
      },
      select: {
        id: true,
        slots: { where: { resourceId: labId, slotEnd: { gt: now } }, select: { slotStart: true } },
      },
    });
    for (const reservation of labReservations) {
      const slotStarts = reservation.slots.map((slot) => slot.slotStart);
      if (slotStarts.length > 0) {
        await insertSlots(db, reservation.id, [laptopId], slotStarts, slotMinutes);
      }
    }
  }
}
