import type { GenrePackName } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * The active project, as the executor needs it: its ID, for the model choice (Model providers),
 * and its genre pack, for the offering rule. The real reader comes from the Project store's file
 * API (#20 phase:files). Until then the tests bind a fixed project.
 */
export interface ActiveProject {
  readonly id: string;
  /** The built-in genre pack `project.yaml` names, or undefined when it names none. */
  readonly genrePack: GenrePackName | undefined;
}

export interface ActiveProjectSource {
  /** The active project. Rejects when no project is open. */
  current(): Promise<ActiveProject>;
}

/** The DI token the active-project source is bound under. */
export const ACTIVE_PROJECT = Symbol('scriba.tool-registry.active-project');
