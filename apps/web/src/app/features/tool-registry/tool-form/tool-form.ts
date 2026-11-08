import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { NgTemplateOutlet } from '@angular/common';
import type { EntityListItem } from '@bbartolome/scriba-contracts/project-store';
import type {
  FormField,
  InputPort,
  ToolDetail,
  ValidateResponse,
  ValidationIssue,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ToolFieldComponent } from './tool-field';
import { ToolRegistryApi } from '../api/tool-registry.api';
import {
  type FieldValue,
  type FieldValues,
  type GroupedIssues,
  argsIssuesOf,
  groupIssues,
  initialValues,
  messageOf,
  toArguments,
} from './tool-form-model';

const NO_ISSUES: GroupedIssues = { byField: {}, general: [] };

/** The two layouts of one tool: the full form, and the node body the canvas hosts (#8). */
export type ToolFormLayout = 'form' | 'node';

/** The context a port handle template receives: the port it is drawn for. */
export interface PortHandleContext {
  readonly $implicit: InputPort;
}

/**
 * The tool form (survey 21 §3, phase:form-renderer). One component renders one tool's descriptor
 * in two layouts. The form layout draws every field, and a submit sends the arguments to validate.
 * The node layout draws the typed input ports, which the Graph runner's handle template decorates,
 * and the params as ordinary controls. Both layouts read the same detail, so one response drives
 * both.
 */
