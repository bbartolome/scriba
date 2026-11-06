import { describe, expect, it } from 'vitest';
import {
  LintCountsSchema,
  LintDiagnosticSchema,
  LintRequestSchema,
  LintResultSchema,
} from '../../src/tool-registry/index.js';

/** phase:contract: the lint-result shape and the lint request (spec, "Lint result"). */

const DIAGNOSTIC = {
  severity: 'error',
  rule: 'output-enum',
  message: 'output must be one of draft, entity, claims, graph, check',
  line: 9,
  column: 3,
};

describe('lint diagnostic', () => {
  it('accepts an error and a warning, each with a rule, a message and a 1-based position', () => {
    expect(LintDiagnosticSchema.parse(DIAGNOSTIC)).toEqual(DIAGNOSTIC);
    expect(LintDiagnosticSchema.safeParse({ ...DIAGNOSTIC, severity: 'warning' }).success).toBe(
      true,
    );
  });

  it('refuses another severity, and a position below 1', () => {
    expect(LintDiagnosticSchema.safeParse({ ...DIAGNOSTIC, severity: 'info' }).success).toBe(false);
    expect(LintDiagnosticSchema.safeParse({ ...DIAGNOSTIC, line: 0 }).success).toBe(false);
    expect(LintDiagnosticSchema.safeParse({ ...DIAGNOSTIC, column: 0 }).success).toBe(false);
  });
});

describe('lint result and request', () => {
  it('holds the diagnostics for one source, in order', () => {
    const result = { diagnostics: [DIAGNOSTIC, { ...DIAGNOSTIC, severity: 'warning' }] };
    expect(LintResultSchema.parse(result)).toEqual(result);
    expect(LintResultSchema.parse({ diagnostics: [] })).toEqual({ diagnostics: [] });
  });

  it('counts errors and warnings as non-negative integers', () => {
    expect(LintCountsSchema.parse({ errors: 1, warnings: 0 })).toEqual({ errors: 1, warnings: 0 });
    expect(LintCountsSchema.safeParse({ errors: -1, warnings: 0 }).success).toBe(false);
  });

  it('takes the submitted YAML as a string and nothing else', () => {
    expect(LintRequestSchema.parse({ yaml: 'name: cold_open\n' })).toEqual({
      yaml: 'name: cold_open\n',
    });
    expect(LintRequestSchema.safeParse({ yaml: { name: 'cold_open' } }).success).toBe(false);
  });
});
