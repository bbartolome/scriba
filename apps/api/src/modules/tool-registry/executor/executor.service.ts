import { Inject, Injectable } from '@nestjs/common';
import type {
  ExecuteResponse,
  OutputKind,
  RenderResponse,
  ResolvedToolEntity,
  SourceUsed,
  ToolCallInput,
  ToolCatalogEntry,
} from '@bbartolome/scriba-contracts/tool-registry';
import {
  PROVIDER_CLIENT,
  ProviderError,
  type ChatMessage,
  type CollectedChat,
  type ProviderClient,
} from '../../providers/index.js';
import { renderPrompt, TemplateError } from '../template/renderer.js';
import { argsMessage, validateArguments } from './args-validate.js';
import { ACTIVE_PROJECT, type ActiveProjectSource } from './project-context.js';
import { idsOf, inputFieldsOf, type InputField } from './input-fields.js';
import { catalogEntriesOf, offeredTools } from './offering.js';
import { toolError } from './errors.js';
import { outputContentOf, SYSTEM_MESSAGES } from './output.js';
import { TOOL_SOURCE, type LoadedTool, type ToolSource } from './tool-source.js';

/** A tool that loaded and is enabled: the only kind the executor runs. */
type RunnableTool = Extract<LoadedTool, { valid: true }>;

/** One entity ID an argument names, with the field it came from. */
interface Reference {
  readonly field: InputField;
  readonly id: string;
}

/** What a call needs before the model is asked: the prompt, the output kind and the sources. */
interface Plan {
  readonly kind: OutputKind;
  readonly projectId: string;
  readonly prompt: string;
  readonly sources: SourceUsed[];
}

export interface ExecuteOptions {
  /** Aborting it stops the model request at once (spec, "Tool executor"). */
  readonly signal?: AbortSignal;
}

/**
 * The tool executor (spec, "Tool executor"). It takes validated arguments and caller-resolved
 * entities, renders the prompt, and calls the model on the active project's choice. It never writes
 * files. `render` stops before the model call, and `execute` runs the same steps and then calls the
 * model. The in-process callers (Agent loop, Graph runner) use this service, and so does the HTTP
 * route.
 */
@Injectable()
export class ToolExecutorService {
  constructor(
    @Inject(TOOL_SOURCE) private readonly tools: ToolSource,
    @Inject(ACTIVE_PROJECT) private readonly projects: ActiveProjectSource,
    @Inject(PROVIDER_CLIENT) private readonly client: ProviderClient,
  ) {}

  /** The rendered prompt for arguments and entities. No model call. */
  async render(name: string, input: ToolCallInput): Promise<RenderResponse> {
    const plan = await this.plan(name, input);
    return { prompt: plan.prompt };
  }

  /**
   * Renders, calls the model with one system message for the output kind and the prompt as the
   * user message, and returns `{output, sourcesUsed}`. A provider failure is `TOOL_MODEL_ERROR`.
   */
  async execute(
    name: string,
    input: ToolCallInput,
    options: ExecuteOptions = {},
  ): Promise<ExecuteResponse> {
    const plan = await this.plan(name, input);
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_MESSAGES[plan.kind] },
      { role: 'user', content: plan.prompt },
    ];

    let collected: CollectedChat;
    try {
      collected = await this.client.collect({
        messages,
        target: { kind: 'project', projectId: plan.projectId },
        signal: options.signal,
      });
    } catch (error) {
      if (error instanceof ProviderError) {
        throw toolError(
          'TOOL_MODEL_ERROR',
          error.message,
          error.hint === undefined ? undefined : { hint: error.hint },
        );
      }
      throw error;
    }

    return {
      output: { kind: plan.kind, content: outputContentOf(plan.kind, collected.text) },
      sourcesUsed: plan.sources,
    };
  }

  /** Steps 1 to 4 of the executor, shared by render and execute. */
  private async plan(name: string, input: ToolCallInput): Promise<Plan> {
    // Step 1: the tool exists, is enabled and is valid.
    const tool = await this.lookup(name);
    const spec = tool.spec;

    // Step 2: the arguments pass the schema, with defaults applied.
    const args = validateArgumentsOrRefuse(name, spec, input.arguments);
    const fields = inputFieldsOf(spec);

    // Step 3: every entity the arguments name is resolved, and its kind is one the field takes.
    const entities = firstById(input.entities);
    const references = referencesOf(fields, args);
    const unresolved = references.filter((reference) => !entities.has(reference.id));
    if (unresolved.length > 0) {
      throw toolError(
        'TOOL_ENTITY_UNRESOLVED',
        `Tool "${name}" needs entities the call did not resolve: ${unresolved
          .map((reference) => `${reference.field.key} "${reference.id}"`)
          .join(', ')}. Resolve them and try again.`,
        { entities: unresolved.map(detailOf) },
      );
    }
    const wrongKind = references.filter((reference) => {
      const kinds = reference.field.kinds;
      if (reference.field.type !== 'entity' || kinds === undefined || kinds.length === 0) {
        return false;
      }
      const entity = entities.get(reference.id);
      return entity !== undefined && !kinds.includes(entity.type);
    });
    if (wrongKind.length > 0) {
      throw toolError(
        'TOOL_ENTITY_KIND_MISMATCH',
        `Tool "${name}" got entities of the wrong kind: ${wrongKind
          .map((reference) => {
            const entity = entities.get(reference.id);
            return `"${reference.id}" is a ${entity?.type ?? 'unknown'}, but ${reference.field.key} takes ${(reference.field.kinds ?? []).join(', ')}`;
          })
          .join('; ')}.`,
        {
          entities: wrongKind.map((reference) => ({
            ...detailOf(reference),
            type: entities.get(reference.id)?.type,
          })),
        },
      );
    }

    // Step 4: the template renders from the validated arguments and the resolved entities only.
    const project = await this.projects.current();
    const catalog: ToolCatalogEntry[] = catalogEntriesOf(
      offeredTools(await this.tools.list(), project),
    );
    const prompt = renderOrRefuse(name, spec.prompt, {
      inputs: new Set(fields.map((field) => field.key)),
      args,
      entities,
      catalog,
    });

    return {
      kind: spec.output,
      projectId: project.id,
      prompt,
      sources: sourcesOf(references, entities),
    };
  }

  private async lookup(name: string): Promise<RunnableTool> {
    const tool = await this.tools.find(name);
    if (tool === undefined) {
      throw toolError('TOOL_NOT_FOUND', `No tool is named "${name}".`);
    }
    if (!tool.enabled) {
      throw toolError('TOOL_DISABLED', `Tool "${name}" is disabled, so it cannot run.`);
    }
    if (!tool.valid) {
      throw toolError('TOOL_INVALID', `Tool "${name}" did not load, so it cannot run.`);
    }
    return tool;
  }
}

