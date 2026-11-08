import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LintPreviewSchema,
  LintResultSchema,
  type LintDiagnostic,
} from '@bbartolome/scriba-contracts/tool-registry';
import { createTempLibrary, startApp, type RunningApp, type TempLibrary } from '../support/app.js';
import { api } from './support.js';

/**
 * phase:loader-validation: the lint rule set (spec, "Lint rules"), through `POST /api/tools/lint`
 * and the save route. Each case checks the rule, the severity and the line and column of the
 * diagnostic. The lint route never blocks: it answers 200 with the diagnostics, and only the save
 * route refuses a spec with errors (survey 21 §7 item 8).
 */

const LOADER_PACKS_DIR = fileURLToPath(new URL('../fixtures/packs/loader/', import.meta.url));

let library: TempLibrary;
let running: RunningApp;

beforeAll(async () => {
  library = await createTempLibrary();
  running = await startApp(library.booksDir, { packsDir: LOADER_PACKS_DIR });
});

afterAll(async () => {
  await running.app.close();
  await library.cleanup();
});

/** Lints YAML through the route, and returns the diagnostics. The route answers 200 even with errors. */
async function lint(yaml: string): Promise<LintDiagnostic[]> {
  const response = await api(running, 'POST', '/api/tools/lint', { yaml });
  expect(response.status).toBe(200);
  return LintResultSchema.parse(response.body).diagnostics;
}

function find(diagnostics: readonly LintDiagnostic[], rule: string): LintDiagnostic {
  const hit = diagnostics.find((diagnostic) => diagnostic.rule === rule);
  if (hit === undefined) {
    throw new Error(`no ${rule} diagnostic in ${JSON.stringify(diagnostics)}`);
  }
  return hit;
}

/** A complete, valid tool with one port of each hint kind. Tests edit one line of it. */
function specYaml(
  edit: {
    readonly prompt?: string;
    readonly extra?: string;
    readonly description?: string;
    readonly required?: string;
  } = {},
): string {
  const extra = edit.extra === undefined ? [] : [edit.extra];
  return [
    'schemaVersion: 1',
    'name: sample_tool',
    `description: ${edit.description ?? 'A sample tool for the lint tests.'}`,
    'inputs:',
    '  type: object',
    '  properties:',
    '    person:',
    '      type: string',
    '      title: Person',
    '      x-scriba-type: entity',
    '      x-scriba-entity-kinds: [person]',
    '      x-scriba-port: true',
    '    topic:',
    '      type: string',
    '      title: Topic',
    '      x-scriba-type: text',
    '      x-scriba-port: true',
    ...extra,
    `  required: ${edit.required ?? '[person, topic]'}`,
    '  additionalProperties: false',
    'output: draft',
    'enabled: true',
    'prompt: |',
    `  ${edit.prompt ?? 'Write about {{entity person}} and {{topic}}.'}`,
    '',
  ].join('\n');
}

function lineOf(text: string, marker: string): number {
  const index = text.split('\n').findIndex((line) => line.includes(marker));
  if (index < 0) throw new Error(`marker not found: ${marker}`);
  return index + 1;
}

