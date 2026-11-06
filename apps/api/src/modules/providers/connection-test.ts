import type {
  ConnectionTestResult,
  ConnectionTestStage,
  ProviderErrorCode,
} from '@bbartolome/scriba-contracts/providers';
import {
  classifyFailure,
  chatOnce,
  listModelIds,
  probeReach,
  type Endpoint,
} from './client/openai-compatible.js';
import { ProviderError, providerError } from './client/errors.js';
import { WaitTimedOut, timedWait } from './client/timed-wait.js';

/**
 * The connection test (spec #19, "Model list and connection test"): reach the server, list its
 * models, then send a one-token chat with the chosen model. The first failing stage is reported,
 * with an author-facing hint. The test makes one attempt per stage, with no retries, so the answer
 * is immediate. The key it is given is used for this test only, and nothing here stores it.
 */

export interface ConnectionTarget {
  readonly baseURL: string;
  /** The model to chat with. Empty means the first listed model. */
  readonly model: string;
  readonly timeout: number;
  /** The saved key, or a key typed into the form for this test only. */
  readonly apiKey: string | undefined;
}

const PULL_MODEL_HINT =
  'Pull a model on the host, for example with `ollama pull <model>`, then test again.';

/** Ollama's default port, which gets the hint about the host's listening address. */
function isOllamaPort(baseURL: string): boolean {
  try {
    return new URL(baseURL).port === '11434';
  } catch {
    return false;
  }
}

/** The author's next step for a failure, by code (spec: each stage maps to a hint). */
function hintFor(code: ProviderErrorCode, ollama: boolean): string | undefined {
  switch (code) {
    case 'PROVIDER_UNREACHABLE':
      return ollama
        ? 'Is Ollama running on the host, and listening on all interfaces (OLLAMA_HOST=0.0.0.0)? Outside Docker, try http://localhost:11434/v1.'
        : 'Check that the server is running and that the URL is reachable from the app.';
    case 'PROVIDER_UNAUTHORIZED':
      return 'The provider rejected the key. Check it, or replace it.';
    case 'PROVIDER_MODEL_NOT_FOUND':
      return 'The provider has no model with that name. Pick one from its model list.';
    case 'PROVIDER_NOT_CONFIGURED':
      return PULL_MODEL_HINT;
    case 'PROVIDER_TIMEOUT':
      return 'The provider did not answer in time. A slow local model may need a longer timeout.';
    case 'PROVIDER_RATE_LIMITED':
      return 'The provider is rate limiting requests. Wait a moment, then test again.';
    case 'PROVIDER_QUOTA_EXCEEDED':
      return 'This account is out of credit with the provider.';
    case 'PROVIDER_BAD_RESPONSE':
      return 'The server answered, but not like an OpenAI-compatible endpoint. The URL usually ends in /v1.';
    default:
      return undefined;
  }
}

/** Runs one call under the provider's timeout, with its own abort controller. */
function runCall<T>(timeoutMs: number, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  return timedWait(call(controller.signal), timeoutMs, () => controller.abort());
}

/** The coded error for a failed stage. A network error at the reach stage is always unreachable. */
function failureOf(caught: unknown, stage: ConnectionTestStage): ProviderError {
  if (caught instanceof ProviderError) return caught;
  if (caught instanceof WaitTimedOut) return providerError('PROVIDER_TIMEOUT');
  if (stage === 'reach') return providerError('PROVIDER_UNREACHABLE');
  return classifyFailure(caught, stage === 'chat' ? 'chat' : 'models', Date.now()).error;
}

export async function runConnectionTest(target: ConnectionTarget): Promise<ConnectionTestResult> {
  const started = Date.now();
  const endpoint: Endpoint = { baseURL: target.baseURL, apiKey: target.apiKey };
  const ollama = isOllamaPort(target.baseURL);

  const fail = (
    stage: ConnectionTestStage,
    error: ProviderError,
    modelCount?: number,
  ): ConnectionTestResult => {
    const hint = hintFor(error.code, ollama);
    return {
      ok: false,
      stage,
      latencyMs: Date.now() - started,
      ...(modelCount !== undefined ? { modelCount } : {}),
      error: {
        code: error.code,
        message: error.message,
        ...(hint !== undefined ? { hint } : {}),
      },
    };
  };

  try {
    await runCall(target.timeout, (signal) => probeReach(target.baseURL, signal));
  } catch (caught) {
    return fail('reach', failureOf(caught, 'reach'));
  }

  let models: string[];
  try {
    models = await runCall(target.timeout, (signal) => listModelIds(endpoint, signal));
  } catch (caught) {
    return fail('list-models', failureOf(caught, 'list-models'));
  }

  const model = target.model !== '' ? target.model : models[0];
  if (model === undefined) {
    return fail('chat', providerError('PROVIDER_NOT_CONFIGURED'), models.length);
  }

  try {
    await runCall(target.timeout, (signal) => chatOnce(endpoint, model, signal));
  } catch (caught) {
    return fail('chat', failureOf(caught, 'chat'), models.length);
  }

  return { ok: true, stage: 'chat', latencyMs: Date.now() - started, modelCount: models.length };
}
