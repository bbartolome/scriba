import { describe, expect, it } from 'vitest';
import {
  COMPOSE_VERSION_STATES,
  ComposeVersionStatusSchema,
  SETUP_STEP_IDS,
  SETUP_STEP_STATES,
  SetupStatusSchema,
} from '../../src/setup-auth/index.js';
import {
  COMPOSE_MISMATCH,
  COMPOSE_OK,
  COMPOSE_UNKNOWN,
  SETUP_STATUS_FRESH,
  SETUP_STATUS_SKIPPED,
} from './examples.js';

describe('setup status', () => {
  it('accepts a fresh library and a library with skipped steps', () => {
    expect(SetupStatusSchema.safeParse(SETUP_STATUS_FRESH).success).toBe(true);
    expect(SetupStatusSchema.safeParse(SETUP_STATUS_SKIPPED).success).toBe(true);
  });

  it('names the five steps and the three step states from the spec', () => {
    expect([...SETUP_STEP_IDS].sort()).toEqual(
      ['access', 'firstProject', 'preferences', 'providers', 'tailscale'].sort(),
    );
    expect([...SETUP_STEP_STATES].sort()).toEqual(['done', 'pending', 'skipped']);
  });

  it('rejects skipping the access step', () => {
    const skipped = {
      ...SETUP_STATUS_FRESH,
      steps: { ...SETUP_STATUS_FRESH.steps, access: 'skipped' },
    };
    expect(SetupStatusSchema.safeParse(skipped).success).toBe(false);
  });

  it('rejects a step state outside the enum', () => {
    const bad = {
      ...SETUP_STATUS_FRESH,
      steps: { ...SETUP_STATUS_FRESH.steps, tailscale: 'complete' },
    };
    expect(SetupStatusSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing step and a non-boolean complete', () => {
    const steps: Partial<typeof SETUP_STATUS_FRESH.steps> = { ...SETUP_STATUS_FRESH.steps };
    delete steps.firstProject;
    expect(SetupStatusSchema.safeParse({ ...SETUP_STATUS_FRESH, steps }).success).toBe(false);
    expect(SetupStatusSchema.safeParse({ ...SETUP_STATUS_FRESH, complete: 'yes' }).success).toBe(
      false,
    );
  });
});

describe('compose-version status', () => {
  it('has the three states from the spec', () => {
    expect([...COMPOSE_VERSION_STATES]).toEqual(['ok', 'mismatch', 'unknown']);
  });

  it('accepts ok, mismatch and unknown examples', () => {
    expect(ComposeVersionStatusSchema.safeParse(COMPOSE_OK).success).toBe(true);
    expect(ComposeVersionStatusSchema.safeParse(COMPOSE_MISMATCH).success).toBe(true);
    expect(ComposeVersionStatusSchema.safeParse(COMPOSE_UNKNOWN).success).toBe(true);
  });

  it('rejects ok when the two versions differ, and mismatch when they match', () => {
    expect(
      ComposeVersionStatusSchema.safeParse({ state: 'ok', expected: '1.2.0', actual: '1.1.0' })
        .success,
    ).toBe(false);
    expect(
      ComposeVersionStatusSchema.safeParse({
        state: 'mismatch',
        expected: '1.2.0',
        actual: '1.2.0',
      }).success,
    ).toBe(false);
  });

  it('rejects unknown with an actual value, and ok or mismatch with a null actual', () => {
    expect(
      ComposeVersionStatusSchema.safeParse({ state: 'unknown', expected: '1.2.0', actual: '1.2.0' })
        .success,
    ).toBe(false);
    expect(
      ComposeVersionStatusSchema.safeParse({ state: 'ok', expected: '1.2.0', actual: null })
        .success,
    ).toBe(false);
    expect(
      ComposeVersionStatusSchema.safeParse({ state: 'mismatch', expected: '1.2.0', actual: null })
        .success,
    ).toBe(false);
  });

  it('rejects a state outside the enum', () => {
    expect(
      ComposeVersionStatusSchema.safeParse({ state: 'stale', expected: '1.2.0', actual: '1.2.0' })
        .success,
    ).toBe(false);
  });
});
