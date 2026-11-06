import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runChatReply, runModelsReply, type ReplyResult } from './reply.js';
import { findStepIndex, type RequestFacts, type Scenario } from './scenario.js';

/** How a recorded request ended. `rejected` requests were not valid chat bodies and took no turn. */
export type RecordOutcome =
  'completed' | 'dropped' | 'client-disconnected' | 'unmatched' | 'rejected';

export interface RecordedRequest {
  /** 0-based position among the scenario's requests since its last reset. */
  index: number;
  method: string;
  /** The path under the scenario, for example `/v1/chat/completions`. */
  path: string;
  /** Request headers with lowercase names. Authorization is kept, so a test can check the key. */
  headers: Record<string, string>;
  /** The parsed JSON body, or the raw text when it is not JSON. Null when there is no body. */
  body: unknown;
  /** For chat requests, the 0-based turn among the chat requests since reset. */
  turn: number | null;
  /** The index of the step that answered, or null when none did. */
  step: number | null;
  /** The HTTP status sent, or null when the connection was dropped before any head was sent. */
  status: number | null;
  /** `pending` while the reply runs. */
  outcome: RecordOutcome | 'pending';
  receivedAt: string;
}

interface ScenarioState {
  readonly scenario: Scenario;
  /** Chat requests counted since the last reset. This is the next turn index. */
  turns: number;
  requests: RecordedRequest[];
}

export interface MockOpenAiOptions {
  readonly scenarios: readonly Scenario[];
  /** Defaults to 127.0.0.1. */
  readonly host?: string;
  /** Defaults to 0, which picks a free port. */
  readonly port?: number;
}

export interface RunningMockOpenAi {
  /** The origin, for example `http://127.0.0.1:4010`. The SDK base URL is `<url>/scenario/<name>/v1`. */
  readonly url: string;
  close(): Promise<void>;
}

/**
 * Starts the mock. Requests go to `/scenario/<name>/v1/...`, so each scenario has its own turns and
 * its own recording. Mock-only endpoints sit beside them: `GET /scenario/<name>/__mock/requests`
 * and `POST /scenario/<name>/__mock/reset`.
 */
