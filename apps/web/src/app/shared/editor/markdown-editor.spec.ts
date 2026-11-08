import { Component, viewChild } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { Router, provideRouter, type Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { FakeFileApi, fakeHash, provideFakeFileApi } from '../../testing/fake-file-api';
import { installViewport, type ViewportControl } from '../../testing/viewport';
import { ROUND_TRIP_FIXTURES } from './fixtures';
import { IDLE_SAVE_MS } from './save-controller';
import { MarkdownEditor, unsavedChangesGuard } from './markdown-editor';

const PROJECT = 'book';
const PATH = 'drafts/ch01.md';
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1280, height: 800 };
const MIXED = ROUND_TRIP_FIXTURES['mixed endings'] ?? '';

/** Lets the chained promises (the write, the state change) run to the next visible state. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) {
    await Promise.resolve();
  }
}

describe('MarkdownEditor', () => {
  let api: FakeFileApi;
  let fixture: ComponentFixture<MarkdownEditor> | undefined;
  let viewport: ViewportControl | undefined;

  beforeEach(() => {
    api = new FakeFileApi();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeFileApi(api)],
    });
  });

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    viewport?.restore();
    viewport = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Renders the editor on a viewport over a file the project already has. */
  async function render(raw: string, size = DESKTOP, readOnly = false): Promise<void> {
    viewport = installViewport(size);
    api.seed(PROJECT, PATH, raw);
    fixture = TestBed.createComponent(MarkdownEditor);
    fixture.componentRef.setInput('reference', { projectId: PROJECT, path: PATH });
    fixture.componentRef.setInput('readOnly', readOnly);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  }

  function element(): HTMLElement {
    return (fixture as ComponentFixture<MarkdownEditor>).nativeElement as HTMLElement;
  }

  function editorView(): EditorView {
    const dom = element().querySelector<HTMLElement>('.cm-editor');
    if (dom === null) {
      throw new Error('the editor has not been created');
    }
    const view = EditorView.findFromDOM(dom);
    if (view === null) {
      throw new Error('no EditorView for the editor element');
    }
    return view;
  }

  /** A user edit, as an insertion at a position. It goes through the editor's update listener. */
  function insertAt(position: number, text: string): void {
    editorView().dispatch({ changes: { from: position, insert: text } });
  }

  function typeAtEnd(text: string): void {
    insertAt(editorView().state.doc.length, text);
    fixture?.detectChanges();
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(element().querySelectorAll('button')).find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (found === undefined) {
      throw new Error(`no button labelled ${label}`);
    }
    return found;
  }

  function saveStatus(): string {
    return element().querySelector('[data-save-state]')?.getAttribute('data-save-state') ?? '';
  }

  function savedText(): string | undefined {
    return api.contentOf(PROJECT, PATH);
  }

  describe('round trip through the fake file API (spec #17 editor A1)', () => {
    // The mixed-endings fixture comes first, as survey 17 §3 `phase:editor` asks. It is red until the
    // editor loads with the dominant separator and saves with sliceDoc.
    for (const [name, raw] of Object.entries(ROUND_TRIP_FIXTURES)) {
      it(`saves ${name} with no edits byte for byte`, async () => {
        await render(raw);

        button('Save').click();
        await settle();

        expect(api.writes).toHaveLength(1);
        expect(JSON.stringify(api.writes[0]?.content)).toBe(JSON.stringify(raw));
        expect(api.writes[0]?.baseHash).toBe(fakeHash(raw));
        expect(savedText()).toBe(raw);
      });
    }

    it('keeps the mixed endings after the editor loads them', async () => {
      await render(MIXED);

      expect(JSON.stringify(editorView().state.sliceDoc())).toBe(JSON.stringify(MIXED));
    });
  });

  describe('a targeted edit (spec #17 editor A2)', () => {
    it('changes only the edited range in a mixed-endings file', async () => {
      await render('alpha\r\nbeta\ngamma\r\n');
      const end = editorView().state.doc.line(2).to;

      insertAt(end, 'X');
      button('Save').click();
      await settle();

      expect(api.writes[0]?.content).toBe('alpha\r\nbeta\ngammaX\r\n');
    });
  });

  describe('save timing (spec #17 editor A3)', () => {
    it('saves once, about 1.5 s after the last edit', async () => {
      vi.useFakeTimers();
      await render('alpha\n');

      typeAtEnd('one');
      vi.advanceTimersByTime(IDLE_SAVE_MS - 1);
      expect(api.writes).toHaveLength(0);

      vi.advanceTimersByTime(1);
      await settle();
      expect(api.writes).toHaveLength(1);
      expect(api.writes[0]?.content).toBe('alpha\none');
    });

    it('the Save button saves at once, with no key pressed', async () => {
      vi.useFakeTimers();
      await render('alpha\n');

      typeAtEnd('one');
      button('Save').click();
      await settle();

      expect(api.writes).toHaveLength(1);
      expect(api.writes[0]?.content).toBe('alpha\none');
    });

    it('Ctrl-S saves at once', async () => {
      vi.useFakeTimers();
      await render('alpha\n');

      typeAtEnd('one');
      element()
        .querySelector('.cm-content')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
      await settle();

      expect(api.writes).toHaveLength(1);
      expect(api.writes[0]?.content).toBe('alpha\none');
    });

    it('blur saves unsaved text, and a blur with no edits writes nothing', async () => {
      await render('alpha\n');
      // CodeMirror reports a focus change about 10 ms after the DOM event, so the test waits for it.
      const afterFocusChange = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

      editorView().focus();
      editorView().contentDOM.blur();
      await afterFocusChange();
      await settle();
      expect(api.writes).toHaveLength(0);

      editorView().focus();
      typeAtEnd('one');
      editorView().contentDOM.blur();
      await afterFocusChange();
      await settle();
      expect(api.writes).toHaveLength(1);
      expect(api.writes[0]?.content).toBe('alpha\none');
    });

    it('saves requested during an in-flight save coalesce into one follow-up', async () => {
      await render('alpha\n');
      api.holdWrites();

      button('Save').click();
      typeAtEnd('one');
      button('Save').click();
      button('Save').click();
      expect(api.writes).toHaveLength(1);

      api.releaseWrites();
      await settle();
      expect(api.writes).toHaveLength(2);
      expect(api.writes[1]?.content).toBe('alpha\none');
    });
  });

  describe('save states (spec #17 editor A4)', () => {
    it('moves unsaved, saving, saved in the status line', async () => {
      await render('alpha\n');
      expect(saveStatus()).toBe('saved');

      api.holdWrites();
      typeAtEnd('one');
      fixture?.detectChanges();
      expect(saveStatus()).toBe('unsaved');

      button('Save').click();
      fixture?.detectChanges();
      expect(saveStatus()).toBe('saving');

      api.releaseWrites();
      await settle();
      fixture?.detectChanges();
      expect(saveStatus()).toBe('saved');
    });

    it('a failed write shows failed and keeps the text in the editor', async () => {
      await render('alpha\n');

      typeAtEnd('one');
      api.failNextWrite();
      button('Save').click();
      await settle();
      fixture?.detectChanges();

      expect(saveStatus()).toBe('failed');
      expect(editorView().state.sliceDoc()).toBe('alpha\none');
      expect(savedText()).toBe('alpha\n');
    });

    it('a precondition failure shows conflict and does not overwrite the file', async () => {
      await render('alpha\n');

      api.externalWrite(PROJECT, PATH, 'changed elsewhere\n');
      typeAtEnd('one');
      button('Save').click();
      await settle();
      fixture?.detectChanges();

      expect(saveStatus()).toBe('conflict');
      expect(savedText()).toBe('changed elsewhere\n');
      expect(editorView().state.sliceDoc()).toBe('alpha\none');
    });
  });

  describe('leaving with unsaved text (spec #17 editor A5)', () => {
    it('beforeunload asks only while the text is unsaved', async () => {
      await render('alpha\n');

      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      typeAtEnd('one');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });
  });

  describe('layout (spec #17 editor A6)', () => {
    it('shows the split view with a live preview on a tablet', async () => {
      await render('alpha\n', TABLET);

      expect(element().querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('split');
      expect(element().querySelector('app-markdown-preview')).not.toBeNull();
      expect(element().querySelector('.toggle')).toBeNull();
    });

    it('shows the split view on a desktop, and the preview follows the text', async () => {
      await render('alpha\n', DESKTOP);

      typeAtEnd('live words');
      await settle();
      fixture?.detectChanges();

      expect(element().querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('split');
      expect(element().querySelector('app-markdown-preview')?.textContent).toContain('live words');
    });

    it('shows the edit and preview toggle on a phone, not the split view', async () => {
      await render('alpha\n', PHONE);

      expect(element().querySelector('[data-layout]')?.getAttribute('data-layout')).toBe('toggle');
      const edit = element().querySelector<HTMLElement>('.edit');
      const preview = element().querySelector<HTMLElement>('.preview');
      expect(edit?.hidden).toBe(false);
      expect(preview?.hidden).toBe(true);

      button('Preview').click();
      fixture?.detectChanges();
      expect(edit?.hidden).toBe(true);
      expect(preview?.hidden).toBe(false);
    });
  });

  describe('read-only mode', () => {
    it('a read-only editor takes no edits from the user', async () => {
      await render('alpha\n', DESKTOP, true);

      expect(element().querySelector('.cm-content')?.getAttribute('contenteditable')).toBe('false');
    });
  });
});

