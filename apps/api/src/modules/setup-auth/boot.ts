import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { SETUP_AUTH_ROUTES } from '@bbartolome/scriba-contracts/setup-auth';
import { type BootContext, APP_STATE_DIR, registerBootStep } from '../platform/index.js';
import { loadOrCreateSetupToken, writeSetupUrl } from './token/setup-token.js';
import { setCurrentSetupToken, setSetupLibrary } from './state.js';

const logger = new Logger('SetupAuth');

/**
 * The setup URL for this port and token. The link points at the handshake, with the token as a
 * query parameter. [provisional] The base is loopback; `SCRIBA_SETUP_URL_BASE` is not read yet.
 */
export function setupUrl(port: number, token: string): string {
  return `http://127.0.0.1:${port}${SETUP_AUTH_ROUTES.handshake.path}?token=${encodeURIComponent(token)}`;
}

/**
 * The pre-listen step. It creates or reads the setup token, sets it for the guard, writes the
 * setup URL to the state folder, and prints the URL on every start. The write happens before the
 * server listens, so a healthy `/healthz` implies the file exists (survey #18 §3).
 */
export async function setupAuthBoot({ config }: BootContext): Promise<void> {
  const stateDir = join(config.booksDir, APP_STATE_DIR);
  setSetupLibrary(config.booksDir);
  const token = loadOrCreateSetupToken(stateDir);
  setCurrentSetupToken(token);
  const url = setupUrl(config.port, token);
  writeSetupUrl(stateDir, url);
  logger.log(`Setup link: ${url}`);
}

/** Registers the setup-auth pre-listen step with Platform's boot. Returns the unregister function. */
export function registerSetupAuthBoot(): () => void {
  return registerBootStep(setupAuthBoot);
}
