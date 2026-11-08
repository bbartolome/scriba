import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  GRAPH_ID_PATTERN,
  GRAPH_SCHEMA_VERSION,
  type CreateGraphRequest,
  type GraphDocument,
  type GraphFile,
  type GraphListResponse,
  type GraphSummary,
} from '@bbartolome/scriba-contracts/graph-runner';
import type { FileEntry, FileReadResult } from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../../platform/index.js';
import { ProjectStoreProvider } from '../../project-store/index.js';
import { graphError, isApiErrorCode, noActiveProject } from '../errors.js';
import {
  GRAPH_FOLDER,
  graphIdFromPath,
  graphPath,
  readGraphText,
  readGraphValue,
  serializeGraph,
  type GraphFileReading,
  type SchemaIssue,
} from '../graph-file.js';

/** The longest id a name gives. A longer slug would make the temporary file name too long for the disk. */
const SLUG_MAX_LENGTH = 64;

/** The extension every graph file has. */
const JSON_EXTENSION = '.json';

/**
 * Graph CRUD for the active project (spec, "Graph CRUD"). Every read and write goes through the Project
 * store's file API, so path safety and the per-file write lock apply. This slice serves list, get, create
 * and save. Renaming the id and deleting wait for a file-delete operation on the Project store (phase:engine
 * ticket).
 */
@Injectable()
export class GraphsService {
  constructor(private readonly ref: ModuleRef) {}

  /** The Project store's in-process provider, looked up through the app graph (as the Agent loop does). */
  private get store(): ProjectStoreProvider {
    return this.ref.get(ProjectStoreProvider, { strict: false });
  }

  /** The graph list: each graph's summary, sorted by id. A file the list cannot read is listed as invalid. */
  async list(): Promise<GraphListResponse> {
    const projectId = await this.activeProjectId();
    const entries = await this.graphEntries(projectId);
    const summaries = await Promise.all(
      entries.map((entry) => this.summarize(projectId, entry.id, entry.mtime)),
    );
    const graphs = summaries.filter((summary) => summary !== undefined);
    // Code-unit order, not localeCompare, so the list reads the same in every locale.
    return { graphs: graphs.sort((left, right) => (left.id < right.id ? -1 : 1)) };
  }

  /** One graph with its validation issues. A file the schema refuses is not returned (spec, error codes). */
  async get(id: string): Promise<GraphDocument> {
    const projectId = await this.activeProjectId();
    const onDisk = await this.readCurrent(projectId, id);
    if (onDisk.kind === 'missing') {
      throw notFound();
    }
    if (onDisk.kind === 'unreadable') {
      throw unreadable();
    }
    return documentOf(id, readGraphText(onDisk.file.content));
  }

  /**
   * Creates an empty graph from a name and a view. The id is a slug of the name. A name already in use, by a
   * file or folder in `graphs/` (in any letter case) or by an open pending change, gets a numeric suffix
   * (survey 24 §7 Q9, recommended). The check and the write are two steps, not one atomic check: a single
   * author is assumed, so a create that races another create is not guarded.
   */
  async create(request: CreateGraphRequest): Promise<GraphDocument> {
    const projectId = await this.activeProjectId();
    const id = uniqueId(slugFromName(request.name), await this.takenIds(projectId));
    const graph = emptyGraph(request);
    await this.store.writeFile(projectId, {
      path: graphPath(id),
      content: serializeGraph(graph),
    });
    return { id, graph, issues: [] };
  }

  /**
   * Whole-file save. The body must pass the graph schema, or the save is refused and the file is left as it
   * was. A file on disk that a newer app wrote is also refused, because saving would discard its data. A
   * file that is not readable as text has no version to read, so a valid save replaces it: that is the repair
   * path. Otherwise the write names the base it read, so a file that changed since is refused, not overwritten.
   * That refusal is the Project store's `PROJECT_WRITE_CONFLICT` (409), the one code a graph save can answer
   * that is not a `GRAPH_` code.
   */
  async save(id: string, body: unknown): Promise<GraphDocument> {
    const projectId = await this.activeProjectId();
    const onDisk = await this.readCurrent(projectId, id);
    if (onDisk.kind === 'missing') {
      throw notFound();
    }
    if (onDisk.kind === 'present') {
      const reading = readGraphText(onDisk.file.content);
      if (reading.status === 'too-new') {
        throw tooNew(reading.schemaVersion);
      }
    }
    const document = documentOf(id, readGraphValue(body));
    await this.store.writeFile(projectId, {
      path: graphPath(id),
      content: serializeGraph(document.graph),
      ...(onDisk.kind === 'present' ? { baseHash: onDisk.file.hash } : {}),
    });
    return document;
  }

