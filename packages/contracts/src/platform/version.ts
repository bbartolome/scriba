import { z } from 'zod';

/**
 * Official semver 2.0.0 pattern. The spec says the version is "the baked-in semver, or
 * `0.0.0-dev` in dev". The pattern is [proposed]; the spec names the format but not the regex.
 */
export const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** [proposed] identifier. */
export const SemverSchema = z.string().regex(SEMVER_PATTERN);

/**
 * App version info, returned by `GET /api/platform/version` (guarded).
 * Types only in this package. In phase:scaffold, apps/api computes the values at runtime. Build-arg
 * baking of the version, revision and build time is deferred to phase:ci-publish.
 */
export const AppVersionInfoSchema = z.object({
  version: SemverSchema,
  /** Spec: the git SHA. [proposed] Format and the dev fallback value are not given. */
  revision: z.string().min(1),
  /** Spec: the build time. [proposed] ISO 8601 format; the spec does not give one. */
  builtAt: z.iso.datetime(),
  /** Spec: the compose version this image expects. [proposed] Format is not given. */
  composeVersion: z.string().min(1),
});
export type AppVersionInfo = z.infer<typeof AppVersionInfoSchema>;
