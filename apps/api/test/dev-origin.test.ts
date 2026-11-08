import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Survey #16 §7 item 10: `npm run dev` serves the web app at 127.0.0.1:4200 with no proxy rewrite,
// so the API sees that Host and Origin. The API's Host and Origin allowlist admits them only when
// SCRIBA_DEV_ORIGINS names them. The dev script must set it, or /api and /events 403 through the
// dev proxy.
interface PackageJson {
  scripts: Record<string, string>;
}

const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as PackageJson;
const webPackage = JSON.parse(
  readFileSync(new URL('../../web/package.json', import.meta.url), 'utf8'),
) as PackageJson;

describe('npm run dev admits the dev web origin', () => {
  it('sets SCRIBA_DEV_ORIGINS to the host:port that the web dev server listens on', () => {
    const webPort = /--port (\d+)/.exec(webPackage.scripts['start'] ?? '')?.[1];

    expect(webPort).toBe('4200');
    expect(rootPackage.scripts['dev']).toContain(
      `SCRIBA_DEV_ORIGINS=127.0.0.1:${webPort} node --watch apps/api/dist/main.js`,
    );
  });
});
