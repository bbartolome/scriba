import { z } from 'zod';
import { AGENT_DEFAULT_STEP_CAP } from './vocabulary.js';

/**
 * Agent settings (spec, "Settings"). They live in the app's `settings.yaml` under the `agent` key.
 * Platform owns the file and its migration hook; this module registers the section (survey
 * decision 6).
 */
export const AGENT_SETTINGS_SECTION = 'agent';

/**
 * Agent settings shape. Step cap default 12 and research off by default are the spec's. The
 * step-cap bounds are [proposed].
 *
 * The search endpoint has no default. The spec's default is a SearXNG-compatible JSON URL, but
 * the choice is owner item 16, still open, so the default here is `null`.
 */
export const AgentSettingsSchema = z.object({
  stepCap: z.int().min(1).max(100),
  research: z.object({
    enabled: z.boolean(),
  }),
  search: z.object({
    endpoint: z.url().nullable(),
  }),
});
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;

/** Defaults for the `agent` section. Research is off, so the model never sees the research tools. */
export const AGENT_SETTINGS_DEFAULTS: AgentSettings = {
  stepCap: AGENT_DEFAULT_STEP_CAP,
  research: { enabled: false },
  search: { endpoint: null },
};
