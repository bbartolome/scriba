import { z } from 'zod';
import { PublishingModuleSlugSchema } from './modules.js';
import { SemverSchema } from './version.js';

/**
 * Envelope type names: kebab-case, no module prefix (`hello`, not `platform/hello`).
 * The spec gives the kebab-case rule. The exact pattern is [proposed].
 */
export const ENVELOPE_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** [proposed] identifier. */
export const EnvelopeTypeSchema = z.string().regex(ENVELOPE_TYPE_PATTERN);

/**
 * Base SSE envelope `{module, type, data}`. Every module sends this shape on `/events`.
 * `data` is each module's own slice: a discriminated union of its members.
 */
export const EnvelopeBaseSchema = z.object({
  module: PublishingModuleSlugSchema,
  type: EnvelopeTypeSchema,
  data: z.unknown(),
});
export type EnvelopeBase = z.infer<typeof EnvelopeBaseSchema>;

/**
 * `platform/hello`, sent first on every connection. Spec: `{streamId, version, serverTime}`.
 * [proposed] Formats for `streamId` and `serverTime` are not given. `version` reuses the
 * semver format from the version info.
 */
export const PlatformHelloDataSchema = z.object({
  streamId: z.string().min(1),
  version: SemverSchema,
  serverTime: z.iso.datetime(),
});
export type PlatformHelloData = z.infer<typeof PlatformHelloDataSchema>;

/**
 * `platform/echo`, broadcast by the diagnostic route. Spec: `{seq, sentAt}`.
 * [proposed] `seq` is a nonnegative integer; `sentAt` is ISO 8601. The spec gives neither format.
 */
export const PlatformEchoDataSchema = z.object({
  seq: z.int().nonnegative(),
  sentAt: z.iso.datetime(),
});
export type PlatformEchoData = z.infer<typeof PlatformEchoDataSchema>;

/** Platform's own members of the envelope, as a discriminated union on `type`. */
export const PlatformEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    module: z.literal('platform'),
    type: z.literal('hello'),
    data: PlatformHelloDataSchema,
  }),
  z.object({
    module: z.literal('platform'),
    type: z.literal('echo'),
    data: PlatformEchoDataSchema,
  }),
]);
export type PlatformEnvelope = z.infer<typeof PlatformEnvelopeSchema>;
