import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  PRESETS,
  PROVIDER_DEFAULTS,
  ProvidersSectionSchema,
  type CreateProviderRequest,
  type ModelChoice,
  type PresetId,
  type ProviderConfig,
  type ProviderDraft,
  type ProviderRead,
  type ProvidersSection,
} from '@bbartolome/scriba-contracts/providers';
import { providerError } from '../client/errors.js';
import { AutoModelCache } from './auto-model-cache.js';
import { providersLibrary } from './library.js';
import { readProvidersSection, writeProvidersSection } from './providers-section.js';
import { keyHintOf, putSecret, readSecrets, removeSecret, type SecretMap } from './secrets-file.js';

/** The config without its `keyRef`, which never leaves the server (spec #19 "Write-only keys"). */
export function withoutKeyRef(config: ProviderConfig): Omit<ProviderConfig, 'keyRef'> {
  const copy: ProviderConfig = { ...config };
  delete copy.keyRef;
  return copy;
}

/** The read view: the config with `keySet` and the masked hint, computed from the secrets file. */
function viewOf(config: ProviderConfig, secrets: SecretMap): ProviderRead {
  const key = config.keyRef === undefined ? undefined : secrets[config.keyRef];
  return {
    ...withoutKeyRef(config),
    keySet: key !== undefined,
    keyHint: key === undefined ? null : keyHintOf(key),
  };
}

/** A new provider from a preset: the preset's URL, an empty model, and the contract defaults. */
function presetDraft(presetId: PresetId): ProviderDraft {
  const preset = PRESETS.find((candidate) => candidate.id === presetId);
  if (preset === undefined) throw providerError('PROVIDER_NOT_FOUND');
  return { kind: 'openai-compatible', baseURL: preset.baseURL, model: '', ...PROVIDER_DEFAULTS };
}

/** The preset id if free, otherwise the preset id with the first free numeric suffix. */
function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** An opaque reference into the secrets file. It is random, so it says nothing about the provider. */
function newKeyRef(): string {
  return `key-${randomBytes(9).toString('base64url')}`;
}

export interface ProviderList {
  readonly providers: ProviderRead[];
  readonly presets: typeof PRESETS;
  readonly appDefault: ModelChoice;
}

/**
 * The provider registry: the `providers` section of `settings.yaml` and the keys in the secrets
 * file (spec #19 "Registry and storage", "HTTP API"). Reads never write. Each change runs one at a
 * time, so two read-modify-write calls cannot drop each other's change. A key is written before the
 * settings point at it, and a deleted provider's key is removed.
 */
