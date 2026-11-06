import { z } from 'zod';

/**
 * Token handshake and setup token (spec #18, "Setup token" and "Token handshake").
 *
 * The contract covers the request, the redirect and cookie semantics and the token format. It does
 * not cover the cookie name, Max-Age or the `Secure` flag. Those are open owner calls (survey §7
 * items 4, 6 and 8), so they are left out until the owner rules.
 */

/** Query parameter that carries the setup token. [proposed] name; the spec says "a query parameter". */
export const HANDSHAKE_TOKEN_PARAM = 'token' as const;

/**
 * Handshake request: `GET <handshake>?token=...`. [proposed] An absent or empty token fails this
 * schema. The server answers a parse failure as `SETUP_TOKEN_INVALID` with the explanatory page,
 * not as a validation error. Any other string is checked against the stored token, so this schema
 * does not enforce the token's format.
 */
export const HandshakeQuerySchema = z.object({
  token: z.string().min(1),
});
export type HandshakeQuery = z.infer<typeof HandshakeQuerySchema>;

/** Minimum setup-token entropy in bits. Spec: "at least 256 bits from a CSPRNG". */
export const SETUP_TOKEN_MIN_BITS = 256;

/** Setup-token encoding. Spec: base64url. */
export const SETUP_TOKEN_ENCODING = 'base64url' as const;

/**
 * Success redirect status. Spec: 303. The target is `/setup` until setup is complete, then `/`.
 */
export const HANDSHAKE_REDIRECT_STATUS = 303 as const;

/** Redirect targets. Spec: `/setup`, or `/` once setup is complete. Neither carries the token. */
export const HANDSHAKE_REDIRECT_TARGETS = {
  setup: '/setup',
  app: '/',
} as const;

/** Referrer-Policy on the handshake response, so the token cannot leak through Referer. Spec. */
export const HANDSHAKE_REFERRER_POLICY = 'no-referrer' as const;

/**
 * Session cookie attributes the spec fixes: HttpOnly, SameSite=Strict, `Path=/`. The cookie is
 * host-only, so it sets no `Domain` attribute. Left out on purpose: `Secure` (owner check, survey
 * item 6), Max-Age (item 8), and the port-suffixed name (item 4).
 */
export const SESSION_COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'Strict',
  path: '/',
} as const;
