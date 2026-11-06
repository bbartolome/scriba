import { signal } from '@angular/core';
import type { Subscription } from 'rxjs';
import type { ProvidersApi } from './providers-api';
import { messageOf, type ListedModels } from './providers-view';

/** What the picker shows for one provider's model list (spec #19, "Model list"). */
export type ModelListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'listed'; readonly models: readonly string[] }
  | { readonly kind: 'empty' }
  | { readonly kind: 'failed'; readonly message: string };

/** The state as the hint rules read it. */
export function listedModelsOf(state: ModelListState): ListedModels {
  if (state.kind === 'listed') return 'listed';
  if (state.kind === 'empty') return 'empty';
  return 'unknown';
}

/**
 * The model list of one provider, held in a signal. The owner loads it when the provider changes,
 * and asks again when the author refreshes. Nothing caches an empty or a failed list, so a list
 * fetched after `ollama pull` shows the new models.
 */
export class ModelListLoader {
  readonly state = signal<ModelListState>({ kind: 'loading' });
  private subscription: Subscription | undefined;

  constructor(private readonly api: ProvidersApi) {}

  load(providerId: string): void {
    this.subscription?.unsubscribe();
    this.state.set({ kind: 'loading' });
    this.subscription = this.api.models(providerId).subscribe({
      next: (list) =>
        this.state.set(
          list.models.length === 0 ? { kind: 'empty' } : { kind: 'listed', models: list.models },
        ),
      error: (error: unknown) => this.state.set({ kind: 'failed', message: messageOf(error) }),
    });
  }

  /** Stops a load that is still running, when the owner goes away. */
  stop(): void {
    this.subscription?.unsubscribe();
  }
}
