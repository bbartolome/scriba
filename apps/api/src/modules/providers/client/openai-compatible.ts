import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from 'openai';
import type { ProviderErrorCode } from '@bbartolome/scriba-contracts/providers';
import {
  type ChatMessage,
  type ToolChoice,
  type ToolFunctionDefinition,
} from './provider-client.js';
import { providerError, type ProviderError } from './errors.js';
import { parseRetryAfter } from './retry-policy.js';

/**
 * The only file that imports `openai` (survey 19 §2). It maps the client's own types onto the SDK
 * and back. Everything else in the module sees our types and our coded errors.
 *
 * SDK rules (survey 19 §1, §7 Q7):
 * - Every client gets an explicit `baseURL` and `apiKey`, so the SDK never falls back to
 *   `OPENAI_API_KEY` or `OPENAI_BASE_URL`. Keyless providers get a fixed placeholder key.
 * - `maxRetries` is 0. The client owns retries (retry-policy.ts).
 * - Its `timeout` is set to the largest delay a timer accepts, so the client's own timers govern
 *   (timed-wait.ts). The SDK bounds only the wait for response headers, not idle gaps in the body,
 *   which is why the client enforces the rule itself. // provisional: survey 19 §7 Q7
 * - The organization, project, admin and webhook options are set to null, so the SDK does not read
 *   `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID`, `OPENAI_ADMIN_KEY` or `OPENAI_WEBHOOK_SECRET`. Logging is
 *   off, so the SDK prints nothing. The SDK still reads `OPENAI_CUSTOM_HEADERS` when it is set in
 *   the environment, and no option turns that off.
 */

/** Sent for keyless providers, because the SDK requires a non-empty key. */
export const KEYLESS_PLACEHOLDER_KEY = 'scriba-keyless';

/** The largest delay the timer API accepts, so the SDK's own timeout never fires first. */
const SDK_TIMEOUT_MS = 2_147_483_647;

export interface Endpoint {
  readonly baseURL: string;
  /** The key from the secrets file, or undefined for a keyless provider. */
  readonly apiKey: string | undefined;
}

function sdkClient(endpoint: Endpoint): OpenAI {
  return new OpenAI({
    baseURL: endpoint.baseURL,
    apiKey: endpoint.apiKey ?? KEYLESS_PLACEHOLDER_KEY,
    maxRetries: 0,
    timeout: SDK_TIMEOUT_MS,
    organization: null,
    project: null,
    adminAPIKey: null,
    webhookSecret: null,
    logLevel: 'off',
  });
}

/** Maps a client message to the SDK's message type. Tool-call arguments stay the raw string. */
function sdkMessage(message: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls !== undefined && message.toolCalls.length > 0
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: call.rawArguments },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}

function sdkTool(tool: ToolFunctionDefinition): OpenAI.Chat.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  };
}

function sdkToolChoice(choice: ToolChoice): OpenAI.Chat.ChatCompletionToolChoiceOption {
  return typeof choice === 'string'
    ? choice
    : { type: 'function', function: { name: choice.name } };
}

export interface ChatInput {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolFunctionDefinition[];
  readonly toolChoice?: ToolChoice;
  readonly temperature: number;
  /** Sent as `max_tokens`, which Ollama, LM Studio and OpenRouter accept (spec, `max_tokens`). */
  readonly maxTokens: number;
}

/**
 * The request body. `contextSize` is not sent, because the compatible endpoint has no field for it
 * (spec #19, "Provider config"). // provisional: survey 19 §7 Q12
 */
function chatBody(
  input: ChatInput,
): Omit<OpenAI.Chat.ChatCompletionCreateParamsStreaming, 'stream'> {
  const hasTools = input.tools !== undefined && input.tools.length > 0;
  return {
    model: input.model,
    messages: input.messages.map(sdkMessage),
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    ...(hasTools
      ? {
          tools: input.tools?.map(sdkTool),
          ...(input.toolChoice !== undefined
            ? { tool_choice: sdkToolChoice(input.toolChoice) }
            : {}),
        }
      : {}),
  };
}

