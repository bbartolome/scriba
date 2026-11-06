import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MarkdownComponent, provideMarkdown } from 'ngx-markdown';
import { stripFrontMatter } from './front-matter';

/**
 * A Markdown preview of a draft. The front matter is hidden. The output is sanitised by ngx-markdown
 * through Angular's `DomSanitizer` (`SecurityContext.HTML`), so a script or an inline event handler
 * is neither run nor rendered.
 */
@Component({
  selector: 'app-markdown-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarkdownComponent],
  providers: [provideMarkdown()],
  template: `<markdown class="preview" [data]="body()"></markdown>`,
  styles: `
    .preview {
      display: block;
      max-width: 72ch;
      font: var(--mat-sys-body-large);
      overflow-wrap: anywhere;
    }
  `,
})
export class MarkdownPreviewView {
  /** The draft as stored, front matter included. */
  readonly draft = input.required<string>();

  protected readonly body = computed(() => stripFrontMatter(this.draft()));
}
