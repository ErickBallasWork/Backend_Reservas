import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { Status } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { toSkipTake } from '../common/pagination.dto';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListSanctionsQueryDto, ResolveSanctionDto } from './dto/sanction.dto';

const SANCTION_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  resolvedBy: { select: { id: true, fullName: true } },
  reservation: {
    select: {
      id: true,
      startDateTime: true,
      endDateTime: true,
      resource: { select: { name: true } },
    },
  },
} satisfies Prisma.SanctionInclude;

type SanctionRow = Prisma.SanctionGetPayload<{ include: typeof SANCTION_INCLUDE }>;

function toSanctionView(row: SanctionRow) {
  const { reservation, ...rest } = row;
  return {
    ...rest,
    reservation: {
      id: reservation.id,
      startDateTime: reservation.startDateTime,
      endDateTime: reservation.endDateTime,
      resourceName: reservation.resource.name,
    },
  };
}

@Injectable()
export class SanctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly reservationRules: ReservationRulesService,
  ) {}

  async assertNoActiveSanction(userId: string): Promise<void> {
    const sanction = await this.prisma.sanction.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (sanction) {
      throw new ForbiddenException({
        code: 'USER_SANCTIONED',
        message:
          'Tienes una sanción activa por inasistencia. Un administrador debe regularizarla antes de que puedas reservar.',
      });
    }
  }

  async processNoShows(filter: { userId?: string } = {}) {
    const now = new Date();
    const rules = this.reservationRules.current();
    const deadline = new Date(now.getTime() - rules.checkinAfterMin * 60_000);
    const byUser: Prisma.ReservationWhereInput = filter.userId ? { userId: filter.userId } : {};

    const overdue = await this.prisma.reservation.findMany({
      where: { ...byUser, status: Status.CONFIRMED, startDateTime: { lt: deadline } },
      select: { id: true, userId: true, resource: { select: { name: true } } },
      orderBy: { startDateTime: 'asc' },
      take: 200,
    });

    let noShows = 0;
    for (const reservation of overdue) {
      const marked = await this.prisma.$transaction(async (tx) => {
        // Filtering by status skips rows another run already marked.
        const updated = await tx.reservation.updateMany({
          where: { id: reservation.id, status: Status.CONFIRMED },
          data: { status: Status.NO_SHOW },
        });
        if (updated.count === 0) return false;
        await tx.sanction.create({
          data: {
            userId: reservation.userId,
            reservationId: reservation.id,
            type: 'NO_SHOW',
            status: 'ACTIVE',
            reason: `No registró el uso de ${reservation.resource.name}`,
          },
        });
        await this.notifications.notify(
          {
            userId: reservation.userId,
            type: 'NO_SHOW_SANCTION',
            title: 'Reserva marcada como inasistencia',
            message: `No registraste el uso de ${reservation.resource.name}. No podrás reservar hasta que un administrador regularice la sanción.`,
          },
          tx,
        );
        await this.audit.log(
          {
            userId: null,
            action: 'NO_SHOW_MARKED',
            entity: 'Reservation',
            entityId: reservation.id,
          },
          tx,
        );
        return true;
      });
      if (marked) noShows++;
    }

    const expired = await this.prisma.reservation.findMany({
      where: { ...byUser, status: Status.PENDING_APPROVAL, startDateTime: { lte: now } },
      select: { id: true, userId: true, resource: { select: { name: true } } },
      take: 200,
    });

    let expiredTrainings = 0;
    for (const reservation of expired) {
      const done = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.reservation.updateMany({
          where: { id: reservation.id, status: Status.PENDING_APPROVAL },
          data: { status: Status.REJECTED },
        });
        if (updated.count === 0) return false;
        await tx.reservationSlot.deleteMany({ where: { reservationId: reservation.id } });
        await this.notifications.notify(
          {
            userId: reservation.userId,
            type: 'TRAINING_EXPIRED',
            title: 'Solicitud de entrenamiento vencida',
            message: `Tu solicitud para ${reservation.resource.name} no fue aprobada antes de su inicio.`,
          },
          tx,
        );
        await this.audit.log(
          {
            userId: null,
            action: 'TRAINING_EXPIRED',
            entity: 'Reservation',
            entityId: reservation.id,
          },
          tx,
        );
        return true;
      });
      if (done) expiredTrainings++;
    }

    return { noShows, expiredTrainings };
  }

  async list(query: ListSanctionsQueryDto) {
    const where: Prisma.SanctionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sanction.findMany({
        where,
        include: SANCTION_INCLUDE,
        orderBy: { startDate: 'desc' },
        ...toSkipTake(query),
      }),
      this.prisma.sanction.count({ where }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items: rows.map(toSanctionView) };
  }

  async resolve(admin: CurrentUserData, id: string, dto: ResolveSanctionDto) {
    const sanction = await this.prisma.sanction.findUnique({ where: { id } });
    if (!sanction) {
      throw new NotFoundException({
        code: 'SANCTION_NOT_FOUND',
        message: `No existe la sanción ${id}`,
      });
    }
    if (sanction.status !== 'ACTIVE') {
      throw new ConflictException({
        code: 'ALREADY_RESOLVED',
        message: 'La sanción ya fue regularizada',
      });
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.sanction.update({
        where: { id },
        data: { status: 'RESOLVED', endDate: now, resolvedById: admin.id, resolvedAt: now },
        include: SANCTION_INCLUDE,
      });
      await this.notifications.notify(
        {
          userId: sanction.userId,
          type: 'SANCTION_RESOLVED',
          title: 'Sanción regularizada',
          message: 'Ya puedes volver a reservar.',
        },
        tx,
      );
      await this.audit.log(
        {
          userId: admin.id,
          action: 'SANCTION_RESOLVED',
          entity: 'Sanction',
          entityId: id,
          details: { comment: dto.comment ?? null },
        },
        tx,
      );
      return toSanctionView(resolved);
    });
  }
}
