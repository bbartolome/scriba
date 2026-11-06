import { parseDocument } from 'yaml';
import { ProjectModelChoiceSchema } from '@bbartolome/scriba-contracts/project-store';
import { ModelChoiceSchema, type ModelChoice } from '@bbartolome/scriba-contracts/providers';

/**
 * The per-project model override in `project.yaml` (spec #19 "Model choice"; survey 19 §3). The
 * Project store owns the schema, so the key and its shape come from its contract, and this module
 * reads and writes only that one top-level key, through the YAML document, so the rest of the file
 * keeps its bytes.
 */

/** The top-level key of the override, as the Project store's schema names it. */
export const OVERRIDE_KEY = 'model';

/**
 * What a `project.yaml` says about its override. `malformed` is a `model` key the schemas refuse, or a
 * file that is not YAML. Resolution then falls back to the app default and says why.
 */
export type OverrideReading =
  | { readonly status: 'none' }
  | { readonly status: 'set'; readonly choice: ModelChoice }
  | { readonly status: 'malformed' };

/** Reads the override from a `project.yaml` text. It never writes. */
export function readOverride(text: string): OverrideReading {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return { status: 'malformed' };
  const value: unknown = doc.toJS();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { status: 'none' };
  }
  const raw: unknown = (value as Record<string, unknown>)[OVERRIDE_KEY];
  if (raw === undefined) return { status: 'none' };

  // The Project store's shape requires a non-empty model. The choice contract then checks the
  // provider id and refuses `auto`, which is never a saved model name.
  const stored = ProjectModelChoiceSchema.safeParse(raw);
  if (!stored.success) return { status: 'malformed' };
  const choice = ModelChoiceSchema.safeParse({
    providerId: stored.data.providerId,
    model: stored.data.model,
  });
  return choice.success ? { status: 'set', choice: choice.data } : { status: 'malformed' };
}

/**
 * The `project.yaml` text with its override set or removed. Only the `model` key changes. Comments
 * and the other keys keep their place, because the edit goes through the YAML document, never
 * through a re-serialised object (the Project store's rule, spec "File API").
 */
export function withOverride(text: string, choice: ModelChoice | undefined): string {
  const doc = parseDocument(text);
  if (choice === undefined) {
    doc.delete(OVERRIDE_KEY);
  } else {
    doc.set(OVERRIDE_KEY, { providerId: choice.providerId, model: choice.model });
  }
  return doc.toString();
}
