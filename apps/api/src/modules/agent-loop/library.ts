/**
 * The library folder (`SCRIBA_BOOKS_DIR`) for this process, recorded by the pre-listen boot step.
 * The agent settings live in `settings.yaml` under it, and Platform's settings helpers need the
 * folder. The Project store's own folder is read through its provider, not from here.
 */
let libraryDir: string | undefined;

export function setAgentLibrary(dir: string): void {
  libraryDir = dir;
}

export function agentLibrary(): string {
  if (libraryDir === undefined) {
    throw new Error('The agent loop has not booted, so the library folder is unknown.');
  }
  return libraryDir;
}
