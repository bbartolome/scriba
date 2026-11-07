import type { Provider } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { ApiTransport, type HttpMethod, type TransportResponse } from '../shell/api/api-transport';

/** One write that reached the fake file API, as it went over the wire. */
export interface RecordedWrite {
  readonly projectId: string;
  readonly path: string;
  readonly content: string;
  readonly baseHash: string | undefined;
}

/** One request of any kind, in order. */
export interface RecordedFileRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly body: unknown;
}

const READ_ROUTE = /^\/api\/project-store\/projects\/([^/?]+)\/files\/read\?path=([^&]*)$/;
const WRITE_ROUTE = /^\/api\/project-store\/projects\/([^/?]+)\/files\/write$/;
const MTIME = '2026-11-07T12:00:00.000Z';

interface StoredFile {
  readonly content: string;
  readonly hash: string;
}

/**
 * A stand-in digest with the contract's shape (64 lowercase hex characters). The editor never
 * computes a hash, it only sends back the one the read or write gave it, so the fake needs a digest
 * that is stable and changes with the content, not a real SHA-256.
 */
export function fakeHash(content: string): string {
  let digest = '';
  for (let seed = 0; seed < 8; seed++) {
    let hash = (0x811c9dc5 ^ Math.imul(seed, 0x9e3779b9)) >>> 0;
    for (let index = 0; index < content.length; index++) {
      hash ^= content.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    digest += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return digest;
}

/**
 * The file API at the wire, with a disk. Reads and writes go through the real typed client, so Zod
 * parsing, the typed error and the write-conflict code all behave as in the app. A write that names
 * a stale `baseHash` fails with `PROJECT_WRITE_CONFLICT` and leaves the disk alone, as the Platform
 * does (spec, "File API").
 *
 * Writes can be held, which models a save that is still in flight. A route it does not know fails
 * loudly, so a test cannot pass by accident.
 */
export class FakeFileApi extends ApiTransport {
  private readonly disk = new Map<string, StoredFile>();
  private held: Array<() => void> | undefined;
  private failNext = false;

  /** Every write that reached the fake, in arrival order. A held write is recorded when it arrives. */
  readonly writes: RecordedWrite[] = [];

  /** Every request of any kind, in order. */
  readonly requests: RecordedFileRequest[] = [];

  /** Puts a file on the fake disk, as the project already has it. */
  seed(projectId: string, path: string, content: string): void {
    this.disk.set(keyOf(projectId, path), { content, hash: fakeHash(content) });
  }

  /** The text on the fake disk now, or undefined when the file does not exist. */
  contentOf(projectId: string, path: string): string | undefined {
    return this.disk.get(keyOf(projectId, path))?.content;
  }

  /** Another editor saved the file. The disk changes under the open editor, so its base is stale. */
  externalWrite(projectId: string, path: string, content: string): void {
    this.seed(projectId, path, content);
  }

  /** Holds every write from now until `releaseWrites`, so a save stays in flight. */
  holdWrites(): void {
    this.held = [];
  }

  /** Completes the held writes in arrival order, then stops holding. */
  releaseWrites(): void {
    const queued = this.held ?? [];
    this.held = undefined;
    for (const complete of queued) {
      complete();
    }
  }

  /** The next write gets no answer at all, as when the server is unreachable. */
  failNextWrite(): void {
    this.failNext = true;
  }

  override send(method: HttpMethod, path: string, body?: unknown): Observable<TransportResponse> {
    this.requests.push({ method, path, body });

    const read = READ_ROUTE.exec(path);
    if (method === 'GET' && read) {
      return of(this.read(read[1] ?? '', decodeURIComponent(read[2] ?? '')));
    }

    const write = WRITE_ROUTE.exec(path);
    if (method === 'POST' && write) {
      const projectId = decodeURIComponent(write[1] ?? '');
      const request = body as { path: string; content: string; baseHash?: string };
      const record: RecordedWrite = {
        projectId,
        path: request.path,
        content: request.content,
        baseHash: request.baseHash,
      };
      this.writes.push(record);
      return this.answerWrite(record);
    }

    return throwError(() => new Error(`FakeFileApi: no route for ${method} ${path}`));
  }

  private answerWrite(record: RecordedWrite): Observable<TransportResponse> {
    const perform = (): TransportResponse => {
      if (this.failNext) {
        this.failNext = false;
        return { status: 0, body: undefined };
      }
      return this.write(record);
    };

    if (this.held === undefined) {
      return of(perform());
    }
    return new Observable<TransportResponse>((subscriber) => {
      this.held?.push(() => {
        subscriber.next(perform());
        subscriber.complete();
      });
    });
  }

  private read(projectId: string, path: string): TransportResponse {
    const file = this.disk.get(keyOf(projectId, path));
    if (file === undefined) {
      return {
        status: 404,
        body: { error: { code: 'PROJECT_NOT_FOUND', message: `No file at ${path}.` } },
      };
    }
    return {
      status: 200,
      body: { path, content: file.content, hash: file.hash, mtime: MTIME },
    };
  }

  private write(record: RecordedWrite): TransportResponse {
    const key = keyOf(record.projectId, record.path);
    const current = this.disk.get(key);
    if (record.baseHash !== undefined && current?.hash !== record.baseHash) {
      return {
        status: 409,
        body: {
          error: {
            code: 'PROJECT_WRITE_CONFLICT',
            message: `${record.path} changed on disk since it was read.`,
          },
        },
      };
    }
    const hash = fakeHash(record.content);
    this.disk.set(key, { content: record.content, hash });
    return { status: 200, body: { path: record.path, hash, mtime: MTIME } };
  }
}

function keyOf(projectId: string, path: string): string {
  return `${projectId}\u0000${path}`;
}

/** Provides the fake file API in place of the HTTP transport. */
export function provideFakeFileApi(api: FakeFileApi): Provider {
  return { provide: ApiTransport, useValue: api };
}