/** A route host that exposes the editor's leave check, as a feature's routed component would. */
@Component({
  selector: 'app-editor-route',
  imports: [MarkdownEditor],
  template: `<app-markdown-editor [reference]="reference" />`,
})
class EditorRoute {
  protected readonly reference = { projectId: PROJECT, path: PATH };
  private readonly editor = viewChild.required(MarkdownEditor);

  confirmLeave(): Promise<boolean> {
    return this.editor().confirmLeave();
  }
}

@Component({ selector: 'app-blank-route', template: `<p>elsewhere</p>` })
class BlankRoute {}

const ROUTES: Routes = [
  { path: 'draft', component: EditorRoute, canDeactivate: [unsavedChangesGuard] },
  { path: 'other', component: BlankRoute },
];

describe('leaving the editor route (spec #17 editor A5)', () => {
  let api: FakeFileApi;
  let viewport: ViewportControl | undefined;

  beforeEach(() => {
    api = new FakeFileApi();
    api.seed(PROJECT, PATH, 'alpha\n');
    viewport = installViewport(DESKTOP);
    TestBed.configureTestingModule({
      providers: [provideRouter(ROUTES), provideFakeFileApi(api)],
    });
  });

  afterEach(() => {
    viewport?.restore();
    viewport = undefined;
    vi.restoreAllMocks();
  });

  async function openDraft(): Promise<{ host: EditorRoute; harness: RouterTestingHarness }> {
    const harness = await RouterTestingHarness.create();
    const host = await harness.navigateByUrl('/draft', EditorRoute);
    await settle();
    harness.fixture.detectChanges();
    return { host, harness };
  }

  function typeInDraft(harness: RouterTestingHarness, text: string): void {
    const dom = harness.routeNativeElement?.querySelector<HTMLElement>('.cm-editor');
    const view = dom ? EditorView.findFromDOM(dom) : null;
    if (view === null || view === undefined) {
      throw new Error('the draft editor is not on the page');
    }
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
  }

  it('prompts first, and cancelling stays on the route and writes nothing', async () => {
    const { harness } = await openDraft();
    typeInDraft(harness, 'one');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const router = TestBed.inject(Router);
    const left = await router.navigateByUrl('/other');

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(left).toBe(false);
    expect(router.url).toBe('/draft');
    expect(api.writes).toHaveLength(0);
  });

  it('confirming saves the text, then leaves', async () => {
    const { harness } = await openDraft();
    typeInDraft(harness, 'one');
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const router = TestBed.inject(Router);
    const left = await router.navigateByUrl('/other');
    await settle();

    expect(left).toBe(true);
    expect(api.writes).toHaveLength(1);
    expect(api.contentOf(PROJECT, PATH)).toBe('alpha\none');
    expect(router.url).toBe('/other');
  });

  it('a failed save on leave keeps the user on the route', async () => {
    const { harness } = await openDraft();
    typeInDraft(harness, 'one');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.failNextWrite();

    const router = TestBed.inject(Router);
    const left = await router.navigateByUrl('/other');
    await settle();

    expect(left).toBe(false);
    expect(router.url).toBe('/draft');
  });

  it('leaving with no unsaved text does not prompt', async () => {
    await openDraft();
    const confirm = vi.spyOn(window, 'confirm');

    const left = await TestBed.inject(Router).navigateByUrl('/other');

    expect(left).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
