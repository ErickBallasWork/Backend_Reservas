import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Catálogo: árbol')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('tree')
  @ApiOperation({ summary: 'Catálogo completo: edificio > sala o laboratorio > laptop (HU-04)' })
  tree() {
    return this.prisma.building.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        resources: {
          where: { isActive: true, parentResourceId: null },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          include: { children: { where: { isActive: true }, orderBy: { name: 'asc' } } },
        },
      },
    });
  }
}
