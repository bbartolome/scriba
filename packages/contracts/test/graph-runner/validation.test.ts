import { describe, expect, it } from 'vitest';
import {
  GRAPH_ISSUE_SEVERITIES,
  GRAPH_VALIDATION_ERROR_CODES,
  GRAPH_VALIDATION_ISSUE_CODES,
  GRAPH_VALIDATION_SEVERITY,
  GRAPH_VALIDATION_WARNING_CODES,
  GraphValidationIssueCodeSchema,
  GraphValidationIssueSchema,
} from '../../src/graph-runner/index.js';

/**
 * phase:contract: the validation issue shape `{code, severity, nodeId?, edgeId?, portId?, message}` and
 * the codes that enumerate the checks the spec lists (survey 24 §7 Q6). The spec gives no code names,
 * so this test pins the names the contract publishes.
 */
describe('validation issue codes', () => {
  it('has 13 error codes, one for each error check the spec lists', () => {
    expect([...GRAPH_VALIDATION_ERROR_CODES]).toEqual([
      'GRAPH_NODE_KIND_ILLEGAL',
      'GRAPH_TOOL_UNAVAILABLE',
      'GRAPH_PORT_UNKNOWN',
      'GRAPH_PORT_TYPE_MISMATCH',
      'GRAPH_INPUT_MULTIPLY_WIRED',
      'GRAPH_PORT_WIRED_AND_PINNED',
      'GRAPH_PORT_UNFILLED',
      'GRAPH_SETTING_MISSING',
      'GRAPH_CYCLE',
      'GRAPH_OUTPUT_UNWIRED',
      'GRAPH_OUTPUT_SOURCE_INVALID',
      'GRAPH_OUTPUT_KIND_UNWRITABLE',
      'GRAPH_ID_DUPLICATE',
    ]);
  });

  it('has 6 warning codes, for the dead step, the story checks and the pinned entity', () => {
    expect([...GRAPH_VALIDATION_WARNING_CODES]).toEqual([
      'GRAPH_NODE_DEAD',
      'GRAPH_INPUT_UNWIRED',
      'GRAPH_PINNED_ENTITY_MISSING',
      'GRAPH_PATH_INVALID',
      'GRAPH_EDGE_NODE_UNKNOWN',
      'GRAPH_ENTITY_PATH_OUTSIDE',
    ]);
  });

  it('lists every code once, errors first, and every code carries a GRAPH_ prefix', () => {
    expect(GRAPH_VALIDATION_ISSUE_CODES.length).toBe(19);
    expect(new Set(GRAPH_VALIDATION_ISSUE_CODES).size).toBe(19);
    expect(GRAPH_VALIDATION_ISSUE_CODES.slice(0, 13)).toEqual([...GRAPH_VALIDATION_ERROR_CODES]);
    for (const code of GRAPH_VALIDATION_ISSUE_CODES) {
      expect(code.startsWith('GRAPH_'), code).toBe(true);
    }
  });

  it('gives every code a severity and no other key, matching the error and warning lists', () => {
    expect(Object.keys(GRAPH_VALIDATION_SEVERITY).sort()).toEqual(
      [...GRAPH_VALIDATION_ISSUE_CODES].sort(),
    );
    for (const code of GRAPH_VALIDATION_ERROR_CODES) {
      expect(GRAPH_VALIDATION_SEVERITY[code], code).toBe('error');
    }
    for (const code of GRAPH_VALIDATION_WARNING_CODES) {
      expect(GRAPH_VALIDATION_SEVERITY[code], code).toBe('warning');
    }
  });

  it('has the two severities, error and warning', () => {
    expect([...GRAPH_ISSUE_SEVERITIES]).toEqual(['error', 'warning']);
  });

  it('refuses a code outside the list', () => {
    expect(GraphValidationIssueCodeSchema.safeParse('GRAPH_MADE_UP').success).toBe(false);
  });
});

describe('validation issue shape', () => {
  it('accepts an issue with only a code, a severity and a message', () => {
    expect(
      GraphValidationIssueSchema.safeParse({
        code: 'GRAPH_CYCLE',
        severity: 'error',
        message: 'The recipe loops back on itself.',
      }).success,
    ).toBe(true);
  });

  it('accepts the optional node, edge and port ids', () => {
    expect(
      GraphValidationIssueSchema.safeParse({
        code: 'GRAPH_PORT_TYPE_MISMATCH',
        severity: 'error',
        nodeId: 'opening',
        edgeId: 'w-question',
        portId: 'opening.question',
        message: 'A text port cannot take an entity.',
      }).success,
    ).toBe(true);
  });

  it('refuses a severity that does not match the code', () => {
    expect(
      GraphValidationIssueSchema.safeParse({
        code: 'GRAPH_CYCLE',
        severity: 'warning',
        message: 'x',
      }).success,
    ).toBe(false);
  });

  it('refuses an empty message, an unknown key and a malformed port id', () => {
    expect(
      GraphValidationIssueSchema.safeParse({
        code: 'GRAPH_NODE_DEAD',
        severity: 'warning',
        message: '',
      }).success,
    ).toBe(false);
    expect(
      GraphValidationIssueSchema.safeParse({
        code: 'GRAPH_NODE_DEAD',
        severity: 'warning',
        message: 'x',
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      GraphValidationIssueSchema.safeParse({
        code: 'GRAPH_PORT_UNKNOWN',
        severity: 'error',
        portId: 'no-port-here',
        message: 'x',
      }).success,
    ).toBe(false);
  });
});
