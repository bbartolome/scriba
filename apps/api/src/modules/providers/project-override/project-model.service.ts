import { Injectable } from '@nestjs/common';
import type {
  EffectiveModel,
  ModelChoice,
  ProjectModelView,
} from '@bbartolome/scriba-contracts/providers';
import { ApiException, PLATFORM_CODES } from '../../platform/index.js';
import { ProviderClientService } from '../client/provider-client-service.js';
import type { ResolvedModel } from '../client/provider-client.js';
import { ProvidersRegistry } from '../registry/providers-registry.js';
import { ProjectOverrideStore } from './project-override-store.js';

/** The author's words when an override would name no model. The Project store needs a name. */
const MODEL_NAME_NEEDED =
  'Pick a model name for this project. To go back to the app default, clear the project model.';

/** The effective response without the provider config the client returns for the agent loop. */
function effectiveOf(resolved: ResolvedModel): EffectiveModel {
  return {
    choice: resolved.choice,
    source: resolved.source,
    contextSize: resolved.contextSize,
    ...(resolved.warning === undefined ? {} : { warning: resolved.warning }),
  };
}

/**
 * The project model panel's service (spec #19 "HTTP API" and "Model choice"). It reads the
 * project's override and the effective model, and sets or clears the override. The override lives in
 * `project.yaml`, written through the Project store's file API, so a write is an author action and
 * never a pending change (spec #19).
 */
@Injectable()
export class ProjectModelService {
  constructor(
    private readonly overrides: ProjectOverrideStore,
    private readonly registry: ProvidersRegistry,
    private readonly client: ProviderClientService,
  ) {}

  /** The saved override (or null) and the effective model, as the next run would resolve it. */
  async view(projectId: string): Promise<ProjectModelView> {
    const reading = await this.overrides.read(projectId);
    const resolved = await this.client.resolve(projectId);
    return {
      override: reading.status === 'set' ? reading.choice : null,
      effective: effectiveOf(resolved),
    };
  }

  /**
   * Sets the override. The provider must exist (PROVIDER_NOT_FOUND, survey 19 §7 Q15). An empty model
   * is refused, because `project.yaml` needs a model name and the app default covers "use the
   * provider's own model".
   */
  async set(projectId: string, choice: ModelChoice): Promise<ProjectModelView> {
    if (choice.model === '') {
      throw new ApiException(400, PLATFORM_CODES.VALIDATION_FAILED, MODEL_NAME_NEEDED);
    }
    // provisional: survey 19 §7 Q15 (an unknown provider id is PROVIDER_NOT_FOUND, per the recommendation)
    await this.registry.require(choice.providerId);
    await this.overrides.write(projectId, choice);
    return this.view(projectId);
  }

  /** Removes the override, so the project resolves to the app default again. */
  async clear(projectId: string): Promise<ProjectModelView> {
    await this.overrides.write(projectId, undefined);
    return this.view(projectId);
  }
}
