import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { ProviderRead } from '@bbartolome/scriba-contracts/providers';
import type { Observable } from 'rxjs';
import { ProvidersApi } from './providers-api';
import { messageOf } from './providers-view';

/**
 * The write-only key field (spec #19, "Write-only keys"). A key is typed into a password input and
 * sent once. The field is cleared before the request leaves, so the key is held only by the
 * request. The screen then shows the masked hint from the server, and never the key.
 */
@Component({
  selector: 'app-provider-key',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatFormField, MatLabel, MatInput],
  styles: `
    :host {
      display: block;
    }
    .key-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .key-form mat-form-field {
      flex: 1 1 14rem;
    }
    .mask {
      font-family: monospace;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <section class="key" aria-labelledby="key-heading">
      <h3 id="key-heading">API key</h3>
      <p class="status" data-testid="key-status">
        @if (keySet()) {
          Key set: <span class="mask">{{ keyHint() }}</span>
        } @else {
          No key set. Local servers usually need none.
        }
      </p>
      <form class="key-form" (submit)="save($event)">
        <mat-form-field appearance="outline">
          <mat-label>{{ keySet() ? 'Replace key' : 'New key' }}</mat-label>
          <input
            matInput
            #keyInput
            type="password"
            name="key"
            autocomplete="new-password"
            autocapitalize="off"
            spellcheck="false"
          />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy()">Save key</button>
      </form>
      @if (keySet()) {
        <button mat-button type="button" [disabled]="busy()" (click)="remove()">Remove key</button>
      }
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
    </section>
  `,
})
export class ProviderKeyComponent {
  private readonly api = inject(ProvidersApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly keyField = viewChild.required<ElementRef<HTMLInputElement>>('keyInput');

  readonly providerId = input.required<string>();
  readonly keySet = input.required<boolean>();
  readonly keyHint = input.required<string | null>();
  /** The provider after the key changed. The read view carries no key. */
  readonly changed = output<ProviderRead>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | undefined>(undefined);

  protected save(event: Event): void {
    event.preventDefault();
    const field = this.keyField().nativeElement;
    const key = field.value.trim();
    // Cleared first: the typed key now lives only in the request, not in the page.
    field.value = '';
    if (key === '') {
      this.error.set('Enter a key first.');
      return;
    }
    this.run(this.api.setKey(this.providerId(), key));
  }

  protected remove(): void {
    this.run(this.api.clearKey(this.providerId()));
  }

  private run(request: Observable<ProviderRead>): void {
    this.busy.set(true);
    this.error.set(undefined);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (provider) => {
        this.busy.set(false);
        this.changed.emit(provider);
      },
      error: (failure: unknown) => {
        this.busy.set(false);
        this.error.set(messageOf(failure));
      },
    });
  }
}
