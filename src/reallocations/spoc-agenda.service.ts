import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Status, SUPERADMIN_ROLE } from '../common/constants';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { PrismaService } from '../prisma/prisma.service';
import { SpocAgendaQueryDto } from './dto/spoc-agenda.dto';

const MAX_RANGE_DAYS = 8;
const AGENDA_STATUSES: string[] = [Status.CONFIRMED, Status.PENDING_APPROVAL, Status.CHECKED_IN];

export function parseAgendaRange(query: SpocAgendaQueryDto) {
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (to.getTime() <= from.getTime()) {
    throw new BadRequestException({
      code: 'INVALID_RANGE',
      message: '"to" debe ser posterior a "from"',
    });
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 3_600_000) {
    throw new BadRequestException({
      code: 'RANGE_TOO_LONG',
      message: `El rango no puede superar ${MAX_RANGE_DAYS} días`,
    });
  }
  return { from, to };
}

@Injectable()
export class SpocAgendaService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: CurrentUserData, query: SpocAgendaQueryDto) {
    const { from, to } = parseAgendaRange(query);
    const buildings = await this.managedBuildings(user);
    const selected = query.buildingId ?? buildings[0]?.id;
    if (!selected || !buildings.some((building) => building.id === selected)) {
      throw new ForbiddenException({
        code: 'NOT_YOUR_BUILDING',
        message: 'Solo puedes ver la agenda de los edificios que administras',
      });
    }

    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: AGENDA_STATUSES },
        startDateTime: { lt: to },
        endDateTime: { gt: from },
        resource: { buildingId: selected, type: 'MEETING_ROOM' },
      },
      select: {
        id: true,
        resourceId: true,
        startDateTime: true,
        endDateTime: true,
        status: true,
        purpose: true,
        justification: true,
        attendees: true,
        seriesId: true,
        user: { select: { fullName: true } },
        _count: { select: { reallocations: true } },
      },
      orderBy: { startDateTime: 'asc' },
    });

    return {
      buildingId: selected,
      buildings,
      reservations: reservations.map(({ user: owner, _count, ...reservation }) => ({
        ...reservation,
        reallocated: _count.reallocations > 0,
        owner: { fullName: owner.fullName },
      })),
    };
  }

  private async managedBuildings(user: CurrentUserData) {
    const unrestricted = user.roles.includes(SUPERADMIN_ROLE);
    const rows = await this.prisma.building.findMany({
      where: { isActive: true, ...(unrestricted ? {} : { id: { in: user.spocBuildingIds } }) },
      select: {
        id: true,
        name: true,
        resources: {
          where: { type: 'MEETING_ROOM', isActive: true },
          select: { id: true, name: true, capacity: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ resources, ...building }) => ({ ...building, rooms: resources }));
  }
}
