import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  type Observable,
  Subject,
  catchError,
  debounceTime,
  forkJoin,
  map,
  of,
  switchMap,
} from 'rxjs';
import {
  CatalogChangedDataSchema,
  type ExecuteResponse,
  type LintDiagnostic,
  type LintPreview,
  type ResolvedToolEntity,
  type ToolDetail,
  ToolSpecLintFailedBodySchema,
  type ValidateResponse,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ApiError, EventStream } from '../../../shell';
import { ReadOnlyDiffView } from '../../../shared/diff/read-only-diff-view';
import { ToolRegistryApi } from '../api/tool-registry.api';
import { ToolFormComponent } from '../tool-form/tool-form';
import { messageOf } from '../tool-form/tool-form-model';
import { originLabel } from '../tools-list/tools-list.page';
import { NO_PROJECT, type ProjectContext, loadProjectContext } from './project-context';
import { YamlEditor } from './yaml-editor';

/** The starting YAML of a new tool. It is a valid spec, so the first preview draws at once. */
export const NEW_TOOL_YAML = `schemaVersion: 1
name: new_tool
description: Describe what this tool does.
inputs:
  type: object
  properties:
    notes:
      type: string
      title: Notes
      description: Free text the tool should use.
  required: [notes]
  additionalProperties: false
output: draft
enabled: true
prompt: |
  Write the draft from these notes.

  Notes: {{notes}}
`;

/** Pause after the last keystroke before the live lint runs. */
export const LINT_DEBOUNCE_MS = 300;

/** The longest tool name the contract accepts. */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * The URL segment of the New tool page. A tool cannot be saved under it, because `/tools/new` would
 * open the New page and never the tool.
 */
export const NEW_TOOL_ROUTE = 'new';

