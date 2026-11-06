import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * phase:contract acceptance 1: the slice builds and imports with no other subpath. Its compiled
 * files may import only Zod and their own siblings. These checks read dist/, so the suite builds it
 * first, as the project-store subpath test does.
 */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const DIST = join(PACKAGE_ROOT, 'dist', 'tool-registry');

describe('tool-registry subpath', () => {
  beforeAll(() => {
    const build = spawnSync(process.execPath, [TSC_BIN, '-p', 'tsconfig.json'], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(build.stderr + build.stdout, 'tsc build for the subpath test failed').toBe('');
    expect(build.status).toBe(0);
  });

  it('imports only zod and its own files at runtime', () => {
    const files = readdirSync(DIST).filter((file) => file.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    const importPattern = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const seen = new Set<string>();
    for (const file of files) {
      const source = readFileSync(join(DIST, file), 'utf8');
      const specifiers = [...source.matchAll(importPattern)].map((match) => match[1] ?? '');
      for (const specifier of specifiers) {
        seen.add(specifier);
        const allowed = specifier === 'zod' || specifier.startsWith('./');
        expect(allowed, `${file} imports ${specifier}`).toBe(true);
      }
    }
    // The scan must find the real imports, or the loop above would pass without checking anything.
    expect(seen.has('zod')).toBe(true);
    expect([...seen].some((specifier) => specifier.startsWith('./'))).toBe(true);
  });

  it('lists zod as the only runtime dependency of the package', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(['zod']);
  });
});
