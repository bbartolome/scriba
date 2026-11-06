import { randomBytes } from 'node:crypto';
import { open, readdir, rename, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Writes bytes to a real path atomically: a temp file in the same folder, fsynced, then renamed over
 * the target (spec, "File API"). The temp name starts with a dot, so the list hides it and the
 * compile step skips it (survey 20 §7 item 17). The caller passes the real path, so a symlink is
 * never replaced: the bytes go to what the link points at.
 */
export async function writeAtomically(realPath: string, bytes: Uint8Array): Promise<void> {
  const temp = join(
    dirname(realPath),
    `.${basename(realPath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    const handle = await open(temp, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, realPath);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

/** A dot-prefixed temp name left behind by a crash: `.<name>.<pid>.<hex>.tmp`. */
const TEMP_NAME = /^\..+\.tmp$/;

/**
 * Removes leftover temp files under a folder, recursively, on activation (survey 20 §7 item 17). It
 * touches only dot-prefixed `.tmp` names, never a real file. A missing folder is a no-op.
 */
export async function sweepTempFiles(folder: string): Promise<number> {
  let removed = 0;
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      removed += await sweepTempFiles(path);
    } else if (
      TEMP_NAME.test(entry.name) &&
      (await stat(path).then(
        (s) => s.isFile(),
        () => false,
      ))
    ) {
      await unlink(path).catch(() => undefined);
      removed += 1;
    }
  }
  return removed;
}
