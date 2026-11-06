import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter } from '@codemirror/view';
import { DeviceClassService } from '../../shell/device/device-class';
import { endingChangedLines, splitLineEndings } from './line-endings';

export type DiffMode = 'unified' | 'side-by-side';

/** The glyph in the gutter for a line whose ending changed. It is a marker, not a text edit. */
class LineEndingMarker extends GutterMarker {
  override toDOM(): HTMLElement {
    const mark = document.createElement('span');
    mark.className = 'eol-marker';
    mark.textContent = '↵';
    mark.title = 'Line ending changed';
    mark.setAttribute('aria-label', 'Line ending changed');
    return mark;
  }
}

const LINE_ENDING_MARKER = new LineEndingMarker();

/** A gutter that marks the given line numbers, and no others. */
function lineEndingGutter(lines: ReadonlySet<number>): Extension {
  return gutter({
    class: 'cm-eol-gutter',
    lineMarker(view, line) {
      return lines.has(view.state.doc.lineAt(line.from).number) ? LINE_ENDING_MARKER : null;
    },
  });
}

/**
 * A read-only diff of a draft. Each side's text has its carriage returns removed, because
 * CodeMirror treats LF and CRLF as the same text. The line-ending change is marked in the gutter
 * instead, so an LF-to-CRLF edit still shows (shared-components A3).
 *
 * The view is side by side on a tablet or desktop and unified on a phone. A toggle changes it.
 * Identical inputs show "No changes" and build no editor.
 */
@Component({
  selector: 'app-read-only-diff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (conflict()) {
      <p class="conflict" role="status">The file changed since this draft was read.</p>
    }
    @if (unchanged()) {
      <p class="same">No changes</p>
    } @else {
      <div class="bar">
        <span class="path">{{ path() }}</span>
        <button type="button" class="mode" (click)="toggleMode()">
          {{ mode() === 'unified' ? 'Side by side' : 'Unified' }}
        </button>
      </div>
      <div class="host" [attr.data-mode]="mode()" #host></div>
    }
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font: var(--mat-sys-label-large);
    }
    .path {
      overflow-wrap: anywhere;
    }
    .host {
      margin-top: 8px;
    }
    .eol-marker {
      color: var(--mat-sys-tertiary);
      font: var(--mat-sys-label-small);
    }
    .conflict {
      color: var(--mat-sys-error);
    }
  `,
})
export class ReadOnlyDiffView {
  readonly path = input.required<string>();
  readonly base = input.required<string>();
  readonly proposed = input.required<string>();
  readonly conflict = input(false);

  private readonly device = inject(DeviceClassService).current;
  private readonly override = signal<DiffMode | undefined>(undefined);
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  protected readonly mode = computed<DiffMode>(
    () => this.override() ?? (this.device() === 'phone' ? 'unified' : 'side-by-side'),
  );
  protected readonly unchanged = computed(() => this.base() === this.proposed());

  private editor: EditorView | MergeView | undefined;

  constructor() {
    effect((onCleanup) => {
      const element = this.host()?.nativeElement;
      const base = this.base();
      const proposed = this.proposed();
      const mode = this.mode();
      if (element === undefined || base === proposed) {
        return;
      }
      this.editor = buildDiff(element, base, proposed, mode);
      onCleanup(() => {
        this.editor?.destroy();
        this.editor = undefined;
      });
    });
  }

  protected toggleMode(): void {
    this.override.set(this.mode() === 'unified' ? 'side-by-side' : 'unified');
  }
}

/** Builds the diff editor for one mode. The returned view is destroyed when the inputs change. */
function buildDiff(
  parent: HTMLElement,
  base: string,
  proposed: string,
  mode: DiffMode,
): EditorView | MergeView {
  const before = splitLineEndings(base);
  const after = splitLineEndings(proposed);
  const changed = new Set(endingChangedLines(before.endings, after.endings));
  const readOnly: Extension[] = [EditorState.readOnly.of(true), EditorView.editable.of(false)];
  const marks = lineEndingGutter(changed);

  if (mode === 'side-by-side') {
    return new MergeView({
      parent,
      gutter: true,
      highlightChanges: true,
      a: { doc: before.text, extensions: [...readOnly, marks] },
      b: { doc: after.text, extensions: [...readOnly, marks] },
    });
  }
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: after.text,
      extensions: [
        ...readOnly,
        marks,
        unifiedMergeView({ original: before.text, gutter: true, mergeControls: false }),
      ],
    }),
  });
}
