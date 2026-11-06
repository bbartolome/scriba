import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { ProjectFilesPage } from './project-files.page';

const LIST = '/api/project-store/projects';
const FILES = '/api/project-store/projects/book/files?recursive=true';
const READ = '/api/project-store/projects/book/files/read?path=drafts%2Fch01.md';
const MTIME = '2026-11-06T12:00:00.000Z';

/** The files view: read-only, for the active project only (the phase:files UI scope). */
describe('project files page', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ProjectFilesPage>;

  function settle(): void {
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent.replace(/\s+/g, ' ');
  }

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(api)],
    });
    fixture = TestBed.createComponent(ProjectFilesPage);
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
    await fixture.whenStable();
    settle();

    expect(text()).toContain('book is not the active project.');
    expect(api.requests.some((request) => request.path.includes('/files'))).toBe(false);
  });

  it('lists the active project and opens a Markdown draft read-only', async () => {
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
    api.reply('GET', READ, 200, {
      path: 'drafts/ch01.md',
      content: '# Chapter one\n\nDraft text.\n',
      hash: 'a'.repeat(64),
      mtime: MTIME,
    });
    fixture.componentRef.setInput('projectId', 'book');
    settle();
    await fixture.whenStable();
    settle();

    expect(text()).toContain('drafts/');
    expect(text()).toContain('Read-only.');
    const open = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'ch01.md',
    );
    open?.click();
    await fixture.whenStable();
    settle();
    await fixture.whenStable();
    settle();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.viewer h2')?.textContent?.trim()).toBe('drafts/ch01.md');
    expect(host.querySelector('.viewer h1')?.textContent?.trim()).toBe('Chapter one');
    expect(host.querySelector('textarea, input, [contenteditable]')).toBeNull();
  });
});
