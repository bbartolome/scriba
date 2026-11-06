import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * phase:contract acceptance 1 (no runtime dependency beyond Zod) and acceptance 4 (the Platform
 * sample check can import the project.yaml schema). These read dist/, so the suite builds it first,
 * as the exports test does.
 */
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const DIST = join(PACKAGE_ROOT, 'dist', 'project-store');

// Node's own resolver, from the repo root, the way a root-level CI check imports a workspace package.
const SAMPLE_CHECK_SCRIPT = `
const { ProjectYamlSchema } = await import('@bbartolome/scriba-contracts/project-store');
const withVersion = ProjectYamlSchema.safeParse({ schemaVersion: 1, title: 'Sample', genrePack: 'nonfiction' });
const withoutVersion = ProjectYamlSchema.safeParse({ title: 'Sample', genrePack: 'nonfiction' });
process.stdout.write(JSON.stringify({ withVersion: withVersion.success, withoutVersion: withoutVersion.success }));
`;

describe('project-store subpath', () => {
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

  it('imports the project.yaml schema from the repo root, as the sample check will', () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', SAMPLE_CHECK_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(run.stderr, 'root import of the project-store subpath failed').toBe('');
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual({ withVersion: true, withoutVersion: false });
  });
});
