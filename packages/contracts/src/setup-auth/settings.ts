import { z } from 'zod';

/**
 * Owner allowlist and preferences (spec #18, "Owner allowlist" and "Preferences"). Both are
 * field-level merges into `settings.yaml`. The PATCH body is the partial form of each shape.
 */

/** Owner allowlist, `{enabled, logins[]}` (spec). Off by default. */
export const OwnerAllowlistSchema = z.strictObject({
  enabled: z.boolean(),
  /**
   * Tailscale logins. Each must be nonempty and unique [proposed]: the spec gives the field, not its
   * format. Whether an enabled list may be empty is not decided here. It is an open owner question.
   */
  logins: z.array(z.string().min(1)).refine((logins) => new Set(logins).size === logins.length, {
    message: 'logins must be unique',
  }),
});
export type OwnerAllowlist = z.infer<typeof OwnerAllowlistSchema>;

/** PATCH body for the allowlist: any subset of its fields. [proposed] method and partial body. */
export const OwnerAllowlistUpdateSchema = OwnerAllowlistSchema.partial();
export type OwnerAllowlistUpdate = z.infer<typeof OwnerAllowlistUpdateSchema>;

/**
 * Theme values. Spec: "system/light/dark", applied through the Shell's theming. The app-wide default
 * is not in this shape. Where it is stored is open (survey §7 item 14).
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export const ThemeSchema = z.enum(THEMES);
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * Preferences (spec): author display name (a default for new projects), theme and default genre
 * pack for new projects. Field names are [proposed]. Null means the author has not set the value
 * (the step was skipped or the field was never saved). The genre pack is stored as an id. Its
 * validation is open (survey §7 item 10).
 */
export const PreferencesSchema = z.strictObject({
  authorDisplayName: z.string().min(1).nullable(),
  theme: ThemeSchema,
  defaultGenrePack: z.string().min(1).nullable(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

/** PATCH body for preferences: any subset of its fields. [proposed] method and partial body. */
export const PreferencesUpdateSchema = PreferencesSchema.partial();
export type PreferencesUpdate = z.infer<typeof PreferencesUpdateSchema>;