/** The arguments, checked. A failing check is `TOOL_ARGS_INVALID` with every issue listed. */
function validateArgumentsOrRefuse(
  name: string,
  spec: RunnableTool['spec'],
  args: Record<string, unknown>,
): Record<string, unknown> {
  let result: ReturnType<typeof validateArguments>;
  try {
    result = validateArguments(spec, args);
  } catch {
    throw toolError('TOOL_INVALID', `Tool "${name}" has an input schema that does not compile.`);
  }
  if (!result.ok) {
    throw toolError('TOOL_ARGS_INVALID', argsMessage(name, result.issues), {
      issues: result.issues,
    });
  }
  return result.arguments;
}

function renderOrRefuse(
  name: string,
  template: string,
  input: {
    readonly inputs: ReadonlySet<string>;
    readonly args: Record<string, unknown>;
    readonly entities: ReadonlyMap<string, ResolvedToolEntity>;
    readonly catalog: readonly ToolCatalogEntry[];
  },
): string {
  try {
    return renderPrompt(template, {
      inputs: input.inputs,
      arguments: input.args,
      entities: input.entities,
      catalog: input.catalog,
    });
  } catch (error) {
    if (error instanceof TemplateError) {
      throw toolError(
        'TOOL_INVALID',
        `Tool "${name}" has a template that cannot run: ${error.message}`,
      );
    }
    throw error;
  }
}

/** The entities the caller resolved, by ID. The first one given for an ID wins. */
function firstById(entities: readonly ResolvedToolEntity[]): Map<string, ResolvedToolEntity> {
  const byId = new Map<string, ResolvedToolEntity>();
  for (const entity of entities) {
    if (!byId.has(entity.id)) byId.set(entity.id, entity);
  }
  return byId;
}

/** Every entity reference in the arguments, in property order: entity fields, then style fields. */
function referencesOf(fields: readonly InputField[], args: Record<string, unknown>): Reference[] {
  return fields.flatMap((field) =>
    field.type === 'entity' || field.type === 'style'
      ? idsOf(args[field.key]).map((id) => ({ field, id }))
      : [],
  );
}

/**
 * `sourcesUsed` (spec): the resolved references for the entity-typed fields, de-duplicated in
 * property order. A style profile is left out, because it shapes voice and not evidence.
 */
function sourcesOf(
  references: readonly Reference[],
  entities: ReadonlyMap<string, ResolvedToolEntity>,
): SourceUsed[] {
  const seen = new Set<string>();
  const sources: SourceUsed[] = [];
  for (const reference of references) {
    if (reference.field.type !== 'entity' || seen.has(reference.id)) continue;
    const entity = entities.get(reference.id);
    if (entity === undefined) continue;
    seen.add(reference.id);
    sources.push({ id: entity.id, type: entity.type, path: entity.path });
  }
  return sources;
}

function detailOf(reference: Reference): { field: string; id: string } {
  return { field: reference.field.key, id: reference.id };
}
