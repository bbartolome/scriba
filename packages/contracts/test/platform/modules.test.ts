import { describe, expect, it } from 'vitest';
import {
  MODULE_SLUGS,
  ModuleSlugSchema,
  PUBLISHING_MODULE_SLUGS,
  PublishingModuleSlugSchema,
} from '../../src/platform/index.js';

describe('module slugs', () => {
  it('are the ten subpath slugs from the spec', () => {
    expect([...MODULE_SLUGS]).toEqual([
      'platform',
      'setup-auth',
      'providers',
      'project-store',
      'tool-registry',
      'agent-loop',
      'graph-runner',
      'compile-export',
      'shell',
      'genre-packs',
    ]);
  });

  it('publish envelopes for eight of them; shell and genre-packs are excluded', () => {
    expect(PUBLISHING_MODULE_SLUGS).toHaveLength(8);
    expect(PUBLISHING_MODULE_SLUGS).not.toContain('shell');
    expect(PUBLISHING_MODULE_SLUGS).not.toContain('genre-packs');
    for (const slug of PUBLISHING_MODULE_SLUGS) {
      expect(PublishingModuleSlugSchema.safeParse(slug).success).toBe(true);
      expect(ModuleSlugSchema.safeParse(slug).success).toBe(true);
    }
    expect(PublishingModuleSlugSchema.safeParse('shell').success).toBe(false);
  });
});
