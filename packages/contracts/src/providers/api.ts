import { z } from 'zod';
import { ProviderDraftSchema } from './config.js';
import { PresetIdSchema } from './presets.js';

/**
 * Request bodies the `/api/providers` routes take, beyond the schemas in the other files of this
 * subpath (spec #19, "HTTP API": inputs are validated with the contract's Zod schemas). The API
 * module cannot import Zod itself, so these live here.
 */

/**
 * Create-provider request. A new provider comes from a preset, which pre-fills the preset's URL
 * with the contract defaults, or from a full draft config. The server assigns the id: the preset id
 * (or `custom` for a draft), plus a numeric suffix if that id is taken. The two forms are strict,
 * so a preset id and draft fields cannot be sent together.
 */
export const CreateProviderRequestSchema = z.union([
  z.strictObject({ presetId: PresetIdSchema }),
  ProviderDraftSchema,
]);
export type CreateProviderRequest = z.infer<typeof CreateProviderRequestSchema>;
