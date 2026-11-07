import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { installViewport, type ViewportControl } from '../../testing/viewport';
import { EditableMergeView } from './editable-merge-view';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

describe('EditableMergeView (spec #17 editor A8)', () => {
  let viewport: ViewportControl | undefined;
  let fixture: ComponentFixture<EditableMergeView> | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    viewport?.restore();
    viewport = undefined;
  });

  function render(base: string, proposed: string, size = DESKTOP): void {
    viewport = installViewport(size);
    fixture = TestBed.createComponent(EditableMergeView);
    fixture.componentRef.setInput('path', 'drafts/ch01.md');
    fixture.componentRef.setInput('base', base);
    fixture.componentRef.setInput('proposed', proposed);
    fixture.detectChanges();
  }

  function editors(): EditorView[] {
    const host = fixture?.nativeElement as HTMLElement;
    return Array.from(host.querySelectorAll<HTMLElement>('.cm-editor')).map((dom) => {
      const view = EditorView.findFromDOM(dom);
      if (view === null) {
        throw new Error('no EditorView for a merge editor');
      }
      return view;
    });
  }

  /** Records what the component emits, in order. */
  function emitted(): string[] {
    const texts: string[] = [];
    fixture?.componentInstance.proposedChange.subscribe((text) => texts.push(text));
    return texts;
  }

  it('does not emit anything on its own', () => {
    render('alpha\nbeta\n', 'alpha\nBETA\n');
    const texts = emitted();

    expect(texts).toEqual([]);
  });

  it('the proposed side is editable and emits the edited text', () => {
    render('alpha\nbeta\n', 'alpha\nBETA\n');
    const texts = emitted();
    const proposed = editors()[1];
    if (proposed === undefined) {
      throw new Error('the proposed side is missing');
    }

    proposed.dispatch({ changes: { from: proposed.state.doc.length, insert: 'X' } });

    expect(texts).toEqual(['alpha\nBETA\nX']);
  });

  it('keeps CRLF in the emitted text of a CRLF proposal', () => {
    render('alpha\nbeta\n', 'alpha\r\nBETA\r\n');
    const texts = emitted();
    const proposed = editors()[1];
    if (proposed === undefined) {
      throw new Error('the proposed side is missing');
    }

    proposed.dispatch({ changes: { from: proposed.state.doc.line(2).to, insert: 'X' } });

    expect(texts).toEqual(['alpha\r\nBETAX\r\n']);
  });

  it('the base side stays read-only', () => {
    render('alpha\nbeta\n', 'alpha\nBETA\n');

    const base = editors()[0];
    expect(base?.dom.querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false');
  });

  it('on a phone the unified view is editable and emits the edited text', () => {
    render('alpha\nbeta\n', 'alpha\nBETA\n', PHONE);
    const texts = emitted();
    const only = editors()[0];
    if (only === undefined) {
      throw new Error('the unified editor is missing');
    }

    only.dispatch({ changes: { from: only.state.doc.length, insert: 'X' } });

    expect(texts).toEqual(['alpha\nBETA\nX']);
  });
});
