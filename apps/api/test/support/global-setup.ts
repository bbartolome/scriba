import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const contractsRoot = join(apiRoot, '..', '..', 'packages', 'contracts');
const tscBin = join(
  dirname(createRequire(import.meta.url).resolve('typescript/package.json')),
  'bin',
  'tsc',
);

/**
 * Builds the contracts package and the API before the tests run. Subpath imports resolve to
 * dist/, and the spawned-process tests run dist/main.js. CI runs `npm test` before `npm run build`,
 * so the tests cannot assume a prior build.
 */
export default function setup(): void {
  for (const cwd of [contractsRoot, apiRoot]) {
    execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.json'], { cwd, stdio: 'inherit' });
  }
}
