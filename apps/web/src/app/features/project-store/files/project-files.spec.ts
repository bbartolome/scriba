import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { installViewport, type ViewportControl } from '../../../testing/viewport';
import { ProjectFilesPage } from './project-files.page';

const LIST = '/api/project-store/projects';
const FILES = '/api/project-store/projects/book/files?recursive=true';
const READ = '/api/project-store/projects/book/files/read?path=drafts%2Fch01.md';
const WRITE = '/api/project-store/projects/book/files/write';
const VERSIONS = '/api/project-store/projects/book/versions?draftPath=drafts%2Fch01.md';
const MTIME = '2026-11-06T12:00:00.000Z';
const HASH = 'a'.repeat(64);
const SAVED = 'b'.repeat(64);

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/**
 * The files view for the active project (survey 20 §3 phase:pending-review): desktop and tablet edit a draft with a
 * base-checked save and a stale-base warning, and a phone reads it. A top-level draft lists its saved versions.
 */
describe('project files page', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ProjectFilesPage>;
  let viewport: ViewportControl;

  function settle(): void {
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return host().textContent.replace(/\s+/g, ' ');
  }

  async function settled(): Promise<void> {
    await fixture.whenStable();
    settle();
    await fixture.whenStable();
    settle();
  }

  function activeProject(): void {
    api.reply('GET', LIST, 200, {
      projects: [
        {
          id: 'book',
          active: true,
          status: 'ok',
          title: 'Book',
          genrePack: 'nonfiction',
          schemaVersion: 1,
        },
      ],
    });
    api.reply('GET', FILES, 200, {
      entries: [
        { path: 'drafts', kind: 'dir', size: 0, mtime: MTIME },
        { path: 'drafts/ch01.md', kind: 'file', size: 24, mtime: MTIME },
      ],
    });
  }

  function openDraft(): void {
    api.reply('GET', READ, 200, {
      path: 'drafts/ch01.md',
      content: '# Chapter one\n\nDraft text.\n',
      hash: HASH,
      mtime: MTIME,
    });
    api.reply('GET', VERSIONS, 200, {
      draftPath: 'drafts/ch01.md',
      versions: [{ id: '20261104T231500123Z', createdAt: MTIME, size: 17 }],
    });
  }

  async function clickDraft(): Promise<void> {
    const open = Array.from(host().querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'ch01.md',
    );
    open?.click();
    await settled();
  }

  function editor(): HTMLTextAreaElement | null {
    return host().querySelector<HTMLTextAreaElement>('textarea.editor');
  }

  function saveButton(): HTMLButtonElement | undefined {
    return Array.from(host().querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Save',
    );
  }

  beforeEach(() => {
    viewport = installViewport(DESKTOP);
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(api)],
    });
    fixture = TestBed.createComponent(ProjectFilesPage);
  });

  afterEach(() => {
    viewport.restore();
  });

  it('does not browse a project that is not the active one, and offers to activate it', async () => {
    api.reply('GET', LIST, 200, {
      projects: [
        { id: 'other', active: true, status: 'ok' },
        { id: 'book', active: false, status: 'ok' },
      ],
    });
    fixture.componentRef.setInput('projectId', 'book');
    settle();
    await settled();

    expect(text()).toContain('book is not the active project.');
    expect(api.requests.some((request) => request.path.includes('/files'))).toBe(false);
  });

  it('on desktop, opens a draft in the editor and lists its saved versions', async () => {
    activeProject();
    openDraft();
    fixture.componentRef.setInput('projectId', 'book');
    settle();
    await settled();
    await clickDraft();

    expect(text()).toContain('drafts/');
    expect(editor()?.value).toBe('# Chapter one\n\nDraft text.\n');
    expect(host().querySelector('.versions')?.textContent).toContain(MTIME);
    expect(saveButton()?.disabled).toBe(true);
  });

  it('saves the edited text with the base the file was read at, and clears the dirty state', async () => {
    activeProject();
    openDraft();
    api.reply('POST', WRITE, 200, { path: 'drafts/ch01.md', hash: SAVED, mtime: MTIME });
    fixture.componentRef.setInput('projectId', 'book');
    settle();
    await settled();
    await clickDraft();

    const field = editor();
    if (field === null) {
      throw new Error('the editor is not on the page');
    }
    field.value = '# Chapter one\n\nEdited text.\n';
    field.dispatchEvent(new Event('input'));
    settle();
    expect(saveButton()?.disabled).toBe(false);

    saveButton()?.click();
    await settled();

    const write = api.requests.find((request) => request.path === WRITE);
    expect(write?.body).toEqual({
      path: 'drafts/ch01.md',
      content: '# Chapter one\n\nEdited text.\n',
      baseHash: HASH,
    });
    expect(host().querySelector('[data-testid="stale-base"]')).toBeNull();
    expect(saveButton()?.disabled).toBe(true);
  });

  it('shows the stale-base warning when the disk refused the save, and a reload clears it', async () => {
    activeProject();
    openDraft();
    api.fail('POST', WRITE, 409, 'PROJECT_WRITE_CONFLICT', 'The file changed on disk.');
    fixture.componentRef.setInput('projectId', 'book');
    settle();
    await settled();
    await clickDraft();

    const field = editor();
    if (field === null) {
      throw new Error('the editor is not on the page');
    }
    field.value = 'Typed over a host edit.\n';
    field.dispatchEvent(new Event('input'));
    settle();
    saveButton()?.click();
    await settled();

    expect(host().querySelector('[data-testid="stale-base"]')?.textContent).toContain(
      'changed on disk since you opened it',
    );
    expect(editor()?.value).toBe('Typed over a host edit.\n');

    const reload = Array.from(host().querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Reload from disk',
    );
    reload?.click();
    await settled();

    expect(host().querySelector('[data-testid="stale-base"]')).toBeNull();
    expect(editor()?.value).toBe('# Chapter one\n\nDraft text.\n');
  });

  it('on a phone, opens the file read-only with no editor', async () => {
    viewport.resize(PHONE);
    activeProject();
    openDraft();
    fixture.componentRef.setInput('projectId', 'book');
    settle();
    await settled();
    await clickDraft();

    expect(text()).toContain('Read-only on this screen.');
    expect(editor()).toBeNull();
    expect(host().querySelector('.viewer h1')?.textContent?.trim()).toBe('Chapter one');
  });
});
