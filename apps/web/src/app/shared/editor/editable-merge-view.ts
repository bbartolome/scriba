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
  untracked,
  viewChild,
} from '@angular/core';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DeviceClassService } from '../../shell/device/device-class';
import {
  dominantLineSeparator,
  documentExtensions,
  documentText,
  loadDocument,
} from './markdown-document';

type Mode = 'unified' | 'side-by-side';

/**
 * A merge view whose proposed side is editable (spec #17 editor A8). The base side is read-only. Each
 * edit to the proposed side emits the whole edited text, with each line's separator kept, so the
 * caller can save it or pass it on.
 *
 * It is side by side on a tablet or desktop and unified on a phone. A device-class change keeps the
 * text the user has typed. A new `proposed` input replaces it. The read-only diff in `shared/diff` is
 * a separate component, and it is unchanged.
 */
@Component({
  selector: 'app-editable-merge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <span class="path">{{ path() }}</span>
    </div>
    <div class="host" [attr.data-mode]="mode()" #host></div>
  `,
  styles: `
    .bar {
      font: var(--mat-sys-label-large);
    }
    .path {
      overflow-wrap: anywhere;
    }
    .host {
      margin-top: 8px;
    }
  `,
})
export class EditableMergeView implements OnDestroy {
  /** The file the change is for. It labels the view. */
  readonly path = input.required<string>();
  /** The text the change is against. It is read-only. */
  readonly base = input.required<string>();
  /** The proposed text. It is editable, and each edit emits `proposedChange`. */
  readonly proposed = input.required<string>();

  /** The whole edited proposed text, after each edit. */
  readonly proposedChange = output<string>();

  private readonly device = inject(DeviceClassService).current;
  protected readonly mode = computed<Mode>(() =>
    this.device() === 'phone' ? 'unified' : 'side-by-side',
  );
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');

  private view: EditorView | MergeView | undefined;
  private builtBase: string | undefined;
  private builtMode: Mode | undefined;
  private lastInput: string | undefined;
  private latest: string | undefined;

  constructor() {
    effect(() => {
      const base = this.base();
      const input = this.proposed();
      const mode = this.mode();
      untracked(() => {
        // An echo of the text this view just emitted is not a new input, so the view is not rebuilt.
        const inputChanged = input !== this.lastInput && input !== this.latest;
        this.lastInput = input;
        if (
          this.view !== undefined &&
          !inputChanged &&
          base === this.builtBase &&
          mode === this.builtMode
        ) {
          return;
        }
        const text = inputChanged || this.latest === undefined ? input : this.latest;
        this.build(base, text, mode);
      });
    });
  }

  ngOnDestroy(): void {
    this.destroyView();
  }

  private build(base: string, proposed: string, mode: Mode): void {
    this.destroyView();
    this.latest = proposed;
    this.builtBase = base;
    this.builtMode = mode;

    const element = this.host().nativeElement;
    const emit = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const next = documentText(update.state);
        this.latest = next;
        this.proposedChange.emit(next);
      }
    });

    if (mode === 'side-by-side') {
      this.view = new MergeView({
        parent: element,
        gutter: true,
        highlightChanges: true,
        a: {
          doc: base,
          extensions: [
            ...documentExtensions(base),
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ],
        },
        b: { doc: proposed, extensions: [...documentExtensions(proposed), emit] },
      });
      return;
    }

    this.view = new EditorView({
      parent: element,
      state: loadDocument(proposed, [
        emit,
        unifiedMergeView({
          original: Text.of(base.split(dominantLineSeparator(base))),
          gutter: true,
          mergeControls: false,
        }),
      ]),
    });
  }

  private destroyView(): void {
    this.view?.destroy();
    this.view = undefined;
  }
}
