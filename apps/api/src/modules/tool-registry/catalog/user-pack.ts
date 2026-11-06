import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { userToolsDir } from './config.js';

/**
 * Writes one tool file into the user pack. The write goes through a temporary file in the same
 * folder and then a rename, so a reader never sees half a file. Nothing outside the user pack is
 * written here: the packs root is read-only to the registry (spec, "PUT on a built-in writes ...").
 */
export async function writeUserToolFile(
  booksDir: string,
  file: string,
  yaml: string,
): Promise<void> {
  const folder = userToolsDir(booksDir);
  await mkdir(folder, { recursive: true });
  const target = join(folder, file);
  const temp = `${target}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(yaml, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/** Removes one tool file from the user pack. A file that is already gone is not an error. */
export async function removeUserToolFile(booksDir: string, file: string): Promise<void> {
  await unlink(join(userToolsDir(booksDir), file)).catch((error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return;
    }
    throw error;
  });
}