@Injectable()
export class ProvidersRegistry {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly autoCache: AutoModelCache) {}

  /** The section, validated. It is always present after the boot step has run. */
  async current(): Promise<ProvidersSection> {
    const section = await readProvidersSection(providersLibrary());
    if (section === undefined) {
      throw new Error(
        'settings.yaml has no providers section. The boot step writes it before listen.',
      );
    }
    return section;
  }

  /** A saved provider, with its keyRef. It is for the client, not for responses. */
  async require(id: string): Promise<ProviderConfig> {
    const found = (await this.current()).list.find((provider) => provider.id === id);
    if (found === undefined) throw providerError('PROVIDER_NOT_FOUND');
    return found;
  }

  /** The key behind a keyRef, or undefined for a keyless provider or a missing entry. */
  async keyFor(keyRef: string | undefined): Promise<string | undefined> {
    if (keyRef === undefined) return undefined;
    return (await readSecrets(providersLibrary()))[keyRef];
  }

  async list(): Promise<ProviderList> {
    const section = await this.current();
    const secrets = await readSecrets(providersLibrary());
    return {
      providers: section.list.map((provider) => viewOf(provider, secrets)),
      presets: PRESETS,
      appDefault: section.appDefault,
    };
  }

  async view(config: ProviderConfig): Promise<ProviderRead> {
    return viewOf(config, await readSecrets(providersLibrary()));
  }

  create(body: CreateProviderRequest): Promise<ProviderRead> {
    return this.serialize(async () => {
      const section = await this.current();
      const draft: ProviderDraft = 'presetId' in body ? presetDraft(body.presetId) : body;
      const base = 'presetId' in body ? body.presetId : 'custom';
      const id = uniqueId(base, new Set(section.list.map((provider) => provider.id)));
      const config: ProviderConfig = { ...draft, id };
      await this.save({ ...section, list: [...section.list, config] });
      return this.view(config);
    });
  }

  update(id: string, draft: ProviderDraft): Promise<ProviderRead> {
    return this.serialize(async () => {
      const section = await this.current();
      const existing = section.list.find((provider) => provider.id === id);
      if (existing === undefined) throw providerError('PROVIDER_NOT_FOUND');
      const next: ProviderConfig =
        existing.keyRef === undefined
          ? { ...draft, id }
          : { ...draft, id, keyRef: existing.keyRef };
      await this.save({
        ...section,
        list: section.list.map((provider) => (provider.id === id ? next : provider)),
      });
      // The auto lookup depends on the provider's URL and key, so a change clears it.
      this.autoCache.forget(id);
      return this.view(next);
    });
  }

  remove(id: string): Promise<void> {
    return this.serialize(async () => {
      const section = await this.current();
      const existing = section.list.find((provider) => provider.id === id);
      if (existing === undefined) throw providerError('PROVIDER_NOT_FOUND');
      if (section.appDefault.providerId === id) {
        // provisional: survey 19 §7 Q15 (409 PROVIDER_IN_USE, per the recommendation)
        throw providerError(
          'PROVIDER_IN_USE',
          'Pick another app default first, then delete this provider.',
        );
      }
      await this.save({ ...section, list: section.list.filter((provider) => provider.id !== id) });
      if (existing.keyRef !== undefined) {
        await removeSecret(providersLibrary(), existing.keyRef);
      }
      this.autoCache.forget(id);
    });
  }

  setKey(id: string, key: string): Promise<ProviderRead> {
    return this.serialize(async () => {
      const section = await this.current();
      const existing = section.list.find((provider) => provider.id === id);
      if (existing === undefined) throw providerError('PROVIDER_NOT_FOUND');
      const keyRef = existing.keyRef ?? newKeyRef();
      // The key is written first, so a settings entry never points at a missing key.
      await putSecret(providersLibrary(), keyRef, key);
      const next: ProviderConfig = { ...existing, keyRef };
      if (existing.keyRef === undefined) {
        await this.save({
          ...section,
          list: section.list.map((provider) => (provider.id === id ? next : provider)),
        });
      }
      this.autoCache.forget(id);
      return this.view(next);
    });
  }

  clearKey(id: string): Promise<ProviderRead> {
    return this.serialize(async () => {
      const section = await this.current();
      const existing = section.list.find((provider) => provider.id === id);
      if (existing === undefined) throw providerError('PROVIDER_NOT_FOUND');
      if (existing.keyRef === undefined) return this.view(existing);
      const keyRef = existing.keyRef;
      const next: ProviderConfig = { ...existing };
      delete next.keyRef;
      await this.save({
        ...section,
        list: section.list.map((provider) => (provider.id === id ? next : provider)),
      });
      await removeSecret(providersLibrary(), keyRef);
      this.autoCache.forget(id);
      return this.view(next);
    });
  }

  setAppDefault(choice: ModelChoice): Promise<ModelChoice> {
    return this.serialize(async () => {
      const section = await this.current();
      if (!section.list.some((provider) => provider.id === choice.providerId)) {
        throw providerError('PROVIDER_NOT_FOUND');
      }
      await this.save({ ...section, appDefault: choice });
      return choice;
    });
  }

  /** Runs one change after the previous one. A failed change does not block the next. */
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async save(section: ProvidersSection): Promise<void> {
    await writeProvidersSection(providersLibrary(), ProvidersSectionSchema.parse(section));
  }
}
