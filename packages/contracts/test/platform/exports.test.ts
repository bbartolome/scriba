import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Runs after `npm run build`: these checks read dist/ and the emitted package.json.
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SUBPATHS = [
  'platform',
  'setup-auth',
  'providers',
  'project-store',
  'tool-registry',
  'agent-loop',
  'graph-runner',
  'compile-export',
  'shell',
  'genre-packs',
] as const;

interface PackageJson {
  name: string;
  exports: Record<string, { types?: string; import?: string }>;
}

const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageJson;

// Node's own resolver runs the check, not Vite's, so it matches how NestJS loads the package.
// The child process has the package as its cwd, so self-reference by package name applies.
const RESOLVE_SCRIPT = `
const subpaths = ${JSON.stringify(SUBPATHS)};
const resolved = {};
for (const slug of subpaths) {
  const spec = '@bbartolome/scriba-contracts/' + slug;
  resolved[slug] = import.meta.resolve(spec);
  await import(spec);
}
let rootResolves = true;
try {
  import.meta.resolve('@bbartolome/scriba-contracts');
} catch {
  rootResolves = false;
}
process.stdout.write(JSON.stringify({ resolved, rootResolves }));
`;

describe('package exports', () => {
  it('has exactly the ten subpath keys and no "." export', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(SUBPATHS.map((s) => `./${s}`).sort());
    // toHaveProperty reads '.' as a path separator, so check the key list directly.
    expect(Object.keys(pkg.exports)).not.toContain('.');
  });

  it('maps each subpath to dist/<slug>/index.d.ts and index.js', () => {
    for (const slug of SUBPATHS) {
      expect(pkg.exports[`./${slug}`]).toEqual({
        types: `./dist/${slug}/index.d.ts`,
        import: `./dist/${slug}/index.js`,
      });
    }
  });

  it('emits index.js and index.d.ts for every subpath in dist', () => {
    for (const slug of SUBPATHS) {
      for (const file of ['index.js', 'index.d.ts']) {
        const path = join(PACKAGE_ROOT, 'dist', slug, file);
        expect(existsSync(path), `missing ${path}; run npm run build first`).toBe(true);
      }
    }
  });

  it('resolves and loads every subpath under Node, and not the bare package name', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', RESOLVE_SCRIPT], {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr, 'node resolve/import failed').toBe('');
    expect(run.status).toBe(0);

    const { resolved, rootResolves } = JSON.parse(run.stdout) as {
      resolved: Record<string, string>;
      rootResolves: boolean;
    };
    for (const slug of SUBPATHS) {
      expect(resolved[slug]).toMatch(new RegExp(`/dist/${slug}/index\\.js$`));
    }
    expect(rootResolves).toBe(false);
  });
});
