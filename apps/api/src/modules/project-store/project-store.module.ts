import { type DynamicModule, Module } from '@nestjs/common';
import { PlatformModule } from '../platform/index.js';
import { ActiveProjectStore } from './active-project.service.js';
import {
  projectStoreConfigFromEnv,
  PROJECT_STORE_CONFIG,
  type ProjectStoreConfig,
} from './config.js';
import { EntitiesService } from './entities.service.js';
import { FileApiController } from './file-api.controller.js';
import { FileApiService } from './file-api.service.js';
import { LibraryService } from './library.service.js';
import { FileLocks } from './locks.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectStoreEvents } from './events.js';
import { ProjectStoreProvider } from './provider.js';
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';

/**
 * The Project store module (survey 20 §2). It owns the library, the active project, the file API,
 * entity resolution and the in-process provider. The configuration comes from the environment, and
 * `withConfig` replaces it for tests.
 */
@Module({
  imports: [PlatformModule],
  controllers: [ProjectsController, FileApiController, SearchController],
  providers: [
    { provide: PROJECT_STORE_CONFIG, useFactory: () => projectStoreConfigFromEnv(process.env) },
    FileLocks,
    ActiveProjectStore,
    LibraryService,
    FileApiService,
    EntitiesService,
    SearchService,
    ProjectStoreEvents,
    ProjectStoreProvider,
  ],
  exports: [ProjectStoreProvider],
})
export class ProjectStoreModule {
  /** The same module with an explicit configuration, for tests that use their own library and samples. */
  static withConfig(config: ProjectStoreConfig): DynamicModule {
    return {
      module: ProjectStoreModule,
      providers: [{ provide: PROJECT_STORE_CONFIG, useValue: config }],
    };
  }
}
