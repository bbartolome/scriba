import { describe, expect, it } from 'vitest';
import * as toolRegistry from '../../src/tool-registry/index.js';
import { COLD_OPEN_ENVELOPE, COLD_OPEN_PORTS, RESOLVED_PERSON } from './fixtures.js';

/**
 * phase:contract acceptance 4: Genre packs, Agent loop and Graph runner can reference every type
 * their specs consume. Each group below lists what one consumer's spec names in the Tool registry's
 * contract (spec, "Consumed by"), and the test checks that each name resolves from the subpath.
 */

const isSchema = (value: unknown): boolean =>
  typeof (value as { safeParse?: unknown } | undefined)?.safeParse === 'function';

describe('Genre packs can reference the spec format and pack lint types', () => {
  it('finds the tool-spec format, the hint vocabulary, the entity-type envelope and the lint result', () => {
    expect(isSchema(toolRegistry.ToolSpecSchema)).toBe(true);
    expect(toolRegistry.SCRIBA_HINTS.type).toBe('x-scriba-type');
    expect(toolRegistry.SCRIBA_HINTS.entityKinds).toBe('x-scriba-entity-kinds');
    expect(toolRegistry.SCRIBA_CONTROLS.length).toBeGreaterThan(0);
    expect(isSchema(toolRegistry.EntityTypeSchema)).toBe(true);
    expect(isSchema(toolRegistry.LintResultSchema)).toBe(true);
    expect(isSchema(toolRegistry.LintDiagnosticSchema)).toBe(true);
    expect(toolRegistry.ToolSpecSchema.safeParse(COLD_OPEN_ENVELOPE).success).toBe(true);
  });
});

describe('Agent loop can reference the function schemas, validate, the readable error, execute and the result', () => {
  it('finds each of them and parses a sample', () => {
    expect(isSchema(toolRegistry.FunctionToolSchema)).toBe(true);
    expect(isSchema(toolRegistry.FunctionListResponseSchema)).toBe(true);
    expect(isSchema(toolRegistry.ValidateRequestSchema)).toBe(true);
    expect(isSchema(toolRegistry.ValidationIssueSchema)).toBe(true);
    expect(isSchema(toolRegistry.ToolArgsInvalidBodySchema)).toBe(true);
    expect(isSchema(toolRegistry.ExecuteRequestSchema)).toBe(true);
    expect(isSchema(toolRegistry.ExecuteResponseSchema)).toBe(true);
    expect(isSchema(toolRegistry.ResolvedToolEntitySchema)).toBe(true);
    expect(
      toolRegistry.ExecuteRequestSchema.safeParse({
        arguments: { person: RESOLVED_PERSON.id },
        entities: [RESOLVED_PERSON],
      }).success,
    ).toBe(true);
    expect(toolRegistry.TOOL_REGISTRY_ROUTES.execute.path).toBe('/api/tools/:name/execute');
  });
});

describe('Graph runner can reference the port types, hints, port derivation, params validate and execute', () => {
  it('finds the port-type enum, the hints, the port descriptor and the params-mode request', () => {
    expect(toolRegistry.PORT_TYPES).toEqual(['text', 'entity', 'style']);
    expect(toolRegistry.SCRIBA_HINTS.port).toBe('x-scriba-port');
    expect(toolRegistry.SCRIBA_HINTS.type).toBe('x-scriba-type');
    expect(isSchema(toolRegistry.PortDescriptorSchema)).toBe(true);
    expect(isSchema(toolRegistry.InputPortSchema)).toBe(true);
    expect(isSchema(toolRegistry.FormDescriptorSchema)).toBe(true);
    expect(toolRegistry.OUTPUT_PORT_KEY).toBe('output');
    expect(toolRegistry.PortDescriptorSchema.parse(COLD_OPEN_PORTS).output.key).toBe('output');
    expect(
      toolRegistry.ValidateRequestSchema.safeParse({ mode: 'params', arguments: { tone: 'dry' } })
        .success,
    ).toBe(true);
    expect(isSchema(toolRegistry.ExecuteResponseSchema)).toBe(true);
    expect(isSchema(toolRegistry.ToolErrorCodeSchema)).toBe(true);
  });
});
