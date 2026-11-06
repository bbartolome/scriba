import { z } from 'zod';
import { ComposeVersionStatusSchema } from './compose-version.js';

/**
 * Setup status (spec #18, "/setup flow"). Each step records `pending`, `done` or `skipped`. The
 * overall `complete` flag is set when the author finishes or explicitly skips the rest.
 */

/** The five steps, in wizard order (spec). */
export const SETUP_STEP_IDS = [
  'access',
  'tailscale',
  'providers',
  'preferences',
  'firstProject',
] as const;
export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export const SETUP_STEP_STATES = ['pending', 'done', 'skipped'] as const;
export const SetupStepStateSchema = z.enum(SETUP_STEP_STATES);
export type SetupStepState = z.infer<typeof SetupStepStateSchema>;

/**
 * Setup status: per-step state, `complete` and the compose-version status. The compose-mismatch flag
 * is `compose.state !== 'ok'` [proposed]. The spec exposes the flag so the Shell can show a global
 * banner, if its spec chooses to.
 *
 * The spec says "every step except Access can be skipped", so `steps.access` may not be `skipped`.
 * The schema enforces that.
 */
export const SetupStatusSchema = z
  .strictObject({
    steps: z.strictObject({
      access: SetupStepStateSchema,
      tailscale: SetupStepStateSchema,
      providers: SetupStepStateSchema,
      preferences: SetupStepStateSchema,
      firstProject: SetupStepStateSchema,
    }),
    complete: z.boolean(),
    compose: ComposeVersionStatusSchema,
  })
  .refine((status) => status.steps.access !== 'skipped', {
    message: 'the access step cannot be skipped',
    path: ['steps', 'access'],
  });
export type SetupStatus = z.infer<typeof SetupStatusSchema>;
