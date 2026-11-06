import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { APP_STATE_DIR } from '../boot/app-state.js';

/** Name of the settings file inside the app-state folder. The spec gives this name. */
export const SETTINGS_FILE_NAME = 'settings.yaml';

/**
 * Current version of the settings.yaml envelope. [proposed] The spec says the file has a
 * `schemaVersion` but gives no number. The survey starts at 1.
 */
export const SETTINGS_SCHEMA_VERSION = 1;

/** The envelope's own key. Sections may not use it. */
const VERSION_KEY = 'schemaVersion';

const SECTION_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * [proposed] A step turns one section from `fromVersion` into `fromVersion + 1`. Steps are keyed
 * by the file's schemaVersion, as owner item 7 recommends (survey §7 item 7).
 */
export type SettingsSectionStep = (section: unknown) => unknown;

/**
 * [proposed] `registerSettingsSection` is the survey's name. The spec says only that modules
 * register `{fromVersion → step}` migrations for their section through Platform.
 */
export interface SettingsSectionRegistration {
  /** Top-level key in settings.yaml, for example `providers`. */
  readonly name: string;
  /** Steps keyed by the file schemaVersion they migrate from. */
  readonly steps?: Readonly<Record<number, SettingsSectionStep>>;
}

/** Thrown when settings.yaml cannot be read or migrated. Nothing has been written when this is thrown. */
export class SettingsFileError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'SettingsFileError';
    this.path = path;
  }
}

/** Thrown when the file was written by a newer app. The app refuses to start (spec #7). */
export class SettingsNewerVersionError extends SettingsFileError {
  readonly found: number;
  readonly supported: number;

  constructor(path: string, found: number, supported: number) {
    super(
      `${path} has schemaVersion ${found}, but this app supports up to schemaVersion ${supported}. ` +
        'Nothing was changed. To roll back, start the app version that wrote this file (for the ' +
        'Docker install, set SCRIBA_IMAGE_TAG to that version and run docker compose up -d).',
      path,
    );
    this.name = 'SettingsNewerVersionError';
    this.found = found;
    this.supported = supported;
  }
}

export type SettingsMigration =
  | { readonly status: 'absent' }
  | { readonly status: 'current'; readonly version: number }
  | {
      readonly status: 'migrated';
      readonly from: number;
      readonly to: number;
      readonly backupPath: string;
    };

type SettingsDocument = { [key: string]: unknown; schemaVersion: number };

const registrations = new Map<string, SettingsSectionRegistration>();

/**
 * Registers a section and its steps. Returns a function that removes the registration again.
 * Registration happens at module load, before boot runs the migration.
 */
export function registerSettingsSection(registration: SettingsSectionRegistration): () => void {
  const { name, steps = {} } = registration;
  if (!SECTION_NAME_PATTERN.test(name) || name === VERSION_KEY) {
    throw new Error(
      `Settings section name ${JSON.stringify(name)} must be kebab-case and cannot be "${VERSION_KEY}".`,
    );
  }
  if (registrations.has(name)) {
    throw new Error(`Settings section "${name}" is already registered.`);
  }
  for (const key of Object.keys(steps)) {
    const fromVersion = Number(key);
    if (
      !Number.isInteger(fromVersion) ||
      fromVersion < 0 ||
      fromVersion >= SETTINGS_SCHEMA_VERSION
    ) {
      throw new Error(
        `Settings section "${name}" has a step for schemaVersion ${key}. ` +
          `Steps must be keyed by an integer from 0 to ${SETTINGS_SCHEMA_VERSION - 1}.`,
      );
    }
  }
  registrations.set(name, registration);
  return () => {
    if (registrations.get(name) === registration) {
      registrations.delete(name);
    }
  };
}

export function settingsFilePath(booksDir: string): string {
  return join(booksDir, APP_STATE_DIR, SETTINGS_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads the file. Returns undefined when it is absent. Throws when it is not a valid envelope. */
async function loadDocument(path: string): Promise<SettingsDocument | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new SettingsFileError(
      `${path} is not valid YAML (${reasonOf(error)}). Nothing was changed.`,
      path,
    );
  }

  const version = isRecord(parsed) ? parsed[VERSION_KEY] : undefined;
  if (
    !isRecord(parsed) ||
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    throw new SettingsFileError(
      `${path} needs a top-level ${VERSION_KEY} that is a non-negative integer. Nothing was changed.`,
      path,
    );
  }
  return parsed as SettingsDocument;
}

