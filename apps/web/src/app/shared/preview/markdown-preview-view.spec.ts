import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownPreviewView } from './markdown-preview-view';

/** A marker a rendered script would set. It stays unset when the script is neither run nor kept. */
interface PreviewWindow {
  __previewRan?: boolean;
}

describe('MarkdownPreviewView', () => {
  let fixture: ComponentFixture<MarkdownPreviewView>;

  async function render(draft: string): Promise<HTMLElement> {
    fixture = TestBed.createComponent(MarkdownPreviewView);
    fixture.componentRef.setInput('draft', draft);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    delete (window as PreviewWindow).__previewRan;
  });

  it('shows the draft body and hides its front matter', async () => {
    const root = await render('---\ntitle: Chapter one\n---\n# Opening\n\nSome text.\n');

    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Opening');
    expect(root.textContent).toContain('Some text.');
    expect(root.textContent).not.toContain('title: Chapter one');
  });

  it('neither runs nor renders a script element', async () => {
    const root = await render(
      'Before.\n\n<script>(window as PreviewWindow).__previewRan = true;</script>\n\nAfter.\n',
    );

    expect(root.querySelector('script')).toBeNull();
    expect((window as PreviewWindow).__previewRan).toBeUndefined();
    expect(root.textContent).toContain('After.');
  });

  it('removes an inline event handler from a rendered image', async () => {
    const root = await render('<img src="missing.png" onerror="window.__previewRan = true">\n');

    expect(root.querySelector('[onerror]')).toBeNull();
    expect((window as PreviewWindow).__previewRan).toBeUndefined();
  });

  it('does not keep a javascript link', async () => {
    const root = await render('[click me](javascript:window.__previewRan=true)\n');

    const links = [...root.querySelectorAll('a')];
    for (const link of links) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });
});