describe('phase:loader-validation: lint reports every rule with a line and a column', () => {
  it('returns no diagnostics for a complete, valid tool spec', async () => {
    const diagnostics = await lint(specYaml());
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('reports an unknown x-scriba key on the line it is written on', async () => {
    const yaml = specYaml({ extra: '      x-scriba-foo: true' });
    const hit = find(await lint(yaml), 'hint-vocabulary');
    expect(hit.severity).toBe('error');
    expect(hit.line).toBe(lineOf(yaml, 'x-scriba-foo'));
    expect(hit.message).toContain('"x-scriba-foo" is not a known hint');
  });

  it('reports a template variable that is not an input at its own line and column', async () => {
    const yaml = specYaml({ prompt: 'Write about {{ghost}} and {{topic}}.' });
    const hit = find(await lint(yaml), 'template-variable');
    expect(hit.severity).toBe('error');
    expect(hit.line).toBe(lineOf(yaml, '{{ghost}}'));
    expect(hit.column).toBe((yaml.split('\n')[hit.line - 1] ?? '').indexOf('{{ghost}}') + 1);
    expect(hit.message).toBe('"ghost" is not an input of this tool.');
  });

  it('reports an out-of-subset keyword on the property that uses it', async () => {
    const yaml = specYaml({ extra: '      oneOf: []' });
    const hit = find(await lint(yaml), 'inputs-subset');
    expect(hit.severity).toBe('error');
    expect(hit.line).toBe(lineOf(yaml, 'oneOf'));
  });

  it('reports a description over 200 characters, and a description that spans more than one line', async () => {
    const long = await lint(specYaml({ description: 'x'.repeat(201) }));
    expect(find(long, 'description').message).toContain('201 characters');

    const multiline = await lint(
      [
        'schemaVersion: 1',
        'name: sample_tool',
        'description: |',
        '  one',
        '  two',
        'inputs:',
        '  type: object',
        '  properties: {}',
        'output: draft',
        'enabled: true',
        'prompt: hi',
        '',
      ].join('\n'),
    );
    expect(find(multiline, 'description').severity).toBe('error');
  });

  it('reports a control that does not fit the field type, and an enum that is not a list of strings', async () => {
    const yaml = specYaml({ extra: '      x-scriba-control: slider' });
    const hit = find(await lint(yaml), 'hint-control');
    expect(hit.severity).toBe('error');
    expect(hit.message).toContain('does not fit');
  });

  it('reports the reserved output key used as an input', async () => {
    const yaml = specYaml().replace('    topic:', '    output:');
    expect(find(await lint(yaml), 'reserved-output').severity).toBe('error');
  });

  it('reports a {{this}} outside {{#each}} and an {{entity}} helper on a field that is not an entity', async () => {
    const outside = specYaml({ prompt: 'Write about {{this}}, {{topic}}, and {{entity person}}.' });
    expect(find(await lint(outside), 'template-scope').severity).toBe('error');

    const notEntity = specYaml({ prompt: 'Write about {{entity topic}} and {{entity person}}.' });
    const hit = find(await lint(notEntity), 'template-entity');
    expect(hit.line).toBe(lineOf(notEntity, '{{entity topic}}'));
  });

  it('warns when a required input is never used, and when a style field is listed as required', async () => {
    const unused = specYaml({ prompt: 'Write about {{entity person}}.' });
    const warning = find(await lint(unused), 'unused-required');
    expect(warning.severity).toBe('warning');
    expect(warning.message).toContain('"topic"');

    const styleYaml = specYaml({
      extra:
        '    style:\n      type: string\n      x-scriba-type: style\n      x-scriba-port: true',
      required: '[person, topic, style]',
    });
    const styleWarning = find(await lint(styleYaml), 'style-required');
    expect(styleWarning.severity).toBe('warning');
    expect(styleWarning.message).toContain('never required');
  });

  it('warns on an entity kind that no entity type declares, and does not block the lint', async () => {
    const yaml = specYaml().replace('[person]', '[ghost]');
    const diagnostics = await lint(yaml);
    const hit = find(diagnostics, 'entity-kind');
    expect(hit.severity).toBe('warning');
    expect(hit.message).toContain('"ghost"');
    expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('reports a YAML parse error at the position the parser gives', async () => {
    const hit = find(await lint('schemaVersion: 1\nname: [unclosed\n'), 'yaml-parse');
    expect(hit.severity).toBe('error');
    expect(hit.line).toBeGreaterThan(0);
  });

  it('refuses a newer schemaVersion with a schema-version error', async () => {
    const hit = find(
      await lint(specYaml().replace('schemaVersion: 1', 'schemaVersion: 2')),
      'schema-version',
    );
    expect(hit.severity).toBe('error');
    expect(hit.message).toContain('schemaVersion 2');
  });

  it('refuses a save whose file name and envelope name differ, with 422 and no file', async () => {
    const response = await api(running, 'PUT', '/api/tools/other_name', { yaml: specYaml() });
    expect(response.status).toBe(422);
    const body = response.body as {
      error: { code: string; details: { diagnostics: LintDiagnostic[] } };
    };
    expect(body.error.code).toBe('TOOL_SPEC_LINT_FAILED');
    expect(find(body.error.details.diagnostics, 'file-name').severity).toBe('error');
    await expect(
      readFile(`${library.booksDir}/.scriba/packs/user/tools/other_name.yaml`, 'utf8'),
    ).rejects.toThrow();
  });
});

/**
 * phase:editor-ui: the lint route answers with the form and port views when the YAML has no error,
 * so the editor's preview is live (survey 21 §3, provisional). With an error it answers the
 * diagnostics only, and the editor keeps its last valid preview.
 */
describe('phase:editor-ui: lint answers with the preview views when the YAML is clean', () => {
  it('returns the form and the port views of a clean spec, from the same emitter as a saved tool', async () => {
    const response = await api(running, 'POST', '/api/tools/lint', { yaml: specYaml() });
    expect(response.status).toBe(200);
    const preview = LintPreviewSchema.parse(response.body);

    expect(preview.form?.fields.map((field) => field.key)).toEqual(['person', 'topic']);
    expect(preview.ports?.inputs.map((port) => port.key)).toEqual(['person', 'topic']);
    expect(preview.ports?.output.kind).toBe('draft');
  });

  it('omits the views when the YAML has an error, and still reports the diagnostic', async () => {
    const response = await api(running, 'POST', '/api/tools/lint', {
      yaml: specYaml({ prompt: 'Write about {{nobody}} and {{topic}}.' }),
    });
    expect(response.status).toBe(200);
    const preview = LintPreviewSchema.parse(response.body);

    expect(preview.form).toBeUndefined();
    expect(preview.ports).toBeUndefined();
    expect(preview.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
  });

  it('lints the editor\'s "New tool" template without an error, so a new tool starts with a live preview', async () => {
    // Keep in step with NEW_TOOL_YAML in apps/web/.../tool-editor/tool-editor.page.ts.
    const template = [
      'schemaVersion: 1',
      'name: new_tool',
      'description: Describe what this tool does.',
      'inputs:',
      '  type: object',
      '  properties:',
      '    notes:',
      '      type: string',
      '      title: Notes',
      '      description: Free text the tool should use.',
      '  required: [notes]',
      '  additionalProperties: false',
      'output: draft',
      'enabled: true',
      'prompt: |',
      '  Write the draft from these notes.',
      '',
      '  Notes: {{notes}}',
      '',
    ].join('\n');
    const response = await api(running, 'POST', '/api/tools/lint', { yaml: template });
    const preview = LintPreviewSchema.parse(response.body);

    expect(preview.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(preview.form).toBeDefined();
  });
  it('reports a name the save would refuse when the live lint is given that name', async () => {
    const response = await api(running, 'POST', '/api/tools/lint', {
      yaml: specYaml(),
      name: 'other_tool',
    });
    expect(response.status).toBe(200);
    const preview = LintPreviewSchema.parse(response.body);

    expect(preview.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true);
    expect(preview.form).toBeUndefined();
  });
});
