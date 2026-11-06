import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenarioDir } from './scenario.js';
import { startMockOpenAi } from './server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4010;
const USAGE = 'Usage: npm run mock:openai -- [--host 127.0.0.1] [--port 4010]';

interface CliOptions {
  readonly host: string;
  readonly port: number;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--host' && value !== undefined) {
      host = value;
      i += 1;
    } else if (flag === '--port' && value !== undefined) {
      if (!/^[0-9]+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
        throw new Error(`--port must be an integer from 1 to 65535, not "${value}". ${USAGE}`);
      }
      port = Number(value);
      i += 1;
    } else {
      throw new Error(`Unknown or incomplete argument "${flag ?? ''}". ${USAGE}`);
    }
  }
  return { host, port };
}

/** The e2e package root, found by walking up to its package.json. It works from fixtures/ and from dist/. */
function findPackageRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Could not find the e2e package root (package.json) above the mock server.');
    }
    dir = parent;
  }
  return dir;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const scenarioDir = join(findPackageRoot(), 'fixtures', 'mock-openai', 'scenarios');
  const scenarios = loadScenarioDir(scenarioDir);

  const mock = await startMockOpenAi({ scenarios, host: options.host, port: options.port });
  console.log(`Mock OpenAI server listening on ${mock.url}`);
  for (const scenario of scenarios) {
    console.log(`  ${mock.url}/scenario/${scenario.name}/v1`);
  }

  const stop = (): void => {
    mock.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      },
    );
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
