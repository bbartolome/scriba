import {
  RESERVED_BUILTIN_TOOL_NAMES,
  type ToolFamily,
} from '@bbartolome/scriba-contracts/agent-loop';
import { GenrePackNameSchema } from '@bbartolome/scriba-contracts/tool-registry';
import type { ToolFunctionDefinition } from '../../providers/index.js';
import type { ProjectStoreProvider } from '../../project-store/index.js';
import { BUILTIN_TOOLS, type BuiltinTool, type ToolOutcome } from './builtin-tools.js';
import { narrativeToolOf, type NarrativeDeps } from './narrative.js';

/**
 * The tools an agent run offers the model (spec, "Tool families"). A built-in tool and a narrative
 * tool are offered the same way: a function definition for the request, and a `prepare` that checks
 * the arguments and returns the run.
 */

/** What one call can reach: the active project, the store, and the run and call that made it. */
export interface CallContext {
  readonly projectId: string;
  readonly store: ProjectStoreProvider;
  readonly runId: string;
  readonly callId: string;
  /** The model the run uses, for the draft provenance. */
  readonly model: string;
  /** Aborted when the run is stopped or the project is switched. */
  readonly signal: AbortSignal;
}

/**
 * A call's arguments, checked. `ok` carries the arguments to run with and the run itself. A failed
 * check carries the readable text that the model and the card both receive.
 */
export type PreparedCall =
  | {
      readonly ok: true;
      readonly arguments: Record<string, unknown>;
      run(): Promise<ToolOutcome>;
    }
  | { readonly ok: false; readonly message: string };

/** One tool a run is offered. */
export interface OfferedTool {
  readonly name: string;
  readonly family: ToolFamily;
  /** The function the model is offered in the request. */
  readonly definition: ToolFunctionDefinition;
  prepare(ctx: CallContext, args: Record<string, unknown>): Promise<PreparedCall>;
}

/** The tools one agent run is offered, and the registry tools it had to leave out. */
export interface OfferedSet {
  readonly tools: readonly OfferedTool[];
  /** Registry tools whose names are reserved for a built-in tool (spec, "Tool families"). */
  readonly leftOut: readonly string[];
}

const RESERVED: ReadonlySet<string> = new Set<string>(RESERVED_BUILTIN_TOOL_NAMES);

function offerBuiltin(tool: BuiltinTool): OfferedTool {
  return {
    name: tool.name,
    family: tool.family,
    definition: {
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    },
    async prepare(ctx: CallContext, args: Record<string, unknown>): Promise<PreparedCall> {
      const check = tool.check(args);
      if (!check.ok) {
        return { ok: false, message: check.message };
      }
      return { ok: true, arguments: args, run: () => tool.execute(ctx, args) };
    },
  };
}

/**
 * The tools a run is offered, read once at the start of the run (spec: "The tool list is read at the
 * start of each agent run"). The built-in tools come first, then the enabled registry tools the
 * active project is offered. A registry tool with a reserved name is left out.
 */
// provisional: survey 23 §7 item 22
export async function offerTools(
  deps: NarrativeDeps,
  project: {
    readonly id: string;
    readonly genrePack: string | undefined;
    readonly styleProfile: string | undefined;
  },
): Promise<OfferedSet> {
  const genre = GenrePackNameSchema.safeParse(project.genrePack);
  const { functions } = await deps.catalog.functions({
    id: project.id,
    genrePack: genre.success ? genre.data : undefined,
  });
  const leftOut: string[] = [];
  const narrative: OfferedTool[] = [];
  for (const entry of functions) {
    if (RESERVED.has(entry.function.name)) {
      leftOut.push(entry.function.name);
      continue;
    }
    narrative.push(narrativeToolOf(entry, deps, project.styleProfile));
  }
  return { tools: [...BUILTIN_TOOLS.map(offerBuiltin), ...narrative], leftOut };
}
