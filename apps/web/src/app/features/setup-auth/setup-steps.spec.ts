import { describe, expect, it } from 'vitest';
import { SETUP_STEP_IDS } from '@bbartolome/scriba-contracts/setup-auth';
import {
  WIZARD_STEPS,
  nextStepId,
  skipRestUpdate,
  stepInfo,
  stepStateText,
  stepUpdate,
} from './setup-steps';

const PENDING = {
  access: 'pending',
  tailscale: 'pending',
  providers: 'pending',
  preferences: 'pending',
  firstProject: 'pending',
} as const;

describe('the wizard steps (survey 18 §3, phase:setup-flow)', () => {
  it('lists the five steps of the contract, in wizard order', () => {
    expect(WIZARD_STEPS.map((step) => step.id)).toEqual([...SETUP_STEP_IDS]);
  });

  it('makes every step but Access skippable', () => {
    expect(stepInfo('access').skippable).toBe(false);
    for (const id of ['tailscale', 'providers', 'preferences', 'firstProject'] as const) {
      expect(stepInfo(id).skippable).toBe(true);
    }
  });

  it('walks forward through the steps and ends after the last one', () => {
    const order: string[] = [];
    let current: (typeof SETUP_STEP_IDS)[number] | undefined = 'access';
    while (current !== undefined) {
      order.push(current);
      current = nextStepId(current);
    }
    expect(order).toEqual([...SETUP_STEP_IDS]);
  });

  it('writes a single step state under that step only', () => {
    expect(stepUpdate('providers', 'skipped')).toEqual({ steps: { providers: 'skipped' } });
  });

  it('skips the rest from a step: later steps not done become skipped, and the flag is set', () => {
    expect(
      skipRestUpdate('providers', { ...PENDING, access: 'done', tailscale: 'skipped' }),
    ).toEqual({
      steps: { providers: 'skipped', preferences: 'skipped', firstProject: 'skipped' },
      complete: true,
    });
  });

  it('keeps a step that is already done when the rest is skipped', () => {
    const update = skipRestUpdate('access', { ...PENDING, access: 'done', providers: 'done' });
    expect(update.steps).toEqual({
      tailscale: 'skipped',
      preferences: 'skipped',
      firstProject: 'skipped',
    });
  });

  it('marks access done, never skipped, when the rest is skipped from the first step', () => {
    expect(skipRestUpdate('access', PENDING).steps?.access).toBe('done');
  });

  it('names each state in plain words', () => {
    expect(stepStateText('done')).toBe('Done');
    expect(stepStateText('skipped')).toBe('Skipped');
    expect(stepStateText('pending')).toBe('Not set up yet');
  });
});
