import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/error-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogBuildingNodeDto } from './dto/catalog-response.dto';

@ApiTags('Catálogo: árbol')
@ApiErrorResponses(401, 403)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('tree')
  @ApiOkResponse({ type: [CatalogBuildingNodeDto] })
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
