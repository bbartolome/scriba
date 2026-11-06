import type { Origin, ToolSpec } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * What the executor needs from the catalog: the effective tools, by name. The catalog service
 * (loader-validation) implements it. Until that lands, tests bind a fixture-backed source.
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
    };

export interface ToolSource {
  /** The tool with this name, after user-over-built-in precedence, or undefined when none has it. */
  find(name: string): Promise<LoadedTool | undefined>;
  /** Every tool the catalog holds, valid or not, enabled or not. */
  list(): Promise<readonly LoadedTool[]>;
}

/** The DI token the catalog source is bound under. */
export const TOOL_SOURCE = Symbol('scriba.tool-registry.tool-source');
