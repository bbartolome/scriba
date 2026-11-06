import type { Origin, ToolSpec } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * What the executor needs from the catalog: the effective tools, by name. The Tool registry's
 * catalog binds it through `ToolExecutorModule.register`.
 *
 * `enabled` is the effective switch (the author's override, else the spec's default). A tool that
 * did not load has `valid: false` and no spec, and the executor refuses it.
 */
export type LoadedTool =
  | {
      readonly valid: true;
      readonly name: string;
      readonly origin: Origin;
      readonly enabled: boolean;
      readonly spec: ToolSpec;
    }
  | {
      readonly valid: false;
      readonly name: string;
      readonly origin: Origin;
      readonly enabled: boolean;
      /** The lint errors that stopped the tool from loading, one line each, for `TOOL_INVALID`. */
      readonly problems?: readonly string[];
    };

export interface ToolSource {
  /** The tool with this name, after user-over-built-in precedence, or undefined when none has it. */
  find(name: string): Promise<LoadedTool | undefined>;
  /** Every tool the catalog holds, valid or not, enabled or not. */
  list(): Promise<readonly LoadedTool[]>;
}

/** The DI token the catalog source is bound under. */
export const TOOL_SOURCE = Symbol('scriba.tool-registry.tool-source');
