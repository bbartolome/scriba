import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ToolCatalogService, ToolExecutorService } from '../../tool-registry/index.js';

/**
 * The Tool registry's catalog and executor, looked up through the app graph the way the Project
 * store is (see `ProjectAccess`). The composition root imports the Tool registry module, so this
 * module does not import it and make a second copy.
 */
@Injectable()
export class ToolAccess {
  constructor(private readonly ref: ModuleRef) {}

  /** The enabled tools, their function schemas and their entity and style references. */
  get catalog(): ToolCatalogService {
    return this.ref.get(ToolCatalogService, { strict: false });
  }

  /** Runs one narrative tool, after its entities are resolved. */
  get executor(): ToolExecutorService {
    return this.ref.get(ToolExecutorService, { strict: false });
  }
}
