import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DeviceClassService } from '../../shell/device/device-class';
import { type ToolCardLike, type ToolCardStatus, toolCardStatus } from './tool-card';

const STATUS_LABEL: Readonly<Record<ToolCardStatus, string>> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  error: 'Error',
};

/**
 * One tool call. It shows the tool's name and status; on a phone it starts collapsed, and a tap
 * expands it. A tablet or desktop starts expanded. The body shows the arguments, the summary and
 * output or error, and the source paths the call used.
 */
@Component({
  selector: 'app-tool-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [attr.data-status]="status()">
      <button type="button" class="head" [attr.aria-expanded]="expanded()" (click)="toggle()">
        <span class="name">{{ card().name }}</span>
        <span class="status">{{ label() }}</span>
      </button>
      @if (expanded()) {
        <div class="body">
          @if (card().arguments !== undefined) {
            <pre class="arguments">{{ argumentsText() }}</pre>
          }
          @if (card().summary) {
            <p class="summary">{{ card().summary }}</p>
          }
          @if (card().state === 'failed' && card().error; as error) {
            <p class="error" role="alert">{{ error.message }}</p>
          }
          @if (card().output !== undefined) {
            <pre class="output">{{ outputText() }}</pre>
          }
          @if (sources().length > 0) {
            <ul class="sources">
              @for (source of sources(); track source.id) {
                <li>{{ source.path }}</li>
              }
            </ul>
          }
        </div>
      }
    </article>
  `,
  styles: `
    .card {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      padding: 8px 12px;
      font: var(--mat-sys-body-medium);
    }
    .head {
      all: unset;
      display: flex;
      width: 100%;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
    }
    .status {
      font: var(--mat-sys-label-large);
    }
    .body > * + * {
      margin-top: 8px;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 0;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
    .sources {
      margin: 0;
      padding-left: 20px;
    }
  `,
})
export class ToolCardView {
  readonly card = input.required<ToolCardLike>();

  private readonly device = inject(DeviceClassService).current;
  /** The reader's last choice. Until they tap, the device class decides. */
  private readonly choice = signal<boolean | undefined>(undefined);

  protected readonly status = computed(() => toolCardStatus(this.card()));
  protected readonly label = computed(() => STATUS_LABEL[this.status()]);
  protected readonly expanded = computed(() => this.choice() ?? this.device() !== 'phone');
  protected readonly sources = computed(() => this.card().sourcesUsed ?? []);
  protected readonly argumentsText = computed(() => JSON.stringify(this.card().arguments, null, 2));
  protected readonly outputText = computed(() => {
    const output = this.card().output;
    return typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  });

  protected toggle(): void {
    this.choice.set(!this.expanded());
  }
}