/** Starts a streamed chat. It resolves once the response headers arrive. */
export async function startChatStream(
  endpoint: Endpoint,
  input: ChatInput,
  signal: AbortSignal,
): Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>> {
  return sdkClient(endpoint).chat.completions.create(
    { ...chatBody(input), stream: true },
    { signal },
  );
}

/** A one-token, non-streamed chat, for the connection test's last stage. */
export async function chatOnce(
  endpoint: Endpoint,
  model: string,
  signal: AbortSignal,
): Promise<void> {
  await sdkClient(endpoint).chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: 'Reply with one word.' }],
      max_tokens: 1,
      stream: false,
    },
    { signal },
  );
}

/** The provider's model ids, in the order the server lists them. */
export async function listModelIds(endpoint: Endpoint, signal: AbortSignal): Promise<string[]> {
  const page = await sdkClient(endpoint).models.list({ signal });
  return page.data.map((model) => model.id);
}

/**
 * Reaches the server without any model call: any HTTP response counts as reached, even a 404 for
 * the bare base URL (connection test, stage `reach`). A network failure rejects.
 */
export async function probeReach(baseURL: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(baseURL, { method: 'GET', signal });
  await response.body?.cancel();
}

/** Which call failed. A 404 means something different for each. */
export type CallStage = 'chat' | 'models' | 'reach';

/** The coded error for a failed call, and whether the client may retry it. */
export interface FailureClass {
  readonly error: ProviderError;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
}

function failure(code: ProviderErrorCode, retryable: boolean, retryAfterMs?: number): FailureClass {
  return retryAfterMs === undefined
    ? { error: providerError(code), retryable }
    : { error: providerError(code), retryable, retryAfterMs };
}

/**
 * A network failure below the SDK's own error types. The body reader raises a `TypeError` when the
 * socket closes mid-body, with the socket error as its cause (checked against Node's undici).
 */
function isTransportFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return (
    error.message === 'terminated' || error.message === 'fetch failed' || error.cause !== undefined
  );
}

/**
 * Maps a failed SDK call to a coded error (spec #19, "Retry boundary" and "Errors"). The mapping
 * uses only the status, the error code and the connection type, never the provider's message.
 * `retryAfterMs` comes from the `Retry-After` header, when there is one.
 */
export function classifyFailure(error: unknown, stage: CallStage, now: number): FailureClass {
  if (error instanceof APIUserAbortError) return failure('PROVIDER_ABORTED', false);
  if (error instanceof APIConnectionTimeoutError) return failure('PROVIDER_TIMEOUT', true);
  if (error instanceof APIConnectionError) return failure('PROVIDER_UNREACHABLE', true);
  if (isTransportFailure(error)) return failure('PROVIDER_UNREACHABLE', true);
  if (!(error instanceof APIError) || typeof error.status !== 'number') {
    return failure('PROVIDER_BAD_RESPONSE', false);
  }

  const status = error.status;
  if (status === 401 || status === 403) return failure('PROVIDER_UNAUTHORIZED', false);
  if (status === 404) {
    return stage === 'chat'
      ? failure('PROVIDER_MODEL_NOT_FOUND', false)
      : failure('PROVIDER_BAD_RESPONSE', false);
  }
  if (status === 408) return failure('PROVIDER_TIMEOUT', true);
  if (status === 409) return failure('PROVIDER_BAD_RESPONSE', true);
  if (status === 429) {
    // Out of credit is not a rate limit, so it is not retried, even though it is a 429.
    if (error.code === 'insufficient_quota') return failure('PROVIDER_QUOTA_EXCEEDED', false);
    const retryAfter = parseRetryAfter(error.headers?.get('retry-after') ?? null, now);
    return failure('PROVIDER_RATE_LIMITED', true, retryAfter);
  }
  if (status === 504) return failure('PROVIDER_TIMEOUT', true);
  if (status >= 500) return failure('PROVIDER_UNREACHABLE', true);
  return failure('PROVIDER_BAD_RESPONSE', false);
}

/** The SDK's chunk types, re-exported so that no other file in the module imports the SDK. */
export type ChatChunk = OpenAI.Chat.ChatCompletionChunk;
export type ChunkToolCallDelta = NonNullable<
  OpenAI.Chat.ChatCompletionChunk.Choice.Delta['tool_calls']
>[number];
