import { type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { type NotificationsService } from '../notifications/notifications.service';
import { type PrismaService } from '../prisma/prisma.service';
import { type ApprovalRoutingService } from '../reservations/approval-routing.service';
import { type ReservationsService } from '../reservations/reservations.service';
import { ApprovalsService } from './approvals.service';

const LEADER: CurrentUserData = {
  id: 'leader',
  email: 'leader@tcs.com',
  fullName: 'Leader',
  roles: ['LIDER'],
  spocBuildingIds: [],
};

const FUTURE = new Date(Date.now() + 3 * 24 * 3_600_000);

const reservation = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  userId: 'owner',
  status: 'PENDING_APPROVAL',
  startDateTime: FUTURE,
  resource: { name: 'Sala 1' },
  ...overrides,
});

const containing = (text: string): unknown => expect.stringContaining(text);
const objectWith = (value: object): unknown => expect.objectContaining(value);
const anyDate: unknown = expect.any(Date);

async function codeOf(action: Promise<unknown>): Promise<unknown> {
  try {
    await action;
  } catch (error) {
    return (error as { response: { code: string } }).response.code;
  }
  return null;
}

function build(options: { assigned?: string[]; updatedCounts?: number[] } = {}) {
  const updatedCounts = [...(options.updatedCounts ?? [1])];
  const tx = {
    reservation: {
      updateMany: jest.fn().mockImplementation(() => ({ count: updatedCounts.shift() ?? 1 })),
    },
    approval: { create: jest.fn() },
    reservationSlot: { deleteMany: jest.fn() },
  };
  const prisma = {
    reservation: { findUnique: jest.fn(), findMany: jest.fn() },
    reservationSeries: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
    $transaction: jest.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const notifications = { notify: jest.fn() };
  const audit = { log: jest.fn() };
  const routing = {
    assignedLeaderIds: jest.fn().mockResolvedValue(options.assigned ?? ['leader']),
    pendingOwnersFilter: jest.fn().mockReturnValue({}),
  };
  const reservations = { getById: jest.fn().mockResolvedValue({ id: 'r1' }) };
  const service = new ApprovalsService(
    prisma as unknown as PrismaService,
    reservations as unknown as ReservationsService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    routing as unknown as ApprovalRoutingService,
  );
  return { service, tx, prisma, notifications, audit };
}

describe('ApprovalsService.decide', () => {
  it('approves to CONFIRMED, records the approval and tells the owner', async () => {
    const { service, tx, prisma, notifications } = build();
    prisma.reservation.findUnique.mockResolvedValue(reservation());

    await service.decide(LEADER, 'r1', { decision: 'APPROVE' });

    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CONFIRMED' } }),
    );
    expect(tx.approval.create).toHaveBeenCalledWith({
      data: { reservationId: 'r1', approverId: 'leader', status: 'APPROVED', comments: null },
    });
    expect(tx.reservationSlot.deleteMany).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', type: 'RESERVATION_APPROVED' }),
      tx,
    );
  });

  it('rejects to REJECTED, frees the slots and includes the reason in the notice', async () => {
    const { service, tx, prisma, notifications } = build();
    prisma.reservation.findUnique.mockResolvedValue(reservation());

    await service.decide(LEADER, 'r1', { decision: 'REJECT', comments: ' sin cupo ' });

    expect(tx.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REJECTED' } }),
    );
    expect(tx.reservationSlot.deleteMany).toHaveBeenCalledWith({ where: { reservationId: 'r1' } });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RESERVATION_REJECTED',
        message: containing('Motivo: sin cupo'),
      }),
      tx,
    );
  });

  it('requires a comment to reject', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue(reservation());

    expect(await codeOf(service.decide(LEADER, 'r1', { decision: 'REJECT' }))).toBe(
      'COMMENTS_REQUIRED',
    );
  });

  it('refuses to decide the own request of the approver', async () => {
    const { service, prisma } = build({ assigned: [] });
    prisma.reservation.findUnique.mockResolvedValue(reservation({ userId: 'leader' }));

    expect(await codeOf(service.decide(LEADER, 'r1', { decision: 'APPROVE' }))).toBe(
      'CANNOT_APPROVE_OWN',
    );
  });

  it('refuses a leader the owner is not assigned to', async () => {
    const { service, prisma } = build({ assigned: ['someone-else'] });
    prisma.reservation.findUnique.mockResolvedValue(reservation());

    expect(await codeOf(service.decide(LEADER, 'r1', { decision: 'APPROVE' }))).toBe(
      'NOT_YOUR_APPROVAL',
    );
  });

  it('reports a lost race as NOT_PENDING and writes nothing else', async () => {
    const { service, tx, prisma, notifications } = build({ updatedCounts: [0] });
    prisma.reservation.findUnique.mockResolvedValue(reservation());

    expect(await codeOf(service.decide(LEADER, 'r1', { decision: 'APPROVE' }))).toBe('NOT_PENDING');
    expect(tx.approval.create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('refuses a reservation that is no longer pending', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue(reservation({ status: 'CONFIRMED' }));

    expect(await codeOf(service.decide(LEADER, 'r1', { decision: 'APPROVE' }))).toBe('NOT_PENDING');
  });

  it('answers RESERVATION_NOT_FOUND for an unknown id', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue(null);

    expect(await codeOf(service.decide(LEADER, 'r1', { decision: 'APPROVE' }))).toBe(
      'RESERVATION_NOT_FOUND',
    );
  });
});

