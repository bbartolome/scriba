import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { EntityListItem } from '@bbartolome/scriba-contracts/project-store';
import { z } from 'zod';

/** The MIME type an entity chip carries when it is dragged. Its data is `{"id": "<entity id>"}`. */
export const ENTITY_CHIP_MIME = 'application/x-scriba-entity';

const ChipSchema = z.object({ id: z.string().min(1) });

/** The entity ID a drop carries: the chip's own data, else the plain text of the drag. */
function droppedId(transfer: DataTransfer | null): string | undefined {
  if (transfer === null) {
    return undefined;
  }
  const chip = transfer.getData(ENTITY_CHIP_MIME);
  if (chip !== '') {
    const parsed = ChipSchema.safeParse(safeJson(chip));
    if (parsed.success) {
      return parsed.data.id;
    }
  }
  const text = transfer.getData('text/plain').trim();
  return text === '' ? undefined : text;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The entity picker. It offers only the active project's entities of the field's kinds, shows the
 * chosen entity as a chip (several for a list), and accepts an entity chip dropped on it. A dropped
 * entity of the wrong kind, or one the project does not have, is refused with a message and not
 * added (spec, "Form renderer": the picker filters by kind and accepts dropped chips).
 */
@Component({
  selector: 'app-entity-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .picker {
      display: grid;
      gap: 0.25rem;
    }
    .label {
      font: var(--mat-sys-title-small);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.125rem 0.5rem;
      border-radius: 999px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .remove {
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      text-decoration: underline;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .issue {
      margin: 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
  template: `
    <div
      class="picker"
      data-testid="entity-picker"
      [attr.data-kinds]="kinds().join(' ')"
      (dragover)="allowDrop($event)"
      (drop)="drop($event)"
    >
      <span class="label">{{ label() }}</span>
      <div class="chips">
        @for (id of selected(); track id) {
          <span
            class="chip"
            draggable="true"
            [attr.data-entity-id]="id"
            (dragstart)="dragStart($event, id)"
          >
            {{ id }}
            <button
              type="button"
              class="remove"
              [attr.aria-label]="'Remove ' + id"
              (click)="remove(id)"
            >
              Remove
            </button>
          </span>
        } @empty {
          <span class="empty">None chosen</span>
        }
      </div>
      <select [attr.aria-label]="'Choose for ' + label()" (change)="choose($event)">
        <option value="">{{ list() ? 'Add an entity' : 'Choose an entity' }}</option>
        @for (entity of options(); track entity.id) {
          <option [value]="entity.id">{{ entity.id }}</option>
        }
      </select>
      @if (refusal(); as text) {
        <p class="issue" role="status">{{ text }}</p>
      }
    </div>
  `,
})
export class EntityPickerComponent {
  readonly label = input.required<string>();
  /** The entity kinds the picker offers. Empty means every kind. */
  readonly kinds = input<readonly string[]>([]);
  readonly list = input<boolean>(false);
  readonly entities = input<readonly EntityListItem[]>([]);
  readonly value = input<string | readonly string[] | undefined>(undefined);
  readonly valueChange = output<string | string[] | undefined>();

  protected readonly refusal = signal<string | null>(null);

  protected readonly selected = computed<readonly string[]>(() => {
    const value = this.value();
    if (value === undefined) return [];
    return typeof value === 'string' ? [value] : value;
  });

  protected readonly options = computed(() => {
    const kinds = this.kinds();
    return this.entities().filter((entity) => kinds.length === 0 || kinds.includes(entity.type));
  });

  protected allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    const id = droppedId(event.dataTransfer);
    if (id !== undefined) {
      this.offer(id);
    }
  }

  protected dragStart(event: DragEvent, id: string): void {
    event.dataTransfer?.setData(ENTITY_CHIP_MIME, JSON.stringify({ id }));
  }

  protected choose(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const id = select.value;
    select.value = '';
    if (id !== '') {
      this.offer(id);
    }
  }

  protected remove(id: string): void {
    this.refusal.set(null);
    if (this.list()) {
      this.valueChange.emit(this.selected().filter((item) => item !== id));
    } else {
      this.valueChange.emit(undefined);
    }
  }

  /** Adds an entity if the project has it and its kind fits. Otherwise it says why not. */
  private offer(id: string): void {
    const entity = this.entities().find((candidate) => candidate.id === id);
    const kinds = this.kinds();
    if (entity === undefined) {
      this.refusal.set(`${id} is not an entity in the active project.`);
      return;
    }
    if (kinds.length > 0 && !kinds.includes(entity.type)) {
      this.refusal.set(`${id} is a ${entity.type}. This field takes ${kinds.join(' or ')}.`);
      return;
    }
    this.refusal.set(null);
    if (this.list()) {
      if (!this.selected().includes(id)) {
        this.valueChange.emit([...this.selected(), id]);
      }
    } else {
      this.valueChange.emit(id);
    }
  }
}
