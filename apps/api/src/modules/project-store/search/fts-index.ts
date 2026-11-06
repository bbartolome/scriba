import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import type { SearchScope } from '@bbartolome/scriba-contracts/project-store';
import type { Passage } from './passages.js';

/**
 * The index format (spec, "Search (FTS5)"). A database whose `PRAGMA user_version` differs from this
 * constant is rebuilt when it is opened, so the constant moves whenever the schema or the passage
 * rules change.
 */
export const SEARCH_INDEX_FORMAT_VERSION = 1;

/** The number of tokens a snippet shows around the matches. */
const SNIPPET_TOKENS = 32;

/** The schema: one FTS5 table of passages, and the manifest that says which file each came from. */
const SCHEMA = [
  "CREATE VIRTUAL TABLE passages USING fts5(body, path UNINDEXED, scope UNINDEXED, char_offset UNINDEXED, tokenize = 'porter unicode61')",
  'CREATE TABLE manifest (path TEXT PRIMARY KEY, mtime_ms REAL NOT NULL, size INTEGER NOT NULL, checked_ms REAL NOT NULL)',
];

/** The files a database can leave beside it: its journal and, if ever enabled, its WAL and shared memory. */
const DATABASE_SUFFIXES = ['', '-journal', '-wal', '-shm'] as const;

/** What the manifest keeps for one file: the (path, mtime, size) key and when the file was last read. */
export interface ManifestRow {
  readonly mtimeMs: number;
  readonly size: number;
  readonly checkedMs: number;
}

/** A file ready to store: its passages replace whatever the index held for its path. */
export interface IndexedFile {
  readonly path: string;
  readonly scope: SearchScope;
  readonly mtimeMs: number;
  readonly size: number;
  readonly checkedMs: number;
  readonly passages: readonly Passage[];
}

/** One row of a query, before the module turns it into the contract's passage. */
export interface RawHit {
  readonly path: string;
  readonly offset: number;
  readonly snippet: string;
  readonly rank: number;
}

/**
 * The index file name for a project: its id, percent-encoded, so that any legal folder name is safe as
 * a file name (spec, "Library and discovery"). The characters `encodeURIComponent` leaves alone and
 * that some systems refuse in names are escaped too.
 */
export function indexFileName(projectId: string): string {
  const encoded = encodeURIComponent(projectId).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${encoded}.db`;
}

/** The folder of index files, under the library's state folder (spec: `/books/.scriba/index/`). */
export function indexFolder(booksDir: string): string {
  return join(booksDir, '.scriba', 'index');
}

/** The database file for one project. */
export function indexFilePath(booksDir: string, projectId: string): string {
  return join(indexFolder(booksDir), indexFileName(projectId));
}

/**
 * The author's text as an FTS5 query (spec, "Search (FTS5)"). Each whitespace-separated term is quoted,
 * so FTS5 syntax characters (`"`, `*`, `-`, `NEAR`) are text, and the terms are joined with OR, so a
 * long claim still retrieves. A term with no letter or digit is dropped. Undefined when none is left.
 */
export function matchExpression(query: string): string | undefined {
  const terms = query.split(/\s+/).filter((term) => /[\p{L}\p{N}]/u.test(term));
  if (terms.length === 0) {
    return undefined;
  }
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' OR ');
}

/** Removes a project's database and its sidecar files. A file that is not there is not an error. */
export function removeIndexFiles(file: string): void {
  for (const suffix of DATABASE_SUFFIXES) {
    rmSync(`${file}${suffix}`, { force: true });
  }
}

/** A typed view of one open index database. Every call runs on the caller's lock. */
export class SearchDatabase {
  private readonly insertPassage: StatementSync;
  private readonly deletePassages: StatementSync;
  private readonly deleteManifest: StatementSync;
  private readonly insertManifest: StatementSync;
  private readonly selectManifest: StatementSync;