  /** The active project's id. Every graph route acts on it. */
  private async activeProjectId(): Promise<string> {
    const projectId = await this.store.activeProjectId();
    if (projectId === undefined) {
      throw noActiveProject();
    }
    return projectId;
  }

  /** The direct entries of `graphs/`, files and folders alike. A missing folder has none. */
  private async folderEntries(projectId: string): Promise<FileEntry[]> {
    try {
      return await this.store.listFiles(projectId, { path: GRAPH_FOLDER });
    } catch (error) {
      if (isApiErrorCode(error, 'PROJECT_NOT_FOUND')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * The graph files directly under `graphs/`, by id, with each file's modified time. Other files in the folder
   * are not graphs and are not listed.
   */
  private async graphEntries(projectId: string): Promise<GraphEntry[]> {
    const graphs: GraphEntry[] = [];
    for (const entry of await this.folderEntries(projectId)) {
      const id = entry.kind === 'file' ? graphIdFromPath(entry.path) : undefined;
      if (id !== undefined) {
        graphs.push({ id, mtime: entry.mtime });
      }
    }
    return graphs;
  }

  /**
   * The ids a new graph must not take: every direct entry of `graphs/` whose name ends in `.json` (a file or a
   * folder), and every open pending change aimed at `graphs/`. Names are compared in lower case, because a
   * case-insensitive disk treats `Draft.json` and `draft.json` as one file. The Agent loop's `freeGraphPath`
   * uses the same rule.
   */
  private async takenIds(projectId: string): Promise<Set<string>> {
    const taken = new Set<string>();
    for (const entry of await this.folderEntries(projectId)) {
      const name = entry.path.slice(GRAPH_FOLDER.length + 1).toLowerCase();
      if (name.endsWith(JSON_EXTENSION)) {
        taken.add(name.slice(0, -JSON_EXTENSION.length));
      }
    }
    for (const change of await this.store.listPending(projectId)) {
      const id = graphStemOf(change.targetPath.toLowerCase());
      if (id !== undefined) {
        taken.add(id);
      }
    }
    return taken;
  }

  /**
   * One list row. A file the schema refuses, or that cannot be read as text, is listed as invalid. A file
   * removed after the listing was taken has no row.
   */
  private async summarize(
    projectId: string,
    id: string,
    mtime: string,
  ): Promise<GraphSummary | undefined> {
    const onDisk = await this.readCurrent(projectId, id);
    if (onDisk.kind === 'missing') {
      return undefined;
    }
    if (onDisk.kind === 'unreadable') {
      return invalidSummary(id, mtime, undefined);
    }
    const reading = readGraphText(onDisk.file.content);
    if (reading.status === 'valid') {
      return {
        id,
        name: reading.graph.name,
        view: reading.graph.view,
        nodeCount: reading.graph.nodes.length,
        modifiedAt: onDisk.file.mtime,
        schemaValid: true,
      };
    }
    return invalidSummary(id, onDisk.file.mtime, reading.raw);
  }

  /**
   * What is on disk for one graph id. Reads never write. Only a missing file, or one the store cannot read as
   * text or that is over the size cap, is classified here. Any other failure, such as no active project or a
   * path outside the project, is rethrown.
   */
  private async readCurrent(projectId: string, id: string): Promise<OnDisk> {
    if (!GRAPH_ID_PATTERN.test(id)) {
      return { kind: 'missing' };
    }
    try {
      return { kind: 'present', file: await this.store.readFile(projectId, graphPath(id)) };
    } catch (error) {
      if (isApiErrorCode(error, 'PROJECT_NOT_FOUND')) {
        return { kind: 'missing' };
      }
      if (
        isApiErrorCode(error, 'PROJECT_NOT_TEXT') ||
        isApiErrorCode(error, 'PROJECT_FILE_TOO_LARGE')
      ) {
        return { kind: 'unreadable' };
      }
      throw error;
    }
  }
}

/** A graph file in the listing: its id and its modified time. */
interface GraphEntry {
  readonly id: string;
  readonly mtime: string;
}

/** What is on disk for one graph id: no file, a file the store can read, or a file it cannot read as text. */
type OnDisk =
  | { readonly kind: 'missing' }
  | { readonly kind: 'present'; readonly file: FileReadResult }
  | { readonly kind: 'unreadable' };

/**
 * The response for a parsed graph. A valid graph is returned with no issues. Its issues are not checked
 * yet: the validator lands in a later slice of phase:engine, so an empty list does not yet mean the recipe
 * is runnable. A too-new or invalid file is refused.
 */
function documentOf(id: string, reading: GraphFileReading): GraphDocument {
  switch (reading.status) {
    case 'valid':
      return { id, graph: reading.graph, issues: [] };
    case 'too-new':
      throw tooNew(reading.schemaVersion);
    case 'invalid':
      throw schemaInvalid(reading.issues);
  }
}

function notFound(): ApiException {
  return graphError('GRAPH_NOT_FOUND', 'No graph has that id.');
}

function tooNew(schemaVersion: number): ApiException {
  return graphError(
    'GRAPH_SCHEMA_VERSION_UNSUPPORTED',
    'This graph was written by a newer app and cannot be read or saved here. The file was left unchanged.',
    { schemaVersion },
  );
}

function schemaInvalid(issues: readonly SchemaIssue[]): ApiException {
  return graphError(
    'GRAPH_SCHEMA_INVALID',
    'The graph does not match the graph schema. The file was left unchanged.',
    { issues },
  );
}

/** A file the store cannot read as UTF-8 text under the size cap. It fails the graph schema as a file. */
function unreadable(): ApiException {
  return graphError(
    'GRAPH_SCHEMA_INVALID',
    'The file is not UTF-8 text or is over 5 MB, so it cannot be read as a graph. The file was left unchanged.',
    { issues: [{ path: [], message: 'not UTF-8 text under the 5 MB size limit' }] },
  );
}

/**
 * The list row for a graph that is not valid. The name, view and node count come from the parsed JSON
 * when it has them. A story view is the safe default, since a story graph never runs.
 */
function invalidSummary(id: string, modifiedAt: string, raw: unknown): GraphSummary {
  const fields = typeof raw === 'object' && raw !== null ? raw : {};
  const name =
    'name' in fields && typeof fields.name === 'string' && fields.name.length > 0
      ? fields.name
      : id;
  const view = 'view' in fields && fields.view === 'recipe' ? 'recipe' : 'story';
  const nodeCount = 'nodes' in fields && Array.isArray(fields.nodes) ? fields.nodes.length : 0;
  return { id, name, view, nodeCount, modifiedAt, schemaValid: false };
}

/** The empty graph a create writes: the view, the name, and no nodes or edges. */
function emptyGraph(request: CreateGraphRequest): GraphFile {
  return request.view === 'story'
    ? {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        view: 'story',
        name: request.name,
        nodes: [],
        edges: [],
      }
    : {
        schemaVersion: GRAPH_SCHEMA_VERSION,
        view: 'recipe',
        name: request.name,
        nodes: [],
        edges: [],
      };
}

/**
 * The name, without its extension, of a direct `graphs/<name>.json` path. A nested path takes no id. The name is
 * not checked against the slug pattern, because it only blocks a create from reusing the name.
 */
function graphStemOf(path: string): string | undefined {
  const prefix = `${GRAPH_FOLDER}/`;
  if (!path.startsWith(prefix) || !path.endsWith(JSON_EXTENSION)) {
    return undefined;
  }
  const name = path.slice(prefix.length, -JSON_EXTENSION.length);
  return name.includes('/') ? undefined : name;
}

/**
 * The id a name gives: lower-case letters and digits joined by single hyphens, with accents removed, at most
 * 64 characters. A name with no letters or digits gets the id `graph`. The slug is [proposed]: the spec says
 * only "a lower-case slug from the name".
 */
export function slugFromName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
  return slug === '' ? 'graph' : slug;
}

/** The base id when it is free, otherwise the base with the first free numeric suffix from 2. */
function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
