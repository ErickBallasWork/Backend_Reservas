import { Module } from '@nestjs/common';
import { BuildingsController } from './buildings.controller';
import { BuildingsService } from './buildings.service';
import { CatalogLookupService } from './catalog-lookup.service';
import { CatalogController } from './catalog.controller';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  controllers: [BuildingsController, ResourcesController, CatalogController],
  providers: [BuildingsService, ResourcesService, CatalogLookupService],
  exports: [CatalogLookupService],
})
export class CatalogModule {}
