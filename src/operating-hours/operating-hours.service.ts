import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { isUniqueViolation } from '../common/db.types';
import { AppConfigService } from '../config/app-config.service';
import { ReservationRulesService } from '../config/reservation-rules.service';
import { PrismaService } from '../prisma/prisma.service';
import { RuleViolation } from '../reservations/time-rules';
import {
  ClosedDateResponseDto,
  CreateClosedDateDto,
  OperatingHoursResponseDto,
  OperatingHoursSource,
  ReplaceOperatingHoursDto,
} from './dto/operating-hours.dto';
import {
  findClosedSlot,
  findWindowProblem,
  formatTimeOfDay,
  parseTimeOfDay,
  type DailyWindow,
  type LocalSlot,
  type OperatingCalendar,
} from './operating-calendar';

interface ResourceScope {
  id: string;
  parentResourceId: string | null;
}

interface ScheduleRow extends DailyWindow {
  resourceId: string | null;
}

interface ClosedRow {
  resourceId: string | null;
  dateKey: string;
}

export interface ScheduleBook {
  calendarFor(resource: ResourceScope): OperatingCalendar;
}

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

export function resolveSchedule(
  rows: readonly ScheduleRow[],
  resource: ResourceScope,
): { source: OperatingHoursSource; windows: DailyWindow[] | null } {
  const forOwner = (resourceId: string | null) =>
    rows.filter((row) => row.resourceId === resourceId);
  const own = forOwner(resource.id);
  if (own.length > 0) return { source: 'OWN', windows: own };
  const parent = resource.parentResourceId ? forOwner(resource.parentResourceId) : [];
  if (parent.length > 0) return { source: 'PARENT', windows: parent };
  const global = forOwner(null);
  if (global.length > 0) return { source: 'GLOBAL', windows: global };
  return { source: 'ALWAYS_OPEN', windows: null };
}

@Injectable()
export class OperatingHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly audit: AuditService,
    private readonly reservationRules: ReservationRulesService,
  ) {}

  get timeZone(): string {
    return this.appConfig.server.timeZone;
  }

  async loadBook(): Promise<ScheduleBook> {
    const [hours, closed] = await Promise.all([
      this.prisma.operatingHours.findMany(),
      this.prisma.closedDate.findMany(),
    ]);
    const rows: ScheduleRow[] = hours.map((row) => ({
      resourceId: row.resourceId,
      dayOfWeek: row.dayOfWeek,
      opensAtMinute: row.opensAtMinute,
      closesAtMinute: row.closesAtMinute,
    }));
    const closedRows: ClosedRow[] = closed.map((row) => ({
      resourceId: row.resourceId,
      dateKey: toDateKey(row.date),
    }));
    return {
      calendarFor: (resource) => {
        const owners = new Set([null, resource.id, resource.parentResourceId]);
        return {
          windows: resolveSchedule(rows, resource).windows,
          closedDates: new Set(
            closedRows.filter((row) => owners.has(row.resourceId)).map((row) => row.dateKey),
          ),
        };
      },
    };
  }

  async assertOpen(resource: ResourceScope, slots: readonly LocalSlot[]): Promise<void> {
    const book = await this.loadBook();
    const closed = findClosedSlot(
      slots,
      this.reservationRules.current().slotMinutes,
      book.calendarFor(resource),
    );
    if (closed) {
      throw new RuleViolation(
        'OUTSIDE_OPERATING_HOURS',
        'La franja está fuera del horario en que se puede reservar este recurso',
      );
    }
  }

  async read(resourceId: string | undefined): Promise<OperatingHoursResponseDto> {
    const scope = await this.resolveScope(resourceId);
    const rows = await this.prisma.operatingHours.findMany();
    const resolved = scope
      ? resolveSchedule(rows, scope)
      : resolveSchedule(
          rows.filter((row) => row.resourceId === null),
          { id: '', parentResourceId: null },
        );
    return {
      resourceId: resourceId ?? null,
      source: resolved.source,
      windows: (resolved.windows ?? []).map((window) => ({
        dayOfWeek: window.dayOfWeek,
        opensAt: formatTimeOfDay(window.opensAtMinute),
        closesAt: formatTimeOfDay(window.closesAtMinute),
      })),
    };
  }

  async replace(
    user: CurrentUserData,
    dto: ReplaceOperatingHoursDto,
  ): Promise<OperatingHoursResponseDto> {
    await this.resolveScope(dto.resourceId);
    const windows: DailyWindow[] = dto.windows.map((window) => ({
      dayOfWeek: window.dayOfWeek,
      opensAtMinute: parseTimeOfDay(window.opensAt),
      closesAtMinute: parseTimeOfDay(window.closesAt),
    }));
    const problem = findWindowProblem(windows, this.reservationRules.current().slotMinutes);
    if (problem) {
      throw new BadRequestException({ code: 'INVALID_OPERATING_HOURS', message: problem });
    }

    const resourceId = dto.resourceId ?? null;
    await this.prisma.$transaction(async (tx) => {
      await tx.operatingHours.deleteMany({ where: { resourceId } });
      if (windows.length > 0) {
        await tx.operatingHours.createMany({
          data: windows.map((window) => ({ ...window, resourceId })),
        });
      }
      await this.audit.log(
        {
          userId: user.id,
          action: 'OPERATING_HOURS_REPLACED',
          entity: 'OperatingHours',
          entityId: resourceId,
          details: { windows: dto.windows },
        },
        tx,
      );
    });
    return this.read(dto.resourceId);
  }

  async listClosedDates(): Promise<ClosedDateResponseDto[]> {
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const rows = await this.prisma.closedDate.findMany({
      where: { date: { gte: today } },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      resourceId: row.resourceId,
      date: toDateKey(row.date),
      name: row.name,
    }));
  }

  async createClosedDate(
    user: CurrentUserData,
    dto: CreateClosedDateDto,
  ): Promise<ClosedDateResponseDto> {
    await this.resolveScope(dto.resourceId);
    const date = new Date(`${dto.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || toDateKey(date) !== dto.date) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: 'La fecha no es válida' });
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.closedDate.create({
          data: { date, name: dto.name.trim(), resourceId: dto.resourceId ?? null },
        });
        await this.audit.log(
          {
            userId: user.id,
            action: 'CLOSED_DATE_CREATED',
            entity: 'ClosedDate',
            entityId: row.id,
            details: dto,
          },
          tx,
        );
        return row;
      });
      return {
        id: created.id,
        resourceId: created.resourceId,
        date: dto.date,
        name: created.name,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'DUPLICATE',
          message: 'Ya existe un día cerrado con esa fecha para ese recurso',
        });
      }
      throw error;
    }
  }

  async deleteClosedDate(user: CurrentUserData, id: string): Promise<void> {
    const existing = await this.prisma.closedDate.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'CLOSED_DATE_NOT_FOUND',
        message: 'No existe ese día cerrado',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.closedDate.delete({ where: { id } });
      await this.audit.log(
        {
          userId: user.id,
          action: 'CLOSED_DATE_DELETED',
          entity: 'ClosedDate',
          entityId: id,
          details: { date: toDateKey(existing.date), name: existing.name },
        },
        tx,
      );
    });
  }

  private async resolveScope(resourceId: string | undefined): Promise<ResourceScope | null> {
    if (!resourceId) return null;
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { id: true, parentResourceId: true },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `No existe el recurso ${resourceId}`,
      });
    }
    return resource;
  }
}
