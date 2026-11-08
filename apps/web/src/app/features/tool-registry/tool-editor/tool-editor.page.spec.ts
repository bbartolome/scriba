import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Text } from '@codemirror/state';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type LintDiagnostic,
  type LintPreview,
  ToolDetailSchema,
  type ToolDetail,
  ToolListResponseSchema,
} from '@bbartolome/scriba-contracts/tool-registry';
import { DeviceClassService, EventStream, type ModuleEvent } from '../../../shell';
import type { TransportResponse } from '../../../shell/api/api-transport';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { TOOL_REGISTRY_FEATURE_ROUTES } from '../routes';
import { COLD_OPEN } from '../tool-form/fixtures';
import {
  LINT_DEBOUNCE_MS,
  NEW_TOOL_YAML,
  ToolEditorPage,
  copyNameFor,
  nameOf,
  renamed,
} from './tool-editor.page';
import { toCodeMirrorDiagnostics } from './yaml-editor';

const TOOL = '/api/tools/cold_open';
const LIST = '/api/tools';
const PROJECTS = '/api/project-store/projects';
const BOOK_ENTITIES = '/api/project-store/projects/book/entities';
const BOOK_PROJECT_YAML = '/api/project-store/projects/book/files/read?path=project.yaml';
const LINT = '/api/tools/lint';

const USER_COPY: ToolDetail = ToolDetailSchema.parse({
  ...COLD_OPEN,
  origin: 'user',
  overrides: 'nonfiction',
  yaml: 'name: cold_open\ndescription: My copy.\n',
});

const DIAGNOSTIC: LintDiagnostic = {
  severity: 'error',
  rule: 'required',
  message: 'missing field',
  line: 3,
  column: 5,
};

const WARNING: LintDiagnostic = {
  severity: 'warning',
  rule: 'unused-input',
  message: 'the input is never used',
  line: 2,
  column: 1,
};

/** The live lint's views for an edited draft: the person field retitled and given new kinds. */
function liveViewsOf(): LintPreview {
  const form = COLD_OPEN.form;
  const ports = COLD_OPEN.ports;
  if (form === undefined || ports === undefined) {
    throw new Error('the cold-open fixture has a form and ports');
  }
  return {
    diagnostics: [],
    form: {
      fields: form.fields.map((field) =>
        field.key === 'person' ? { ...field, title: 'Subject', entityKinds: ['claim'] } : field,
      ),
    },
    ports: {
      ...ports,
      inputs: ports.inputs.map((port) =>
        port.key === 'person' ? { ...port, title: 'Subject' } : port,
      ),
    },
  };
}

/** A tool list answer that holds the given names, as valid user tools. */
function listOf(...names: string[]): unknown {
  return ToolListResponseSchema.parse({
    tools: names.map((name) => ({
      name,
      enabled: true,
      origin: 'user',
      valid: true,
      lint: { errors: 0, warnings: 0 },
    })),
  });
}

@Component({ selector: 'app-larger-screen-stub', template: '' })
class LargerScreenStub {}

/**
 * The editor page, rendered through the Tools routes as the app renders them. The live lint, the
 * save, the actions and the Try panel are each checked against the wire the page actually uses.
 */
