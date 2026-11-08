import { Module } from '@nestjs/common';
import { PlatformModule } from '../platform/index.js';
import { GraphsController } from './graphs/graphs.controller.js';
import { GraphsService } from './graphs/graphs.service.js';

/**
 * The Graph runner module (survey 24 §2). This slice serves graph CRUD over `/api/graphs`, reading and
 * writing `graphs/<id>.json` through the Project store's in-process provider. The Project store module is
 * imported once, by the composition root, so this module reaches it through the app graph and does not
 * import it again. The run engine and the validator are later slices of phase:engine.
 */
@Module({
  imports: [PlatformModule],
  controllers: [GraphsController],
  providers: [GraphsService],
})
export class GraphRunnerModule {}
