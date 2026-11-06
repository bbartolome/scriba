import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { installViewport, type ViewportControl } from '../../testing/viewport';
import type { ToolCardLike } from './tool-card';
import { ToolCardView } from './tool-card-view';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const PENDING: ToolCardLike = { callId: 'call-1', name: 'read_file', family: 'project' };

const DONE: ToolCardLike = {
  ...PENDING,
  state: 'done',
  arguments: { path: 'drafts/ch1.md' },
  summary: 'Read 1 file',
  output: { lines: 12 },
  sourcesUsed: [{ id: 'src-1', type: 'file', path: 'drafts/ch1.md' }],
};

const FAILED: ToolCardLike = {
  ...PENDING,
  state: 'failed',
  sourcesUsed: [],
  error: { message: 'path is outside the project', attempt: 2, withdrawn: true },
};

describe('ToolCardView', () => {
  let viewport: ViewportControl | undefined;

  afterEach(() => {
    viewport?.restore();
    viewport = undefined;
  });

  function render(card: ToolCardLike, size = DESKTOP): ComponentFixture<ToolCardView> {
    viewport = installViewport(size);
    const fixture = TestBed.createComponent(ToolCardView);
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: ComponentFixture<ToolCardView>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it.each([
    ['pending', PENDING, 'Pending'],
    ['running', { ...PENDING, state: 'running' as const, sourcesUsed: [] }, 'Running'],
    ['done', DONE, 'Done'],
    ['error', FAILED, 'Error'],
  ])('renders the %s status with its label', (status, card, label) => {
    const fixture = render(card);
    const root = element(fixture).querySelector('.card');

    expect(root?.getAttribute('data-status')).toBe(status);
    expect(element(fixture).querySelector('.status')?.textContent?.trim()).toBe(label);
    expect(element(fixture).querySelector('.name')?.textContent?.trim()).toBe('read_file');
  });

  it('starts collapsed on a phone and expands on a tap', () => {
    const fixture = render(DONE, PHONE);
    const head = element(fixture).querySelector<HTMLButtonElement>('.head');

    expect(head?.getAttribute('aria-expanded')).toBe('false');
    expect(element(fixture).querySelector('.body')).toBeNull();

    head?.click();
    fixture.detectChanges();

    expect(head?.getAttribute('aria-expanded')).toBe('true');
    expect(element(fixture).querySelector('.body')).not.toBeNull();
  });

  it('collapses again on a second tap', () => {
    const fixture = render(DONE, PHONE);
    const head = element(fixture).querySelector<HTMLButtonElement>('.head');

    head?.click();
    fixture.detectChanges();
    head?.click();
    fixture.detectChanges();

    expect(element(fixture).querySelector('.body')).toBeNull();
  });

  it('starts expanded on a tablet and a desktop', () => {
    const fixture = render(DONE, DESKTOP);

    expect(element(fixture).querySelector('.head')?.getAttribute('aria-expanded')).toBe('true');
    expect(element(fixture).querySelector('.body')).not.toBeNull();
  });

  it('shows the arguments, summary, output and source paths of a finished call', () => {
    const fixture = render(DONE, DESKTOP);
    const text = element(fixture).textContent ?? '';

    expect(element(fixture).querySelector('.arguments')?.textContent).toContain('drafts/ch1.md');
    expect(element(fixture).querySelector('.summary')?.textContent?.trim()).toBe('Read 1 file');
    expect(element(fixture).querySelector('.output')?.textContent).toContain('"lines": 12');
    expect(element(fixture).querySelector('.sources li')?.textContent?.trim()).toBe(
      'drafts/ch1.md',
    );
    expect(text).toContain('read_file');
  });

  it('shows a failed call its error message in an alert', () => {
    const fixture = render(FAILED, DESKTOP);
    const alert = element(fixture).querySelector('[role="alert"]');

    expect(alert?.textContent?.trim()).toBe('path is outside the project');
  });
});
