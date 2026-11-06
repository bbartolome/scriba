import { z } from 'zod';

/**
 * Request identity (spec #18, "Identity"): `{via: 'loopback'} | {via: 'tailnet', login}`.
 * `loopback` is the session-cookie path. `tailnet` carries the Tailscale login from the header that
 * Serve injects. The identity is for display and logs only, never for partitioning data (spec).
 */

/** A request with a valid session cookie on a loopback Host. A `login` key is refused. */
export const LoopbackIdentitySchema = z.strictObject({
  via: z.literal('loopback'),
});
export type LoopbackIdentity = z.infer<typeof LoopbackIdentitySchema>;

/**
 * A tailnet request whose Serve-injected identity was trusted. [proposed] `login` must be nonempty.
 * The spec gives the field, not its format.
 */
export const TailnetIdentitySchema = z.strictObject({
  via: z.literal('tailnet'),
  login: z.string().min(1),
});
export type TailnetIdentity = z.infer<typeof TailnetIdentitySchema>;

export const IdentitySchema = z.discriminatedUnion('via', [
  LoopbackIdentitySchema,
  TailnetIdentitySchema,
]);
export type Identity = z.infer<typeof IdentitySchema>;