export async function startMockOpenAi(options: MockOpenAiOptions): Promise<RunningMockOpenAi> {
  const states = new Map<string, ScenarioState>();
  for (const scenario of options.scenarios) {
    if (states.has(scenario.name)) {
      throw new Error(`Duplicate mock scenario "${scenario.name}"`);
    }
    states.set(scenario.name, { scenario, turns: 0, requests: [] });
  }

  const host = options.host ?? '127.0.0.1';
  const server = createServer((req, res) => {
    handle(states, req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (res.headersSent) {
        res.destroy();
      } else {
        sendError(res, 500, `Mock server failure: ${message}`, 'mock_failure');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://${host}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function handle(
  states: ReadonlyMap<string, ScenarioState>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw = await readText(req);
  const path = new URL(req.url ?? '/', 'http://mock.invalid').pathname;

  if (req.method === 'GET' && path === '/__mock/health') {
    sendJson(res, 200, { status: 'ok', scenarios: [...states.keys()] });
    return;
  }

  const routed = /^\/scenario\/([^/]+)(\/.*)$/.exec(path);
  if (routed === null) {
    sendError(res, 404, `No route for ${req.method} ${path}.`, 'not_found');
    return;
  }
  const [, name = '', rest = ''] = routed;
  const state = states.get(name);
  if (state === undefined) {
    const known = [...states.keys()].join(', ') || 'none';
    sendError(
      res,
      404,
      `Unknown mock scenario "${name}". Known scenarios: ${known}.`,
      'scenario_not_found',
    );
    return;
  }

  if (req.method === 'GET' && rest === '/__mock/requests') {
    sendJson(res, 200, { scenario: name, requests: state.requests });
    return;
  }
  if (req.method === 'POST' && rest === '/__mock/reset') {
    state.requests = [];
    state.turns = 0;
    sendJson(res, 200, { scenario: name, reset: true });
    return;
  }
  if (req.method === 'POST' && rest === '/v1/chat/completions') {
    await handleChat(state, req, raw, res);
    return;
  }
  if (req.method === 'GET' && rest === '/v1/models') {
    handleModels(state, req, raw, res);
    return;
  }
  sendError(res, 404, `No mock route for ${req.method} ${path}.`, 'not_found');
}

async function handleChat(
  state: ScenarioState,
  req: IncomingMessage,
  raw: string,
  res: ServerResponse,
): Promise<void> {
  const parsed = parseChatBody(raw);
  if (!parsed.ok) {
    const record = addRecord(state, req, raw, null);
    record.status = 400;
    record.outcome = 'rejected';
    sendError(res, 400, parsed.message, 'invalid_request');
    return;
  }

  const body = parsed.value;
  const turn = state.turns;
  state.turns += 1;
  const record = addRecord(state, req, raw, turn);
  const messages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
  const facts: RequestFacts = {
    endpoint: 'chat',
    turn,
    lastMessage: lastMessageOf(messages),
    hasToolResult: messages.some((message) => isRecord(message) && message.role === 'tool'),
  };

  const stepIndex = findStepIndex(state.scenario, facts);
  if (stepIndex < 0) {
    record.status = 500;
    record.outcome = 'unmatched';
    sendError(
      res,
      500,
      `Scenario "${state.scenario.name}" has no step for chat turn ${turn}. Add a step whose match fits this request.`,
      'no_step_matched',
    );
    return;
  }

  record.step = stepIndex;
  const result = await runChatReply(res, state.scenario.steps[stepIndex]?.respond ?? [], {
    stream: body.stream === true,
    model: typeof body.model === 'string' ? body.model : 'mock-model',
  });
  settle(record, result);
}

function handleModels(
  state: ScenarioState,
  req: IncomingMessage,
  raw: string,
  res: ServerResponse,
): void {
  const facts: RequestFacts = {
    endpoint: 'models',
    turn: null,
    lastMessage: undefined,
    hasToolResult: false,
  };
  const record = addRecord(state, req, raw, null);
  const stepIndex = findStepIndex(state.scenario, facts);
  if (stepIndex < 0) {
    record.status = 500;
    record.outcome = 'unmatched';
    sendError(
      res,
      500,
      `Scenario "${state.scenario.name}" has no models step. Add {"match": {"endpoint": "models"}, "respond": [{"type": "models", "ids": []}]}.`,
      'no_step_matched',
    );
    return;
  }

  record.step = stepIndex;
  const reply = state.scenario.steps[stepIndex]?.respond[0];
  if (reply?.type !== 'models') {
    throw new Error('A models step must respond with a models reply.');
  }
  settle(record, runModelsReply(res, reply.ids));
}

function addRecord(
  state: ScenarioState,
  req: IncomingMessage,
  raw: string,
  turn: number | null,
): RecordedRequest {
  const record: RecordedRequest = {
    index: state.requests.length,
    method: req.method ?? 'GET',
    path: new URL(req.url ?? '/', 'http://mock.invalid').pathname.replace(/^\/scenario\/[^/]+/, ''),
    headers: headersOf(req),
    body: bodyOf(raw),
    turn,
    step: null,
    status: null,
    outcome: 'pending',
    receivedAt: new Date().toISOString(),
  };
  state.requests.push(record);
  return record;
}

function settle(record: RecordedRequest, result: ReplyResult): void {
  record.status = result.status;
  record.outcome = result.outcome;
}

function headersOf(req: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    Object.entries(req.headers).map(([name, value]) => [
      name,
      Array.isArray(value) ? value.join(', ') : (value ?? ''),
    ]),
  );
}

function bodyOf(raw: string): unknown {
  if (raw === '') {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function parseChatBody(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, message: 'Request body is not valid JSON.' };
  }
  if (!isRecord(value)) {
    return { ok: false, message: 'Request body must be a JSON object.' };
  }
  return { ok: true, value };
}

function lastMessageOf(messages: readonly unknown[]): RequestFacts['lastMessage'] {
  const last = messages.at(-1);
  if (!isRecord(last)) {
    return undefined;
  }
  return {
    role: typeof last.role === 'string' ? last.role : '',
    content: textOf(last.content),
  };
}

/** Message content is a string, or a list of parts whose text parts are joined. */
function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Errors use the OpenAI error shape, so the SDK reads them as API errors. */
function sendError(res: ServerResponse, status: number, message: string, code: string): void {
  sendJson(res, status, { error: { message, type: 'mock_error', code } });
}
