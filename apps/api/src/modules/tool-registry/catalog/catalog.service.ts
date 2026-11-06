import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  type BuiltInOrigin,
  type BuiltInTool,
  type DeleteToolResponse,
  type EntityType,
  type EntityTypeListResponse,
  type FunctionListResponse,
  type GenrePackName,
  type Origin,
  type LintResult,
  type SaveToolResponse,
  type SetToolEnabledResponse,
  type ToolDetail,
  type ToolListResponse,
  type ValidateRequest,
  type ValidateResponse,
  type LintDiagnostic,
} from '@bbartolome/scriba-contracts/tool-registry';
import { StreamPublisher } from '../../platform/index.js';
import { toolError } from '../errors.js';
import { offeredTools } from '../executor/offering.js';
import type { ActiveProject } from '../executor/project-context.js';
import type { LoadedTool } from '../executor/tool-source.js';
import { lintToolSpec } from '../spec/lint.js';
import { TOOL_REGISTRY_CONFIG, type ToolRegistryConfig } from './config.js';
import {
  asBuiltIn,
  detailOf,
  entityTypeEntryOf,
  functionOf,
  loadedOf,
  summaryOf,
  toolEntryOf,
  type EntityTypeEntry,
  type ToolEntry,
} from './entries.js';
import { readOverrides, writeOverride } from './settings.js';
import {
  buildSnapshot,
  changedNames,
  EMPTY_SNAPSHOT,
  type CatalogRow,
  type CatalogSnapshot,
} from './snapshot.js';
import { readBuiltInEntityTypes, readBuiltInTools, readUserTools } from './packs.js';
import { removeUserToolFile, writeUserToolFile } from './user-pack.js';

/**
 * The Tool registry's catalog (survey 21 §2, `catalog.service.ts`). It loads the built-in packs
 * once, at startup, and re-scans the user pack before each list, get or call, by its manifest. It
 * serves the registry's reads and writes, and it is the in-process source the executor binds.
 *
 * GET never mutates. A rescan updates memory only, and it publishes `catalog-changed` when a
 * name's rows moved (survey 21 §7 item 4). Writes go through one queue, so a save and a rescan
 * cannot interleave.
 */