describe('tool editor page', () => {
  let api: FakeApi;
  let harness: RouterTestingHarness;
  /** The catalog events the page's event stream carries, which a test pushes by hand. */
  let events: Subject<ModuleEvent>;

  /** The page's protected edit entry point: what the YAML editor reports after each change. */
  const typeInto = (page: ToolEditorPage, value: string): void => {
    (page as unknown as { edit(text: string): void }).edit(value);
    harness.fixture.detectChanges();
  };
  const host = (): HTMLElement => harness.fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(host().querySelectorAll('button')).find(
      (element) => element.textContent?.trim() === label,
    );
  const text = (): string => host().textContent ?? '';
  const preview = (): HTMLElement | null =>
    host().querySelector<HTMLElement>('section[aria-labelledby="preview-heading"]');
  const tryPanel = (): HTMLElement | null => host().querySelector<HTMLElement>('section.try');
  const countOf = (method: string, path: string): number =>
    api.requests.filter((request) => request.method === method && request.path === path).length;

  /** Presses the Try panel's own check button, the way a person does. */
  const check = (): void => {
    const submit = tryPanel()?.querySelector<HTMLButtonElement>('form button[type="submit"]');
    if (submit === null || submit === undefined) {
      throw new Error('the Try panel has a check button');
    }
    submit.click();
    harness.fixture.detectChanges();
  };

  beforeEach(async () => {
    api = new FakeApi();
    events = new Subject<ModuleEvent>();
    api.reply('GET', PROJECTS, 200, { projects: [] });
    api.reply('GET', LIST, 200, listOf());
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tools', children: TOOL_REGISTRY_FEATURE_ROUTES },
          { path: 'larger-screen', component: LargerScreenStub },
        ]),
        provideFakeApi(api),
        { provide: DeviceClassService, useValue: { current: signal('desktop') } },
        { provide: EventStream, useValue: { forModule: () => events.asObservable() } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a built-in read-only, and Customize saves a copy that then reads as the user copy', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    expect(text()).toContain('Built-in, nonfiction pack');
    expect(button('Save')).toBeUndefined();

    api.reply('PUT', TOOL, 200, { name: 'cold_open', origin: 'user', lint: { diagnostics: [] } });
    api.reply('GET', TOOL, 200, { ...COLD_OPEN, origin: 'user', overrides: 'nonfiction' });
    button('Customize')?.click();
    harness.fixture.detectChanges();
    typeInto(page, `${COLD_OPEN.yaml}description: Changed.\n`);
    button('Save')?.click();
    harness.fixture.detectChanges();

    expect(api.requests.find((request) => request.method === 'PUT')).toEqual({
      method: 'PUT',
      path: TOOL,
      body: { yaml: `${COLD_OPEN.yaml}description: Changed.\n` },
    });
    expect(text()).toContain('Saved cold_open.');
    expect(host().querySelector('[data-testid="origin"]')?.textContent).toContain(
      'Your copy of a built-in tool',
    );
  });

  it('shows a refused save on its lines, and keeps the saved tool shown and active', async () => {
    api.reply('GET', TOOL, 200, USER_COPY);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();
    const readsBefore = countOf('GET', TOOL);

    api.reply('PUT', TOOL, 422, {
      error: {
        code: 'TOOL_SPEC_LINT_FAILED',
        message: 'Tool "cold_open" was not saved.',
        details: { diagnostics: [DIAGNOSTIC] },
      },
    });
    typeInto(page, 'name: cold_open\n  broken: [\n');
    button('Save')?.click();
    harness.fixture.detectChanges();

    expect(host().querySelector('[data-testid="save-failure"]')?.textContent).toContain(
      'Tool "cold_open" was not saved.',
    );
    expect(host().querySelector('[data-testid="diagnostics"]')?.textContent).toContain(
      'line 3, column 5: missing field',
    );
    // The saved tool is still the one shown, and the refused save wrote nothing the page re-reads.
    expect(host().querySelector('[data-testid="origin"]')?.textContent).toContain(
      'Your copy of a built-in tool',
    );
    expect(countOf('GET', TOOL)).toBe(readsBefore);
    expect(button('Save')).toBeDefined();
  });

  it('saves a warnings-only YAML, and shows its warnings', async () => {
    api.reply('GET', TOOL, 200, USER_COPY);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('PUT', TOOL, 200, {
      name: 'cold_open',
      origin: 'user',
      lint: { diagnostics: [WARNING] },
    });
    api.reply('GET', TOOL, 200, { ...USER_COPY, lint: { diagnostics: [WARNING] } });
    typeInto(page, 'name: cold_open\ndescription: Warned.\n');
    button('Save')?.click();
    harness.fixture.detectChanges();

    expect(text()).toContain('Saved cold_open.');
    expect(host().querySelector('[data-testid="save-failure"]')).toBeNull();
    expect(
      host().querySelector('[data-testid="diagnostics"] [data-severity="warning"]')?.textContent,
    ).toContain('line 2, column 1: the input is never used');
  });

  it('runs the live lint once after a pause, and keeps the last valid preview while the YAML is broken', async () => {
    vi.useFakeTimers();
    api.reply('GET', TOOL, 200, USER_COPY);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('POST', LINT, 200, liveViewsOf());
    typeInto(page, 'name: cold_open\ndescription: Edited.\n');
    typeInto(page, 'name: cold_open\ndescription: Edited again.\n');
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);
    harness.fixture.detectChanges();

    const lints = api.requests.filter((request) => request.path === LINT);
    expect(lints).toHaveLength(1);
    expect(lints[0]?.body).toEqual({
      yaml: 'name: cold_open\ndescription: Edited again.\n',
      name: 'cold_open',
    });

    api.reply('POST', LINT, 200, { diagnostics: [DIAGNOSTIC] } satisfies LintPreview);
    typeInto(page, 'name: cold_open\n  broken: [\n');
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);
    harness.fixture.detectChanges();

    expect(preview()?.querySelector('[data-layout="node"]')).not.toBeNull();
    expect(text()).toContain('line 3, column 5');
  });

  it('redraws the node ports from the live lint, not from the saved tool', async () => {
    vi.useFakeTimers();
    api.reply('GET', TOOL, 200, COLD_OPEN);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    expect(preview()?.querySelector('[data-port="person"]')?.textContent).toContain('Person');

    api.reply('POST', LINT, 200, liveViewsOf());
    typeInto(page, `${COLD_OPEN.yaml}description: Ports.\n`);
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);
    harness.fixture.detectChanges();

    expect(preview()?.querySelector('[data-port="person"]')?.textContent).toContain('Subject');
    expect(preview()?.querySelector('[data-port="person"]')?.textContent).not.toContain('Person');
  });

  it('changes what the entity picker offers when the live lint changes the entity kinds', async () => {
    vi.useFakeTimers();
    api.reply('GET', PROJECTS, 200, {
      projects: [
        { id: 'book', title: 'Book', genrePack: 'nonfiction', active: true, status: 'ok' },
      ],
    });
    api.reply('GET', BOOK_ENTITIES, 200, {
      entities: [
        { id: 'ada-lovelace', type: 'person', path: 'entities/people/ada-lovelace.md' },
        { id: 'engine-claim', type: 'claim', path: 'entities/claims/engine.md' },
      ],
    });
    api.fail('GET', BOOK_PROJECT_YAML, 404, 'PROJECT_NOT_FOUND', 'no project.yaml');
    api.reply('GET', TOOL, 200, COLD_OPEN);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();
    const offered = (): string[] =>
      Array.from(
        preview()?.querySelector('[data-testid="entity-picker"]')?.querySelectorAll('option') ?? [],
      )
        .map((option) => option.value)
        .filter((value) => value !== '');

    expect(offered()).toEqual(['ada-lovelace']);

    api.reply('POST', LINT, 200, liveViewsOf());
    typeInto(page, `${COLD_OPEN.yaml}description: Kinds.\n`);
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);
    harness.fixture.detectChanges();

    expect(offered()).toEqual(['engine-claim']);
    expect(
      preview()?.querySelector('[data-testid="entity-picker"]')?.getAttribute('data-kinds'),
    ).toBe('claim');
  });

  it('reports a failed live lint on its own line, and clears it once a lint answers', async () => {
    vi.useFakeTimers();
    api.reply('GET', TOOL, 200, USER_COPY);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.fail('POST', LINT, 500, 'PLATFORM_INTERNAL', 'The check could not run.');
    typeInto(page, 'name: cold_open\ndescription: One.\n');
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);
    harness.fixture.detectChanges();

    expect(host().querySelector('[data-testid="lint-failure"]')?.textContent).toContain(
      'The check could not run.',
    );
    expect(host().querySelector('[data-testid="save-failure"]')).toBeNull();

    api.reply('POST', LINT, 200, { diagnostics: [] } satisfies LintPreview);
    typeInto(page, 'name: cold_open\ndescription: Two.\n');
    vi.advanceTimersByTime(LINT_DEBOUNCE_MS);
    harness.fixture.detectChanges();

    expect(host().querySelector('[data-testid="lint-failure"]')).toBeNull();
  });

  it('reverts a customised built-in only on the second press, and reads the built-in again', async () => {
    api.reply('GET', TOOL, 200, USER_COPY);
    await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('DELETE', TOOL, 200, { name: 'cold_open', restoredOrigin: 'nonfiction' });
    api.reply('GET', TOOL, 200, COLD_OPEN);
    button('Revert to built-in')?.click();
    harness.fixture.detectChanges();

    expect(countOf('DELETE', TOOL)).toBe(0);
    expect(button('Confirm revert')).toBeDefined();

    button('Confirm revert')?.click();
    harness.fixture.detectChanges();

    expect(countOf('DELETE', TOOL)).toBe(1);
    expect(text()).toContain('Reverted cold_open to the built-in tool.');
    expect(host().querySelector('[data-testid="origin"]')?.textContent).toContain(
      'Built-in, nonfiction pack',
    );
  });

  it('refuses to save a new tool under a name already in use, and replaces nothing', async () => {
    api.reply('GET', LIST, 200, listOf('new_tool'));
    const page = await harness.navigateByUrl('/tools/new', ToolEditorPage);
    harness.fixture.detectChanges();

    expect(text()).toContain('New tool');
    expect(nameOf(NEW_TOOL_YAML)).toBe('new_tool');
    typeInto(page, NEW_TOOL_YAML);
    button('Save')?.click();
    harness.fixture.detectChanges();

    expect(countOf('PUT', '/api/tools/new_tool')).toBe(0);
    expect(host().querySelector('[data-testid="save-failure"]')?.textContent).toContain(
      'A tool named "new_tool" already exists',
    );
  });

  it('saves a new tool under a free name from its YAML', async () => {
    api.reply('GET', LIST, 200, listOf('cold_open'));
    const page = await harness.navigateByUrl('/tools/new', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('PUT', '/api/tools/new_tool', 200, {
      name: 'new_tool',
      origin: 'user',
      lint: { diagnostics: [] },
    });
    typeInto(page, NEW_TOOL_YAML);
    button('Save')?.click();
    harness.fixture.detectChanges();

    expect(countOf('PUT', '/api/tools/new_tool')).toBe(1);
  });

  it('duplicates to the first free copy name, and never replaces a tool that exists', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    api.reply('GET', LIST, 200, listOf('cold_open_copy'));
    await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('PUT', '/api/tools/cold_open_copy_2', 200, {
      name: 'cold_open_copy_2',
      origin: 'user',
      lint: { diagnostics: [] },
    });
    button('Duplicate')?.click();
    harness.fixture.detectChanges();

    const put = api.requests.find((request) => request.method === 'PUT');
    expect(put?.path).toBe('/api/tools/cold_open_copy_2');
    expect(put?.body).toEqual({ yaml: renamed(COLD_OPEN.yaml, 'cold_open_copy_2') });
  });

  it('runs the saved tool from the Try panel with the checked arguments, and writes no file', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('POST', '/api/tools/cold_open/validate', 200, {
      arguments: { person: 'ada-lovelace', view: 'story' },
      entities: [],
    });
    api.reply('POST', '/api/tools/cold_open/execute', 200, {
      output: { kind: 'draft', content: 'Ada opens the chapter.' },
      sourcesUsed: [],
    });
    check();
    button('Run')?.click();
    harness.fixture.detectChanges();

    const run = api.requests.find((request) => request.path === '/api/tools/cold_open/execute');
    expect(run?.body).toEqual({
      arguments: { person: 'ada-lovelace', view: 'story' },
      entities: [],
    });
    expect(host().querySelector('[data-testid="tool-output"]')?.textContent).toContain(
      'Ada opens the chapter.',
    );
    expect(api.requests.some((request) => request.method === 'PUT')).toBe(false);
  });

  it('drops the checked arguments once the Try form is edited, so Run cannot send stale ones', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    api.reply('POST', '/api/tools/cold_open/validate', 200, {
      arguments: { person: 'ada-lovelace' },
      entities: [],
    });
    check();
    expect(button('Run')?.disabled).toBe(false);

    const notes = tryPanel()?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '[name="notes"]',
    );
    if (notes === null || notes === undefined) {
      throw new Error('the Try form has a notes field');
    }
    notes.value = 'Changed after the check.';
    notes.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();

    expect(button('Run')?.disabled).toBe(true);
  });

  it('gives no action while the tool has not loaded, so nothing runs against an empty draft', async () => {
    api.fail('GET', TOOL, 404, 'TOOL_NOT_FOUND', 'No tool is named "cold_open".');
    await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    expect(button('Save')).toBeUndefined();
    expect(button('Customize')).toBeUndefined();
    expect(button('Duplicate')).toBeUndefined();
    expect(text()).toContain('No tool is named "cold_open".');
  });

  it('reloads a tool another writer changed, when the author has no unsaved edits', async () => {
    api.reply('GET', TOOL, 200, COLD_OPEN);
    await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();
    const readsBefore = countOf('GET', TOOL);

    events.next({ type: 'catalog-changed', data: { names: ['cold_open'] } });
    harness.fixture.detectChanges();

    expect(countOf('GET', TOOL)).toBe(readsBefore + 1);
  });

  it("does not reload over the author's unsaved edits", async () => {
    api.reply('GET', TOOL, 200, USER_COPY);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();
    typeInto(page, 'name: cold_open\ndescription: Mine.\n');
    const readsBefore = countOf('GET', TOOL);

    events.next({ type: 'catalog-changed', data: { names: ['cold_open'] } });

    expect(countOf('GET', TOOL)).toBe(readsBefore);
  });

  it('keeps an edit typed while a reload is still in flight', async () => {
    api.reply('GET', TOOL, 200, USER_COPY);
    const page = await harness.navigateByUrl('/tools/cold_open', ToolEditorPage);
    harness.fixture.detectChanges();

    const answer = new Subject<TransportResponse>();
    const send = api.send.bind(api);
    vi.spyOn(api, 'send').mockImplementation((method, path, body) =>
      method === 'GET' && path === TOOL ? answer.asObservable() : send(method, path, body),
    );
    events.next({ type: 'catalog-changed', data: { names: ['cold_open'] } });
    typeInto(page, 'name: cold_open\ndescription: Typed during the reload.\n');
    answer.next({ status: 200, body: { ...COLD_OPEN, origin: 'user', overrides: 'nonfiction' } });
    answer.complete();
    harness.fixture.detectChanges();

    expect(text()).toContain('Your unsaved edits are kept.');
    expect(host().querySelector('[data-testid="origin"]')?.textContent).toContain(
      'Your copy of a built-in tool',
    );
  });
});