/** The tool name a YAML source declares, or undefined when it has no top-level `name:` line. */
export function nameOf(yaml: string): string | undefined {
  const match = /^name:\s*['"]?([^'"\s#]+)['"]?\s*(#.*)?$/m.exec(yaml);
  return match?.[1];
}

/** The same YAML with its top-level `name:` line set to `name`. Other lines are kept as written. */
export function renamed(yaml: string, name: string): string {
  return yaml.replace(/^name:.*$/m, `name: ${name}`);
}

/**
 * The first free copy name for `base`: `<base>_copy`, then `<base>_copy_2`, and so on. The base is
 * cut so the name stays within the tool-name length limit, and a copy never takes a name in use.
 */
export function copyNameFor(base: string, taken: ReadonlySet<string>): string {
  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? '_copy' : `_copy_${index}`;
    const stem = base.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length).replace(/_+$/, '');
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** The lint diagnostics a refused save carries, or null when the failure is not a lint refusal. */
function lintRefusalOf(failure: unknown): readonly LintDiagnostic[] | null {
  if (!(failure instanceof ApiError)) {
    return null;
  }
  const parsed = ToolSpecLintFailedBodySchema.safeParse({
    error: { code: failure.code, message: failure.message, details: failure.details },
  });
  return parsed.success ? parsed.data.error.details.diagnostics : null;
}

/** The preview the editor draws: the last valid form and ports, from the live lint. */
interface LiveViews {
  readonly form: NonNullable<ToolDetail['form']>;
  readonly ports: NonNullable<ToolDetail['ports']>;
}

/** One edit as the live lint sees it, tagged with the open tool it belongs to. */
interface Edit {
  readonly text: string;
  readonly generation: number;
}

/** The live lint's answer to one edit, or the reason it could not be had. */
type LintAnswer =
  | { readonly generation: number; readonly lint: LintPreview }
  | { readonly generation: number; readonly failure: string };

/** The two actions that delete a file, and so need a second press to confirm. */
type ConfirmAction = 'revert' | 'delete';

/**
 * The Tool editor (survey 21 §3, phase:editor-ui). It edits one tool's YAML: the live lint runs
 * after a pause, the preview redraws from the last valid YAML, and a save writes the user copy only
 * when the lint has no error. A built-in opens read-only, and Customize unlocks it. A Try panel runs
 * the saved tool against the active project and writes nothing.
 */
@Component({
  selector: 'app-tool-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, ReadOnlyDiffView, RouterLink, ToolFormComponent, YamlEditor],
  styles: `
    .crumbs {
      font: var(--mat-sys-body-small);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0.75rem 0;
    }
    .layout {
      display: grid;
      gap: 1.5rem;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      align-items: start;
    }
    .diagnostics {
      margin: 0.5rem 0 0;
      padding-left: 1.25rem;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .diagnostics [data-severity='warning'] {
      color: var(--mat-sys-on-surface-variant);
    }
    .meta,
    .note {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .notice {
      color: var(--mat-sys-primary);
    }
    .try {
      grid-column: 1 / -1;
    }
    .output {
      padding: 0.75rem;
      border-radius: 0.75rem;
      background: var(--mat-sys-surface-container);
      white-space: pre-wrap;
    }
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  template: `
    <p class="crumbs"><a routerLink="/tools">Tools</a></p>
    <h1>{{ isNew() ? 'New tool' : name() }}</h1>
    @if (detail(); as tool) {
      <p class="meta" data-testid="origin">{{ originText(tool) }}</p>
    }
    @if (loadFailure(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }

    <div class="actions">
      @if (ready()) {
        @if (readOnly()) {
          <button mat-flat-button type="button" (click)="customize()">Customize</button>
        } @else {
          <button mat-flat-button type="button" [disabled]="!dirty() || saving()" (click)="save()">
            Save
          </button>
        }
        @if (canCompare()) {
          <button mat-stroked-button type="button" (click)="toggleCompare()">
            {{ comparing() ? 'Hide comparison' : 'Compare with built-in' }}
          </button>
        }
        @if (canRevert()) {
          <button
            mat-stroked-button
            type="button"
            data-testid="revert"
            [disabled]="saving()"
            (click)="revert()"
          >
            {{ confirming() === 'revert' ? 'Confirm revert' : 'Revert to built-in' }}
          </button>
        }
        @if (canDelete()) {
          <button
            mat-stroked-button
            type="button"
            data-testid="delete"
            [disabled]="saving()"
            (click)="remove()"
          >
            {{ confirming() === 'delete' ? 'Confirm delete' : 'Delete' }}
          </button>
        }
        @if (!isNew()) {
          <button mat-stroked-button type="button" [disabled]="saving()" (click)="duplicate()">
            Duplicate
          </button>
        }
      }
    </div>
    @if (confirming(); as action) {
      <p class="note" role="status">
        {{
          action === 'revert'
            ? 'Reverting deletes your copy and restores the built-in tool.'
            : 'Deleting removes this tool file from your library.'
        }}
        Press the button again to confirm.
      </p>
    }
    @if (notice(); as text) {
      <p class="notice" role="status">{{ text }}</p>
    }
    @if (failure(); as text) {
      <p class="error" role="alert" data-testid="save-failure">{{ text }}</p>
    }
    @if (lintFailure(); as text) {
      <p class="note" data-testid="lint-failure">Live check unavailable: {{ text }}</p>
    }

    <div class="layout">
      <section aria-labelledby="yaml-heading">
        <h2 id="yaml-heading">YAML</h2>
        <app-yaml-editor
          [text]="draft()"
          [diagnostics]="diagnostics()"
          [readOnly]="readOnly()"
          (textChange)="edit($event)"
        />
        @if (diagnostics().length > 0) {
          <ul class="diagnostics" aria-label="Diagnostics" data-testid="diagnostics">
            @for (item of diagnostics(); track $index) {
              <li [attr.data-severity]="item.severity">
                line {{ item.line }}, column {{ item.column }}: {{ item.message }}
              </li>
            }
          </ul>
        }
        @if (comparing() && compareBase() !== null) {
          <app-read-only-diff
            [path]="(name() ?? 'new_tool') + '.yaml'"
            [base]="compareBase() ?? ''"
            [proposed]="draft()"
          />
        }
      </section>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading">Preview</h2>
        @if (preview(); as view) {
          <h3>Node body</h3>
          <app-tool-form
            [detail]="view"
            layout="node"
            [entities]="project().entities"
            [styleDefault]="project().styleDefault"
          />
          <h3>Form</h3>
          <app-tool-form
            [detail]="view"
            [entities]="project().entities"
            [styleDefault]="project().styleDefault"
          />
        } @else {
          <p class="note">The preview appears once the YAML has no error.</p>
        }
      </section>

      <section class="try" aria-labelledby="try-heading">
        <h2 id="try-heading">Try</h2>
        <p class="note">
          Runs the saved tool against the active project and writes no files. Save first to try the
          latest YAML.
        </p>
        @if (!isNew() && saved(); as tool) {
          @if (tool.form === undefined) {
            <p class="note">This tool has no form, so it cannot be tried until it has no error.</p>
          } @else {
            <app-tool-form
              [detail]="tool"
              [entities]="project().entities"
              [styleDefault]="project().styleDefault"
              (validated)="checked.set($event)"
              (changed)="checked.set(null)"
            />
            <button
              mat-flat-button
              type="button"
              data-testid="try-run"
              [disabled]="checked() === null || running()"
              (click)="run()"
            >
              Run
            </button>
          }
        }
        @if (tryFailure(); as text) {
          <p class="error" role="alert">{{ text }}</p>
        }
        @if (result(); as done) {
          <h3>Output</h3>
          <pre class="output" data-testid="tool-output">{{ done.output.content }}</pre>
          <h3>Sources used</h3>
          <ul data-testid="sources-used">
            @for (source of done.sourcesUsed; track source.id) {
              <li>{{ source.id }} ({{ source.path }})</li>
            }
          </ul>
        }
      </section>
    </div>
  `,
})
export class ToolEditorPage implements OnInit {
  private readonly api = inject(ToolRegistryApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stream = inject(EventStream);
  private readonly edits = new Subject<Edit>();
  /**
   * Counts the tools the page has opened or written. An answer that arrives for an earlier tool or
   * an earlier write carries an older count, and the page drops it.
   */
  private generation = 0;

  /** The tool's name from the URL, or null for a new tool. */
  protected readonly name = signal<string | null>(null);
  protected readonly isNew = computed(() => this.name() === null);
  /** The saved tool, as GET answers it. Null for a new tool, or before the first answer. */
  protected readonly detail = signal<ToolDetail | null>(null);
  protected readonly saved = this.detail;
  /** Actions wait for the saved tool, so none runs against an empty draft. */
  protected readonly ready = computed(() => this.isNew() || this.detail() !== null);
  protected readonly draft = signal(NEW_TOOL_YAML);
  protected readonly customizing = signal(false);
  protected readonly confirming = signal<ConfirmAction | null>(null);
  protected readonly diagnostics = signal<readonly LintDiagnostic[]>([]);
  /** The last valid live views. A broken YAML keeps the previous preview. */
  protected readonly liveViews = signal<LiveViews | null>(null);
  protected readonly project = signal<ProjectContext>(NO_PROJECT);
  protected readonly loadFailure = signal<string | null>(null);
  protected readonly failure = signal<string | null>(null);
  protected readonly lintFailure = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly comparing = signal(false);
  protected readonly compareBase = signal<string | null>(null);
  protected readonly checked = signal<ValidateResponse | null>(null);
  protected readonly running = signal(false);
  protected readonly tryFailure = signal<string | null>(null);
  protected readonly result = signal<ExecuteResponse | null>(null);

  protected readonly originText = originLabel;
  protected readonly dirty = computed(() => {
    const saved = this.detail()?.yaml;
    return saved === undefined || this.draft() !== saved;
  });
  /** A built-in is read-only until Customize. Nothing is editable before the tool has loaded. */
  protected readonly readOnly = computed(() => {
    const tool = this.detail();
    return !this.ready() || (tool !== null && tool.origin !== 'user' && !this.customizing());
  });
  protected readonly canCompare = computed(() => {
    const tool = this.detail();
    return tool !== null && (tool.origin !== 'user' || tool.overrides !== undefined);
  });
  protected readonly canRevert = computed(() => {
    const tool = this.detail();
    return tool !== null && tool.origin === 'user' && tool.overrides !== undefined;
  });
  protected readonly canDelete = computed(() => {
    const tool = this.detail();
    return tool !== null && tool.origin === 'user' && tool.overrides === undefined;
  });
  /** The draft's preview: the saved tool's shape, redrawn from the last valid live views. */
  protected readonly preview = computed<ToolDetail | null>(() => {
    const views = this.liveViews();
    const base = this.detail();
    if (base === null) {
      return views === null
        ? null
        : {
            name: nameOf(this.draft()) ?? 'new_tool',
            origin: 'user',
            enabled: true,
            yaml: this.draft(),
            lint: { diagnostics: [...this.diagnostics()] },
            form: views.form,
            ports: views.ports,
          };
    }
    return views === null ? base : { ...base, form: views.form, ports: views.ports };
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.open(params.get('name'));
    });

    // Another writer changed this tool. Reload it, unless the author has unsaved edits.
    this.stream
      .forModule('tool-registry')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        const parsed = CatalogChangedDataSchema.safeParse(event.data);
        const current = this.name();
        if (
          event.type === 'catalog-changed' &&
          parsed.success &&
          current !== null &&
          parsed.data.names.includes(current) &&
          !this.dirty()
        ) {
          this.reload(current);
        }
      });

    // Live lint after a pause. A broken draft keeps the previous preview and shows its diagnostics.
    this.edits
      .pipe(
        debounceTime(LINT_DEBOUNCE_MS),
        switchMap((edit): Observable<LintAnswer> =>
          this.api.lint(edit.text, this.name() ?? undefined).pipe(
            map((lint): LintAnswer => ({ generation: edit.generation, lint })),
            catchError((failure: unknown) =>
              of<LintAnswer>({ generation: edit.generation, failure: messageOf(failure) }),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((answer) => {
        if (answer.generation !== this.generation) {
          return;
        }
        if ('failure' in answer) {
          this.lintFailure.set(answer.failure);
          return;
        }
        this.lintFailure.set(null);
        this.diagnostics.set(answer.lint.diagnostics);
        if (answer.lint.form !== undefined && answer.lint.ports !== undefined) {
          this.liveViews.set({ form: answer.lint.form, ports: answer.lint.ports });
        }
      });
  }

  protected edit(text: string): void {
    this.confirming.set(null);
    this.draft.set(text);
    this.relint();
  }

  protected customize(): void {
    this.customizing.set(true);
  }

  /**
   * Saves the draft under the tool's name. A new tool takes its name from the YAML, and a name
   * already in use is refused, so a new tool never replaces one. A refused save shows its
   * diagnostics, and the saved tool stays active, because the server writes nothing.
   */
  protected save(): void {
    const named = this.name();
    const target = named ?? nameOf(this.draft());
    if (target === undefined) {
      this.failure.set('Give the tool a name in its YAML before saving.');
      return;
    }
    if (!this.ready()) {
      return;
    }
    if (target === NEW_TOOL_ROUTE) {
      this.failure.set(
        `"${target}" is the address of the New tool page, so a tool cannot be saved under it. Rename the tool in its YAML.`,
      );
      return;
    }
    const text = this.draft();
    this.confirming.set(null);
    this.begin();
    const generation = this.generation;
    if (named !== null) {
      this.write(named, text, generation);
      return;
    }
    // A new tool is written only under a name no tool holds, so it never replaces one.
    this.takenNames()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (taken) => {
          if (generation !== this.generation) {
            this.saving.set(false);
            return;
          }
          if (taken.has(target)) {
            this.fail(
              `A tool named "${target}" already exists, so saving would replace it. Give this tool another name in its YAML.`,
            );
            return;
          }
          this.write(target, text, generation);
        },
        error: (failure: unknown) => this.fail(messageOf(failure)),
      });
  }

  /** Removes the user copy. The first press asks for confirmation, and the second removes it. */
  protected revert(): void {
    const target = this.name();
    if (target === null || !this.ready() || this.saving()) {
      return;
    }
    if (this.confirming() !== 'revert') {
      this.confirming.set('revert');
      return;
    }
    this.confirming.set(null);
    const generation = this.generation;
    this.api
      .remove(target)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (generation !== this.generation) {
            return;
          }
          this.customizing.set(false);
          this.notice.set(`Reverted ${target} to the built-in tool.`);
          this.reload(target, this.draft(), generation);
        },
        error: (failure: unknown) => {
          if (generation === this.generation) {
            this.failure.set(messageOf(failure));
          }
        },
      });
  }

  /** Deletes a user-only tool. The first press asks for confirmation, and the second deletes it. */
  protected remove(): void {
    const target = this.name();
    if (target === null || !this.ready() || this.saving()) {
      return;
    }
    if (this.confirming() !== 'delete') {
      this.confirming.set('delete');
      return;
    }
    this.confirming.set(null);
    const generation = this.generation;
    this.api
      .remove(target)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (generation === this.generation) {
            void this.router.navigate(['/tools']);
          }
        },
        error: (failure: unknown) => {
          if (generation === this.generation) {
            this.failure.set(messageOf(failure));
          }
        },
      });
  }

  /**
   * Saves the draft as a copy under the first free `<name>_copy` name, with its YAML renamed to
   * match, and opens the copy. An existing tool is never replaced.
   */
  protected duplicate(): void {
    const source = this.name();
    if (source === null || !this.ready() || this.saving()) {
      return;
    }
    const body = this.draft();
    this.confirming.set(null);
    this.begin();
    const generation = this.generation;
    this.takenNames()
      .pipe(
        switchMap((taken) => {
          const copy = copyNameFor(source, taken);
          return this.api.save(copy, renamed(body, copy)).pipe(map(() => copy));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (copy) => {
          this.saving.set(false);
          if (generation === this.generation) {
            void this.router.navigate(['/tools', copy]);
          }
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (generation !== this.generation) {
            return;
          }
          this.diagnostics.set(lintRefusalOf(failure) ?? this.diagnostics());
          this.fail(messageOf(failure));
        },
      });
  }

  protected toggleCompare(): void {
    this.confirming.set(null);
    if (this.comparing()) {
      this.comparing.set(false);
      return;
    }
    const tool = this.detail();
    if (tool === null) {
      return;
    }
    if (tool.origin !== 'user') {
      this.compareBase.set(tool.yaml);
      this.comparing.set(true);
      return;
    }
    const generation = this.generation;
    this.api
      .builtIn(tool.name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (builtIn) => {
          if (generation !== this.generation) {
            return;
          }
          this.compareBase.set(builtIn.yaml);
          this.comparing.set(true);
        },
        error: (failure: unknown) => {
          if (generation === this.generation) {
            this.failure.set(messageOf(failure));
          }
        },
      });
  }

  /**
   * Runs the saved tool with the validated arguments. Each entity the check referenced is read from
   * the active project first, so the run gets its content.
   */
  protected run(): void {
    const input = this.checked();
    const tool = this.name();
    if (input === null || tool === null) {
      return;
    }
    const context = this.project();
    const missing = input.entities.find(
      (reference) => !context.entities.some((entity) => entity.id === reference.id),
    );
    // A tool with no entity inputs runs with no project, so only the entities need one.
    if (missing !== undefined || (input.entities.length > 0 && context.id === null)) {
      this.tryFailure.set(
        `${missing?.id ?? 'The entity'} is not in the active project, so the tool cannot run.`,
      );
      return;
    }
    const projectId = context.id ?? '';
    const generation = this.generation;
    this.running.set(true);
    this.tryFailure.set(null);
    this.result.set(null);
    const reads: Observable<ResolvedToolEntity>[] = input.entities.map((reference) => {
      const entity = context.entities.find((candidate) => candidate.id === reference.id);
      return this.api.readFile(projectId, entity?.path ?? '').pipe(
        map((file) => ({
          id: reference.id,
          type: entity?.type ?? '',
          path: entity?.path ?? '',
          content: file.content,
        })),
      );
    });
    const entities$ = reads.length === 0 ? of<ResolvedToolEntity[]>([]) : forkJoin(reads);
    entities$
      .pipe(
        switchMap((entities) => this.api.execute(tool, { arguments: input.arguments, entities })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (done) => {
          if (generation !== this.generation) {
            this.running.set(false);
            return;
          }
          this.running.set(false);
          this.result.set(done);
        },
        error: (failure: unknown) => {
          this.running.set(false);
          if (generation === this.generation) {
            this.tryFailure.set(messageOf(failure));
          }
        },
      });
  }

  /** The names of every tool the library holds, built-in, user and invalid alike. */
  private takenNames(): Observable<ReadonlySet<string>> {
    return this.api.listTools().pipe(map((list) => new Set(list.tools.map((tool) => tool.name))));
  }

  /**
   * Starts a write. The generation moves on, so the live-lint answers for earlier edits are dropped,
   * and the page shows that it is saving.
   */
  private begin(): void {
    this.generation += 1;
    this.saving.set(true);
    this.failure.set(null);
    this.notice.set(null);
  }

  /** Ends a write that failed, and sends the draft to the live lint again, because its answers were dropped. */
  private fail(message: string): void {
    this.saving.set(false);
    this.failure.set(message);
    this.relint();
  }

  /** Sends the draft to the live lint, tagged with the current generation. */
  private relint(): void {
    this.edits.next({ text: this.draft(), generation: this.generation });
  }

  /** Writes the draft under `target`. An answer for an earlier generation changes nothing on the page. */
  private write(target: string, text: string, generation: number): void {
    const creating = this.isNew();
    this.api
      .save(target, text)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (done) => {
          this.saving.set(false);
          if (generation !== this.generation) {
            return;
          }
          this.diagnostics.set(done.lint.diagnostics);
          this.notice.set(`Saved ${target}.`);
          if (creating) {
            void this.router.navigate(['/tools', target]);
          } else {
            this.reload(target, text, generation);
          }
          this.relint();
        },
        error: (failure: unknown) => {
          this.saving.set(false);
          if (generation !== this.generation) {
            return;
          }
          this.diagnostics.set(lintRefusalOf(failure) ?? this.diagnostics());
          this.fail(messageOf(failure));
        },
      });
  }

  /** Opens the tool named in the URL, or a new tool when the URL names none. */
  private open(name: string | null): void {
    this.generation += 1;
    this.name.set(name);
    this.detail.set(null);
    this.customizing.set(false);
    this.confirming.set(null);
    this.comparing.set(false);
    this.compareBase.set(null);
    this.failure.set(null);
    this.lintFailure.set(null);
    this.notice.set(null);
    this.loadFailure.set(null);
    this.checked.set(null);
    this.result.set(null);
    this.tryFailure.set(null);
    this.liveViews.set(null);
    this.diagnostics.set([]);
    this.loadProject();
    if (name === null) {
      this.draft.set(NEW_TOOL_YAML);
      this.relint();
      return;
    }
    this.draft.set('');
    this.reload(name);
  }

  /**
   * Reads the tool again. The draft becomes the saved YAML only when it still holds `expectedDraft`,
   * the text the page expects it to hold. An edit made while the read was in flight is kept, and the
   * page says the saved tool changed. An answer for an earlier generation changes nothing.
   */
  private reload(
    name: string,
    expectedDraft: string = this.draft(),
    generation: number = this.generation,
  ): void {
    this.api
      .getTool(name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tool) => {
          if (generation !== this.generation) {
            return;
          }
          this.detail.set(tool);
          this.loadFailure.set(null);
          this.checked.set(null);
          this.result.set(null);
          this.confirming.set(null);
          if (this.draft() !== expectedDraft) {
            this.notice.set(`Saved changes to ${name} are in. Your unsaved edits are kept.`);
            return;
          }
          this.draft.set(tool.yaml);
          this.diagnostics.set(tool.lint.diagnostics);
          this.liveViews.set(null);
          this.relint();
        },
        error: (failure: unknown) => {
          if (generation === this.generation) {
            this.loadFailure.set(messageOf(failure));
          }
        },
      });
  }

  private loadProject(): void {
    loadProjectContext(this.api)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (context) => {
          this.project.set(context);
          // Arguments checked before the entities arrived describe a form that has since redrawn.
          this.checked.set(null);
        },
        error: () => this.project.set(NO_PROJECT),
      });
  }
}
