import { describe, expect, it } from 'vitest';
import {
  OUTPUT_KINDS,
  TOOL_REGISTRY_ROUTES,
  ToolErrorCodeSchema,
  ToolSpecSchema,
} from '@bbartolome/scriba-contracts/tool-registry';

// phase:contract acceptance 1: the slice is importable from apps/api through its subpath.
describe('tool-registry contract slice in apps/api', () => {
  it('imports the tool-spec schema, the output enum, the route constants and the error codes', () => {
    expect(
      ToolSpecSchema.safeParse({
        schemaVersion: 1,
        name: 'cold_open',
        description: 'Open a chapter.',
        inputs: { type: 'object', properties: {} },
        output: 'draft',
        enabled: true,
        prompt: 'Write.',
      }).success,
    ).toBe(true);
    expect([...OUTPUT_KINDS]).toEqual(['draft', 'entity', 'claims', 'graph', 'check']);
    expect(TOOL_REGISTRY_ROUTES.execute.path).toBe('/api/tools/:name/execute');
    expect(ToolErrorCodeSchema.safeParse('TOOL_ARGS_INVALID').success).toBe(true);
  });
});
