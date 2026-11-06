import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BLOCKING_STATUSES, ResourceType } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';

const TYPE_LABEL: Record<string, string> = {
  MEETING_ROOM: 'una sala de reuniones',
  AI_LAB: 'un laboratorio de IA',
  LAPTOP: 'una laptop',
};

@Injectable()
export class CatalogLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveResource(id: string, expected?: ResourceType[]) {
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: { building: true, parent: true },
    });
    if (!resource) {
      throw new NotFoundException({
        code: 'RESOURCE_NOT_FOUND',
        message: `No existe el recurso ${id}`,
      });
    }
    if (expected && !(expected as string[]).includes(resource.type)) {
      throw new UnprocessableEntityException({
        code: 'WRONG_RESOURCE_TYPE',
        message: `El recurso debe ser ${expected.map((t) => TYPE_LABEL[t]).join(' o ')}`,
      });
    }
    const parentInactive = resource.parent !== null && !resource.parent.isActive;
    if (!resource.isActive || !resource.building.isActive || parentInactive) {
      throw new UnprocessableEntityException({
        code: 'RESOURCE_INACTIVE',
        message: 'El recurso, su laboratorio o su edificio están inactivos',
      });
    }
    return resource;
  }

  async activeLaptopIds(labId: string): Promise<string[]> {
    const laptops = await this.prisma.resource.findMany({
      where: { parentResourceId: labId, type: 'LAPTOP', isActive: true },
      select: { id: true },
    });
    return laptops.map((l) => l.id);
  }

  futureReservations(where: Prisma.ReservationWhereInput) {
    return this.prisma.reservation.findMany({
      where: { ...where, status: { in: BLOCKING_STATUSES }, endDateTime: { gt: new Date() } },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        resource: { select: { id: true, name: true, type: true } },
      },
      orderBy: { startDateTime: 'asc' },
    });
  }

  async assertNoFutureReservations(where: Prisma.ReservationWhereInput, what: string) {
    const count = await this.prisma.reservation.count({
      where: { ...where, status: { in: BLOCKING_STATUSES }, endDateTime: { gt: new Date() } },
    });
    if (count > 0) {
      throw new ConflictException({
        code: 'HAS_FUTURE_RESERVATIONS',
        message: `${what} tiene ${count} reserva(s) futura(s). Resuélvelas antes de continuar.`,
      });
    }
  }
}
