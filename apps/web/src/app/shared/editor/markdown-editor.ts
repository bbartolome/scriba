import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import type { CanDeactivateFn } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import type { FileReadResult, FileReference } from '@bbartolome/scriba-contracts/project-store';
import { ApiError, DeviceClassService } from '../../shell';
import { MarkdownPreviewView } from '../preview/markdown-preview-view';
import { EditorFileApi } from './file-api';
import { documentText, loadDocument } from './markdown-document';
import { type SaveState, SaveController, type WriteOutcome } from './save-controller';

/** What the leave guard asks of the routed component. The editor implements it. */
export interface HasUnsavedText {
  confirmLeave(): Promise<boolean>;
}

/**
 * A route guard for the editor's route. It prompts before leaving with unsaved text. Confirming saves
 * the text, and leaves only when the save succeeds. A failed or conflicting save keeps the user on the
 * route, so no text is lost (spec #17 editor A3 and A5).
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedText> = (component) =>
  component.confirmLeave();

/** The prompt shown before leaving with unsaved text. [proposed] copy, pending a presentation review. */
const LEAVE_PROMPT = 'You have unsaved changes. Save them and leave?';

const STATUS_LABELS: Readonly<Record<SaveState, string>> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  failed: 'Not saved. Try again.',
  conflict: 'The file changed on disk. Not saved.',
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The request failed.';
}

/** Lets the document be edited, or not. A read-only editor takes no user edits. */
function editability(readOnly: boolean): Extension[] {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}

/**
 * The Markdown editor for one project file (spec #17 editor; survey 17 §4). It loads the file through
 * the file API, keeps its line separator, and saves through the same API with the base hash it read.
 *
 * The layout is a split view with a live preview on a tablet or desktop, and an edit and preview
 * toggle on a phone. Saves run on an idle timer, on the Save button, on Ctrl or Cmd with S, and on
 * blur. A conflict or a failure keeps the text and shows its state.
 *
 * PROVISIONAL (survey 17 item O6): this editor is Markdown only. #21 uses its own YAML instance.
 * PROVISIONAL (survey 17 item O1): the phone toggle includes Edit, as spec A6 says. #20 must allow
 * the editor on phones for that to be reachable.
 */
@Component({
  selector: 'app-markdown-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarkdownPreviewView],
  template: `
    <div class="bar">
      <span class="path">{{ reference().path }}</span>
      <span class="status" role="status" [attr.data-save-state]="saveState()">{{
        statusLabel()
      }}</span>
      <button type="button" (click)="saveNow()" [disabled]="readOnly() || loading()">Save</button>
    </div>
    @if (error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }
    @if (layout() === 'toggle') {
      <div class="toggle" role="group" aria-label="Pane">
        <button type="button" [attr.aria-pressed]="pane() === 'edit'" (click)="pane.set('edit')">
          Edit
        </button>
        <button
          type="button"
          [attr.aria-pressed]="pane() === 'preview'"
          (click)="pane.set('preview')"
        >
          Preview
        </button>
      </div>
    }
    <div class="panes" [attr.data-layout]="layout()">
      <div class="edit" [hidden]="layout() === 'toggle' && pane() !== 'edit'">
        <div class="cm-host" #host></div>
      </div>
      <div class="preview" [hidden]="layout() === 'toggle' && pane() !== 'preview'">
        <app-markdown-preview [draft]="text()" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      font: var(--mat-sys-label-large);
    }
    .path {
      flex: 1 1 auto;
      overflow-wrap: anywhere;
    }
    .status {
      color: var(--mat-sys-on-surface-variant);
    }
    .status[data-save-state='failed'],
    .status[data-save-state='conflict'],
    .error {
      color: var(--mat-sys-error);
    }
    .toggle {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .panes {
      margin-top: 8px;
    }
    .panes[data-layout='split'] {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
    }
    .edit,
    .preview {
      min-width: 0;
    }
    :host .cm-editor {
      min-height: 12rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 4px;
    }
  `,
})
export class MarkdownEditor implements OnDestroy {
  /** The file to edit: its project and its project-relative path. Every request names both. */
  readonly reference = input.required<FileReference>();
  /** A read-only editor shows the text and takes no edits or saves. */
  readonly readOnly = input(false);

