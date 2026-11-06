import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoleAssignmentDto } from './dto/user.dto';

export interface RoleRow {
  roleId: number;
  buildingId: string | null;
}

@Injectable()
export class RoleRowsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(roles: RoleAssignmentDto[]): Promise<RoleRow[]> {
    const all = await this.prisma.role.findMany();
    const idByName = new Map<string, number>(all.map((r) => [r.name, r.id]));
    const rows: RoleRow[] = [];
    for (const r of roles) {
      const roleId = idByName.get(r.role);
      if (roleId === undefined) {
        throw new BadRequestException({
          code: 'ROLE_NOT_FOUND',
          message: `El rol ${r.role} no existe. ¿Corriste el seed?`,
        });
      }
      rows.push({ roleId, buildingId: await this.resolveBuilding(r) });
    }
    return rows;
  }

  private async resolveBuilding(r: RoleAssignmentDto): Promise<string | null> {
    if (r.role !== 'SPOC_EDIFICIO') return null;
    if (!r.buildingId) {
      throw new BadRequestException({
        code: 'BUILDING_REQUIRED',
        message: 'El rol SPOC_EDIFICIO necesita buildingId',
      });
    }
    const building = await this.prisma.building.findUnique({ where: { id: r.buildingId } });
    if (!building) {
      throw new NotFoundException({
        code: 'BUILDING_NOT_FOUND',
        message: `No existe el edificio ${r.buildingId}`,
      });
    }
    return building.id;
  }
}
