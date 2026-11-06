import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { installViewport, type ViewportControl } from '../../testing/viewport';
import { ReadOnlyDiffView } from './read-only-diff-view';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

describe('ReadOnlyDiffView', () => {
  let viewport: ViewportControl | undefined;
  let fixture: ComponentFixture<ReadOnlyDiffView> | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
    viewport?.restore();
    viewport = undefined;
  });

  function render(
    base: string,
    proposed: string,
    size = DESKTOP,
  ): ComponentFixture<ReadOnlyDiffView> {
    viewport = installViewport(size);
    fixture = TestBed.createComponent(ReadOnlyDiffView);
    fixture.componentRef.setInput('path', 'drafts/ch1.md');
    fixture.componentRef.setInput('base', base);
    fixture.componentRef.setInput('proposed', proposed);
    fixture.detectChanges();
    return fixture;
  }

  function element(): HTMLElement {
    return (fixture as ComponentFixture<ReadOnlyDiffView>).nativeElement as HTMLElement;
  }

  it('shows "No changes" for identical inputs and builds no editor', () => {
    render('# Opening\n\nText.\n', '# Opening\n\nText.\n');

    expect(element().querySelector('.same')?.textContent?.trim()).toBe('No changes');
    expect(element().querySelector('.host')).toBeNull();
  });

  it('shows a text change as a diff, not "No changes"', () => {
    render('# Opening\n\nText.\n', '# Opening\n\nText changed.\n');

    expect(element().querySelector('.same')).toBeNull();
    expect(element().querySelector('.host')).not.toBeNull();
  });

  it('shows a whitespace-only change as a diff', () => {
    render('alpha beta\n', 'alpha  beta\n');

    expect(element().querySelector('.same')).toBeNull();
  });

  it('shows an LF-to-CRLF change as a diff, not "No changes"', () => {
    render('alpha\nbeta\n', 'alpha\r\nbeta\n');

    expect(element().querySelector('.same')).toBeNull();
    expect(element().querySelector('.host')).not.toBeNull();
  });

  it('marks the line whose ending changed in the gutter', () => {
    render('alpha\nbeta\n', 'alpha\r\nbeta\n');

    const markers = element().querySelectorAll('.eol-marker');
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]?.getAttribute('aria-label')).toBe('Line ending changed');
  });

  it('shows a front-matter-only change as a diff', () => {
    render('---\ntitle: One\n---\nBody\n', '---\ntitle: Two\n---\nBody\n');

    expect(element().querySelector('.same')).toBeNull();
  });

  it('is side by side on a desktop', () => {
    const view = render('a\nb\n', 'a\nc\n', DESKTOP);

    expect(view.nativeElement.querySelector('.host')?.getAttribute('data-mode')).toBe(
      'side-by-side',
    );
  });

  it('is unified on a phone', () => {
    const view = render('a\nb\n', 'a\nc\n', PHONE);

    expect(view.nativeElement.querySelector('.host')?.getAttribute('data-mode')).toBe('unified');
  });

  it('switches between the two views with the toggle', () => {
    const view = render('a\nb\n', 'a\nc\n', DESKTOP);
    const toggle = view.nativeElement.querySelector('.mode') as HTMLButtonElement;

    toggle.click();
    view.detectChanges();

    expect(view.nativeElement.querySelector('.host')?.getAttribute('data-mode')).toBe('unified');
    expect(toggle.textContent?.trim()).toBe('Side by side');
  });

  it('shows the conflict notice when the file changed since the draft was read', () => {
    viewport = installViewport(DESKTOP);
    fixture = TestBed.createComponent(ReadOnlyDiffView);
    fixture.componentRef.setInput('path', 'drafts/ch1.md');
    fixture.componentRef.setInput('base', 'a\n');
    fixture.componentRef.setInput('proposed', 'b\n');
    fixture.componentRef.setInput('conflict', true);
    fixture.detectChanges();

    expect(element().querySelector('.conflict')?.textContent).toContain('changed since');
  });
});
