import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { parse } from 'yaml';
import type { EntityListItem, ResolvedEntity } from '@bbartolome/scriba-contracts/project-store';
import { ApiException } from '../platform/index.js';
import { listFilesUnder } from './walk.js';
import { guardProjectPath, type ProjectLocation } from './path-guard.js';
import { MAX_FILE_BYTES, decodeText, hasTextName } from './text.js';

/** The folders entities live in. Source entities live in `sources/` (spec, "Resolution"). */
const ENTITY_FOLDERS = ['sources', 'entities'] as const;

/** An entity as the index holds it: its ID, type, file and full text. */
export interface IndexedEntity {
  readonly id: string;
  readonly type: string;
  readonly path: string;
  readonly content: string;
}

/** A front matter block at the top of a file: `---`, YAML, `---`. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a file's front matter. `undefined` means no block. `'malformed'` means a block that is not a
 * YAML mapping, and the file is then not an entity.
 */
export function readFrontMatter(text: string): Record<string, unknown> | 'malformed' | undefined {
  const match = FRONT_MATTER.exec(text);
  if (match === null) {
    return undefined;
  }
  try {
    const value: unknown = parse(match[1] ?? '');
    if (value === null) {
      return {};
    }
    return isRecord(value) ? value : 'malformed';
  } catch {
    return 'malformed';
  }
}

/** The ID a file resolves by when its front matter has none: the file stem. */
function stemOf(path: string): string {
  const name = basename(path);
  const dot = extname(name);
  return dot.length > 0 && dot.length < name.length ? name.slice(0, -dot.length) : name;
}

/**
 * Entity resolution and the entity list (spec, "Entity references and front matter"). The index is
 * built on each call from the files on disk, and nothing is stored, so a GET never writes. The
 * front-matter `id` wins, a file with no `id` resolves by its stem, and a file with no `type` in
 * `sources/` is a source.
 */
@Injectable()
export class EntitiesService {
  /**
   * Every entity in `sources/` and `entities/`. Drafts are never indexed (spec, "Search").
   * The index is computed in memory on each request, and nothing is persisted here.
   */
  // provisional: survey 20 §7 item 4
  async index(project: ProjectLocation): Promise<IndexedEntity[]> {
    const entities: IndexedEntity[] = [];
    for (const folder of ENTITY_FOLDERS) {
      const paths = await listFilesUnder(project, folder).catch((error: unknown) => {
        if (error instanceof ApiException && error.code === 'PROJECT_PATH_OUTSIDE_PROJECT') {
          return [];
        }
        throw error;
      });
      for (const path of paths) {
        const entity = await this.readEntity(project, path, folder);
        if (entity !== undefined) {
          entities.push(entity);
        }
      }
    }
    return entities;
  }

  /** Resolves each ID to its one file, or reports it as not found or duplicated. Order follows the request. */
  async resolve(project: ProjectLocation, ids: readonly string[]): Promise<ResolvedEntity[]> {
    const entities = await this.index(project);
    return ids.map((id): ResolvedEntity => {
      const hits = entities.filter((entity) => entity.id === id);
      const [first] = hits;
      if (first === undefined) {
        return { ok: false, id, code: 'PROJECT_ENTITY_NOT_FOUND' };
      }
      if (hits.length > 1) {
        return {
          ok: false,
          id,
          code: 'PROJECT_ENTITY_DUPLICATE_ID',
          paths: hits.map((hit) => hit.path).sort(),
        };
      }
      return { ok: true, id, type: first.type, path: first.path, content: first.content };
    });
  }

  /** The entity list, optionally filtered by `type`. */
  async list(project: ProjectLocation, type?: string): Promise<EntityListItem[]> {
    const entities = await this.index(project);
    return entities
      .filter((entity) => type === undefined || entity.type === type)
      .map((entity) => ({ id: entity.id, type: entity.type, path: entity.path }));
  }

  // provisional: survey 20 §7 item 27 (a file with no id resolves by its stem; duplicates are reported)
  private async readEntity(
    project: ProjectLocation,
    path: string,
    folder: string,
  ): Promise<IndexedEntity | undefined> {
    if (!hasTextName(path)) {
      return undefined;
    }
    const guarded = await guardProjectPath(project, path).catch(() => undefined);
    if (guarded === undefined) {
      return undefined;
    }
    const info = await stat(guarded.realPath).catch(() => undefined);
    if (info === undefined || info.size > MAX_FILE_BYTES) {
      return undefined;
    }
    const text = decodeText(await readFile(guarded.realPath));
    if (text === undefined) {
      return undefined;
    }
    const front = readFrontMatter(text);
    if (front === 'malformed') {
      return undefined;
    }
    const declaredId = front?.['id'];
    const declaredType = front?.['type'];
    const id = typeof declaredId === 'string' && declaredId.length > 0 ? declaredId : stemOf(path);
    const type =
      typeof declaredType === 'string' && declaredType.length > 0
        ? declaredType
        : // provisional: survey 20 §7 item 14 (a source file without a type defaults to `source`)
          folder === 'sources'
          ? 'source'
          : undefined;
    if (type === undefined) {
      return undefined;
    }
    return { id, type, path, content: text };
  }
}