/** Reads and writes need the file at the current version, so migration must have run first. */
function assertCurrent(doc: SettingsDocument, path: string): void {
  if (doc.schemaVersion > SETTINGS_SCHEMA_VERSION) {
    throw new SettingsNewerVersionError(path, doc.schemaVersion, SETTINGS_SCHEMA_VERSION);
  }
  if (doc.schemaVersion < SETTINGS_SCHEMA_VERSION) {
    throw new SettingsFileError(
      `${path} is at schemaVersion ${doc.schemaVersion}, behind ${SETTINGS_SCHEMA_VERSION}. ` +
        'Migration runs at boot, before any read or write.',
      path,
    );
  }
}

/** Writes through a temp file in the same folder, then renames it over the target. */
export async function writeFileAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, path);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/**
 * [proposed] Backup name `settings.yaml.<ISO time with : and . replaced by ->.bak`. The spec says
 * "timestamped copy beside it" without a format. The copy never overwrites an existing file.
 */
async function backupFile(path: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${path}.${stamp}.bak`;
  await copyFile(path, backupPath, constants.COPYFILE_EXCL);
  return backupPath;
}

/**
 * Boot-time migration. If the file is absent or current, nothing changes. If it is behind, the
 * file is backed up first, the registered steps run in order, and the result is written
 * atomically. A newer file throws SettingsNewerVersionError and is left as it is.
 */
export async function migrateSettingsFile(booksDir: string): Promise<SettingsMigration> {
  const path = settingsFilePath(booksDir);
  const doc = await loadDocument(path);
  if (doc === undefined) {
    return { status: 'absent' };
  }
  if (doc.schemaVersion > SETTINGS_SCHEMA_VERSION) {
    throw new SettingsNewerVersionError(path, doc.schemaVersion, SETTINGS_SCHEMA_VERSION);
  }
  if (doc.schemaVersion === SETTINGS_SCHEMA_VERSION) {
    return { status: 'current', version: doc.schemaVersion };
  }

  const from = doc.schemaVersion;
  const backupPath = await backupFile(path);
  const migrated: SettingsDocument = { ...doc };
  for (let version = from; version < SETTINGS_SCHEMA_VERSION; version += 1) {
    for (const registration of registrations.values()) {
      const step = registration.steps?.[version];
      if (step === undefined || !Object.hasOwn(migrated, registration.name)) {
        continue;
      }
      try {
        migrated[registration.name] = step(migrated[registration.name]);
      } catch (error) {
        throw new SettingsFileError(
          `Settings migration for section "${registration.name}" failed at schemaVersion ${version} ` +
            `(${reasonOf(error)}). The file was not changed; the backup is ${backupPath}.`,
          path,
        );
      }
    }
    migrated[VERSION_KEY] = version + 1;
  }

  await writeFileAtomic(path, stringify(migrated));
  return { status: 'migrated', from, to: SETTINGS_SCHEMA_VERSION, backupPath };
}

/** Serializes writes per file, so two read-modify-write calls cannot drop each other's section. */
const queues = new Map<string, Promise<void>>();

function serialize(key: string, task: () => Promise<void>): Promise<void> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task);
  queues.set(
    key,
    run.catch(() => undefined),
  );
  return run;
}

/**
 * [proposed] Survey name `readSection`. Reads one section for its owning module. `booksDir` is the
 * library folder. Returns undefined when the file or the section is absent.
 */
export async function readSection<T = unknown>(
  booksDir: string,
  name: string,
): Promise<T | undefined> {
  const path = settingsFilePath(booksDir);
  const doc = await loadDocument(path);
  if (doc === undefined) {
    return undefined;
  }
  assertCurrent(doc, path);
  return doc[name] as T | undefined;
}

/**
 * [proposed] Survey name `writeSection`. Writes one section atomically, keeping the other
 * sections. Creates the file at the current version if it does not exist yet.
 */
export function writeSection(booksDir: string, name: string, value: unknown): Promise<void> {
  if (!SECTION_NAME_PATTERN.test(name) || name === VERSION_KEY) {
    throw new Error(`Settings section name ${JSON.stringify(name)} is not valid.`);
  }
  const path = settingsFilePath(booksDir);
  return serialize(path, async () => {
    const existing = await loadDocument(path);
    if (existing !== undefined) {
      assertCurrent(existing, path);
    }
    const doc: SettingsDocument = existing ?? { [VERSION_KEY]: SETTINGS_SCHEMA_VERSION };
    doc[name] = value;
    await mkdir(dirname(path), { recursive: true });
    await writeFileAtomic(path, stringify(doc));
  });
}
