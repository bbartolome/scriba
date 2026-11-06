import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ToolArgsInvalidBodySchema,
  ToolDetailSchema,
  ValidateResponseSchema,
  type ToolDetail,
} from '@bbartolome/scriba-contracts/tool-registry';
import {
  createTempLibrary,
  startApp,
  withSession,
  type RunningApp,
  type TempLibrary,
} from '../support/app.js';

/**
 * phase:form-renderer (survey 21 §3, spike): one fixture-backed response drives the form and the
 * node body, and submitting sends the arguments to validate. The tests go through HTTP only.
 */

interface Answer {
  readonly status: number;
  readonly body: unknown;
}

/** The cold-open tool, as a built-in of a fixture pack (the loader reads it like any built-in). */
const COLD_OPEN_PACKS_DIR = fileURLToPath(new URL('../fixtures/packs/cold-open/', import.meta.url));

let library: TempLibrary;
let running: RunningApp;

beforeAll(async () => {
  library = await createTempLibrary();
  running = await startApp(library.booksDir, { packsDir: COLD_OPEN_PACKS_DIR });
});

afterAll(async () => {
  await running.app.close();
  await library.cleanup();
});

async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer> {
  const init = withSession(running, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await fetch(`${running.baseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, body: text === '' ? undefined : JSON.parse(text) };
}

async function detail(): Promise<ToolDetail> {
  const answer = await request('GET', '/api/tools/cold_open');
  expect(answer.status).toBe(200);
  return ToolDetailSchema.parse(answer.body);
}

/** Every key in an object tree, at any depth. */
function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysDeep(child)]);
}

describe('phase:form-renderer: one response drives the form and the node body', () => {
  it('returns the cold-open detail with the three views, which the contract parses', async () => {
    const body = await detail();
    expect(body.name).toBe('cold_open');
    expect(body.enabled).toBe(true);
    // The real lint runs now. Its one finding is spike note 3: the fixture lists `style` as required,
    // and a style field is never required, so the lint warns and nothing blocks.
    expect(
      body.lint.diagnostics.map((diagnostic) => [diagnostic.rule, diagnostic.severity]),
    ).toEqual([['style-required', 'warning']]);
    expect(body.form).toBeDefined();
    expect(body.ports).toBeDefined();
    expect(body.functionSchema).toBeDefined();
  });

  it('comes back with the form fields in declared order, each with its control', async () => {
    const { form } = await detail();
    expect(form?.fields.map((field) => field.key)).toEqual(['person', 'notes', 'style', 'tone']);
    expect(form?.fields.map((field) => field.control)).toEqual([
      'entity-picker',
      'text',
      'style-picker',
      'select',
    ]);
    const tone = form?.fields.find((field) => field.key === 'tone');
    expect(tone?.options).toEqual(['warm', 'dry', 'urgent']);
    expect(tone?.default).toBe('warm');
  });

  it('gives the node body typed ports for the entity, text and style fields, and the rest as params', async () => {
    const { ports } = await detail();
    expect(ports?.inputs.map((port) => [port.key, port.type])).toEqual([
      ['person', 'entity'],
      ['notes', 'text'],
      ['style', 'style'],
    ]);
    expect(ports?.params).toEqual(['tone']);
    expect(ports?.output).toEqual({ key: 'output', type: 'text', kind: 'draft' });
  });

  it('restricts the entity picker to the fixture kind, person', async () => {
    const { form } = await detail();
    const person = form?.fields.find((field) => field.key === 'person');
    expect(person?.entityKinds).toEqual(['person']);
    expect(person?.required).toBe(true);
  });

  it('never marks a style field as required, even though the fixture lists it', async () => {
    const body = await detail();
    expect(body.form?.fields.find((field) => field.key === 'style')?.required).toBe(false);
    expect(body.ports?.inputs.find((port) => port.key === 'style')?.required).toBe(false);
    expect(body.functionSchema?.function.parameters['required']).toEqual(['person']);
  });

  it('adds the plain kind hint to the entity and style descriptions in the function schema', async () => {
    const { functionSchema } = await detail();
    const properties = functionSchema?.function.parameters['properties'] as Record<
      string,
      { description?: string }
    >;
    expect(properties['person']?.description).toContain('Entity ID(s) of kind person.');
    expect(properties['style']?.description).toContain(
      "Style-profile entity ID; defaults to the project's style profile.",
    );
  });

  it('emits a function schema with no x- key that passes the draft-07 meta-schema', async () => {
    const { functionSchema } = await detail();
    const parameters = functionSchema?.function.parameters ?? {};
    expect(keysDeep(parameters).filter((key) => key.startsWith('x-'))).toEqual([]);
    expect(parameters['additionalProperties']).toBe(false);
    const ajv = new Ajv({ strict: true });
    expect(ajv.validateSchema(parameters)).toBe(true);
  });

  it('answers an unknown tool with TOOL_NOT_FOUND, and refuses a request with no session', async () => {
    const missing = await request('GET', '/api/tools/no_such_tool');
    expect(missing.status).toBe(404);
    expect((missing.body as { error: { code: string } }).error.code).toBe('TOOL_NOT_FOUND');

    const anonymous = await fetch(`${running.baseUrl}/api/tools/cold_open`);
    expect(anonymous.status).toBe(401);
  });
});

describe('phase:form-renderer: submit sends the arguments to validate', () => {
  it('returns the arguments with defaults applied, and the entity IDs to resolve', async () => {
    const answer = await request('POST', '/api/tools/cold_open/validate', {
      mode: 'full',
      arguments: { person: 'ada-lovelace', notes: 'Her first program.' },
    });
    expect(answer.status).toBe(200);
    expect(ValidateResponseSchema.safeParse(answer.body).success).toBe(true);
    expect(answer.body).toEqual({
      arguments: { person: 'ada-lovelace', notes: 'Her first program.', tone: 'warm' },
      entities: [{ field: 'person', id: 'ada-lovelace', style: false }],
    });
  });

  it('names each missing required field and each wrong enum value, with a readable message', async () => {
    const answer = await request('POST', '/api/tools/cold_open/validate', {
      mode: 'full',
      arguments: { tone: 'loud' },
    });
    expect(answer.status).toBe(422);
    const body = ToolArgsInvalidBodySchema.parse(answer.body);
    expect(body.error.code).toBe('TOOL_ARGS_INVALID');
    expect(body.error.details.issues).toEqual([
      { path: '/person', message: 'This field is required.' },
      { path: '/tone', message: 'Must be one of: warm, dry, urgent. Received: "loud".' },
    ]);
    expect(body.error.message.split('\n')).toEqual([
      "cold_open: the arguments do not match the tool's inputs.",
      '- person: This field is required.',
      '- tone: Must be one of: warm, dry, urgent. Received: "loud".',
    ]);
  });

  it('reports an unknown field with the list of allowed fields', async () => {
    const answer = await request('POST', '/api/tools/cold_open/validate', {
      mode: 'full',
      arguments: { person: 'ada-lovelace', mood: 'grim' },
    });
    expect(answer.status).toBe(422);
    expect(
      (answer.body as { error: { details: { issues: unknown[] } } }).error.details.issues,
    ).toEqual([
      { path: '/mood', message: 'Unknown field. Allowed fields: person, notes, style, tone.' },
    ]);
  });

  it('passes a params-mode node whose only missing fields are ports, and rejects a port key', async () => {
    const passes = await request('POST', '/api/tools/cold_open/validate', {
      mode: 'params',
      arguments: { tone: 'dry' },
    });
    expect(passes.status).toBe(200);
    expect(passes.body).toEqual({ arguments: { tone: 'dry' }, entities: [] });

    const rejects = await request('POST', '/api/tools/cold_open/validate', {
      mode: 'params',
      arguments: { person: 'ada-lovelace' },
    });
    expect(rejects.status).toBe(422);
    expect(
      (rejects.body as { error: { details: { issues: unknown[] } } }).error.details.issues,
    ).toEqual([
      {
        path: '/person',
        message: 'This field is a port. Params mode checks only the non-port fields.',
      },
    ]);
  });

  it('answers a request with no mode with a validation failure', async () => {
    const answer = await request('POST', '/api/tools/cold_open/validate', { arguments: {} });
    expect(answer.status).toBe(400);
  });
});
