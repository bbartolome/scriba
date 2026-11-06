import {
  AGENT_SETTINGS_DEFAULTS,
  AGENT_SETTINGS_SECTION,
  AgentSettingsSchema,
  type AgentSettings,
} from '@bbartolome/scriba-contracts/agent-loop';
import { readSection, registerSettingsSection, writeSection } from '../platform/index.js';
import { agentLibrary } from './library.js';

// provisional: survey 23 §7 item 6 (decided). This module registers the `agent` section; Platform owns the file.
registerSettingsSection({ name: AGENT_SETTINGS_SECTION });

/**
 * The agent settings, read from the `agent` section. An absent section means the defaults (step cap
 * 12, research off). A section that does not match its schema is an error, as the providers
 * section is.
 */
export async function readAgentSettings(): Promise<AgentSettings> {
  const raw = await readSection<unknown>(agentLibrary(), AGENT_SETTINGS_SECTION);
  if (raw === undefined) {
    return structuredClone(AGENT_SETTINGS_DEFAULTS);
  }
  const parsed = AgentSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('The agent section in settings.yaml does not match its schema.');
  }
  return parsed.data;
}

/** Writes the whole section, keeping the other sections. The caller has validated it. */
export function writeAgentSettings(settings: AgentSettings): Promise<void> {
  return writeSection(agentLibrary(), AGENT_SETTINGS_SECTION, settings);
}