@Component({
  selector: 'app-tool-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tool-form {
      display: block;
      max-width: 40rem;
    }
    .issue {
      margin: 0.25rem 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .failure {
      color: var(--mat-sys-error);
    }
    .node {
      display: grid;
      gap: 0.75rem;
      max-width: 22rem;
      padding: 0.75rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 0.75rem;
    }
    .node-head .name {
      font: var(--mat-sys-title-medium);
    }
    .ports {
      display: grid;
      gap: 0.375rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .port {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .port-type {
      color: var(--mat-sys-on-surface-variant);
    }
    .handle {
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      background: var(--mat-sys-primary);
    }
    .validated pre {
      padding: 0.5rem;
      border-radius: 0.5rem;
      background: var(--mat-sys-surface-container);
      overflow-x: auto;
    }
  `,
  imports: [MatButton, NgTemplateOutlet, ToolFieldComponent],
  template: `
    @if (detail().form === undefined) {
      <p class="no-views">This tool has no form, because its spec has lint errors.</p>
    } @else if (layout() === 'node') {
      <section class="node" data-layout="node" [attr.aria-label]="'Tool node ' + detail().name">
        <header class="node-head">
          <span class="name">{{ detail().name }}</span>
        </header>
        @if (ports(); as shape) {
          <ul class="ports" aria-label="Input ports">
            @for (port of shape.inputs; track port.key) {
              <li class="port" [attr.data-port]="port.key" [attr.data-type]="port.type">
                <ng-container
                  [ngTemplateOutlet]="portHandle() ?? defaultHandle"
                  [ngTemplateOutletContext]="{ $implicit: port }"
                />
                <span class="port-title">{{ port.title }}</span>
                <span class="port-type"
                  >{{ port.type }}{{ port.list ? ' list' : ''
                  }}{{ port.required ? ', required' : '' }}</span
                >
              </li>
            }
          </ul>
          <div class="port output" data-output-port [attr.data-type]="shape.output.type">
            <span class="port-title">output</span>
            <span class="port-type">{{ shape.output.kind }}</span>
          </div>
          <div class="params" aria-label="Params">
            @for (key of shape.params; track key) {
              @if (fieldFor(key); as field) {
                <app-tool-field
                  [field]="field"
                  [value]="values()[key]"
                  [issues]="messages()[key] ?? []"
                  [entities]="entities()"
                  (valueChange)="setValue(key, $event)"
                />
              }
            }
          </div>
        }
      </section>
    } @else {
      <form
        class="tool-form"
        novalidate
        [attr.aria-label]="'Arguments for ' + detail().name"
        (submit)="submit($event)"
      >
        @for (message of issues().general; track $index) {
          <p class="issue general">{{ message }}</p>
        }
        @for (field of fields(); track field.key) {
          <app-tool-field
            [field]="field"
            [value]="values()[field.key]"
            [issues]="messages()[field.key] ?? []"
            [entities]="entities()"
            (valueChange)="setValue(field.key, $event)"
          />
        }
        <button mat-flat-button type="submit" [disabled]="checking()">Check arguments</button>
        @if (failure(); as text) {
          <p class="failure" role="alert">{{ text }}</p>
        }
        @if (result(); as done) {
          <section class="validated" aria-label="Validated arguments">
            <h3>Arguments with defaults applied</h3>
            <pre data-testid="validated-arguments">{{ argumentsText(done) }}</pre>
            <ul data-testid="referenced-entities">
              @for (ref of done.entities; track $index) {
                <li [attr.data-entity-field]="ref.field">
                  {{ ref.id }}{{ ref.style ? ' (style)' : '' }}
                </li>
              }
            </ul>
          </section>
        }
      </form>
    }
    <ng-template #defaultHandle>
      <span class="handle" aria-hidden="true"></span>
    </ng-template>
  `,
})
export class ToolFormComponent {
  private readonly api = inject(ToolRegistryApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Counts the edits a person has made, so a check answered after an edit is not reported. */
  private edits = 0;
  readonly detail = input.required<ToolDetail>();
  readonly layout = input<ToolFormLayout>('form');
  /** The active project's entities. Each picker filters them by its kinds. */
  readonly entities = input<readonly EntityListItem[]>([]);
  /** The active project's style profile, which a style field starts on when it has no default. */
  readonly styleDefault = input<string | undefined>(undefined);
  /** The Graph runner's port handle. Without one, a plain handle mark is drawn. */
  readonly portHandle = input<TemplateRef<PortHandleContext> | undefined>(undefined);
  /** Emits the validated arguments and the entity IDs to resolve, after a successful check. */
  readonly validated = output<ValidateResponse>();
  /** Emits when a person edits a field, so a caller can drop arguments it checked before. */
  readonly changed = output<void>();

  protected readonly fields = computed(() => this.detail().form?.fields ?? []);
  // The node body draws the port rows and the params from the descriptor, which keeps params to non-port fields (survey 21 §7 item 13).
  // provisional: survey 21 §7 item 13
  protected readonly ports = computed(() => this.detail().ports);

  protected readonly values = linkedSignal<FieldValues>(() =>
    initialValues(this.fields(), this.styleDefault()),
  );
  protected readonly issues = linkedSignal({
    source: this.detail,
    computation: (): GroupedIssues => NO_ISSUES,
  });
  protected readonly messages = computed(() => this.issues().byField);
  protected readonly result = linkedSignal({
    source: this.detail,
    computation: (): ValidateResponse | null => null,
  });
  protected readonly checking = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected fieldFor(key: string): FormField | undefined {
    return this.fields().find((field) => field.key === key);
  }

  protected setValue(key: string, value: FieldValue | undefined): void {
    this.edits += 1;
    this.values.update((current) => ({ ...current, [key]: value }));
    // A result describes the arguments it checked, so an edit makes it stale.
    this.result.set(null);
    this.changed.emit();
  }

  protected argumentsText(done: ValidateResponse): string {
    return JSON.stringify(done.arguments, null, 2);
  }

  /** Sends the arguments to validate. A refusal shows its issues on their fields. */
  protected submit(event: Event): void {
    event.preventDefault();
    this.checking.set(true);
    this.failure.set(null);
    const args = toArguments(this.fields(), this.values());
    const version = this.edits;
    const snapshot = this.values();
    this.api
      .validate(this.detail().name, { mode: 'full', arguments: args })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (done) => {
          this.checking.set(false);
          // A check answered after an edit describes arguments the form no longer shows, so it is dropped.
          if (version !== this.edits || snapshot !== this.values()) {
            return;
          }
          this.issues.set(NO_ISSUES);
          this.result.set(done);
          this.validated.emit(done);
        },
        error: (error: unknown) => {
          this.checking.set(false);
          const refused = argsIssuesOf(error);
          if (refused !== null) {
            this.result.set(null);
            this.issues.set(this.grouped(refused));
          } else {
            this.failure.set(messageOf(error));
          }
        },
      });
  }

  private grouped(issues: readonly ValidationIssue[]): GroupedIssues {
    return groupIssues(issues, this.detail().form);
  }
}
