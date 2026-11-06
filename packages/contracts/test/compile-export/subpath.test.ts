import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * phase:contract acceptance 1: the subpath builds and imports with the slices it names. Its compiled
 * files may import Zod, their own siblings, and the Project store and Platform slices, which the
 * shapes name (file references, the project id, the SHA-256 digest, the envelope and semver). These
 * checks read dist/, so the suite builds it first, as the other subpath tests do.
 */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const DIST = join(PACKAGE_ROOT, 'dist', 'compile-export');

/** The only import specifiers the compiled slice may use. */
const ALLOWED_SPECIFIERS = new Set(['zod', '../project-store/index.js', '../platform/index.js']);

// Node's own resolver, from the repo root, the way a root-level CI check imports a workspace package.
const SUBPATH_SCRIPT = `
const compileExport = await import('@bbartolome/scriba-contracts/compile-export');
const sha = 'a'.repeat(64);
const view = { entries: [], totals: { body: 0, manuscript: 0 }, orderSource: 'alphabetical', warnings: [], revision: sha };
process.stdout.write(JSON.stringify({
  view: compileExport.ManuscriptViewSchema.safeParse(view).success,
  badPath: compileExport.OrderEntrySchema.safeParse({ path: 'sources/a.md' }).success,
  routes: compileExport.COMPILE_EXPORT_ROUTES.manuscript.path,
  codes: compileExport.COMPILE_EXPORT_ERROR_CODES.length,
}));
`;

describe('compile-export subpath', () => {
  beforeAll(() => {
    const build = spawnSync(process.execPath, [TSC_BIN, '-p', 'tsconfig.json'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(build.stderr + build.stdout, 'tsc build for the subpath test failed').toBe('');
    expect(build.status).toBe(0);
  });

  it('imports only zod, its own files, and the project-store and platform slices', () => {
    const files = readdirSync(DIST).filter((file) => file.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const seen = new Set<string>();
    for (const file of files) {
      const source = readFileSync(join(DIST, file), 'utf8');
      const specifiers = [...source.matchAll(importPattern)].map((match) => match[1] ?? '');
      for (const specifier of specifiers) {
        seen.add(specifier);
        const allowed = ALLOWED_SPECIFIERS.has(specifier) || specifier.startsWith('./');
        expect(allowed, `${file} imports ${specifier}`).toBe(true);
      }
    }
    // The scan must find the real imports, or the loop above would pass without checking anything.
    expect(seen.has('zod')).toBe(true);
    expect(seen.has('../project-store/index.js')).toBe(true);
    expect(seen.has('../platform/index.js')).toBe(true);
  });

  it('lists zod as the only runtime dependency of the package', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(['zod']);
  });

  it('imports from the repo root by the package subpath name', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', SUBPATH_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr, 'root import of the compile-export subpath failed').toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({
      view: true,
      badPath: false,
      routes: '/api/compile-export/projects/:projectId/manuscript',
      codes: 10,
    });
  });
});
