import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/error-response.dto';
import { CatalogTreeService } from './catalog-tree.service';
import { CatalogBuildingNodeDto } from './dto/catalog-response.dto';

@ApiTags('Catálogo: árbol')
@ApiErrorResponses(401, 403)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogTree: CatalogTreeService) {}

  @Get('tree')
  @ApiOkResponse({ type: [CatalogBuildingNodeDto] })
  @ApiOperation({ summary: 'Catálogo completo: edificio > sala o laboratorio > laptop (HU-04)' })
  tree() {
    return this.catalogTree.tree();
  }
}