describe('ApprovalsService.decideSeries', () => {
  const occurrences = [
    reservation({ id: 'r1' }),
    reservation({ id: 'r2' }),
    reservation({ id: 'r3' }),
  ];

  it('decides every pending occurrence and sends one grouped notice', async () => {
    const { service, tx, prisma, notifications } = build({ updatedCounts: [1, 1, 1] });
    prisma.reservation.findMany.mockResolvedValue(occurrences);

    const result = await service.decideSeries(LEADER, 's1', { decision: 'APPROVE' });

    expect(result).toEqual({ seriesId: 's1', decided: 3, skipped: 0 });
    expect(tx.approval.create).toHaveBeenCalledTimes(3);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: containing('Tus 3 reservas de Sala 1') }),
      tx,
    );
  });

  it('counts occurrences someone else decided first as skipped', async () => {
    const { service, prisma } = build({ updatedCounts: [1, 0, 1] });
    prisma.reservation.findMany.mockResolvedValue(occurrences);

    const result = await service.decideSeries(LEADER, 's1', { decision: 'APPROVE' });

    expect(result).toEqual({ seriesId: 's1', decided: 2, skipped: 1 });
  });

  it('only looks at future pending occurrences', async () => {
    const { service, prisma } = build();
    prisma.reservation.findMany.mockResolvedValue(occurrences);

    await service.decideSeries(LEADER, 's1', { decision: 'APPROVE' });

    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: objectWith({
          seriesId: 's1',
          status: 'PENDING_APPROVAL',
          startDateTime: { gt: anyDate },
        }),
      }),
    );
  });

  it('answers NOT_PENDING when nothing is left to decide', async () => {
    const { service, prisma } = build();
    prisma.reservation.findMany.mockResolvedValue([]);

    expect(await codeOf(service.decideSeries(LEADER, 's1', { decision: 'APPROVE' }))).toBe(
      'NOT_PENDING',
    );
  });

  it('answers SERIES_NOT_FOUND for an unknown series', async () => {
    const { service, prisma } = build();
    prisma.reservationSeries.findUnique.mockResolvedValue(null);

    expect(await codeOf(service.decideSeries(LEADER, 's1', { decision: 'APPROVE' }))).toBe(
      'SERIES_NOT_FOUND',
    );
  });

  it('refuses the series of the own request of the approver', async () => {
    const { service, prisma } = build({ assigned: [] });
    prisma.reservation.findMany.mockResolvedValue([reservation({ userId: 'leader' })]);

    expect(await codeOf(service.decideSeries(LEADER, 's1', { decision: 'APPROVE' }))).toBe(
      'CANNOT_APPROVE_OWN',
    );
  });
});
