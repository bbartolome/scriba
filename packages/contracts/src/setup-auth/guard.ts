import { SETUP_AUTH_ROUTES } from './routes.js';

/**
 * Constants the global guard pins (spec #18, "The guard"). They describe the guard's rules. They
 * contain no logic: the guard itself lives in apps/api. Each invariant is named here so a test can
 * check it.
 */

/**
 * Methods that skip the Origin check. Spec: the check applies to every method other than GET, HEAD
 * and OPTIONS. Every other method is a mutation and must pass the Host and full-Origin checks.
 */
export const ORIGIN_EXEMPT_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/** Methods that must never change files or state (invariant: GET and HEAD never mutate). */
export const READ_ONLY_METHODS = ['GET', 'HEAD'] as const;

/**
 * Prefix of every CORS response header. Invariant: no response carries one, OPTIONS included.
 * Header names are case-insensitive, so a test should compare in lower case.
 */
export const CORS_HEADER_PREFIX = 'access-control-';

/**
 * Loopback Host names, each with the app's port. Spec: `127.0.0.1:<SCRIBA_PORT>` and
 * `localhost:<SCRIBA_PORT>`. The port is set by Platform's env (#16), not here.
 */
export const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost'] as const;

/** Scheme of a loopback origin. Spec: `http://127.0.0.1:<port>` and `http://localhost:<port>`. */
export const LOOPBACK_ORIGIN_SCHEME = 'http' as const;

/**
 * Scheme of a tailnet origin. Spec: `https://<tailnet name>`. A tailnet Origin with `http://` is
 * refused (phase:tailnet acceptance).
 */
export const TAILNET_ORIGIN_SCHEME = 'https' as const;

/**
 * The identity header that Tailscale Serve injects on tailnet requests (spec #6, via #18). Serve
 * strips any copy a client sends. The guard trusts it only on a tailnet Host from a loopback peer.
 */
export const TAILNET_LOGIN_HEADER = 'Tailscale-User-Login' as const;

/**
 * Route paths that skip the Host check. Spec: every route except `/healthz` passes the Host check,
 * because the container healthcheck calls the internal port. `/healthz` is Platform's route (#16).
 * Platform exports no constant for it, so the path is repeated here.
 */
export const HOST_EXEMPT_ROUTE_PATHS = ['/healthz'] as const;

/**
 * The pinned public set, route paths only. Spec: `/healthz`, the token-handshake endpoint, the
 * identity endpoint and the static Angular bundle. The static bundle is the fourth member of the
 * spec's set, but it is not an API route, so it is not in this list. The guard test pins it
 * separately. "Public" means no credential is needed. The Host check still applies to all of these
 * except `/healthz`.
 */
export const SETUP_AUTH_PUBLIC_ROUTE_PATHS = [
  HOST_EXEMPT_ROUTE_PATHS[0],
  SETUP_AUTH_ROUTES.handshake.path,
  SETUP_AUTH_ROUTES.identity.path,
] as const;
