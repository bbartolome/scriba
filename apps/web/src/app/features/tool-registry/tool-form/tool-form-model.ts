import { z } from 'zod';
import {
  type FormDescriptor,
  type FormField,
  ValidationIssueSchema,
  type ValidationIssue,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ApiError } from '../../../shell';

/** A value a field holds while it is being edited. A list of text is held as its raw input. */
export type FieldValue = string | number | boolean | readonly string[];

/** The values of one form, by field key. A key with no value is absent or undefined. */
export type FieldValues = Readonly<Record<string, FieldValue | undefined>>;

/**
 * The kind a style field's picker offers. The core pack's `style-profile` entity type holds the
 * style profiles (survey 22 §2, the core entity types), and the spec says a style field means one
 * style-profile entity ID.
 */
export const STYLE_PROFILE_KIND = 'style-profile';

function isFieldValue(value: unknown): value is FieldValue {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

/**
 * The starting values: each field's descriptor default, and a style field starts on the project's
 * style profile when it has no default of its own.
 */
export function initialValues(
  fields: readonly FormField[],
  styleDefault: string | undefined,
): FieldValues {
  const values: Record<string, FieldValue> = {};
  for (const field of fields) {
    if (field.default !== undefined && isFieldValue(field.default)) {
      values[field.key] = field.default;
    } else if (field.control === 'style-picker' && styleDefault !== undefined) {
      values[field.key] = styleDefault;
    }
  }
  return values;
}

/**
 * The arguments a submit sends: every field that holds a value, in form order. An empty field is
 * left out, so a missing required field reaches validate as missing. A list typed as text is split
 * on commas here, so the input does not lose a comma while it is typed.
 */
export function toArguments(
  fields: readonly FormField[],
  values: FieldValues,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const value = argumentOf(field, values[field.key]);
    if (value !== undefined) {
      args[field.key] = value;
    }
  }
  return args;
}

function argumentOf(field: FormField, value: FieldValue | undefined): unknown {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (field.list) {
    const items =
      typeof value === 'string'
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item !== '')
        : [...(Array.isArray(value) ? value : [])];
    if (items.length === 0) {
      return undefined;
    }
    return field.control === 'number'
      ? items.map((item) => (Number.isNaN(Number(item)) ? item : Number(item)))
      : items;
  }
  return Array.isArray(value) && value.length === 0 ? undefined : value;
}

/** The issue messages per field key. An issue whose path names no field is returned as general. */
export interface GroupedIssues {
  readonly byField: Readonly<Record<string, readonly string[]>>;
  readonly general: readonly string[];
}

export function groupIssues(
  issues: readonly ValidationIssue[],
  form: FormDescriptor | undefined,
): GroupedIssues {
  const keys = new Set((form?.fields ?? []).map((field) => field.key));
  const byField: Record<string, string[]> = {};
  const general: string[] = [];
  for (const issue of issues) {
    const key = issue.path.startsWith('/') ? issue.path.slice(1) : issue.path;
    if (keys.has(key)) {
      (byField[key] ??= []).push(issue.message);
    } else {
      general.push(`${key === '' ? 'Arguments' : key}: ${issue.message}`);
    }
  }
  return { byField, general };
}

/** The structured issues of a `TOOL_ARGS_INVALID` answer, or null for any other failure. */
export function argsIssuesOf(error: unknown): ValidationIssue[] | null {
  if (!(error instanceof ApiError) || error.code !== 'TOOL_ARGS_INVALID') {
    return null;
  }
  const details: unknown = error.details;
  const issues = z.object({ issues: z.array(ValidationIssueSchema) }).safeParse(details);
  return issues.success ? issues.data.issues : null;
}

/** A message a person can read for any failed call. */
export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The request failed. Try again.';
}
