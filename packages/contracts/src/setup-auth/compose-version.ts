import { z } from 'zod';

/**
 * Compose-version status (spec #18, "Compose-version mismatch (#7)"). The app compares
 * `SCRIBA_COMPOSE_VERSION` from its environment with the version the image expects. The expected
 * version is a constant in Platform's version info (#16). Format is [proposed] (see
 * `AppVersionInfoSchema` in /platform).
 */
export const COMPOSE_VERSION_STATES = ['ok', 'mismatch', 'unknown'] as const;
export const ComposeVersionStateSchema = z.enum(COMPOSE_VERSION_STATES);
export type ComposeVersionState = z.infer<typeof ComposeVersionStateSchema>;

/**
 * Compose-version status: `{state, expected, actual}` (spec). The three states are:
 * - `ok`: the values match;
 * - `mismatch`: both are set and differ;
 * - `unknown`: the variable is missing, so `actual` is null.
 *
 * The rules that tie `state` to the two values are [proposed]: the spec defines the states, and
 * the schema makes an inconsistent combination a parse failure.
 */
export const ComposeVersionStatusSchema = z.discriminatedUnion('state', [
  z
    .strictObject({
      state: z.literal('ok'),
      expected: z.string().min(1),
      actual: z.string().min(1),
    })
    .refine((status) => status.expected === status.actual, {
      message: 'state "ok" requires expected to equal actual',
      path: ['actual'],
    }),
  z
    .strictObject({
      state: z.literal('mismatch'),
      expected: z.string().min(1),
      actual: z.string().min(1),
    })
    .refine((status) => status.expected !== status.actual, {
      message: 'state "mismatch" requires expected to differ from actual',
      path: ['actual'],
    }),
  z.strictObject({
    state: z.literal('unknown'),
    expected: z.string().min(1),
    actual: z.null(),
  }),
]);
export type ComposeVersionStatus = z.infer<typeof ComposeVersionStatusSchema>;
