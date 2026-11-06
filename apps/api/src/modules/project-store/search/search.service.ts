import { stat, readFile, rm, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import {
  ProjectIdSchema,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_SCOPES,
  type SearchPassage,
  type SearchRebuildResult,
  type SearchRequest,
} from '@bbartolome/scriba-contracts/project-store';
import { PROJECT_STORE_CONFIG, type ProjectStoreConfig } from '../config.js';
import { FileLocks } from '../locks.js';
import { listNames, type ProjectLocation } from '../path-guard.js';
import { decodeText } from '../text.js';
import {
  indexFilePath,
  indexFolder,
  matchExpression,
  openSearchDatabase,
  removeIndexFiles,
  type IndexedFile,
  type SearchDatabase,
} from './fts-index.js';
import { diffManifest, scanSearchableFiles, type DiskFile } from './manifest.js';
import { splitPassages } from './passages.js';

/** An index file name: the encoded project id, then the database extension and any sidecar. */
const INDEX_FILE = /^(.+)\.db(?:-journal|-wal|-shm)?$/;

/** The error codes a path that is not there reports, so a vanished file is treated as removed. */
const VANISHED_CODES: ReadonlySet<string> = new Set(['ENOENT', 'ENOTDIR', 'EISDIR']);

function vanished(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && VANISHED_CODES.has(code);
}

/**
 * Reads one file for the index. The clock is read before the bytes, so a write that lands during the
 * read leaves a manifest key that the next diff will see as changed. A file that is not UTF-8 text
 * stays in the manifest with no passages, so it is not read again until it changes.
 */
async function readForIndex(file: DiskFile): Promise<IndexedFile | undefined> {
  const checkedMs = Date.now();
  let bytes: Buffer;
  try {
    bytes = await readFile(file.realPath);
  } catch (error) {
    if (vanished(error)) {
      return undefined;
    }
    throw error;
  }
  const text = decodeText(bytes);
  return {
    path: file.path,
    scope: file.scope,
    mtimeMs: file.mtimeMs,
    size: file.size,
    checkedMs,
    passages: text === undefined ? [] : splitPassages(text),
  };
}

/** The project id a database file name holds, or undefined when the name does not decode to an id. */
function projectIdOf(encoded: string): string | undefined {
  try {
    const id = decodeURIComponent(encoded);
    return ProjectIdSchema.safeParse(id).success ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Keyword search over `sources/` and `entities/` (spec, "Search (FTS5)"). Each query, and each
 * activation, runs the manifest diff first, so a host edit shows in the next result and a deleted file
 * drops out with no manual rebuild. Every operation takes the index lock of its project, so a diff
 * never interleaves with another diff or a rebuild. Nothing here runs from a GET.
 */
@Injectable()
export class SearchService implements OnApplicationBootstrap {
  constructor(
    @Inject(PROJECT_STORE_CONFIG) private readonly config: ProjectStoreConfig,
    private readonly locks: FileLocks,
  ) {}

  /**
   * At startup, the index files of projects whose folder is gone are removed. A renamed folder gets a
   * new id, so its old index is orphaned, and an index is disposable (spec, "Library and discovery").
   */
  // provisional: survey 20 §7 item 19 (the id is the folder name, so a renamed folder's index is orphaned)
  async onApplicationBootstrap(): Promise<void> {
    await this.pruneOrphanIndexes();
  }

  /** Activation's refresh: the manifest diff, so the index matches disk when the project turns active. */
  async refresh(project: ProjectLocation): Promise<void> {
    await this.withIndex(project, false, (db) => this.sync(project, db));
  }

  /** The rebuild POST: the database is discarded and every file is indexed again. */
  rebuild(project: ProjectLocation): Promise<SearchRebuildResult> {
    return this.withIndex(project, true, async (db) => {
      await this.sync(project, db);
      return db.counts();
    });
  }

  /**
   * A keyword query. The diff runs first. Terms are quoted and joined with OR (spec), and the result is
   * the BM25 order, with the score negated so that a higher score is better.
   */
  search(project: ProjectLocation, request: SearchRequest): Promise<SearchPassage[]> {
    return this.withIndex(project, false, async (db) => {
      await this.sync(project, db);
      const match = matchExpression(request.query);
      if (match === undefined) {
        return [];
      }
      // provisional: survey 20 §7 item 21 (search limit 10 by default, 50 at most)
      const limit = request.limit ?? SEARCH_LIMIT_DEFAULT;
      const scopes = request.scope ?? [...SEARCH_SCOPES];
      return db.hits(match, scopes, limit).map((hit) => ({
        path: hit.path,
        offset: hit.offset,
        snippet: hit.snippet,
        score: -hit.rank,
      }));
    });
  }

  /**
   * Runs one task against the project's database, under its lock. The database is opened for the task
   * and closed after it. A rebuild discards the files first, so the open starts from nothing.
   */
  // provisional: survey 20 §7 item 4 (the index is written only by activation and the POSTs, never by a GET)
  private async withIndex<T>(
    project: ProjectLocation,
    reset: boolean,
    task: (db: SearchDatabase) => Promise<T>,
  ): Promise<T> {
    const file = indexFilePath(this.config.booksDir, project.id);
    return this.locks.run(`search:${file}`, async () => {
      await mkdir(dirname(file), { recursive: true });
      if (reset) {
        removeIndexFiles(file);
      }
      const db = openSearchDatabase(file);
      try {
        return await task(db);
      } finally {
        db.close();
      }
    });
  }

  /**
   * The manifest diff. Only changed, added and removed files are touched, and all the writes land in one
   * transaction. A file that vanishes between the scan and its read is removed.
   */
  private async sync(project: ProjectLocation, db: SearchDatabase): Promise<void> {
    const plan = diffManifest(await scanSearchableFiles(project), db.manifest());
    const removed = [...plan.removed];
    const updated: IndexedFile[] = [];
    for (const file of plan.toIndex) {
      const indexed = await readForIndex(file);
      if (indexed === undefined) {
        removed.push(file.path);
      } else {
        updated.push(indexed);
      }
    }
    if (removed.length > 0 || updated.length > 0) {
      db.apply(removed, updated);
    }
  }

  /**
   * Removes index files whose project folder no longer exists. A folder that is absent creates nothing.
   * The pruning is best effort: an index is disposable, and a file that cannot be removed is ignored by
   * the next open, so a failure here must not stop the app from starting.
   */
  private async pruneOrphanIndexes(): Promise<void> {
    const folder = indexFolder(this.config.booksDir);
    const names = await listNames(folder).catch((): string[] => []);
    for (const name of names) {
      const match = INDEX_FILE.exec(name);
      if (match === null) {
        continue;
      }
      const projectId = projectIdOf(match[1] ?? '');
      if (projectId !== undefined && (await this.isProjectFolder(projectId))) {
        continue;
      }
      await rm(join(folder, name), { force: true }).catch(() => undefined);
    }
  }

  private isProjectFolder(projectId: string): Promise<boolean> {
    return stat(join(this.config.booksDir, projectId)).then(
      (info) => info.isDirectory(),
      () => false,
    );
  }
}
