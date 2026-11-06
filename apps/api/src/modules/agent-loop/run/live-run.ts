import { type AgentLoopEvent, type AgentRunState } from '@bbartolome/scriba-contracts/agent-loop';
import { applyRunEvent, initialRunState, withStep } from './run-state.js';

/** Why an agent run was asked to stop. The abort itself says nothing, so the cause is kept here. */
export type StopCause = 'stopped' | 'project-switched';

/**
 * One agent run while it is active, in this process. It holds the abort signal, the sequence
 * counter, the live state that current-run-state returns, and the per-tool failure counts. Its
 * transcript writes go through one queue, so the lines land in order.
 */
export class LiveRun {
  readonly abort = new AbortController();
  /** Set before the abort, when a stop is asked for. Read by the loop when the abort lands. */
  cause: StopCause | undefined;
  /** Consecutive failed calls per tool name, reset by a successful call (survey 23 §3, P2). */
  readonly failures = new Map<string, number>();
  /** Tools dropped for the rest of this agent run after the third consecutive failure. */
  readonly withdrawn = new Set<string>();

  private state: AgentRunState;
  private nextSeqNumber = 0;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    readonly projectId: string,
    readonly runId: string,
    readonly fileName: string,
    conversationId: string,
    intent: string,
    stepCap: number,
  ) {
    this.state = initialRunState({ runId, conversationId, intent, stepCap });
  }

  get conversationId(): string {
    return this.state.conversationId;
  }

  get intent(): string {
    return this.state.intent;
  }

  get stepCap(): number {
    return this.state.stepCap;
  }

  /** The next `seq`. Events and transcript lines share one counter, so both stay in order. */
  nextSeq(): number {
    const seq = this.nextSeqNumber;
    this.nextSeqNumber += 1;
    return seq;
  }

  /** Folds an event that was just published into the live state. */
  apply(event: AgentLoopEvent): void {
    this.state = applyRunEvent(this.state, event);
  }

  setStep(step: number): void {
    this.state = withStep(this.state, step, this.state.stepCap);
  }

  /** A copy of the state, so a caller cannot change the run. */
  snapshot(): AgentRunState {
    return structuredClone(this.state);
  }

  /** Queues one transcript write behind the earlier ones. A failed write does not block the queue. */
  enqueue(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch(() => undefined);
  }

  /** Resolves once every queued transcript write has finished. */
  drain(): Promise<void> {
    return this.writes;
  }
}

/**
 * The agent runs of this process. One project has at most one run at a time. A run is reserved
 * while it resolves its model, so a second start cannot slip in before the first is registered.
 */
export class RunRegistry {
  private readonly reserved = new Set<string>();
  private readonly runs = new Map<string, LiveRun>();

  /** Reserves the project for a new run. False when the project already has a run or a reservation. */
  reserve(projectId: string): boolean {
    if (this.reserved.has(projectId) || this.runs.has(projectId)) {
      return false;
    }
    this.reserved.add(projectId);
    return true;
  }

  release(projectId: string): void {
    this.reserved.delete(projectId);
    this.runs.delete(projectId);
  }

  register(run: LiveRun): void {
    this.reserved.delete(run.projectId);
    this.runs.set(run.projectId, run);
  }

  activeOf(projectId: string): LiveRun | undefined {
    return this.runs.get(projectId);
  }

  /** The live run with this id, in this project. */
  find(projectId: string, runId: string): LiveRun | undefined {
    const run = this.runs.get(projectId);
    return run?.runId === runId ? run : undefined;
  }

  all(): LiveRun[] {
    return [...this.runs.values()];
  }
}
