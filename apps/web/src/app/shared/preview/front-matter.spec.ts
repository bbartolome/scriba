import { stripFrontMatter } from './front-matter';

describe('stripFrontMatter', () => {
  it('removes the front matter block at the top of a draft', () => {
    const draft = '---\ntitle: Chapter one\ntags: [draft]\n---\n# Opening\n\nText.\n';

    expect(stripFrontMatter(draft)).toBe('# Opening\n\nText.\n');
  });

  it('removes a CRLF front matter block', () => {
    const draft = '---\r\ntitle: Chapter one\r\n---\r\n# Opening\r\n';

    expect(stripFrontMatter(draft)).toBe('# Opening\r\n');
  });

  it('removes an empty front matter block', () => {
    expect(stripFrontMatter('---\n---\nBody.\n')).toBe('Body.\n');
  });

  it('returns text with no front matter unchanged', () => {
    const draft = '# Opening\n\nText.\n';

    expect(stripFrontMatter(draft)).toBe(draft);
  });

  it('keeps a horizontal rule that is not at the top', () => {
    const draft = '# Opening\n\n---\n\nText.\n';

    expect(stripFrontMatter(draft)).toBe(draft);
  });

  it('keeps an unclosed opening fence', () => {
    const draft = '---\ntitle: never closed\n# Opening\n';

    expect(stripFrontMatter(draft)).toBe(draft);
  });
});
