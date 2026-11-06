import { Module } from '@nestjs/common';
import { ToolCatalogService } from './catalog/catalog.service.js';
import { ToolRegistryController } from './tool-registry.controller.js';

/**
 * The Tool registry module (survey 21 §2, phase:form-renderer). It is an additive import in the
 * composition root. It has no configuration yet: the catalog serves the fixture.
 */
// provisional: survey 21 §7 item 3
@Module({
  controllers: [ToolRegistryController],
  providers: [ToolCatalogService],
  exports: [ToolCatalogService],
})
export class ToolRegistryModule {}
