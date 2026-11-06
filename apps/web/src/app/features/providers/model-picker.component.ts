import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { ModelListState } from './model-list';

/**
 * The model picker (spec #19, "BYOK settings UI"). It lists the provider's models in a dropdown
 * when the list loads. When the list fails or is empty, it becomes a free-text field with a short
 * explanation, so an unusual server never blocks the author. The author can also type a name when
 * the list is wrong. The picker is presentational: its owner loads the list and holds the choice.
 */
@Component({
  selector: 'app-model-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatFormField, MatLabel, MatInput],
  styles: `
    :host {
      display: grid;
      gap: 0.5rem;
    }
    .note {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
  `,
  template: `
    @if (typing() || state().kind !== 'listed') {
      <mat-form-field appearance="outline">
        <mat-label>Model</mat-label>
        <input
          matInput
          type="text"
          autocomplete="off"
          spellcheck="false"
          [name]="fieldName()"
          [value]="model()"
          [attr.aria-describedby]="note() === '' ? null : 'model-note-' + fieldName()"
          (input)="typed($event)"
        />
      </mat-form-field>
      @if (note() !== '') {
        <p class="note" [id]="'model-note-' + fieldName()" data-testid="model-note">
          {{ note() }}
        </p>
      }
      <div class="actions">
        @if (state().kind === 'listed') {
          <button mat-button type="button" (click)="typing.set(false)">Choose from the list</button>
        }
        <button mat-button type="button" (click)="refresh.emit()">Refresh models</button>
      </div>
    } @else {
      <mat-form-field appearance="outline">
        <mat-label>Model</mat-label>
        <select matNativeControl [name]="fieldName()" (change)="chosen($event)">
          <option value="" [selected]="model() === ''">
            auto (the first model the server lists)
          </option>
          @for (name of choices(); track name) {
            <option [value]="name" [selected]="name === model()">{{ name }}</option>
          }
        </select>
      </mat-form-field>
      <div class="actions">
        <button mat-button type="button" (click)="typing.set(true)">Type a model name</button>
        <button mat-button type="button" (click)="refresh.emit()">Refresh models</button>
      </div>
    }
  `,
})
export class ModelPickerComponent {
  /** The model list as its owner holds it. */
  readonly state = input.required<ModelListState>();
  /** The chosen model. Empty means the provider's own default, which the UI shows as `auto`. */
  readonly model = input.required<string>();
  /** The name of the field, so two pickers on one page are told apart. */
  readonly fieldName = input('model');
  readonly modelChange = output<string>();
  readonly refresh = output<void>();

  /** Set when the author asks for free text while the list is available. */
  protected readonly typing = signal(false);

  /** The explanation above the free-text field. Empty when there is nothing to explain. */
  protected readonly note = computed(() => {
    const current = this.state();
    switch (current.kind) {
      case 'loading':
        return 'Loading the model list.';
      case 'empty':
        return 'This server lists no models. Type a model name, or leave it empty to use the first model it lists later.';
      case 'failed':
        return `Scriba could not list this provider's models (${current.message}). Type the model name instead.`;
      case 'listed':
        return '';
    }
  });

  /** The listed names, with the chosen model added when the list does not hold it, so it shows. */
  protected readonly choices = computed(() => {
    const current = this.state();
    if (current.kind !== 'listed') return [];
    const chosen = this.model();
    return chosen === '' || current.models.includes(chosen)
      ? current.models
      : [chosen, ...current.models];
  });

  protected typed(event: Event): void {
    this.modelChange.emit((event.target as HTMLInputElement).value);
  }

  protected chosen(event: Event): void {
    this.modelChange.emit((event.target as HTMLSelectElement).value);
  }
}
