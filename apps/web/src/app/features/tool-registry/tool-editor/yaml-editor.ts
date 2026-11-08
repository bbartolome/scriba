import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { type Diagnostic, lintGutter, setDiagnostics } from '@codemirror/lint';
import { Compartment, EditorState, type Extension, type Text } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import type { LintDiagnostic } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * Maps a lint position (1-based line and column) to a document range. A position past the end of
 * the document is clamped to it, so a stale diagnostic never throws.
 */
export function toCodeMirrorDiagnostics(
  doc: Text,
  diagnostics: readonly LintDiagnostic[],
): Diagnostic[] {
  return diagnostics.map((diagnostic) => {
    const lineNumber = Math.min(Math.max(diagnostic.line, 1), doc.lines);
    const line = doc.line(lineNumber);
    const from = Math.min(line.from + Math.max(diagnostic.column - 1, 0), line.to);
    return {
      from,
      to: Math.max(line.to, from),
      severity: diagnostic.severity === 'error' ? 'error' : 'warning',
      message: `${diagnostic.rule}: ${diagnostic.message}`,
      source: 'tool spec',
    };
  });
}

/**
 * The Tool registry's own CodeMirror 6 YAML editor (survey 21 §7 item 9, option (a)). It keeps its
 * own instance, because the registry saves through its own PUT. Diagnostics come in as lint results
 * and draw in the gutter and on their lines. A read-only editor shows a built-in before Customize.
 *
 * Text that the page sets from outside starts a fresh editor state. Its undo history is empty, so
 * Ctrl+Z cannot bring back another tool's text, and the change is not reported back as typing.
 */
// provisional: survey 21 §7 item 9
@Component({
  selector: 'app-yaml-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: block;
    }
    .host {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 0.75rem;
      overflow: hidden;
      background: var(--mat-sys-surface);
    }
  `,
  template: `<div #host class="host" data-testid="yaml-editor"></div>`,
})
export class YamlEditor implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('host');

  /** The text to show. A change from outside replaces the document; typing does not loop back. */
  readonly text = input.required<string>();
  readonly diagnostics = input<readonly LintDiagnostic[]>([]);
  readonly readOnly = input(false);
  /** Emits the full text after each edit a person makes. */
  readonly textChange = output<string>();

  private view: EditorView | undefined;
  private readonly editable = new Compartment();

  constructor() {
    effect(() => {
      const next = this.text();
      const view = untracked(() => this.view);
      if (view !== undefined && view.state.doc.toString() !== next) {
        view.setState(
          EditorState.create({ doc: next, extensions: untracked(() => this.extensions()) }),
        );
      }
    });
    effect(() => {
      const readOnly = this.readOnly();
      this.view?.dispatch({
        effects: this.editable.reconfigure(this.editableExtensions(readOnly)),
      });
    });
    effect(() => {
      const diagnostics = this.diagnostics();
      const view = this.view;
      if (view !== undefined) {
        view.dispatch(
          setDiagnostics(view.state, toCodeMirrorDiagnostics(view.state.doc, diagnostics)),
        );
      }
    });
  }

  ngAfterViewInit(): void {
    const view = new EditorView({
      parent: this.hostRef().nativeElement,
      state: EditorState.create({
        doc: untracked(() => this.text()),
        extensions: untracked(() => this.extensions()),
      }),
    });
    this.view = view;
    this.destroyRef.onDestroy(() => view.destroy());
    view.dispatch(
      setDiagnostics(
        view.state,
        toCodeMirrorDiagnostics(
          view.state.doc,
          untracked(() => this.diagnostics()),
        ),
      ),
    );
  }

  /** The editor's extensions, with the read-only state as it is now. */
  private extensions(): Extension[] {
    return [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      yaml(),
      lintGutter(),
      EditorView.lineWrapping,
      EditorView.theme({
        '&': { minHeight: '16rem' },
        '&.cm-focused': { outline: '2px solid var(--mat-sys-primary)' },
      }),
      this.editable.of(this.editableExtensions(this.readOnly())),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          this.textChange.emit(update.state.doc.toString());
        }
      }),
    ];
  }

  private editableExtensions(readOnly: boolean): Extension[] {
    return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
  }
}
