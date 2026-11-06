import { Injectable } from '@nestjs/common';
import type {
  ModelChoice,
  ProviderConfig,
  ProvidersSection,
} from '@bbartolome/scriba-contracts/providers';
import { providerError } from './client/errors.js';
import type { ModelTarget } from './client/provider-client.js';
import { ProvidersRegistry } from './registry/providers-registry.js';

/**
 * The model the client will use, before `auto` is applied (spec #19 "Resolution order"). `model` is
 * empty when neither the choice nor the provider names one, so the first listed model is needed.
 */
export interface ChoiceResolution {
  readonly provider: ProviderConfig;
  readonly model: string;
  readonly source: 'project' | 'app';
  /** Set when a project override names a provider that no longer exists. */
  readonly warning?: string;
}

/**
 * Resolution in one pure function (survey 19 §1): project override, then app default, then the
 * provider's own model. The caller applies `auto` after this. A missing override falls back to the
 * app default with a warning. A missing app-default provider cannot be resolved.
 */
export function pickChoice(section: ProvidersSection, override?: ModelChoice): ChoiceResolution {
  const find = (providerId: string): ProviderConfig | undefined =>
    section.list.find((provider) => provider.id === providerId);

  let warning: string | undefined;
  if (override !== undefined) {
    const provider = find(override.providerId);
    if (provider !== undefined) {
      return { provider, model: override.model || provider.model, source: 'project' };
    }
    warning = `The project's model provider "${override.providerId}" no longer exists, so the app default is used.`;
  }

  const appProvider = find(section.appDefault.providerId);
  if (appProvider === undefined) {
    throw providerError(
      'PROVIDER_NOT_CONFIGURED',
      'The app default names a provider that does not exist. Pick a default model in the provider settings.',
    );
  }
  const model = section.appDefault.model || appProvider.model;
  return warning === undefined
    ? { provider: appProvider, model, source: 'app' }
    : { provider: appProvider, model, source: 'app', warning };
}

/** Resolves a model target against the saved settings. It reads, and never writes. */
@Injectable()
export class ModelResolver {
  constructor(private readonly registry: ProvidersRegistry) {}

  async forTarget(target: ModelTarget): Promise<ChoiceResolution> {
    const section = await this.registry.current();
    if (target.kind === 'choice') {
      const provider = section.list.find((candidate) => candidate.id === target.choice.providerId);
      if (provider === undefined) {
        throw providerError('PROVIDER_NOT_CONFIGURED', 'The chosen model provider does not exist.');
      }
      return {
        provider,
        model: target.choice.model || provider.model,
        source: 'app',
      };
    }
    // The project's override is read in phase:project-override. Until then, a project resolves to
    // the app default, which is what a project without an override gets.
    return pickChoice(section, undefined);
  }
}
