import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import type { EntityListItem } from '@bbartolome/scriba-contracts/project-store';
import type { FormField } from '@bbartolome/scriba-contracts/tool-registry';
import { EntityPickerComponent } from './entity-picker';
import { type FieldValue, STYLE_PROFILE_KIND } from './tool-form-model';

/**
 * One form field, drawn with the control its descriptor names. Every control reports a change as a
 * `FieldValue`, and the owning form keeps the values. The field shows its own issue messages.
 */
@Component({
  selector: 'app-tool-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormField, MatLabel, MatInput, MatSlideToggle, EntityPickerComponent],
  template: `
    <div
      class="field"
      [attr.data-field]="field().key"
      [attr.data-control]="field().control"
      [attr.data-required]="field().required"
    >
      @switch (field().control) {
        @case ('text') {
          <mat-form-field appearance="outline">
            <mat-label>{{ field().title }}</mat-label>
            <input
              matInput
              type="text"
              [name]="field().key"
              [required]="field().required"
              [value]="text()"
              (input)="setText($event)"
            />
          </mat-form-field>
        }
        @case ('textarea') {
          <mat-form-field appearance="outline">
            <mat-label>{{ field().title }}</mat-label>
            <textarea
              matInput
              rows="4"
              [name]="field().key"
              [required]="field().required"
              [value]="text()"
              (input)="setText($event)"
            ></textarea>
          </mat-form-field>
        }
        @case ('number') {
          <mat-form-field appearance="outline">
            <mat-label>{{ field().title }}</mat-label>
            <input
              matInput
              type="number"
              [name]="field().key"
              [required]="field().required"
              [min]="field().minimum ?? null"
              [max]="field().maximum ?? null"
              [value]="text()"
              (input)="setNumber($event)"
            />
          </mat-form-field>
        }
        @case ('slider') {
          <label class="slider">
            <span>{{ field().title }}</span>
            <input
              type="range"
              [name]="field().key"
              [min]="field().minimum ?? 0"
              [max]="field().maximum ?? 100"
              [value]="numberValue()"
              (input)="setNumber($event)"
            />
            <output>{{ numberValue() }}</output>
          </label>
        }
        @case ('select') {
          <mat-form-field appearance="outline">
            <mat-label>{{ field().title }}</mat-label>
            <select matNativeControl [name]="field().key" (change)="choose($event)">
              @if (!field().required) {
                <option value="" [selected]="text() === ''">None</option>
              }
              @for (option of field().options ?? []; track option) {
                <option [value]="option" [selected]="option === text()">{{ option }}</option>
              }
            </select>
          </mat-form-field>
        }
        @case ('toggle') {
          <mat-slide-toggle
            [name]="field().key"
            [checked]="value() === true"
            (change)="toggled($event.checked)"
          >
            {{ field().title }}
          </mat-slide-toggle>
        }
        @case ('entity-picker') {
          <app-entity-picker
            [label]="field().title"
            [kinds]="field().entityKinds ?? []"
            [list]="field().list"
            [entities]="entities()"
            [value]="entityValue()"
            (valueChange)="valueChange.emit($event)"
          />
        }
        @case ('style-picker') {
          <app-entity-picker
            [label]="field().title"
            [kinds]="styleKinds"
            [list]="false"
            [entities]="entities()"
            [value]="entityValue()"
            (valueChange)="valueChange.emit($event)"
          />
        }
      }
      @for (message of issues(); track $index) {
        <p class="issue" [attr.data-issue]="field().key">{{ message }}</p>
      }
    </div>
  `,
})
export class ToolFieldComponent {
  readonly field = input.required<FormField>();
  readonly value = input<FieldValue | undefined>(undefined);
  readonly issues = input<readonly string[]>([]);
  readonly entities = input<readonly EntityListItem[]>([]);
  readonly valueChange = output<FieldValue | undefined>();

  protected readonly styleKinds: readonly string[] = [STYLE_PROFILE_KIND];

  /** The text a text, number or select control shows: a list as its comma-joined text. */
  protected readonly text = computed(() => {
    const value = this.value();
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    return '';
  });

  protected readonly numberValue = computed(() => {
    const value = this.value();
    return typeof value === 'number' ? value : (this.field().minimum ?? 0);
  });

  protected readonly entityValue = computed(() => {
    const value = this.value();
    return typeof value === 'string' || Array.isArray(value) ? value : undefined;
  });

  protected setText(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }

  /** A number that does not parse is kept as text, so the server reports it as a wrong type. */
  protected setNumber(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    if (text === '') {
      this.valueChange.emit(undefined);
      return;
    }
    const number = Number(text);
    this.valueChange.emit(Number.isNaN(number) ? text : number);
  }

  protected choose(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }

  protected toggled(checked: boolean): void {
    this.valueChange.emit(checked);
  }
}
