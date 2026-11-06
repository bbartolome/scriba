import { describe, expect, it } from 'vitest';
import {
  CatalogChangedDataSchema,
  TOOL_REGISTRY_EVENT_TYPES,
  ToolRegistryEnvelopeSchema,
} from '../../src/tool-registry/index.js';

/** phase:contract: the catalog-changed SSE member on Platform's envelope (spec, "SSE"). */

const EVENT = {
  module: 'tool-registry',
  type: 'catalog-changed',
  data: { names: ['cold_open', 'mystery_question'] },
} as const;

describe('catalog-changed event', () => {
  it('is the one member of the module, in kebab-case', () => {
    expect([...TOOL_REGISTRY_EVENT_TYPES]).toEqual(['catalog-changed']);
  });

  it('parses on the envelope with the tool names that changed', () => {
    expect(ToolRegistryEnvelopeSchema.parse(EVENT)).toEqual(EVENT);
    expect(CatalogChangedDataSchema.parse({ names: ['cold_open'] })).toEqual({
      names: ['cold_open'],
    });
  });

  it('refuses an empty name list, a name that is not lower snake case, and another module or type', () => {
    expect(CatalogChangedDataSchema.safeParse({ names: [] }).success).toBe(false);
    expect(CatalogChangedDataSchema.safeParse({ names: ['Cold Open'] }).success).toBe(false);
    expect(
      ToolRegistryEnvelopeSchema.safeParse({ ...EVENT, module: 'project-store' }).success,
    ).toBe(false);
    expect(ToolRegistryEnvelopeSchema.safeParse({ ...EVENT, type: 'tool-changed' }).success).toBe(
      false,
    );
  });
});
