import type {
  SetupStatusUpdate,
  SetupStepId,
  SetupStepState,
} from '@bbartolome/scriba-contracts/setup-auth';

/**
 * How a step ends when the author presses its main button. `done` and `skipped` write that state.
 * `open` moves on without writing a state (the Tailscale step, which has nothing to connect yet). `form`
 * means the step's own form ends it, so the footer offers no main button.
 */
export type StepContinuation = 'done' | 'open' | 'form';

export interface WizardStep {
  readonly id: SetupStepId;
  readonly label: string;
  /** Access is the only step that cannot be skipped (spec, "every step except Access"). */
  readonly skippable: boolean;
  readonly continuation: StepContinuation;
}

/** The five steps in wizard order (spec #18, "/setup flow"). */
export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 'access', label: 'Access', skippable: false, continuation: 'done' },
  { id: 'tailscale', label: 'Tailscale', skippable: true, continuation: 'open' },
  { id: 'providers', label: 'Model providers', skippable: true, continuation: 'done' },
  { id: 'preferences', label: 'Preferences', skippable: true, continuation: 'form' },
  { id: 'firstProject', label: 'First project', skippable: true, continuation: 'open' },
];

export function stepInfo(id: SetupStepId): WizardStep {
  const found = WIZARD_STEPS.find((step) => step.id === id);
  if (found === undefined) {
    throw new Error(`No wizard step is named ${id}.`);
  }
  return found;
}

/** The step after `id`, or undefined after the last one. */
export function nextStepId(id: SetupStepId): SetupStepId | undefined {
  const index = WIZARD_STEPS.findIndex((step) => step.id === id);
  return WIZARD_STEPS[index + 1]?.id;
}

/** The plain-language state the step list shows. */
export function stepStateText(state: SetupStepState): string {
  switch (state) {
    case 'done':
      return 'Done';
    case 'skipped':
      return 'Skipped';
    case 'pending':
      return 'Not set up yet';
  }
}

/** A single-step update. The state is written under the step's own key and nothing else. */
export function stepUpdate(id: SetupStepId, state: SetupStepState): SetupStatusUpdate {
  const steps: Partial<Record<SetupStepId, SetupStepState>> = {};
  steps[id] = state;
  return { steps };
}

/**
 * "Skip the rest and finish" (survey 18 §3: the complete flag is set when the author skips the rest).
 * Every step from `from` onward that is not done becomes skipped, and access becomes done, because
 * access cannot be skipped. Steps before `from` keep their state.
 */
export function skipRestUpdate(
  from: SetupStepId,
  current: Readonly<Record<SetupStepId, SetupStepState>>,
): SetupStatusUpdate {
  const steps: Partial<Record<SetupStepId, SetupStepState>> = {};
  const start = WIZARD_STEPS.findIndex((step) => step.id === from);
  for (const step of WIZARD_STEPS.slice(start)) {
    if (current[step.id] === 'done') {
      continue;
    }
    steps[step.id] = step.skippable ? 'skipped' : 'done';
  }
  return { steps, complete: true };
}
