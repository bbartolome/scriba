import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, switchMap } from 'rxjs';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import type { ToolSummary } from '@bbartolome/scriba-contracts/tool-registry';
import { DeviceClassService, EventStream } from '../../../shell';
import { ToolRegistryApi } from '../api/tool-registry.api';
import { messageOf } from '../tool-form/tool-form-model';

/**
 * The identity of one row. An invalid user copy can share a name with the built-in it shadows, so
 * the name alone does not identify a row, and the origin is part of the key.
 */
export function rowKey(tool: Pick<ToolSummary, 'name' | 'origin'>): string {
  return `${tool.origin}:${tool.name}`;
}

/** Where a tool came from, in words a person can act on. */
export function originLabel(tool: Pick<ToolSummary, 'origin' | 'overrides'>): string {
  if (tool.origin === 'user') {
    return tool.overrides === undefined ? 'Your tool' : 'Your copy of a built-in tool';
  }
  return `Built-in, ${tool.origin} pack`;
}

/**
 * The Tools list (survey 21 §3, phase:editor-ui). Every phone reaches it: one row per tool, with
 * its enable switch. The switch saves at once, and a failed save puts it back. A catalog change
 * from the host or another save refreshes the list. The rows link to the editor only on a
 * tablet or larger, because the editor is not reachable on a phone.
 */
@Component({
  selector: 'app-tools-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, RouterLink],
  styles: `
    .tools {
      display: grid;
      gap: 0.75rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tool {
      display: grid;
      gap: 0.25rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 0.75rem;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .name {
      font: var(--mat-sys-title-medium);
      color: inherit;
    }
    .meta,
    .description {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
  `,
  template: `
    <div class="toolbar">
      <h1>Tools</h1>
      @if (!isPhone()) {
        <a mat-flat-button routerLink="/tools/new" data-testid="new-tool">New tool</a>
      }
    </div>
    <p class="note">
      Switch a tool off to keep the agent from offering it.
      @if (isPhone()) {
        Editing needs a tablet or a larger screen.
      }
    </p>
    @if (failure(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }
    @if (tools(); as list) {
      @if (list.length === 0) {
        <p data-testid="no-tools">No tools are loaded.</p>
      }
      <ul class="tools" aria-label="Tools">
        @for (tool of list; track rowKey(tool)) {
          <li class="tool" [attr.data-tool]="tool.name" [attr.data-origin]="tool.origin">
            <div class="head">
              @if (isPhone() || hidesBuiltIn(tool)) {
                <span class="name">{{ tool.name }}</span>
              } @else {
                <a class="name" [routerLink]="['/tools', tool.name]">{{ tool.name }}</a>
              }
              @if (!hidesBuiltIn(tool)) {
                <label>
                  <input
                    #switch
                    type="checkbox"
                    role="switch"
                    [attr.aria-label]="'Enabled: ' + tool.name"
                    [checked]="tool.enabled"
                    (change)="toggle(tool, switch)"
                  />
                  {{ tool.enabled ? 'On' : 'Off' }}
                </label>
              }
            </div>
            @if (tool.description) {
              <p class="description">{{ tool.description }}</p>
            }
            @if (hidesBuiltIn(tool)) {
              <p class="meta">The built-in tool is in use while this copy is broken.</p>
              @if (!isPhone()) {
                <button
                  mat-stroked-button
                  type="button"
                  data-testid="delete-broken"
                  (click)="deleteBroken(tool)"
                >
                  {{ pendingDelete() === rowKey(tool) ? 'Confirm delete' : 'Delete broken copy' }}
                </button>
              }
            }
            <p class="meta">
              {{ originLabel(tool) }}
              @if (tool.output) {
                · {{ tool.output }}
              }
              @if (!tool.valid) {
                · Not loaded: {{ tool.error ?? 'invalid file' }}
              } @else if (tool.lint.errors > 0 || tool.lint.warnings > 0) {
                · {{ tool.lint.errors }} errors, {{ tool.lint.warnings }} warnings
              }
            </p>
          </li>
        }
      </ul>
    } @else if (failure() === null) {
      <p>Loading the tools.</p>
    }
  `,
})
export class ToolsListPage implements OnInit {
  private readonly api = inject(ToolRegistryApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stream = inject(EventStream);
  private readonly device = inject(DeviceClassService).current;

  protected readonly tools = signal<readonly ToolSummary[] | null>(null);
  /** The row whose broken copy waits for its second press. */
  protected readonly pendingDelete = signal<string | null>(null);
  /** Each load goes through here, so a slower earlier answer never overwrites a newer one. */
  private readonly loads = new Subject<void>();
  protected readonly failure = signal<string | null>(null);
  protected readonly isPhone = () => this.device() === 'phone';
  protected readonly originLabel = originLabel;
  protected readonly rowKey = rowKey;

  ngOnInit(): void {
    this.loadList();
    this.loads.next();
    this.stream
      .forModule('tool-registry')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loads.next());
  }

  /**
   * Saves the switch at once. The row shows the new state while the call is in flight, and goes
   * back to the saved state when the call fails. The checkbox is set back as well, because Angular
   * sees no change when a failed save returns the row to the value it already had.
   */
  protected toggle(tool: ToolSummary, input: HTMLInputElement): void {
    const enabled = input.checked;
    const before = tool.enabled;
    this.setRow(tool, { enabled });
    this.api
      .setEnabled(tool.name, enabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.failure.set(null),
        error: (failure: unknown) => {
          this.setRow(tool, { enabled: before });
          input.checked = before;
          this.failure.set(messageOf(failure));
        },
      });
  }

  /** Reads the list. A load that has been overtaken by a newer one is dropped. */
  private loadList(): void {
    this.loads
      .pipe(
        switchMap(() =>
          this.api.listTools().pipe(
            catchError((failure: unknown) => {
              // A failed load shows its error, and the next load still runs.
              this.failure.set(messageOf(failure));
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.tools.set(response.tools);
          this.failure.set(null);
          this.pendingDelete.set(null);
        },
        error: (failure: unknown) => this.failure.set(messageOf(failure)),
      });
  }

  /** A broken copy hides the built-in of its name, and the server keeps one switch per name. */
  protected hidesBuiltIn(tool: ToolSummary): boolean {
    return !tool.valid && tool.overrides !== undefined;
  }

  /**
   * Removes a broken copy, which restores the built-in of its name. The first press asks for
   * confirmation, and the second removes it.
   */
  protected deleteBroken(tool: ToolSummary): void {
    const key = rowKey(tool);
    if (this.pendingDelete() !== key) {
      this.pendingDelete.set(key);
      return;
    }
    this.pendingDelete.set(null);
    this.api
      .remove(tool.name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loads.next(),
        error: (failure: unknown) => this.failure.set(messageOf(failure)),
      });
  }

  private setRow(tool: ToolSummary, change: Partial<Pick<ToolSummary, 'enabled'>>): void {
    const key = rowKey(tool);
    this.tools.update((list) =>
      list === null ? list : list.map((row) => (rowKey(row) === key ? { ...row, ...change } : row)),
    );
  }
}
