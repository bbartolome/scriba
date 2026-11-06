import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { ProjectPickerPage } from './project-picker.page';

const LIST = '/api/project-store/projects';

/** The phase:files acceptance the picker serves: statuses, activation, import and Start from sample. */
describe('project picker', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ProjectPickerPage>;

  function settle(): void {
    fixture.detectChanges();
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent.replace(/\s+/g, ' ');
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((candidate) => candidate.textContent.trim() === label);
    if (found === undefined) {
      throw new Error(`no button named ${label}`);
    }
    return found;
  }

  beforeEach(() => {
    api = new FakeApi();
    api.reply('GET', LIST, 200, {
      projects: [
        {
          id: 'good-book',
          title: 'Good Book',
          genrePack: 'nonfiction',
          active: true,
          status: 'ok',
          schemaVersion: 1,
        },
        { id: 'bare', active: false, status: 'importable' },
        {
          id: 'broken',
          active: false,
          status: 'invalid',
          issues: [{ path: 'schemaVersion', message: 'Required' }],
        },
      ],
    });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(api)],
    });
    fixture = TestBed.createComponent(ProjectPickerPage);
  });

  it('lists each project with its status and names the active project', async () => {
    settle();
    await fixture.whenStable();
    settle();

    expect(text()).toContain('Active project: Good Book');
    expect(text()).toContain('Ready');
    expect(text()).toContain('Not a project yet');
    expect(text()).toContain('Invalid project.yaml');
    expect(text()).toContain('schemaVersion: Required');
  });

  it('imports an importable folder and activates a ready one, through the contract routes', async () => {
    api.reply('POST', '/api/project-store/projects/bare/import', 200, {
      project: {
        id: 'bare',
        active: false,
        status: 'ok',
        title: 'bare',
        genrePack: 'nonfiction',
        schemaVersion: 1,
      },
    });
    api.reply('POST', '/api/project-store/projects/broken/activate', 422, {
      error: { code: 'PROJECT_INVALID', message: 'project.yaml is not valid.' },
    });
    settle();

    button('Import').click();
    settle();
    expect(
      api.requests.some(
        (request) => request.method === 'POST' && request.path.endsWith('/bare/import'),
      ),
    ).toBe(true);
    expect(text()).toContain('Imported bare.');
  });

  it('starts from the nonfiction sample with the folder name and title the author types', async () => {
    api.reply('POST', '/api/project-store/projects/from-sample', 201, {
      project: {
        id: 'demo-book',
        active: false,
        status: 'ok',
        title: 'Demo Book',
        genrePack: 'nonfiction',
        schemaVersion: 1,
      },
    });
    settle();

    const section = (fixture.nativeElement as HTMLElement).querySelector(
      'section[aria-labelledby="sample-heading"]',
    ) as HTMLElement;
    const folder = section.querySelector<HTMLInputElement>(
      'input[name="folder"]',
    ) as HTMLInputElement;
    const title = section.querySelector<HTMLInputElement>(
      'input[name="title"]',
    ) as HTMLInputElement;
    folder.value = 'demo-book';
    folder.dispatchEvent(new Event('input'));
    title.value = 'Demo Book';
    title.dispatchEvent(new Event('input'));
    settle();

    section.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    settle();

    const sent = api.requests.find((request) => request.path.endsWith('/from-sample'));
    expect(sent?.body).toEqual({
      sampleId: 'nonfiction',
      folderName: 'demo-book',
      title: 'Demo Book',
    });
    expect(text()).toContain('Copied the sample.');
  });
});