  /** Emits each save state as it changes. */
  readonly saveStateChange = output<SaveState>();
  /** Emits whether the text differs from the last saved text. */
  readonly dirtyChange = output<boolean>();

  protected readonly saveState = signal<SaveState>('saved');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly text = signal('');
  protected readonly pane = signal<'edit' | 'preview'>('edit');
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.saveState()]);

  private readonly api = inject(EditorFileApi);
  private readonly device = inject(DeviceClassService).current;
  protected readonly layout = computed(() => (this.device() === 'phone' ? 'toggle' : 'split'));
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly editable = new Compartment();

  private view: EditorView | undefined;
  private controller: SaveController | undefined;

  constructor() {
    window.addEventListener('beforeunload', this.onBeforeUnload);

    effect((onCleanup) => {
      const { projectId, path } = this.reference();
      const subscription = this.api.read(projectId, path).subscribe({
        next: (file) => untracked(() => this.open(projectId, path, file)),
        error: (error: unknown) => untracked(() => this.error.set(messageOf(error))),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const readOnly = this.readOnly();
      untracked(() => {
        this.view?.dispatch({ effects: this.editable.reconfigure(editability(readOnly)) });
      });
    });
  }

  /** Saves now. The Save button, and Ctrl or Cmd with S, call this. */
  saveNow(): void {
    void this.controller?.saveNow();
  }

  /**
   * The leave check. With no unsaved text the route may go. Otherwise the user is asked first, and
   * confirming saves. The route may go only when that save succeeds.
   */
  async confirmLeave(): Promise<boolean> {
    const controller = this.controller;
    if (controller === undefined || !controller.dirty) {
      return true;
    }
    if (!window.confirm(LEAVE_PROMPT)) {
      return false;
    }
    await controller.flush();
    return !controller.dirty && controller.state === 'saved';
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    if (this.controller?.dirty) {
      void this.controller.flush();
    }
    this.controller?.dispose();
    this.view?.destroy();
    this.view = undefined;
    this.controller = undefined;
  }

  /** Warns the browser before the tab closes with unsaved text. */
  private readonly onBeforeUnload = (event: Event): void => {
    if (this.controller?.dirty) {
      event.preventDefault();
      (event as BeforeUnloadEvent).returnValue = '';
    }
  };

  private open(projectId: string, path: string, file: FileReadResult): void {
    this.controller?.dispose();
    this.view?.destroy();
    this.error.set(undefined);
    this.loading.set(false);
    this.text.set(file.content);

    const controller = new SaveController({
      text: file.content,
      hash: file.hash,
      write: (content, baseHash) => this.writeOutcome(projectId, path, content, baseHash),
      onState: (state) => {
        this.saveState.set(state);
        this.saveStateChange.emit(state);
      },
    });
    this.controller = controller;

    this.view = new EditorView({
      parent: this.host().nativeElement,
      state: loadDocument(file.content, [
        history(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': 'Markdown text' }),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              this.saveNow();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        this.editable.of(editability(this.readOnly())),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = documentText(update.state);
            this.text.set(next);
            controller.edit(next);
            this.dirtyChange.emit(controller.dirty);
          }
          if (update.focusChanged && !update.view.hasFocus) {
            void controller.flush();
          }
        }),
      ]),
    });
  }

  /** One write through the file API, as a save outcome. A precondition failure is a conflict. */
  private async writeOutcome(
    projectId: string,
    path: string,
    content: string,
    baseHash: string,
  ): Promise<WriteOutcome> {
    try {
      const result = await lastValueFrom(this.api.write(projectId, { path, content, baseHash }));
      this.error.set(undefined);
      return { kind: 'saved', hash: result.hash };
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PROJECT_WRITE_CONFLICT') {
        this.error.set(undefined);
        return { kind: 'conflict' };
      }
      const message = messageOf(error);
      this.error.set(message);
      return { kind: 'failed', message };
    }
  }
}