  constructor(private readonly db: DatabaseSync) {
    this.insertPassage = db.prepare(
      'INSERT INTO passages (body, path, scope, char_offset) VALUES (?, ?, ?, ?)',
    );
    this.deletePassages = db.prepare('DELETE FROM passages WHERE path = ?');
    this.deleteManifest = db.prepare('DELETE FROM manifest WHERE path = ?');
    this.insertManifest = db.prepare(
      'INSERT INTO manifest (path, mtime_ms, size, checked_ms) VALUES (?, ?, ?, ?)',
    );
    this.selectManifest = db.prepare('SELECT path, mtime_ms, size, checked_ms FROM manifest');
  }

  close(): void {
    this.db.close();
  }

  /** The manifest: every indexed path with the key it was indexed under. */
  manifest(): Map<string, ManifestRow> {
    const rows = this.selectManifest.all() as unknown as Array<{
      path: string;
      mtime_ms: number;
      size: number;
      checked_ms: number;
    }>;
    return new Map(
      rows.map((row) => [
        row.path,
        { mtimeMs: row.mtime_ms, size: row.size, checkedMs: row.checked_ms },
      ]),
    );
  }

  /**
   * Applies one refresh in a single transaction: the removed paths lose their passages and manifest
   * rows, and each updated file replaces its passages and gets its manifest row again.
   */
  apply(removed: readonly string[], updated: readonly IndexedFile[]): void {
    this.transaction(() => {
      for (const path of [...removed, ...updated.map((file) => file.path)]) {
        this.deletePassages.run(path);
        this.deleteManifest.run(path);
      }
      for (const file of updated) {
        for (const passage of file.passages) {
          this.insertPassage.run(passage.text, file.path, file.scope, passage.offset);
        }
        this.insertManifest.run(file.path, file.mtimeMs, file.size, file.checkedMs);
      }
    });
  }

  /** The best passages for a MATCH expression within the scopes, in BM25 order, at most `limit`. */
  hits(match: string, scopes: readonly SearchScope[], limit: number): RawHit[] {
    const placeholders = scopes.map(() => '?').join(', ');
    const statement = this.db.prepare(
      `SELECT path, char_offset, snippet(passages, 0, '[', ']', '…', ${SNIPPET_TOKENS}) AS snippet, bm25(passages) AS rank ` +
        `FROM passages WHERE passages MATCH ? AND scope IN (${placeholders}) ` +
        'ORDER BY bm25(passages), path, char_offset LIMIT ?',
    );
    const rows = statement.all(match, ...scopes, limit) as unknown as Array<{
      path: string;
      char_offset: number;
      snippet: string;
      rank: number;
    }>;
    return rows.map((row) => ({
      path: row.path,
      offset: row.char_offset,
      snippet: row.snippet,
      rank: row.rank,
    }));
  }

  /** How many files the manifest holds and how many passages the index holds. */
  counts(): { files: number; passages: number } {
    const files = this.db.prepare('SELECT COUNT(*) AS n FROM manifest').get() as { n: number };
    const passages = this.db.prepare('SELECT COUNT(*) AS n FROM passages').get() as { n: number };
    return { files: files.n, passages: passages.n };
  }

  private transaction(task: () => void): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** The database as it is, when its format matches. Anything else, including an unreadable file, is undefined. */
function openCurrent(file: string): SearchDatabase | undefined {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file);
    const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    if (row?.user_version === SEARCH_INDEX_FORMAT_VERSION) {
      return new SearchDatabase(db);
    }
  } catch {
    // A file that is not a database, or that cannot be read, is rebuilt below.
  }
  db?.close();
  return undefined;
}

/**
 * Opens a project's database. When the file is missing, unreadable, or at another format version, the
 * files are removed and a fresh, empty database is created. The caller then runs the manifest diff,
 * which indexes every file (spec: "a PRAGMA user_version that differs triggers a rebuild on open").
 */
export function openSearchDatabase(file: string): SearchDatabase {
  const current = openCurrent(file);
  if (current !== undefined) {
    return current;
  }
  removeIndexFiles(file);
  const db = new DatabaseSync(file);
  try {
    db.exec(SCHEMA.join(';'));
    db.exec(`PRAGMA user_version = ${SEARCH_INDEX_FORMAT_VERSION}`);
    return new SearchDatabase(db);
  } catch (error) {
    db.close();
    throw error;
  }
}
