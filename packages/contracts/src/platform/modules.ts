import { z } from 'zod';

/**
 * Module slugs. The same strings name the subpath exports, the API route prefixes and the
 * envelope's `module` field. Names are from the Platform spec (#16).
 */
export const MODULE_SLUGS = [
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
] as const;

/**
 * [proposed] identifier. Values are the eight slugs that publish envelopes. The spec says
 * `shell` and `genre-packs` publish nothing, so they are left out of the enum.
 */
export const PUBLISHING_MODULE_SLUGS = [
  'platform',
  'setup-auth',
  'providers',
  'project-store',
  'tool-registry',
  'agent-loop',
  'graph-runner',
  'compile-export',
] as const;

export type ModuleSlug = (typeof MODULE_SLUGS)[number];
export type PublishingModuleSlug = (typeof PUBLISHING_MODULE_SLUGS)[number];

export const ModuleSlugSchema = z.enum(MODULE_SLUGS);
/** [proposed] identifier. The `module` enum of the SSE envelope. */
export const PublishingModuleSlugSchema = z.enum(PUBLISHING_MODULE_SLUGS);
