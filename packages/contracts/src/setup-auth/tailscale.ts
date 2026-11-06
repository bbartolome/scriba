import { z } from 'zod';

/**
 * Normalised Tailscale status (spec #18, "Tailscale LocalAPI" and "Tailscale status"). The app
 * reads tailscaled's status over the LocalAPI socket. This contract is the normalised output, not
 * the raw LocalAPI payload.
 */

/**
 * `BackendState` values from tailscaled's status. The spec names the enum and lists these values,
 * copied verbatim.
 */
export const BACKEND_STATES = [
  'NoState',
  'NeedsLogin',
  'NeedsMachineAuth',
  'Stopped',
  'Starting',
  'Running',
] as const;

export const BackendStateSchema = z.enum(BACKEND_STATES);
export type BackendState = z.infer<typeof BackendStateSchema>;

/**
 * A tailnet DNS name without the trailing dot: lowercase labels of letters, digits and hyphens.
 * [proposed] The spec says "trailing dot removed" and gives no pattern.
 */
export const TAILNET_DNS_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/**
 * Status when the socket is missing or the call is refused, as in plain `npm run dev` (spec). No
 * other field is present, so a stale value cannot leak through.
 */
export const TailscaleUnavailableStatusSchema = z.strictObject({
  available: z.literal(false),
});
export type TailscaleUnavailableStatus = z.infer<typeof TailscaleUnavailableStatusSchema>;

/**
 * Status when the socket answered. The nullable fields are null while there is nothing to report,
 * for example before login [proposed]. The prerequisite flags are null when tailscaled reports no
 * tailnet data yet [proposed]; `false` means the setting is known to be off.
 */
export const TailscaleAvailableStatusSchema = z
  .strictObject({
    available: z.literal(true),
    backendState: BackendStateSchema,
    /**
     * The login link, from `AuthURL`. Null when there is none. [proposed] A `NeedsLogin` status with
     * an empty `AuthURL` is a survey fixture, not a spec one.
     */
    authURL: z.url().nullable(),
    /** Tailnet name from `Self.DNSName`, trailing dot removed. The Host allowlist uses it. */
    dnsName: z.string().regex(TAILNET_DNS_NAME_PATTERN).nullable(),
    /** Tailnet URL, `https://<dnsName>`. Null exactly when `dnsName` is null. */
    tailnetURL: z.url().nullable(),
    /** Prerequisite flag from `CurrentTailnet.MagicDNSEnabled`. */
    magicDNSEnabled: z.boolean().nullable(),
    /** Prerequisite flag. False when `CertDomains` is empty (spec: HTTPS certificates are off). */
    httpsCertsEnabled: z.boolean().nullable(),
    /** The owner's login, from `Self.UserID` and the `User` map. Seeds the allowlist (spec). */
    ownerLogin: z.string().min(1).nullable(),
  })
  .refine(
    (status) =>
      status.dnsName === null
        ? status.tailnetURL === null
        : status.tailnetURL === `https://${status.dnsName}`,
    {
      message: 'tailnetURL must be https:// followed by dnsName, and null when dnsName is null',
      path: ['tailnetURL'],
    },
  );
export type TailscaleAvailableStatus = z.infer<typeof TailscaleAvailableStatusSchema>;

export const TailscaleStatusSchema = z.discriminatedUnion('available', [
  TailscaleUnavailableStatusSchema,
  TailscaleAvailableStatusSchema,
]);
export type TailscaleStatus = z.infer<typeof TailscaleStatusSchema>;
