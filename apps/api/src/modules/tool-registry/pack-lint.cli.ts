import { resolve } from 'node:path';
import { runPackLint } from './catalog/pack-lint.js';

/**
 * The pack-lint command for CI: `node apps/api/dist/modules/tool-registry/pack-lint.cli.js [packsDir]`.
 * The packs folder is the first argument, then `SCRIBA_PACKS_DIR`, then the image default. It prints
 * one line per diagnostic and exits 1 when any error was found.
 */
const argument = process.argv[2];
const packsDir = resolve(argument ?? process.env['SCRIBA_PACKS_DIR'] ?? '/opt/scriba/packs');
const report = await runPackLint(packsDir);
for (const line of report.lines) {
  console.log(line);
}
process.exitCode = report.exitCode;
