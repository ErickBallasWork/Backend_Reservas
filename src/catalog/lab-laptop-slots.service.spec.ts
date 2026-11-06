import { type Prisma } from '@prisma/client';
import { type ReservationRulesService } from '../config/reservation-rules.service';
import { LabLaptopSlotsService } from './lab-laptop-slots.service';

const LAB_ID = 'lab';
const LAPTOP_ID = 'laptop';
const SLOT_MINUTES = 30;

function slotStart(minutes: number) {
  return new Date(Date.UTC(2026, 10, 20, 10, minutes));
}

function build(reservations: { id: string; slots: { slotStart: Date }[] }[]) {
  const tx = {
    reservation: { findMany: jest.fn().mockResolvedValue(reservations) },
    reservationSlot: { createMany: jest.fn() },
  };
  const rules = { current: () => ({ slotMinutes: SLOT_MINUTES }) };
  const service = new LabLaptopSlotsService(rules as unknown as ReservationRulesService);
  return { service, tx, client: tx as unknown as Prisma.TransactionClient };
}

describe('LabLaptopSlotsService.blockInFutureLabReservations', () => {
  it('looks only at blocking full lab reservations that have not ended', async () => {
    const { service, tx, client } = build([]);

    await service.blockInFutureLabReservations(client, LAPTOP_ID, LAB_ID);

    expect(tx.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId: LAB_ID,
          reservationType: 'FULL_LAB',
          status: { in: ['PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN'] },
          endDateTime: { gt: expect.any(Date) as unknown },
        },
      }),
    );
  });

  it('creates one slot per lab slot for the laptop in the same reservation', async () => {
    const { service, tx, client } = build([
      { id: 'r1', slots: [{ slotStart: slotStart(0) }, { slotStart: slotStart(30) }] },
    ]);

    await service.blockInFutureLabReservations(client, LAPTOP_ID, LAB_ID);

    expect(tx.reservationSlot.createMany).toHaveBeenCalledWith({
      data: [
        {
          reservationId: 'r1',
          resourceId: LAPTOP_ID,
          slotStart: slotStart(0),
          slotEnd: slotStart(30),
        },
        {
          reservationId: 'r1',
          resourceId: LAPTOP_ID,
          slotStart: slotStart(30),
          slotEnd: slotStart(60),
        },
      ],
    });
  });

  it('covers every future lab reservation', async () => {
    const { service, tx, client } = build([
      { id: 'r1', slots: [{ slotStart: slotStart(0) }] },
      { id: 'r2', slots: [{ slotStart: slotStart(120) }] },
    ]);

    await service.blockInFutureLabReservations(client, LAPTOP_ID, LAB_ID);

    expect(tx.reservationSlot.createMany).toHaveBeenCalledTimes(2);
  });

  it('skips a reservation whose slots are all in the past', async () => {
    const { service, tx, client } = build([{ id: 'r1', slots: [] }]);

    await service.blockInFutureLabReservations(client, LAPTOP_ID, LAB_ID);

    expect(tx.reservationSlot.createMany).not.toHaveBeenCalled();
  });
});
