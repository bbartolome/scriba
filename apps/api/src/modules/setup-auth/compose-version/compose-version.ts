import type { ComposeVersionStatus } from '@bbartolome/scriba-contracts/setup-auth';
import { parseScribaEnv, readPackageVersion } from '../../platform/index.js';

/**
 * The compose version this image expects. [provisional: survey 18 §4] The survey says the expected
 * value is a constant in Platform's version info, but no baked constant exists on main yet (no
 * `deploy/compose-version`), and Platform's `composeVersion` reads the environment. The image's own
 * version stands in until phase:ci-publish bakes the value. Read once, at load.
 */
const EXPECTED_COMPOSE_VERSION = readPackageVersion();

/**
 * The compose-version status from the expected and the actual values (spec, "Compose-version
 * mismatch"). `unknown` when the variable is unset, `ok` when the two are equal, and `mismatch`
 * when both are set and differ. A newer stamp than the image expects is a mismatch too, because
 * the contract defines the state by equality.
 */
export function composeVersionStatus(
  expected: string,
  actual: string | undefined,
): ComposeVersionStatus {
  if (actual === undefined) {
    return { state: 'unknown', expected, actual: null };
  }
  return { state: actual === expected ? 'ok' : 'mismatch', expected, actual };
}

/** The status for this process: the image's expected version against `SCRIBA_COMPOSE_VERSION`. */
export function currentComposeVersionStatus(): ComposeVersionStatus {
  const { composeVersion } = parseScribaEnv(process.env);
  return composeVersionStatus(EXPECTED_COMPOSE_VERSION, composeVersion);
}
