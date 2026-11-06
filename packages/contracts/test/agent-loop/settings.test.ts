import { describe, expect, it } from 'vitest';
import {
  AGENT_SETTINGS_DEFAULTS,
  AGENT_SETTINGS_SECTION,
  AgentSettingsSchema,
} from '../../src/agent-loop/index.js';

describe('agent settings', () => {
  it('live under the agent key of settings.yaml (decision 6)', () => {
    expect(AGENT_SETTINGS_SECTION).toBe('agent');
  });

  it('default to a step cap of 12, research off, and no search endpoint', () => {
    expect(AGENT_SETTINGS_DEFAULTS).toEqual({
      stepCap: 12,
      research: { enabled: false },
      search: { endpoint: null },
    });
    expect(AgentSettingsSchema.safeParse(AGENT_SETTINGS_DEFAULTS).success).toBe(true);
  });

  it('accept a step cap inside the bounds and reject one outside them', () => {
    const withCap = (stepCap: number) => ({ ...AGENT_SETTINGS_DEFAULTS, stepCap });
    expect(AgentSettingsSchema.safeParse(withCap(1)).success).toBe(true);
    expect(AgentSettingsSchema.safeParse(withCap(100)).success).toBe(true);
    expect(AgentSettingsSchema.safeParse(withCap(0)).success).toBe(false);
    expect(AgentSettingsSchema.safeParse(withCap(101)).success).toBe(false);
    expect(AgentSettingsSchema.safeParse(withCap(2.5)).success).toBe(false);
  });

  it('accept a search endpoint URL and reject text that is not a URL', () => {
    const withEndpoint = (endpoint: string) => ({
      ...AGENT_SETTINGS_DEFAULTS,
      search: { endpoint },
    });
    expect(
      AgentSettingsSchema.safeParse(withEndpoint('http://127.0.0.1:8888/search')).success,
    ).toBe(true);
    expect(AgentSettingsSchema.safeParse(withEndpoint('not a url')).success).toBe(false);
  });
});
