/**
 * The library folder (`SCRIBA_BOOKS_DIR`) for this process. The pre-listen boot step sets it, the
 * same way Setup & auth keeps its token in memory. Services read it when they need the files.
 */
let libraryDir: string | undefined;

export function setProvidersLibrary(dir: string): void {
  libraryDir = dir;
}

export function providersLibrary(): string {
  if (libraryDir === undefined) {
    throw new Error('The providers module has not booted, so the library folder is unknown.');
  }
  return libraryDir;
}
