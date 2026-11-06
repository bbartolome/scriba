import {
  SETUP_STEP_IDS,
  SetupStepStateSchema,
  ThemeSchema,
  type Preferences,
  type SetupStepId,
  type SetupStepState,
} from '@bbartolome/scriba-contracts/setup-auth';
import { readSection, writeSection } from '../../platform/index.js';

/**
 * The two settings sections this module owns (survey 18 §3, setup-flow). `setup` holds the step
 * states and the overall flag. `preferences` holds the author's defaults, and the Project store
 * reads its `defaultGenrePack` when New names no pack. Both are field-level merges: a write changes
 * only the fields it names.
 */
// provisional: survey 18 §7 item 11 (setup status in a `setup` section, registered through Platform)
export const SETUP_SECTION_NAME = 'setup';
export const PREFERENCES_SECTION_NAME = 'preferences';

/** What `settings.yaml` holds for the `setup` section. */
export interface StoredSetup {
  readonly steps: Readonly<Record<SetupStepId, SetupStepState>>;
  readonly complete: boolean;
}

/** A library with no setup section: every step pending, and not complete. */
export const FRESH_SETUP: StoredSetup = {
  steps: {
    access: 'pending',
    tailscale: 'pending',
    providers: 'pending',
    preferences: 'pending',
    firstProject: 'pending',
  },
  complete: false,
};

/** The default preferences, as the contract reads them when nothing is saved. */
export const DEFAULT_PREFERENCES: Preferences = {
  authorDisplayName: null,
  theme: 'system',
  defaultGenrePack: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the stored `setup` section. An absent or unreadable section is the fresh state, so a damaged
 * value never blocks the wizard. A step that is not one of the three states reads as pending.
 */
export function parseStoredSetup(raw: unknown): StoredSetup {
  if (!isRecord(raw) || typeof raw['complete'] !== 'boolean' || !isRecord(raw['steps'])) {
    return FRESH_SETUP;
  }
  const steps = { ...FRESH_SETUP.steps };
  for (const id of SETUP_STEP_IDS) {
    const parsed = SetupStepStateSchema.safeParse(raw['steps'][id]);
    if (parsed.success) {
      steps[id] = parsed.data;
    }
  }
  return { steps, complete: raw['complete'] };
}

/** Reads the stored `preferences` section, with each field defaulted when it is missing or invalid. */
export function parsePreferences(raw: unknown): Preferences {
  const record = isRecord(raw) ? raw : {};
  const name = record['authorDisplayName'];
  const theme = ThemeSchema.safeParse(record['theme']);
  const pack = record['defaultGenrePack'];
  return {
    authorDisplayName: typeof name === 'string' && name.length > 0 ? name : null,
    theme: theme.success ? theme.data : DEFAULT_PREFERENCES.theme,
    defaultGenrePack: typeof pack === 'string' && pack.length > 0 ? pack : null,
  };
}

export function readStoredSetup(booksDir: string): Promise<StoredSetup> {
  return readSection<unknown>(booksDir, SETUP_SECTION_NAME).then(parseStoredSetup);
}

export function writeStoredSetup(booksDir: string, value: StoredSetup): Promise<void> {
  return writeSection(booksDir, SETUP_SECTION_NAME, value);
}

/** The preferences section as the file holds it, so a write can keep keys this version does not own. */
export function readRawPreferences(booksDir: string): Promise<Record<string, unknown>> {
  return readSection<unknown>(booksDir, PREFERENCES_SECTION_NAME).then((raw) =>
    isRecord(raw) ? { ...raw } : {},
  );
}

export function writeRawPreferences(
  booksDir: string,
  value: Record<string, unknown>,
): Promise<void> {
  return writeSection(booksDir, PREFERENCES_SECTION_NAME, value);
}

/**
 * Runs read-modify-write tasks one at a time. Two merges that both read before either writes would
 * drop one of the fields, so each service runs its writes through one queue.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}
