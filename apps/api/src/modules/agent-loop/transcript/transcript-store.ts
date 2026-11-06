import { Injectable, Logger } from '@nestjs/common';
import {
  TRANSCRIPT_SCHEMA_VERSION,
  TranscriptEntrySchema,
  type TranscriptEntry,
} from '@bbartolome/scriba-contracts/agent-loop';
import { ApiException } from '../../platform/index.js';
import { ProjectAccess } from '../project-access.js';

/**
 * The folder of one JSON Lines file per agent run (survey 23 §7 item 18, decided). The spec says
 * `logs/`; the agent-run folder keeps the history reader's filter simple.
 */
// provisional: survey 23 §7 item 18
export const AGENT_RUNS_FOLDER = 'logs/agent-runs';

/** The message of a run closed on the next start, because it had no end line (survey 23 §7 item 15). */
// provisional: survey 23 §7 item 15
export const INTERRUPTED_MESSAGE = 'interrupted';

/** One agent run as its transcript file holds it. */
export interface StoredRun {
  readonly fileName: string;
  readonly runId: string;
  readonly entries: readonly TranscriptEntry[];
}

/** Parses the lines of one file. A line that does not match the contract is skipped. */
function parseLines(text: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = TranscriptEntrySchema.safeParse(value);
    if (parsed.success) {
      entries.push(parsed.data);
    }
  }
  return entries;
}

/**
 * The transcripts in `logs/agent-runs/`, one JSON Lines file per agent run (spec, "Transcripts").
 * Writes and reads go through the Project store's log methods, which keep the path guard and accept
 * only `logs/`. Nothing here reads a key or an absolute path.
 */
@Injectable()
export class TranscriptStore {
  private readonly logger = new Logger('AgentLoop');

  constructor(private readonly access: ProjectAccess) {}

  /** The file name of a run: its start time, then its id, so names sort in time order. */
  fileNameFor(runId: string, startedAt: Date): string {
    return `${startedAt.toISOString().replace(/[:.]/g, '-')}-${runId}.jsonl`;
  }

  async append(projectId: string, fileName: string, entry: TranscriptEntry): Promise<void> {
    await this.access.store.appendLog(
      projectId,
      `${AGENT_RUNS_FOLDER}/${fileName}`,
      `${JSON.stringify(entry)}\n`,
    );
  }

  /** Every run of the project, oldest first. A missing folder has no runs. */
  async runs(projectId: string): Promise<StoredRun[]> {
    let listing;
    try {
      listing = await this.access.store.listFiles(projectId, { path: AGENT_RUNS_FOLDER });
    } catch (error) {
      if (error instanceof ApiException && error.code === 'PROJECT_NOT_FOUND') {
        return [];
      }
      throw error;
    }
    const paths = listing
      .filter((entry) => entry.kind === 'file' && entry.path.endsWith('.jsonl'))
      .map((entry) => entry.path)
      .sort();
    const runs: StoredRun[] = [];
    for (const path of paths) {
      const text = await this.access.store.readLog(projectId, path);
      const entries = text === undefined ? [] : parseLines(text);
      const first = entries[0];
      if (first === undefined) {
        continue;
      }
      runs.push({
        fileName: path.slice(AGENT_RUNS_FOLDER.length + 1),
        runId: first.runId,
        entries,
      });
    }
    return runs;
  }

  async runOf(projectId: string, runId: string): Promise<StoredRun | undefined> {
    return (await this.runs(projectId)).find((run) => run.runId === runId);
  }

  /**
   * Closes every run that has no end line and is not live in this process (survey 23 §7 item 15).
   * Such a run was cut off by a restart. The line is written at the next start, never by a read.
   */
  async closeInterrupted(projectId: string, isLive: (runId: string) => boolean): Promise<void> {
    for (const run of await this.runs(projectId)) {
      if (isLive(run.runId) || run.entries.some((entry) => entry.kind === 'run-end')) {
        continue;
      }
      const first = run.entries[0];
      if (first === undefined) {
        continue;
      }
      const seq = Math.max(...run.entries.map((entry) => entry.seq)) + 1;
      const entry = TranscriptEntrySchema.parse({
        schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
        at: new Date().toISOString(),
        runId: run.runId,
        conversationId: first.conversationId,
        seq,
        kind: 'run-end',
        data: { reason: 'error', pendingChangeIds: [], message: INTERRUPTED_MESSAGE },
      });
      await this.append(projectId, run.fileName, entry).catch((error: unknown) => {
        this.logger.warn(`Could not close an interrupted agent run: ${String(error)}`);
      });
    }
  }
}
