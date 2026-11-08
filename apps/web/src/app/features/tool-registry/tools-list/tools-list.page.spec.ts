import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToolListResponseSchema } from '@bbartolome/scriba-contracts/tool-registry';
import { DeviceClassService } from '../../../shell';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import { ToolsListPage, originLabel } from './tools-list.page';

const LIST = '/api/tools';

const TOOLS = ToolListResponseSchema.parse({
  tools: [
    {
      name: 'cold_open',
      description: 'Open a chapter on a person.',
      output: 'draft',
      enabled: true,
      origin: 'nonfiction',
      valid: true,
      lint: { errors: 0, warnings: 0 },
    },
    {
      name: 'house_voice',
      description: 'Rewrite in the house voice.',
      output: 'draft',
      enabled: false,
      origin: 'user',
      overrides: 'core',
      valid: true,
      lint: { errors: 0, warnings: 1 },
    },
    {
      name: 'broken_tool',
      enabled: true,
      origin: 'user',
      valid: false,
      error: 'TOOL_SPEC_LINT_FAILED',
      lint: { errors: 2, warnings: 0 },
    },
  ],
});

describe('originLabel', () => {
  it('names a built-in by its pack, a user tool as yours, and a copy as a copy of a built-in', () => {
    expect(originLabel({ origin: 'nonfiction' })).toBe('Built-in, nonfiction pack');
    expect(originLabel({ origin: 'user' })).toBe('Your tool');
    expect(originLabel({ origin: 'user', overrides: 'core' })).toBe('Your copy of a built-in tool');
  });
});

/**
 * The Tools list (survey 21 §3, phase:editor-ui). The switch saves at once, a failed save puts it
 * back, and a phone sees the list without the editor.
 */
describe('tools list', () => {
  let api: FakeApi;
  let fixture: ComponentFixture<ToolsListPage>;
  const device = signal<'phone' | 'tablet' | 'desktop'>('desktop');

  const host = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const row = (name: string): HTMLElement => {
    const element = host().querySelector<HTMLElement>(`[data-tool="${name}"]`);
    if (element === null) {
      throw new Error(`no row for ${name}`);
    }
    return element;
  };
  const toggle = (name: string): HTMLInputElement =>
    row(name).querySelector<HTMLInputElement>('input[role="switch"]') as HTMLInputElement;

  beforeEach(() => {
    device.set('desktop');
    api = new FakeApi();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideFakeApi(api),
        { provide: DeviceClassService, useValue: { current: device } },
      ],
    });
    fixture = TestBed.createComponent(ToolsListPage);
  });

  it('lists every tool with its origin, its switch and its lint counts', () => {
    api.reply('GET', LIST, 200, TOOLS);
    fixture.detectChanges();

    expect(row('cold_open').textContent).toContain('Built-in, nonfiction pack');
    expect(toggle('cold_open').checked).toBe(true);
    expect(toggle('house_voice').checked).toBe(false);
    expect(row('house_voice').textContent).toContain('Your copy of a built-in tool');
    expect(row('house_voice').textContent).toContain('0 errors, 1 warnings');
    expect(row('broken_tool').textContent).toContain('Not loaded: TOOL_SPEC_LINT_FAILED');
  });

  it('saves a switch at once with a PUT to the enable route', () => {
    api.reply('GET', LIST, 200, TOOLS);
    api.reply('PUT', '/api/tools/house_voice/enabled', 200, {
      name: 'house_voice',
      enabled: true,
    });
    fixture.detectChanges();

    toggle('house_voice').click();
    fixture.detectChanges();

    expect(api.requests.at(-1)).toEqual({
      method: 'PUT',
      path: '/api/tools/house_voice/enabled',
      body: { enabled: true },
    });
    expect(toggle('house_voice').checked).toBe(true);
  });

  it('puts a switch back and shows the error when the save fails', () => {
    api.reply('GET', LIST, 200, TOOLS);
    api.fail(
      'PUT',
      '/api/tools/cold_open/enabled',
      500,
      'PLATFORM_INTERNAL',
      'The switch could not be saved.',
    );
    fixture.detectChanges();

    toggle('cold_open').click();
    fixture.detectChanges();

    expect(toggle('cold_open').checked).toBe(true);
    expect(host().querySelector('[role="alert"]')?.textContent).toContain(
      'The switch could not be saved.',
    );
  });

  it('links every tool to its editor on a tablet or larger, invalid ones included', () => {
    api.reply('GET', LIST, 200, TOOLS);
    fixture.detectChanges();

    expect(row('cold_open').querySelector('a')?.getAttribute('href')).toBe('/tools/cold_open');
    expect(row('broken_tool').querySelector('a')?.getAttribute('href')).toBe('/tools/broken_tool');
    expect(host().querySelector('[data-testid="new-tool"]')).not.toBeNull();
  });

  /** A broken user copy that shadows a built-in of the same name. */
  const SHADOWED = ToolListResponseSchema.parse({
    tools: [
      {
        name: 'cold_open',
        enabled: true,
        origin: 'nonfiction',
        valid: true,
        lint: { errors: 0, warnings: 0 },
      },
      {
        name: 'cold_open',
        enabled: true,
        origin: 'user',
        overrides: 'nonfiction',
        valid: false,
        error: 'TOOL_SPEC_LINT_FAILED',
        lint: { errors: 1, warnings: 0 },
      },
    ],
  });

  it('shows a broken copy with no switch and no link, since the server keeps one switch per name', () => {
    api.reply('GET', LIST, 200, SHADOWED);
    fixture.detectChanges();

    const rows = host().querySelectorAll<HTMLElement>('[data-tool="cold_open"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.querySelector('input[role="switch"]')).not.toBeNull();
    expect(rows[1]?.querySelector('input[role="switch"]')).toBeNull();
    expect(rows[1]?.querySelector('a')).toBeNull();
    expect(rows[1]?.querySelector('[data-testid="delete-broken"]')).not.toBeNull();
  });

  it('removes a broken copy only on its second press, which restores the built-in', () => {
    api.reply('GET', LIST, 200, SHADOWED);
    api.reply('DELETE', '/api/tools/cold_open', 200, {
      name: 'cold_open',
      restoredOrigin: 'nonfiction',
    });
    fixture.detectChanges();
    const button = (): HTMLButtonElement | null =>
      host().querySelector<HTMLButtonElement>(
        '[data-tool="cold_open"][data-origin="user"] [data-testid="delete-broken"]',
      );

    button()?.click();
    fixture.detectChanges();
    expect(api.requests.some((request) => request.method === 'DELETE')).toBe(false);
    expect(button()?.textContent).toContain('Confirm delete');

    button()?.click();
    fixture.detectChanges();
    expect(api.requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
  });

  it('shows the list and the switches on a phone, with no editor link', () => {
    device.set('phone');
    api.reply('GET', LIST, 200, TOOLS);
    fixture.detectChanges();

    expect(toggle('cold_open')).not.toBeNull();
    expect(host().querySelector('a[href^="/tools/"]')).toBeNull();
    expect(host().querySelector('[data-testid="new-tool"]')).toBeNull();
    expect(host().textContent).toContain('Editing needs a tablet or a larger screen.');
  });
});
