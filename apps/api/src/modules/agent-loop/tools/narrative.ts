import { type DraftProvenance } from '@bbartolome/scriba-contracts/agent-loop';
import {
  type FunctionTool,
  type ReferencedEntity,
  type ResolvedToolEntity,
  type ToolCallInput,
  type ValidateResponse,
} from '@bbartolome/scriba-contracts/tool-registry';
import { ApiException } from '../../platform/index.js';
import type { ToolCatalogService, ToolExecutorService } from '../../tool-registry/index.js';
import { executionFailureText, expectedLine, plural, type ToolOutcome } from './builtin-tools.js';
import type { CallContext, OfferedTool, PreparedCall } from './offered.js';

/**
 * A narrative tool: one enabled registry tool, offered as a function (spec, "Narrative tools"). The
 * registry checks the arguments with Ajv. The loop then resolves every entity and style ID the
 * arguments name through the Project store, and only then does the registry execute the tool. The
 * output and its provenance come back as the outcome.
 */

/** The registry services a narrative tool calls. The Agent loop reaches them through the app graph. */
export interface NarrativeDeps {
  readonly catalog: ToolCatalogService;
  readonly executor: ToolExecutorService;
}

/** Either the resolved entities, or the readable text of the IDs that did not resolve. */
type Resolution =
  | { readonly ok: true; readonly entities: ResolvedToolEntity[] }
  | { readonly ok: false; readonly message: string };

/** The validation message: the registry's own lines, then the expected arguments in brief. */
function validationMessage(parameters: Record<string, unknown>, error: unknown): string {
  if (error instanceof ApiException && error.code === 'TOOL_ARGS_INVALID') {
    return `${error.message}\n${expectedLine(parameters)}`;
  }
  return executionFailureText(error);
}

/**
 * Resolves each entity and style ID through the Project store, once each. An unknown ID, or one that
 * names more than one file, is a readable problem for the model. The fields that name it are listed.
 */
async function resolveReferences(
  ctx: CallContext,
  name: string,
  references: readonly ReferencedEntity[],
): Promise<Resolution> {
  const ids = [...new Set(references.map((reference) => reference.id))];
  if (ids.length === 0) {
    return { ok: true, entities: [] };
  }
  const results = await ctx.store.resolveEntities(ctx.projectId, ids);
  const entities: ResolvedToolEntity[] = [];
  const problems: string[] = [];
  for (const result of results) {
    const fields = references
      .filter((reference) => reference.id === result.id)
      .map((reference) => reference.field)
      .join(', ');
    if (result.ok) {
      entities.push({
        id: result.id,
        type: result.type,
        path: result.path,
        content: result.content,
      });
    } else if (result.code === 'PROJECT_ENTITY_DUPLICATE_ID') {
      problems.push(
        `- ${fields}: the ID "${result.id}" is in more than one file: ${(result.paths ?? []).join(', ')}.`,
      );
    } else {
      problems.push(`- ${fields}: no entity or source has the ID "${result.id}".`);
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      message: [
        `Tool "${name}" could not resolve the entities it names:`,
        ...problems,
        'Use IDs that the project lists, and try again.',
      ].join('\n'),
    };
  }
  return { ok: true, entities };
}

/** Runs the executor, then builds the draft provenance: `{runId, toolCallId, tool, entityIds, …}`. */
async function draftOf(
  ctx: CallContext,
  executor: ToolExecutorService,
  name: string,
  input: ToolCallInput,
  entityIds: readonly string[],
): Promise<ToolOutcome> {
  const response = await executor.execute(name, input, { signal: ctx.signal });
  const provenance: DraftProvenance = {
    runId: ctx.runId,
    toolCallId: ctx.callId,
    tool: name,
    entityIds: [...entityIds],
    sourcesUsed: response.sourcesUsed,
    model: ctx.model,
    at: new Date().toISOString(),
  };
  const { kind, content } = response.output;
  // The card has no provenance field (the contract is unchanged), so the provenance rides in the body.
  // provisional: survey 23 §3 P3 (judgement: card provenance is carried in the output body)
  return {
    summary: `Produced ${kind} output from ${plural(response.sourcesUsed.length, 'source', 'sources')}.`,
    output: { kind, content, provenance },
    modelText: content,
    sourcesUsed: response.sourcesUsed,
    provenance,
  };
}

