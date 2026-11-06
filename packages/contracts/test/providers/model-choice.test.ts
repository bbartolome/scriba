import { describe, expect, it } from 'vitest';
import {
  ClearProjectOverrideRequestSchema,
  ConnectionTestResultSchema,
  EFFECTIVE_MODEL_SOURCES,
  EffectiveModelSchema,
  ModelChoiceSchema,
  ModelListSchema,
  PROVIDER_ERROR_CODES,
  SetAppDefaultRequestSchema,
  SetProjectOverrideRequestSchema,
} from '../../src/providers/index.js';

describe('ModelChoice', () => {
  it('is {providerId, model}, and an empty model means the provider default', () => {
    expect(ModelChoiceSchema.parse({ providerId: 'ollama', model: '' })).toEqual({
      providerId: 'ollama',
      model: '',
    });
    expect(ModelChoiceSchema.parse({ providerId: 'ollama', model: 'local-model' }).model).toBe(
      'local-model',
    );
  });

  it('rejects an extra field and a provider id that is not a slug', () => {
    expect(
      ModelChoiceSchema.safeParse({ providerId: 'ollama', model: '', providerName: 'x' }).success,
    ).toBe(false);
    expect(ModelChoiceSchema.safeParse({ providerId: 'Ollama Local', model: '' }).success).toBe(
      false,
    );
  });

  it("never saves 'auto' as a model, since auto is a resolution source", () => {
    expect(ModelChoiceSchema.safeParse({ providerId: 'ollama', model: 'auto' }).success).toBe(
      false,
    );
  });

  it('is the app default request and the project override request', () => {
    const choice = { providerId: 'openrouter', model: 'example-model' };
    expect(SetAppDefaultRequestSchema.parse(choice)).toEqual(choice);
    expect(SetProjectOverrideRequestSchema.parse(choice)).toEqual(choice);
  });

  it('has a clear request with no body', () => {
    expect(ClearProjectOverrideRequestSchema.safeParse({}).success).toBe(true);
    expect(ClearProjectOverrideRequestSchema.safeParse({ model: 'x' }).success).toBe(false);
  });
});

describe('effective-model response', () => {
  const choice = { providerId: 'ollama', model: 'local-model' };

  it('is {choice, source, contextSize, warning?} with source project, app or auto', () => {
    expect([...EFFECTIVE_MODEL_SOURCES]).toEqual(['project', 'app', 'auto']);
    for (const source of EFFECTIVE_MODEL_SOURCES) {
      expect(EffectiveModelSchema.safeParse({ choice, source, contextSize: 64000 }).success).toBe(
        true,
      );
    }
    expect(
      EffectiveModelSchema.safeParse({ choice, source: 'manual', contextSize: 64000 }).success,
    ).toBe(false);
  });

  it('carries an optional fallback warning', () => {
    const warned = EffectiveModelSchema.parse({
      choice,
      source: 'app',
      contextSize: 64000,
      warning: 'Project override names a deleted provider; using the app default.',
    });
    expect(warned.warning).toContain('app default');
    expect(EffectiveModelSchema.safeParse({ choice, source: 'app', contextSize: 0 }).success).toBe(
      false,
    );
  });
});

describe('model list response', () => {
  it('is a list of model ids, which may be empty for the pull-a-model hint', () => {
    expect(ModelListSchema.parse({ models: ['a', 'b'] }).models).toEqual(['a', 'b']);
    expect(ModelListSchema.parse({ models: [] }).models).toEqual([]);
    expect(ModelListSchema.safeParse({ models: [''] }).success).toBe(false);
  });
});

describe('connection-test result', () => {
  it('is {ok, stage, latencyMs, modelCount?, error?}, with an error only on failure', () => {
    expect(
      ConnectionTestResultSchema.safeParse({
        ok: true,
        stage: 'chat',
        latencyMs: 42,
        modelCount: 3,
      }).success,
    ).toBe(true);
    expect(
      ConnectionTestResultSchema.safeParse({
        ok: true,
        stage: 'chat',
        latencyMs: 42,
        error: { code: 'PROVIDER_TIMEOUT', message: 'late' },
      }).success,
    ).toBe(false);
  });

  it('reports the failing stage with a coded error and an author hint', () => {
    const failure = ConnectionTestResultSchema.parse({
      ok: false,
      stage: 'reach',
      latencyMs: 5,
      error: {
        code: 'PROVIDER_UNREACHABLE',
        message: 'Could not reach the server.',
        hint: 'Is Ollama running on the host, listening on all interfaces?',
      },
    });
    expect(failure.ok).toBe(false);
    expect(failure.ok === false && failure.error.hint).toContain('Ollama');
  });

  it('uses only the provider error codes in its error', () => {
    const result = ConnectionTestResultSchema.safeParse({
      ok: false,
      stage: 'list-models',
      latencyMs: 1,
      error: { code: 'AUTH_REQUIRED', message: 'not a provider code' },
    });
    expect(result.success).toBe(false);
    expect(PROVIDER_ERROR_CODES).not.toContain('AUTH_REQUIRED');
  });
});
