import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user/current-user.decorator';
import { CurrentUserData } from '../common/current-user/current-user.types';
import { ApiErrorResponses } from '../common/error-response.dto';
import { CatalogTreeService } from './catalog-tree.service';
import { assertMayListInactive } from './catalog-visibility';
import { ListBuildingsQueryDto } from './dto/building.dto';
import { CatalogBuildingNodeDto } from './dto/catalog-response.dto';

@ApiTags('Catálogo: árbol')
@ApiErrorResponses(401, 403)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogTree: CatalogTreeService) {}

  @Get('tree')
  @ApiOkResponse({ type: [CatalogBuildingNodeDto] })
  @ApiOperation({
    summary:
      'Catálogo completo: edificio > sala o laboratorio > laptop (HU-04). includeInactive solo para administradores',
  })
  tree(@CurrentUser() user: CurrentUserData, @Query() query: ListBuildingsQueryDto) {
    assertMayListInactive(user, query.includeInactive);
    return this.catalogTree.tree(query.includeInactive);
  }
}
