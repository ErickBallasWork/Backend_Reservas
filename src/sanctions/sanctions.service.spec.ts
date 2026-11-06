import { type Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { type AuditEntry, type AuditService } from '../audit/audit.service';
import { type CurrentUserData } from '../common/current-user/current-user.types';
import { DEFAULT_RESERVATION_RULES } from '../config/reservation-rules.service';
import {
  type NotificationsService,
  type NotifyInput,
} from '../notifications/notifications.service';
import { type PrismaService } from '../prisma/prisma.service';
import { ResolveSanctionDto } from './dto/sanction.dto';
import { SanctionsService } from './sanctions.service';

const admin: CurrentUserData = {
  id: 'admin',
  email: 'admin@tcs.com',
  fullName: 'Admin',
  roles: ['ADMIN'],
  spocBuildingIds: [],
};

function sanctionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sanction-1',
    userId: 'owner',
    reservationId: 'res-1',
    type: 'NO_SHOW',
    status: 'ACTIVE',
    reason: 'No registró el uso de Sala A',
    startDate: new Date('2026-11-11T15:20:00Z'),
    endDate: null,
    resolvedAt: null,
    resolvedById: null,
    resolutionComment: null,
    user: { id: 'owner', fullName: 'Owner', email: 'owner@tcs.com' },
    resolvedBy: null,
    reservation: {
      id: 'res-1',
      startDateTime: new Date('2026-11-11T15:00:00Z'),
      endDateTime: new Date('2026-11-11T16:00:00Z'),
      resource: { name: 'Sala A' },
    },
    ...overrides,
  };
}

function build(options: { found?: unknown; updatedCount?: number } = {}) {
  const found = 'found' in options ? options.found : sanctionRow();
  const tx = {
    sanction: {
      updateMany: jest
        .fn<Promise<{ count: number }>, [Prisma.SanctionUpdateManyArgs]>()
        .mockResolvedValue({ count: options.updatedCount ?? 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(
        sanctionRow({
          status: 'RESOLVED',
          resolvedById: 'admin',
          resolutionComment: 'Justificado',
        }),
      ),
    },
  };
  const prisma = {
    sanction: { findUnique: jest.fn().mockResolvedValue(found) },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const notifications = {
    notify: jest.fn<Promise<void>, [NotifyInput, unknown]>().mockResolvedValue(undefined),
  };
  const audit = {
    log: jest.fn<Promise<void>, [AuditEntry, unknown]>().mockResolvedValue(undefined),
  };
  const rules = { current: () => DEFAULT_RESERVATION_RULES };
  const service = new SanctionsService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    rules,
  );
  return { service, tx, prisma, notifications, audit };
}

describe('SanctionsService.resolve', () => {
  it('resolves an active sanction with the comment, notice and audit', async () => {
    const { service, tx, notifications, audit } = build();

    const result = await service.resolve(admin, 'sanction-1', { comment: 'Justificado' });

    const [args] = tx.sanction.updateMany.mock.calls[0];
    expect(args.where).toEqual({ id: 'sanction-1', status: 'ACTIVE' });
    expect(args.data).toMatchObject({
      status: 'RESOLVED',
      resolvedById: 'admin',
      resolutionComment: 'Justificado',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', type: 'SANCTION_RESOLVED' }),
      tx,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SANCTION_RESOLVED',
        details: {
          comment: 'Justificado',
          affectedUserId: 'owner',
          reservationId: 'res-1',
        },
      }),
      tx,
    );
    expect(result.reservation.resourceName).toBe('Sala A');
    expect(result.resolutionComment).toBe('Justificado');
  });

  it('rejects an unknown sanction', async () => {
    const { service } = build({ found: null });
    await expect(service.resolve(admin, 'missing', { comment: 'x' })).rejects.toMatchObject({
      response: { code: 'SANCTION_NOT_FOUND' },
    });
  });

  it('rejects a sanction that was already resolved', async () => {
    const { service, tx } = build({ found: sanctionRow({ status: 'RESOLVED' }) });
    await expect(service.resolve(admin, 'sanction-1', { comment: 'x' })).rejects.toMatchObject({
      response: { code: 'ALREADY_RESOLVED' },
    });
    expect(tx.sanction.updateMany).not.toHaveBeenCalled();
  });

  it('rejects when another administrator resolves it first', async () => {
    const { service, notifications, audit } = build({ updatedCount: 0 });
    await expect(service.resolve(admin, 'sanction-1', { comment: 'x' })).rejects.toMatchObject({
      response: { code: 'ALREADY_RESOLVED' },
    });
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('ResolveSanctionDto', () => {
  async function errorsFor(comment: unknown) {
    const dto = plainToInstance(ResolveSanctionDto, { comment });
    return { dto, errors: await validate(dto) };
  }

  it('requires a comment', async () => {
    expect((await errorsFor(undefined)).errors).not.toHaveLength(0);
    expect((await errorsFor('   ')).errors).not.toHaveLength(0);
  });

  it('trims the comment', async () => {
    const { dto, errors } = await errorsFor('  Justificado  ');
    expect(errors).toHaveLength(0);
    expect(dto.comment).toBe('Justificado');
  });

  it('limits the comment to 500 characters', async () => {
    expect((await errorsFor('a'.repeat(501))).errors).not.toHaveLength(0);
    expect((await errorsFor('a'.repeat(500))).errors).toHaveLength(0);
  });
});
