import { describe, expect, it } from 'vitest';
import {
  ExecuteRequestSchema,
  ExecuteResponseSchema,
  RenderRequestSchema,
  RenderResponseSchema,
  ResolvedToolEntitySchema,
  SourceUsedSchema,
  ValidateModeSchema,
  ValidateRequestSchema,
  ValidateResponseSchema,
} from '../../src/tool-registry/index.js';
import { RESOLVED_PERSON } from './fixtures.js';

/** phase:contract: validate (full and params), render, and the tool-call request and result. */

describe('validate', () => {
  it('takes exactly the two modes, full and params', () => {
    expect(ValidateModeSchema.safeParse('full').success).toBe(true);
    expect(ValidateModeSchema.safeParse('params').success).toBe(true);
    expect(ValidateModeSchema.safeParse('partial').success).toBe(false);
  });

  it('requires a mode and an arguments object in the request', () => {
    expect(ValidateRequestSchema.parse({ mode: 'params', arguments: { tone: 'dry' } })).toEqual({
      mode: 'params',
      arguments: { tone: 'dry' },
    });
    expect(ValidateRequestSchema.safeParse({ arguments: {} }).success).toBe(false);
    expect(ValidateRequestSchema.safeParse({ mode: 'full', arguments: [] }).success).toBe(false);
  });

  it('returns the defaulted arguments and the entity IDs, each tagged with its field and style flag', () => {
    const response = {
      arguments: { person: 'ada-lovelace', tone: 'warm' },
      entities: [
        { field: 'person', id: 'ada-lovelace', style: false },
        { field: 'style', id: 'house-style', style: true },
      ],
    };
    expect(ValidateResponseSchema.parse(response)).toEqual(response);
    expect(
      ValidateResponseSchema.safeParse({
        arguments: {},
        entities: [{ field: 'person', id: 'ada-lovelace' }],
      }).success,
    ).toBe(false);
  });
});

describe('resolved entity input', () => {
  it('carries the entity reference plus its content, built by the caller', () => {
    expect(ResolvedToolEntitySchema.parse(RESOLVED_PERSON)).toEqual(RESOLVED_PERSON);
  });

  it('refuses a path that escapes the project, or a missing content', () => {
    expect(
      ResolvedToolEntitySchema.safeParse({ ...RESOLVED_PERSON, path: '../secrets.md' }).success,
    ).toBe(false);
    const withoutContent: Record<string, unknown> = { ...RESOLVED_PERSON };
    delete withoutContent.content;
    expect(ResolvedToolEntitySchema.safeParse(withoutContent).success).toBe(false);
  });
});

describe('render', () => {
  it('takes arguments and resolved entities, and returns the prompt text', () => {
    const request = { arguments: { person: 'ada-lovelace' }, entities: [RESOLVED_PERSON] };
    expect(RenderRequestSchema.parse(request)).toEqual(request);
    expect(RenderResponseSchema.parse({ prompt: 'Write a cold open.' })).toEqual({
      prompt: 'Write a cold open.',
    });
  });
});

describe('execute', () => {
  it('returns {output, sourcesUsed}, with output as {kind, content}', () => {
    const response = {
      output: { kind: 'draft', content: 'It was a Tuesday.' },
      sourcesUsed: [{ id: 'ada-lovelace', type: 'person', path: 'entities/people/ada.md' }],
    };
    expect(ExecuteResponseSchema.parse(response)).toEqual(response);
  });

  it('refuses a wrong output kind in the result', () => {
    expect(
      ExecuteResponseSchema.safeParse({
        output: { kind: 'video', content: 'x' },
        sourcesUsed: [],
      }).success,
    ).toBe(false);
  });

  it('takes the same input as render, so both routes share one request shape', () => {
    const request = { arguments: {}, entities: [] };
    expect(ExecuteRequestSchema.parse(request)).toEqual(RenderRequestSchema.parse(request));
  });
});

describe('sources used', () => {
  it('is an item of id, type and path, with the path checked as project-relative', () => {
    const item = { id: 'ada-lovelace', type: 'person', path: 'entities/people/ada.md' };
    expect(SourceUsedSchema.parse(item)).toEqual(item);
    expect(SourceUsedSchema.safeParse({ id: 'ada-lovelace', type: 'person' }).success).toBe(false);
    expect(SourceUsedSchema.safeParse({ ...item, path: '/abs/ada.md' }).success).toBe(false);
  });
});
