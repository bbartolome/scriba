import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { APP_STATE_DIR } from '../../platform/index.js';

/**
 * The secrets file: a reusable helper (survey 19 §2, spec #19 "Registry and storage" and Further
 * Notes). It holds keys only, keyed by an opaque `keyRef`. Settings hold the reference, never the key.
 * Other modules that need a secret reuse these functions rather than adding a second file.
 *
 * The file is a permissions floor, not encryption (spec #5): mode 0600 inside a 0700 folder.
 */

/** Folder under the app-state folder. // provisional: survey 19 §7 Q5 */
export const SECRETS_DIR_NAME = 'secrets';
/** File inside that folder. // provisional: survey 19 §7 Q5 */
export const SECRETS_FILE_NAME = 'secrets.yaml';

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** The keys, by keyRef. */
export type SecretMap = Readonly<Record<string, string>>;

export function secretsDir(booksDir: string): string {
  return join(booksDir, APP_STATE_DIR, SECRETS_DIR_NAME);
}

export function secretsFile(booksDir: string): string {
  return join(secretsDir(booksDir), SECRETS_FILE_NAME);
}

function permissionBits(mode: number): number {
  return mode & 0o777;
}

/** True when `actual` grants any bit that the floor does not. */
function isLooser(actual: number, floor: number): boolean {
  return (actual & ~floor & 0o777) !== 0;
}

function octal(mode: number): string {
  return `0${mode.toString(8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}

/**
 * Makes the folder and file exist with their modes, and tightens them if they are looser. Returns
 * one warning per tightened path. A warning names the path and the mode, never a key.
 */
export async function ensureSecretsFile(booksDir: string): Promise<string[]> {
  const warnings: string[] = [];
  const dir = secretsDir(booksDir);
  const file = secretsFile(booksDir);

  await mkdir(dir, { recursive: true, mode: DIR_MODE });
  const dirMode = permissionBits((await stat(dir)).mode);
  if (isLooser(dirMode, DIR_MODE)) {
    await chmod(dir, DIR_MODE);
    warnings.push(`${dir} was mode ${octal(dirMode)}; tightened it to ${octal(DIR_MODE)}.`);
  }

  let fileMode: number;
  try {
    fileMode = permissionBits((await stat(file)).mode);
  } catch (error: unknown) {
    if (!isMissing(error)) throw error;
    await writeSecrets(booksDir, {});
    return warnings;
  }
  if (isLooser(fileMode, FILE_MODE)) {
    await chmod(file, FILE_MODE);
    warnings.push(`${file} was mode ${octal(fileMode)}; tightened it to ${octal(FILE_MODE)}.`);
  }
  return warnings;
}

/** Reads every key. A missing file has no keys. The errors name the file, never its contents. */
export async function readSecrets(booksDir: string): Promise<SecretMap> {
  const file = secretsFile(booksDir);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error: unknown) {
    if (isMissing(error)) return {};
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch {
    throw new Error(`${file} is not valid YAML.`);
  }
  if (parsed === null || parsed === undefined) return {};
  const keys = isRecord(parsed) ? parsed.keys : undefined;
  if (keys === undefined || keys === null) return {};
  if (!isRecord(keys) || !Object.values(keys).every((value) => typeof value === 'string')) {
    throw new Error(`${file} does not have the expected shape.`);
  }
  return { ...(keys as Record<string, string>) };
}

/**
 * Writes the whole map atomically: a temp file created at mode 0600, synced, renamed over the
 * target, then the mode is checked (spec #5).
 */
async function writeSecrets(booksDir: string, keys: SecretMap): Promise<void> {
  const dir = secretsDir(booksDir);
  const file = secretsFile(booksDir);
  await mkdir(dir, { recursive: true, mode: DIR_MODE });

  const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx', FILE_MODE);
    try {
      await handle.writeFile(stringify({ keys }), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } catch (error: unknown) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }

  if (permissionBits((await stat(file)).mode) !== FILE_MODE) {
    await chmod(file, FILE_MODE);
  }
}

/** Stores a key under a keyRef, replacing any earlier value. */
export async function putSecret(booksDir: string, keyRef: string, key: string): Promise<void> {
  const keys = await readSecrets(booksDir);
  await writeSecrets(booksDir, { ...keys, [keyRef]: key });
}

/** Removes a keyRef's entry. Removing a missing entry does nothing. */
export async function removeSecret(booksDir: string, keyRef: string): Promise<void> {
  const keys = await readSecrets(booksDir);
  if (!(keyRef in keys)) return;
  const remaining: Record<string, string> = { ...keys };
  delete remaining[keyRef];
  await writeSecrets(booksDir, remaining);
}

/**
 * The masked hint: four mask characters, then the last four characters of the key. A key of four
 * characters or fewer shows none, so the hint never equals the key (spec #19 "Write-only keys").
 */
export function keyHintOf(key: string): string {
  const characters = [...key];
  const tail = characters.length > 4 ? characters.slice(-4).join('') : '';
  return `••••${tail}`;
}
