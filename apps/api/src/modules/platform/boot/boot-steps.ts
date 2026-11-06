import type { ScribaConfig } from '../config/env.js';

export interface BootContext {
  readonly config: ScribaConfig;
}

/**
 * [proposed] `registerBootStep` is the survey's name. The spec says only "pre-listen boot steps".
 * A step runs after the app-state check and the settings migration, and before the server
 * listens. Setup & auth is expected to write `setup-url` this way (survey §7 item 11).
 */
export type BootStep = (context: BootContext) => void | Promise<void>;

const steps: BootStep[] = [];

/** Registers a pre-listen step. Returns a function that removes it. */
export function registerBootStep(step: BootStep): () => void {
  steps.push(step);
  return () => {
    const index = steps.indexOf(step);
    if (index !== -1) {
      steps.splice(index, 1);
    }
  };
}

/** Runs the registered steps in registration order. A throw stops boot. */
export async function runBootSteps(context: BootContext): Promise<void> {
  for (const step of [...steps]) {
    await step(context);
  }
}