@Injectable()
export class ToolCatalogService implements OnModuleInit {
  private builtIns: ToolEntry[] = [];
  private entityEntries: EntityTypeEntry[] = [];
  private knownKinds: ReadonlySet<string> = new Set();
  private userEntries: ToolEntry[] = [];
  private snapshot: CatalogSnapshot = EMPTY_SNAPSHOT;
  private manifest: string | undefined;
  private overridesKey: string | undefined;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(TOOL_REGISTRY_CONFIG) private readonly config: ToolRegistryConfig,
    private readonly publisher: StreamPublisher,
  ) {}

  /**
   * Loads the built-in packs. Two built-ins with one name are a load error, so the app does not
   * start with an ambiguous catalog (spec, "Pack layout and loading"; CI's pack lint catches it too).
   */
  async onModuleInit(): Promise<void> {
    const entityFiles = await readBuiltInEntityTypes(this.config.packsDir);
    this.entityEntries = entityFiles.map(entityTypeEntryOf);
    const kinds = new Map<string, number>();
    for (const entry of this.entityEntries) {
      if (entry.entityType !== undefined) {
        kinds.set(entry.entityType.kind, (kinds.get(entry.entityType.kind) ?? 0) + 1);
      }
    }
    for (const [kind, count] of kinds) {
      if (count > 1) {
        throw new Error(
          `Two built-in entity types declare the kind "${kind}". Kinds must be unique, so the packs cannot load.`,
        );
      }
    }
    this.knownKinds = new Set(kinds.keys());

    const toolFiles = await readBuiltInTools(this.config.packsDir);
    this.builtIns = toolFiles.map((file) =>
      toolEntryOf(file, { knownKinds: this.knownKinds, strictKinds: false }),
    );
    const origins = new Map<string, BuiltInOrigin[]>();
    for (const entry of this.builtIns) {
      if (entry.origin === 'user') continue;
      origins.set(entry.name, [...(origins.get(entry.name) ?? []), entry.origin]);
    }
    for (const [name, found] of origins) {
      if (found.length > 1) {
        throw new Error(
          `Two built-in tools are named "${name}" (${found.join(', ')}). Built-in names must be unique, so the packs cannot load.`,
        );
      }
    }
    await this.refresh(true);
  }

  /** `GET /api/tools`: one row per name, plus the invalid user copies that a built-in shadows. */
  async list(query: { readonly genrePack?: GenrePackName }): Promise<ToolListResponse> {
    await this.refresh();
    const rows = this.snapshot.rows.filter((row) => offersTo(row.entry.origin, query.genrePack));
    return { tools: rows.map((row) => summaryOf(row.entry, row.enabled, row.shadows)) };
  }

  /** `GET /api/tools/:name`: the effective tool, with its YAML, lint and views when it is valid. */
  async detail(name: string): Promise<ToolDetail> {
    await this.refresh();
    const row = this.rowOf(name);
    return detailOf(row.entry, row.enabled, row.shadows);
  }

  /** `GET /api/tools/:name/builtin`: the built-in original of a tool, for Compare and Revert. */
  async builtin(name: string): Promise<BuiltInTool> {
    await this.refresh();
    const entry = this.builtIns.find((candidate) => candidate.name === name);
    if (entry === undefined || entry.origin === 'user') {
      throw toolError('TOOL_NOT_FOUND', `No built-in tool is named "${name}".`);
    }
    const origin = asBuiltIn(entry.origin);
    if (origin === undefined) {
      throw toolError('TOOL_NOT_FOUND', `No built-in tool is named "${name}".`);
    }
    return { name, origin, yaml: entry.yaml };
  }

  /** `GET /api/tools/functions`: the function schemas of the tools offered to the active project. */
  async functions(project: ActiveProject): Promise<FunctionListResponse> {
    await this.refresh();
    const rows = [...this.snapshot.effective.values()];
    const offered = new Set(
      offeredTools(
        rows.map((row) => loadedOf(row.entry, row.enabled)),
        project,
      ).map((tool) => tool.name),
    );
    const functions = rows.flatMap((row) => {
      const schema = offered.has(row.entry.name) ? functionOf(row.entry) : undefined;
      return schema === undefined ? [] : [schema];
    });
    return { functions };
  }

  /** `GET /api/tools/entity-types`: the entity-type schemas the built-in packs declare. */
  async entityTypes(): Promise<EntityTypeListResponse> {
    const entityTypes: EntityType[] = this.entityEntries.flatMap((entry) =>
      entry.entityType === undefined ? [] : [entry.entityType],
    );
    return { entityTypes };
  }

  /** `POST /api/tools/lint`: lints submitted YAML and writes nothing. The result is a 200 either way. */
  lint(yaml: string): LintResult {
    const result = lintToolSpec(yaml, { knownKinds: this.knownKinds, strictKinds: false });
    return { diagnostics: result.diagnostics };
  }

  /**
   * Validates arguments against one tool, in full or `params` mode. A tool that did not load is
   * `TOOL_INVALID`. A success returns the arguments with defaults applied and the entity IDs to
   * resolve. A failure is `TOOL_ARGS_INVALID`, with a model-readable message and the issues.
   */
  async validate(name: string, request: ValidateRequest): Promise<ValidateResponse> {
    await this.refresh();
    const row = this.rowOf(name);
    if (!row.entry.valid || row.entry.args === undefined) {
      throw invalidError(name, row.entry.diagnostics);
    }
    const result = row.entry.args.check(request.mode, request.arguments);
    if (!result.ok) {
      const lines = result.issues.map(
        (issue) =>
          `- ${issue.path === '/' ? '(arguments)' : issue.path.slice(1)}: ${issue.message}`,
      );
      throw toolError(
        'TOOL_ARGS_INVALID',
        [`${row.entry.name}: the arguments do not match the tool's inputs.`, ...lines].join('\n'),
        { issues: result.issues },
      );
    }
    return { arguments: result.arguments, entities: result.entities };
  }

  /**
   * `PUT /api/tools/:name`: lints the YAML against its file name, and writes the user copy only
   * when no error remains. A built-in is copied on write, and the packs root is never touched.
   */
  save(name: string, yaml: string): Promise<SaveToolResponse> {
    return this.exclusive(async () => {
      const result = lintToolSpec(yaml, {
        expectedName: name,
        knownKinds: this.knownKinds,
        strictKinds: false,
      });
      const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
      if (errors.length > 0) {
        throw toolError(
          'TOOL_SPEC_LINT_FAILED',
          [
            `Tool "${name}" was not saved. Fix these errors and save again:`,
            ...errors.map(
              (error) => `- line ${error.line}, column ${error.column}: ${error.message}`,
            ),
          ].join('\n'),
          { diagnostics: result.diagnostics },
        );
      }
      await writeUserToolFile(this.config.booksDir, `${name}.yaml`, yaml);
      await this.scan(true);
      return { name, origin: 'user', lint: { diagnostics: result.diagnostics } };
    });
  }

  /**
   * `DELETE /api/tools/:name`: removes the user copy, which reverts to the built-in, or a user-only
   * file. A built-in with no user copy cannot be deleted.
   */
  remove(name: string): Promise<DeleteToolResponse> {
    return this.exclusive(async () => {
      await this.scan(false);
      const copies = this.userEntries.filter((entry) => entry.name === name);
      const builtIn = this.builtIns.find((entry) => entry.name === name);
      if (copies.length === 0) {
        if (builtIn !== undefined) {
          throw toolError(
            'TOOL_BUILTIN_READONLY',
            `"${name}" is a built-in tool, which is read-only. Customize it to save a copy.`,
          );
        }
        throw toolError('TOOL_NOT_FOUND', `No tool is named "${name}".`);
      }
      for (const copy of copies) {
        await removeUserToolFile(this.config.booksDir, copy.file);
      }
      await this.scan(true);
      return {
        name,
        restoredOrigin: builtIn === undefined ? null : (asBuiltIn(builtIn.origin) ?? null),
      };
    });
  }

  /** `PUT /api/tools/:name/enabled`: the author's switch. It is stored in `settings.yaml` and never forks a copy. */
  setEnabled(name: string, enabled: boolean): Promise<SetToolEnabledResponse> {
    return this.exclusive(async () => {
      await this.scan(false);
      if (!this.snapshot.effective.has(name)) {
        throw toolError('TOOL_NOT_FOUND', `No tool is named "${name}".`);
      }
      await writeOverride(this.config.booksDir, name, enabled);
      await this.scan(true);
      return { name, enabled };
    });
  }

  /** The effective tool by name, after user-over-built-in precedence, for the executor's source. */
  async effectiveTool(name: string): Promise<LoadedTool | undefined> {
    await this.refresh();
    const row = this.snapshot.effective.get(name);
    return row === undefined ? undefined : loadedOf(row.entry, row.enabled);
  }

  /** Every effective tool, valid or not, enabled or not, for the executor's source. */
  async effectiveTools(): Promise<readonly LoadedTool[]> {
    await this.refresh();
    return [...this.snapshot.effective.values()].map((row) => loadedOf(row.entry, row.enabled));
  }

  /** Re-scans the user pack and the settings when they changed, before a read. */
  refresh(force = false): Promise<void> {
    return this.exclusive(() => this.scan(force));
  }

  private rowOf(name: string): CatalogRow {
    const row = this.snapshot.effective.get(name);
    if (row === undefined) {
      throw toolError('TOOL_NOT_FOUND', `No tool is named "${name}".`);
    }
    return row;
  }

  /**
   * Re-reads the user pack and the overrides when the manifest or the overrides changed, or when
   * forced. It publishes `catalog-changed` with the names whose rows moved.
   */
  // provisional: survey 21 §7 item 4 (a rescan updates memory only and publishes an in-memory change)
  private async scan(force: boolean): Promise<void> {
    const user = await readUserTools(this.config.booksDir);
    const overrides = await readOverrides(this.config.booksDir);
    const overridesKey = JSON.stringify([...overrides]);
    if (
      !force &&
      this.snapshot.loaded &&
      this.manifest === user.manifest &&
      this.overridesKey === overridesKey
    ) {
      return;
    }
    const userEntries = user.files.map((file) =>
      toolEntryOf(file, { knownKinds: this.knownKinds, strictKinds: false }),
    );
    const next = buildSnapshot(this.builtIns, userEntries, overrides);
    const previous = this.snapshot;
    this.userEntries = userEntries;
    this.snapshot = next;
    this.manifest = user.manifest;
    this.overridesKey = overridesKey;
    if (previous.loaded) {
      const names = changedNames(previous, next);
      if (names.length > 0) {
        this.publisher.publish({
          module: 'tool-registry',
          type: 'catalog-changed',
          data: { names },
        });
      }
    }
  }

  /** Runs one task after the ones before it, so reads, writes and rescans never interleave. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task);
    this.chain = run.catch(() => undefined);
    return run;
  }
}

/** Whether a tool from this origin is offered when the list is filtered to a genre pack. */
function offersTo(origin: Origin, genrePack: GenrePackName | undefined): boolean {
  if (genrePack === undefined) return true;
  return origin === 'core' || origin === 'user' || origin === genrePack;
}

/** A tool that did not load cannot run: the message names it and lists each error line. */
function invalidError(name: string, diagnostics: readonly LintDiagnostic[]): Error {
  const lines = diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => `- line ${diagnostic.line}: ${diagnostic.message}`);
  return toolError(
    'TOOL_INVALID',
    [`Tool "${name}" did not load, so it cannot run.`, ...lines].join('\n'),
  );
}
