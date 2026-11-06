import { describe, expect, it } from 'vitest';
import {
  FormDescriptorSchema,
  FunctionListResponseSchema,
  FunctionToolSchema,
  PortDescriptorSchema,
  ToolCatalogEntrySchema,
} from '../../src/tool-registry/index.js';
import { COLD_OPEN_FORM, COLD_OPEN_FUNCTION, COLD_OPEN_PORTS } from './fixtures.js';

/** phase:contract: the form-descriptor, port-descriptor and function-schema shapes. */

describe('form descriptor', () => {
  it('accepts the cold-open form with the fields in declared order', () => {
    const parsed = FormDescriptorSchema.parse(COLD_OPEN_FORM);
    expect(parsed.fields.map((field) => field.key)).toEqual(['person', 'notes', 'style', 'tone']);
  });

  it('refuses a control outside the spec list', () => {
    const bad = {
      fields: [{ ...COLD_OPEN_FORM.fields[1], control: 'date-picker' }],
    };
    expect(FormDescriptorSchema.safeParse(bad).success).toBe(false);
  });
});

describe('port descriptor', () => {
  it('accepts the cold-open ports: three inputs, one output on the output key, and the params keys', () => {
    const parsed = PortDescriptorSchema.parse(COLD_OPEN_PORTS);
    expect(parsed.inputs.map((port) => port.type)).toEqual(['entity', 'text', 'style']);
    expect(parsed.output).toEqual({ key: 'output', type: 'text', kind: 'draft' });
    expect(parsed.params).toEqual(['tone']);
  });

  it('refuses an output port with a key other than output', () => {
    const bad = { ...COLD_OPEN_PORTS, output: { ...COLD_OPEN_PORTS.output, key: 'result' } };
    expect(PortDescriptorSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses an input port whose type is outside the three port types', () => {
    const bad = {
      ...COLD_OPEN_PORTS,
      inputs: [{ ...COLD_OPEN_PORTS.inputs[0], type: 'number' }],
    };
    expect(PortDescriptorSchema.safeParse(bad).success).toBe(false);
  });
});

describe('tool catalog entry', () => {
  it('accepts a name, a one-line description, input port keys with types, and the output kind', () => {
    const entry = {
      name: 'cold_open',
      description: 'Open a chapter with a scene.',
      ports: [
        { key: 'person', type: 'entity' },
        { key: 'notes', type: 'text' },
      ],
      output: 'draft',
    };
    expect(ToolCatalogEntrySchema.parse(entry)).toEqual(entry);
  });

  it('refuses a catalog name that is not lower snake case', () => {
    expect(
      ToolCatalogEntrySchema.safeParse({
        name: 'Cold Open',
        description: 'x',
        ports: [],
        output: 'draft',
      }).success,
    ).toBe(false);
  });
});

describe('function schema', () => {
  it('accepts the OpenAI-compatible function tool for cold open', () => {
    expect(FunctionToolSchema.parse(COLD_OPEN_FUNCTION)).toEqual(COLD_OPEN_FUNCTION);
  });

  it('refuses a tool type other than function, and a name that is not lower snake case', () => {
    expect(FunctionToolSchema.safeParse({ ...COLD_OPEN_FUNCTION, type: 'tool' }).success).toBe(
      false,
    );
    expect(
      FunctionToolSchema.safeParse({
        ...COLD_OPEN_FUNCTION,
        function: { ...COLD_OPEN_FUNCTION.function, name: 'Cold Open' },
      }).success,
    ).toBe(false);
  });

  it('wraps the function tools in the list response the functions route returns', () => {
    expect(FunctionListResponseSchema.parse({ functions: [COLD_OPEN_FUNCTION] })).toEqual({
      functions: [COLD_OPEN_FUNCTION],
    });
    expect(FunctionListResponseSchema.safeParse({ functions: [{}] }).success).toBe(false);
  });
});
