import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { API_ROOT } from '../../src/modules/platform/config/paths.js';

/** The built entrypoint, which the global setup builds before the tests run. */
export const MAIN_JS = join(API_ROOT, 'dist', 'main.js');

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly output: string;
  readonly timedOut: boolean;
}

/**
 * Runs the built app as a separate process with only the given environment (plus PATH). Stdout
 * and stderr are captured together. A process that outlives the timeout is killed and reported.
 */
export function runAppProcess(
  env: Record<string, string>,
  timeoutMs = 20_000,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MAIN_JS], {
      env: { PATH: process.env.PATH ?? '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, output, timedOut });
    });
  });
}
