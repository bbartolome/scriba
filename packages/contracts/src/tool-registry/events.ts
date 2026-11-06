import { z } from 'zod';
import { ToolNameSchema } from './common.js';

/**
 * SSE members of the Tool registry (spec, "SSE"). One event member: `catalog-changed`, on
 * Platform's envelope `{module, type, data}`. The wire name is kebab-case, as Platform requires.
 */

/** The wire name of the one member. */
export const TOOL_REGISTRY_EVENT_TYPES = ['catalog-changed'] as const;
export const ToolRegistryEventTypeSchema = z.enum(TOOL_REGISTRY_EVENT_TYPES);
export type ToolRegistryEventType = z.infer<typeof ToolRegistryEventTypeSchema>;

/**
 * The catalog changed: the names are the tools whose state moved, after a save, a delete, a toggle
 * or a host-side change to the user pack.
 *
 * The event is an in-memory change. A GET that rescans the user pack updates memory only and never
 * writes files or `settings.yaml` (survey 21 §7 item 4).
 */
// provisional: survey 21 §7 item 4
export const CatalogChangedDataSchema = z.object({
  names: z.array(ToolNameSchema).min(1),
});
export type CatalogChangedData = z.infer<typeof CatalogChangedDataSchema>;

/** The Tool registry's envelope members, as a discriminated union on `type`. */
export const ToolRegistryEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    module: z.literal('tool-registry'),
    type: z.literal('catalog-changed'),
    data: CatalogChangedDataSchema,
  }),
]);
export type ToolRegistryEnvelope = z.infer<typeof ToolRegistryEnvelopeSchema>;