/** The keys of a tool's style fields, from its spec: the properties whose `x-scriba-type` is `style`. */
async function styleKeysOf(catalog: ToolCatalogService, name: string): Promise<string[]> {
  const loaded = await catalog.effectiveTool(name);
  if (loaded === undefined || !loaded.valid) {
    return [];
  }
  const properties = (loaded.spec.inputs['properties'] ?? {}) as Record<string, unknown>;
  return Object.entries(properties)
    .filter(
      ([, schema]) =>
        typeof schema === 'object' &&
        schema !== null &&
        (schema as Record<string, unknown>)['x-scriba-type'] === 'style',
    )
    .map(([key]) => key);
}

/**
 * The project's style profile, for each style field the call left empty. The caller fills it before it
 * resolves the entities (survey 21 §7 item 7), so a draft keeps the project's voice by default. The
 * profile is used only when it resolves, so a missing one renders no style and does not fail the call.
 */
// provisional: survey 21 §7 item 7
async function defaultStyleOf(
  ctx: CallContext,
  catalog: ToolCatalogService,
  name: string,
  args: Record<string, unknown>,
  profile: string | undefined,
): Promise<{ readonly keys: string[]; readonly entity: ResolvedToolEntity } | undefined> {
  if (profile === undefined) {
    return undefined;
  }
  const keys = (await styleKeysOf(catalog, name)).filter(
    (key) => args[key] === undefined || args[key] === '',
  );
  if (keys.length === 0) {
    return undefined;
  }
  const [result] = await ctx.store.resolveEntities(ctx.projectId, [profile]);
  if (result?.ok !== true) {
    return undefined;
  }
  return {
    keys,
    entity: { id: result.id, type: result.type, path: result.path, content: result.content },
  };
}

/** One enabled registry tool, as an offered tool. The family is narrative (spec, "Tool families"). */
export function narrativeToolOf(
  entry: FunctionTool,
  deps: NarrativeDeps,
  styleProfile: string | undefined,
): OfferedTool {
  const { name, parameters } = entry.function;
  return {
    name,
    family: 'narrative',
    definition: entry,
    async prepare(ctx: CallContext, args: Record<string, unknown>): Promise<PreparedCall> {
      let checked: ValidateResponse;
      try {
        checked = await deps.catalog.validate(name, { mode: 'full', arguments: args });
      } catch (error) {
        return { ok: false, message: validationMessage(parameters, error) };
      }
      // An empty style value names no profile, so it is not resolved; the default below may fill it.
      const named = checked.entities.filter((reference) => reference.id !== '');
      const resolution = await resolveReferences(ctx, name, named);
      if (!resolution.ok) {
        return { ok: false, message: resolution.message };
      }
      const defaulted = await defaultStyleOf(
        ctx,
        deps.catalog,
        name,
        checked.arguments,
        styleProfile,
      );
      const passed: Record<string, unknown> = { ...checked.arguments };
      if (defaulted !== undefined) {
        for (const key of defaulted.keys) {
          passed[key] = defaulted.entity.id;
        }
      }
      const entities =
        defaulted === undefined ? resolution.entities : [...resolution.entities, defaulted.entity];
      const entityIds = [
        ...new Set([
          ...named.map((reference) => reference.id),
          ...(defaulted === undefined ? [] : [defaulted.entity.id]),
        ]),
      ];
      const input: ToolCallInput = { arguments: passed, entities };
      return {
        ok: true,
        arguments: passed,
        run: () => draftOf(ctx, deps.executor, name, input, entityIds),
      };
    },
  };
}