/** The phone sees the editor's route send it to the larger-screen page, with the path it asked for. */
describe('tool editor page on a phone', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'tools', children: TOOL_REGISTRY_FEATURE_ROUTES },
          { path: 'larger-screen', component: LargerScreenStub },
        ]),
        provideFakeApi(new FakeApi()),
        { provide: DeviceClassService, useValue: { current: signal('phone') } },
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('sends a phone that opens a tool to the larger-screen page, with the full path it asked for', async () => {
    await harness.navigateByUrl('/tools/cold_open');

    const router = TestBed.inject(Router);
    expect(router.url.split('?')[0]).toBe('/larger-screen');
    expect(router.parseUrl(router.url).queryParams['from']).toBe('/tools/cold_open');
  });

  it('sends a phone that opens a new tool to the larger-screen page too', async () => {
    await harness.navigateByUrl('/tools/new');

    const router = TestBed.inject(Router);
    expect(router.url.split('?')[0]).toBe('/larger-screen');
    expect(router.parseUrl(router.url).queryParams['from']).toBe('/tools/new');
  });
});

describe('editor helpers', () => {
  it('renames only the top-level name line and keeps the rest of the YAML as written', () => {
    const yaml = 'name: cold_open\ndescription: Keep the name:\n  nested: true\n';
    expect(renamed(yaml, 'cold_open_copy')).toBe(
      'name: cold_open_copy\ndescription: Keep the name:\n  nested: true\n',
    );
  });

  it('reads the declared name, quoted or not, and reports none when it is missing', () => {
    expect(nameOf('name: "house_voice"\n')).toBe('house_voice');
    expect(nameOf('description: no name here\n')).toBeUndefined();
  });

  it('picks the first copy name that is free, and keeps a copy within the name length', () => {
    expect(copyNameFor('cold_open', new Set(['cold_open']))).toBe('cold_open_copy');
    expect(copyNameFor('cold_open', new Set(['cold_open', 'cold_open_copy']))).toBe(
      'cold_open_copy_2',
    );
    const copy = copyNameFor('a'.repeat(64), new Set());
    expect(copy.length).toBeLessThanOrEqual(64);
    expect(copy.endsWith('_copy')).toBe(true);
  });

  it('maps a lint position to the document, and clamps one past the document to its end', () => {
    const doc = Text.of(['name: cold_open', 'description: x', 'output: draft']);
    const [first, late] = toCodeMirrorDiagnostics(doc, [
      { severity: 'error', rule: 'a', message: 'first', line: 1, column: 6 },
      { severity: 'warning', rule: 'b', message: 'late', line: 99, column: 500 },
    ]);

    expect(first).toMatchObject({ from: 5, to: 15, severity: 'error', message: 'a: first' });
    expect(late).toMatchObject({ from: doc.line(3).to, to: doc.line(3).to, severity: 'warning' });
  });
});
