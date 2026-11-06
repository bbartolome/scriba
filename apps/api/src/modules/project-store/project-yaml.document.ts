import { isScalar, parseDocument, stringify } from 'yaml';
import {
  ProjectYamlSchema,
  type ProjectSchemaIssue,
} from '@bbartolome/scriba-contracts/project-store';

/**
 * The `schemaVersion` values this app reads (survey 20 §7 item 20). The table lists the versions
 * shipped so far. A version above the newest entry is `too-new`, and that refusal ships before any
 * migrator exists (spec, "Migrations"). Migrators arrive in `phase:migrations`.
 */
// provisional: survey 20 §7 item 20
export const PROJECT_YAML_SUPPORTED_VERSIONS: readonly number[] = [1];
export const PROJECT_YAML_NEWEST_SUPPORTED: number = Math.max(...PROJECT_YAML_SUPPORTED_VERSIONS);

/** The genre pack a project gets when the request names none (spec, "Creating projects"). */
export const DEFAULT_GENRE_PACK = 'nonfiction';

/**
 * What a `project.yaml` text says. `too-new` carries only its version, because nothing else in a
 * newer file can be trusted. `invalid` carries the problems, one per schema path.
 */
export type ProjectYamlReading =
  | {
      readonly status: 'ok';
      readonly schemaVersion: number;
      readonly title: string;
      readonly genrePack: string;
    }
  | { readonly status: 'too-new'; readonly schemaVersion: number }
  | {
      readonly status: 'invalid';
      readonly schemaVersion?: number;
      readonly title?: string;
      readonly genrePack?: string;
      readonly issues: ProjectSchemaIssue[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerVersion(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * Reads a `project.yaml` text. A version above the supported table is `too-new` before the rest of
 * the schema is checked. Otherwise the parsed value must pass the contract's schema. Unknown keys
 * pass, because the schema keeps them.
 */
export function readProjectYaml(text: string): ProjectYamlReading {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    return {
      status: 'invalid',
      issues: [{ path: '', message: `not valid YAML: ${doc.errors[0]?.message ?? 'unknown'}` }],
    };
  }
  const value: unknown = doc.toJS();
  if (!isRecord(value)) {
    return {
      status: 'invalid',
      issues: [{ path: '', message: 'the file must hold a YAML mapping at the top level' }],
    };
  }

  const version = integerVersion(value['schemaVersion']);
  if (version !== undefined && version > PROJECT_YAML_NEWEST_SUPPORTED) {
    return { status: 'too-new', schemaVersion: version };
  }

  const parsed = ProjectYamlSchema.safeParse(value);
  if (!parsed.success) {
    return {
      status: 'invalid',
      ...(version !== undefined && version >= 1 ? { schemaVersion: version } : {}),
      ...(typeof value['title'] === 'string' ? { title: value['title'] } : {}),
      ...(typeof value['genrePack'] === 'string' ? { genrePack: value['genrePack'] } : {}),
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map((segment) => String(segment)).join('.'),
        message: issue.message,
      })),
    };
  }
  return {
    status: 'ok',
    schemaVersion: parsed.data.schemaVersion,
    title: parsed.data.title,
    genrePack: parsed.data.genrePack,
  };
}

/**
 * Sets top-level scalar keys in a `project.yaml` text, in place. The rest of the document keeps its
 * comments and key order, because the edit goes through the YAML document, never through an object
 * re-serialised from the parsed value (spec, "File API"). The caller has validated the text.
 */
export function setTopLevelScalars(
  text: string,
  updates: Readonly<Record<string, string>>,
): string {
  const doc = parseDocument(text);
  for (const [key, value] of Object.entries(updates)) {
    const current = doc.get(key, true);
    if (isScalar(current)) {
      current.value = value;
    } else {
      doc.set(key, value);
    }
  }
  return doc.toString();
}

/** The text of a new `project.yaml`: the schema version, a title and a genre pack, nothing else. */
export function minimalProjectYaml(title: string, genrePack: string): string {
  return stringify({ schemaVersion: 1, title, genrePack });
}
