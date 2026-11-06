import { BadRequestException, Injectable } from '@nestjs/common';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { PrismaService } from '../prisma/prisma.service';
import { chunk } from '../reservations/time-rules';
import { DateRangeQueryDto, OccupancyQueryDto } from './dto/report.dto';

export interface OccupancyRow {
  id: string;
  name: string;
  building: string;
  type: string;
  reservedHours: number;
  availableHours: number;
  occupancyRate: number;
}

export interface DepartmentUsageRow {
  department: string;
  users: number;
  reservations: number;
  checkedIn: number;
  noShows: number;
  cancelled: number;
}

const HOUR = 3_600_000;

// Excel abre bien las tildes si el CSV empieza con este carácter invisible (BOM).
const BOM = String.fromCharCode(0xfeff);

function toCsv(header: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number) => '"' + String(value).replaceAll('"', '""') + '"';
  return (
    BOM + [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n')
  );
}

function rate(reserved: number, available: number): number {
  return available > 0 ? Number((reserved / available).toFixed(4)) : 0;
}

/**
 * HU-23: reportes del Administrador.
 * La ocupación se calcula contando franjas guardadas (RESERVATION_SLOT): una consulta agregada rápida.
 * Nota: hoy se toma el día completo como horario disponible; cuando se defina el horario
 * operativo, se ajusta availableHours.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservationRules: ReservationRulesService,
  ) {}

  private parseRange(query: DateRangeQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException({
        code: 'INVALID_RANGE',
        message: '"to" debe ser posterior a "from"',
      });
    }
    if (to.getTime() - from.getTime() > 366 * 24 * HOUR) {
      throw new BadRequestException({
        code: 'RANGE_TOO_LONG',
        message: 'El rango máximo es de un año',
      });
    }
    return { from, to };
  }

  async occupancy(query: OccupancyQueryDto): Promise<OccupancyRow[]> {
    const { from, to } = this.parseRange(query);
    const groupBy = query.groupBy ?? 'resource';
    const slotHours = this.reservationRules.current().slotMinutes / 60;
    const availableHours = (to.getTime() - from.getTime()) / HOUR;

    // Franjas reservadas por recurso. Solo cuentan reservas vivas (las canceladas y
    // rechazadas ya no tienen franjas; las de No-Show sí, porque bloquearon el recurso).
    const grouped = await this.prisma.reservationSlot.groupBy({
      by: ['resourceId'],
      where: { slotStart: { gte: from, lt: to } },
      _count: { _all: true },
    });
    const slotsById = new Map<string, number>(grouped.map((g) => [g.resourceId, g._count._all]));
    const reservedHoursOf = (id: string) => (slotsById.get(id) ?? 0) * slotHours;

    // Una laptop cuenta como ocupada tanto si la reservaron sola como si reservaron el laboratorio completo.
    const types = groupBy === 'laptop' ? ['LAPTOP'] : ['MEETING_ROOM', 'AI_LAB'];
    const resources = await this.prisma.resource.findMany({
      where: { type: { in: types } },
      include: { building: true, parent: { select: { name: true } } },
      orderBy: [{ buildingId: 'asc' }, { name: 'asc' }],
    });

    const rows: OccupancyRow[] = resources.map((r) => {
      const reservedHours = reservedHoursOf(r.id);
      return {
        id: r.id,
        name: r.parent ? `${r.name} (${r.parent.name})` : r.name,
        building: r.building.name,
        type: r.type,
        reservedHours,
        availableHours,
        occupancyRate: rate(reservedHours, availableHours),
      };
    });
    if (groupBy !== 'building') return rows;

    // Por edificio: suma de horas de sus salas y laboratorios (sin laptops, para no contar doble).
    const byBuilding = new Map<string, OccupancyRow>();
    resources.forEach((r, i) => {
      const current = byBuilding.get(r.buildingId) ?? {
        id: r.buildingId,
        name: r.building.name,
        building: r.building.name,
        type: 'BUILDING',
        reservedHours: 0,
        availableHours: 0,
        occupancyRate: 0,
      };
      current.reservedHours += rows[i].reservedHours;
      current.availableHours += rows[i].availableHours;
      current.occupancyRate = rate(current.reservedHours, current.availableHours);
      byBuilding.set(r.buildingId, current);
    });
    return [...byBuilding.values()];
  }

  /** Misma consulta en CSV para descargar y abrir en Excel. */
  async occupancyCsv(query: OccupancyQueryDto): Promise<string> {
    const rows = await this.occupancy(query);
    return toCsv(
      [
        'id',
        'nombre',
        'edificio',
        'tipo',
        'horas_reservadas',
        'horas_disponibles',
        'tasa_ocupacion',
      ],
      rows.map((r) => [
        r.id,
        r.name,
        r.building,
        r.type,
        r.reservedHours,
        r.availableHours,
        r.occupancyRate,
      ]),
    );
  }

  /** Uso por área (USERS.Department): reservas, asistencias, No-Show y cancelaciones. */
  async usageByDepartment(query: DateRangeQueryDto): Promise<DepartmentUsageRow[]> {
    const { from, to } = this.parseRange(query);
    const grouped = await this.prisma.reservation.groupBy({
      by: ['userId', 'status'],
      where: { startDateTime: { gte: from, lt: to } },
      _count: { _all: true },
    });

    const userIds = [...new Set(grouped.map((g) => g.userId))];
    const departmentOf = new Map<string, string>();
    // SQL Server acepta hasta 2100 parámetros por consulta: se buscan los usuarios por bloques.
    for (const ids of chunk(userIds, 1000)) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, department: true },
      });
      for (const u of users) departmentOf.set(u.id, u.department ?? 'Sin área');
    }

    const rows = new Map<string, DepartmentUsageRow & { userSet: Set<string> }>();
    for (const g of grouped) {
      const department = departmentOf.get(g.userId) ?? 'Sin área';
      const row = rows.get(department) ?? {
        department,
        users: 0,
        reservations: 0,
        checkedIn: 0,
        noShows: 0,
        cancelled: 0,
        userSet: new Set<string>(),
      };
      const count = g._count._all;
      row.userSet.add(g.userId);
      row.reservations += count;
      if (g.status === 'CHECKED_IN') row.checkedIn += count;
      if (g.status === 'NO_SHOW') row.noShows += count;
      if (g.status === 'CANCELLED') row.cancelled += count;
      rows.set(department, row);
    }

    return [...rows.values()]
      .map(({ userSet, ...row }) => ({ ...row, users: userSet.size }))
      .sort((a, b) => b.reservations - a.reservations);
  }

  async usageByDepartmentCsv(query: DateRangeQueryDto): Promise<string> {
    const rows = await this.usageByDepartment(query);
    return toCsv(
      ['area', 'usuarios', 'reservas', 'con_check_in', 'no_show', 'canceladas'],
      rows.map((r) => [r.department, r.users, r.reservations, r.checkedIn, r.noShows, r.cancelled]),
    );
  }
}
