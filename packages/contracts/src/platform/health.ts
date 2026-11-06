import { z } from 'zod';
import { SemverSchema } from './version.js';

/** `GET /healthz` response. Spec: `{status: 'ok', version}`, 200 once boot has finished. */
export const HealthzResponseSchema = z.object({
  status: z.literal('ok'),
  version: SemverSchema,
});
export type HealthzResponse = z.infer<typeof HealthzResponseSchema>;
