import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { COLD_OPEN } from '../tool-form/fixtures';
import { ToolsPage } from './tools-page';

const TOOL = '/api/tools/cold_open';
const PROJECTS = '/api/project-store/projects';
const ENTITIES = '/api/project-store/projects/book/entities';
const PROJECT_YAML = '/api/project-store/projects/book/files/read?path=project.yaml';

const ENTITY_LIST = {
  entities: [
    { id: 'ada-lovelace', type: 'person', path: 'entities/people/ada-lovelace.md' },
    { id: 'engine-claim', type: 'claim', path: 'entities/claims/engine.md' },
    { id: 'house-style', type: 'style-profile', path: 'entities/house-style.md' },
  ],
};

/**
 * The Tools dev preview (survey 21 §3, phase:form-renderer): one response for the cold-open fixture
 * drives a full form and a node body, and the page reads the active project for the picker.
 */
describe('tools page dev preview', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ToolsPage>;

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const settle = (): void => {
    fixture.detectChanges();
    fixture.detectChanges();
  };

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideFakeApi(api)] });
    fixture = TestBed.createComponent(ToolsPage);
  });

  it('draws the form and the node body from one fixture response, with the picker and the style default from the active project', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    api.reply('GET', PROJECTS, 200, {
      projects: [
        { id: 'book', title: 'Book', genrePack: 'nonfiction', active: true, status: 'ok' },
      ],
    });
    api.reply('GET', ENTITIES, 200, ENTITY_LIST);
    api.reply('GET', PROJECT_YAML, 200, {
      path: 'project.yaml',
      content: 'schemaVersion: 1\ntitle: Book\ngenrePack: nonfiction\nstyleProfile: house-style\n',
      hash: 'a'.repeat(64),
      mtime: '2026-11-06T12:00:00.000Z',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    settle();

    expect(api.requests.filter((request) => request.path === TOOL)).toHaveLength(1);
    expect(host().querySelector('section [data-layout="node"]')).not.toBeNull();
    expect(host().querySelector('form.tool-form')).not.toBeNull();
    expect(host().textContent).toContain('Entities from the active project: book.');

    const person = host().querySelector('[data-field="person"]') as HTMLElement;
    expect(
      Array.from(person.querySelectorAll<HTMLOptionElement>('option')).map(
        (option) => option.value,
      ),
    ).toEqual(['', 'ada-lovelace']);

    const style = host().querySelector('[data-field="style"]') as HTMLElement;
    expect(style.querySelector('[data-entity-id="house-style"]')).not.toBeNull();
  });

  it('says the picker is empty when no project is active', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    api.reply('GET', PROJECTS, 200, {
      projects: [{ id: 'book', active: false, status: 'ok' }],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    settle();

    expect(host().querySelector('[data-testid="no-active-project"]')?.textContent).toContain(
      'No project is active',
    );
    expect(api.requests.some((request) => request.path === ENTITIES)).toBe(false);
  });

  it('shows the error when the fixture tool cannot be read', async () => {
    api.fail('GET', TOOL, 404, 'TOOL_NOT_FOUND', 'No tool named cold_open.');
    api.reply('GET', PROJECTS, 200, { projects: [] });
    fixture.detectChanges();
    await fixture.whenStable();
    settle();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain(
      'No tool named cold_open.',
    );
    expect(host().querySelector('[data-layout="node"]')).toBeNull();
  });
});
