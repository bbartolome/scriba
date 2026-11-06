import {
  AGENT_DEFAULT_STEP_CAP,
  type AgentLoopEvent,
  type AgentRunState,
  type TranscriptEntry,
  type ToolCard,
} from '@bbartolome/scriba-contracts/agent-loop';

/**
 * The run state a client sees (spec, "Current-run-state"). Two folds build it, and both must agree:
 * `applyRunEvent` folds the live events of an active run, and `runStateFromEntries` folds the run's
 * transcript once it is finished. A test checks that the two give the same state for one run.
 */

export interface NewRunState {
  readonly runId: string;
  readonly conversationId: string;
  readonly intent: string;
  readonly stepCap: number;
}

export function initialRunState(run: NewRunState): AgentRunState {
  return {
    runId: run.runId,
    conversationId: run.conversationId,
    intent: run.intent,
    status: 'active',
    endReason: null,
    step: 0,
    stepCap: run.stepCap,
    assistantText: '',
    cards: [],
    groundingResults: [],
    pendingChangeIds: [],
    lastSeq: 0,
  };
}

/** Replaces one card, found by its call id. A card that is not there is left as it is. */
function updateCard(
  cards: readonly ToolCard[],
  callId: string,
  change: (card: ToolCard) => ToolCard,
): ToolCard[] {
  return cards.map((card) => (card.callId === callId ? change(card) : card));
}

/** Folds one live event into the state. Pure: it returns a new state. */
export function applyRunEvent(state: AgentRunState, event: AgentLoopEvent): AgentRunState {
  const lastSeq = event.data.seq;
  switch (event.type) {
    case 'run-started':
      return { ...state, lastSeq };
    case 'token-delta':
      return { ...state, assistantText: state.assistantText + event.data.text, lastSeq };
    case 'tool-call-started':
      return {
        ...state,
        lastSeq,
        cards: [
          ...state.cards,
          {
            callId: event.data.callId,
            name: event.data.name,
            family: event.data.family,
            state: 'running',
            sourcesUsed: [],
          },
        ],
      };
    case 'tool-call-args':
      return {
        ...state,
        lastSeq,
        cards: updateCard(state.cards, event.data.callId, (card) => ({
          ...card,
          arguments: event.data.arguments,
        })),
      };
    case 'tool-call-result':
      return {
        ...state,
        lastSeq,
        cards: updateCard(state.cards, event.data.callId, (card) => ({
          ...card,
          state: 'done',
          summary: event.data.summary,
          output: event.data.output,
          sourcesUsed: event.data.sourcesUsed,
          ...(event.data.diffPreview === undefined ? {} : { diffPreview: event.data.diffPreview }),
        })),
      };
    case 'tool-call-error':
      return {
        ...state,
        lastSeq,
        cards: updateCard(state.cards, event.data.callId, (card) => ({
          ...card,
          state: 'failed',
          error: {
            message: event.data.message,
            attempt: event.data.attempt,
            ...(event.data.withdrawn === undefined ? {} : { withdrawn: event.data.withdrawn }),
          },
        })),
      };
    case 'grounding-started':
      return { ...state, lastSeq };
    case 'grounding-result':
      return {
        ...state,
        lastSeq,
        groundingResults: [...state.groundingResults, event.data.result],
      };
    case 'step-cap-reached':
      return { ...state, lastSeq };
    case 'run-ended':
      return {
        ...state,
        lastSeq,
        status: 'finished',
        endReason: event.data.reason,
        pendingChangeIds: [...event.data.pendingChangeIds],
      };
  }
}

/** The step counter, set by the loop before each model call. It is not an event on the stream. */
export function withStep(state: AgentRunState, step: number, stepCap: number): AgentRunState {
  return { ...state, step, stepCap };
}

/** Folds one transcript entry into a state. Used for finished runs and for run history. */
function applyTranscriptEntry(state: AgentRunState, entry: TranscriptEntry): AgentRunState {
  const lastSeq = Math.max(state.lastSeq, entry.seq);
  switch (entry.kind) {
    case 'intent':
      return { ...state, lastSeq, intent: entry.data.intent };
    case 'step':
      return { ...state, lastSeq, step: entry.data.step, stepCap: entry.data.stepCap };
    case 'assistant-text':
      return { ...state, lastSeq, assistantText: state.assistantText + entry.data.text };
    case 'tool-call':
      return {
        ...state,
        lastSeq,
        cards: [
          ...state.cards,
          {
            callId: entry.data.callId,
            name: entry.data.name,
            family: entry.data.family,
            state: 'running',
            arguments: entry.data.arguments,
            sourcesUsed: [],
          },
        ],
      };
    case 'tool-result':
      return {
        ...state,
        lastSeq,
        cards: updateCard(state.cards, entry.data.callId, (card) => ({
          ...card,
          state: 'done',
          summary: entry.data.summary,
          output: entry.data.output,
          sourcesUsed: entry.data.sourcesUsed,
        })),
      };
    case 'tool-error':
      return {
        ...state,
        lastSeq,
        cards: updateCard(state.cards, entry.data.callId, (card) => ({
          ...card,
          state: 'failed',
          error: {
            message: entry.data.message,
            attempt: entry.data.attempt,
            ...(entry.data.withdrawn === undefined ? {} : { withdrawn: entry.data.withdrawn }),
          },
        })),
      };
    case 'grounding':
      return {
        ...state,
        lastSeq,
        groundingResults: [...state.groundingResults, entry.data.result],
      };
    case 'pending-change':
      return {
        ...state,
        lastSeq,
        pendingChangeIds: [...state.pendingChangeIds, entry.data.pendingChangeId],
      };
    case 'run-end':
      return {
        ...state,
        lastSeq,
        status: 'finished',
        endReason: entry.data.reason,
        pendingChangeIds: [...entry.data.pendingChangeIds],
      };
  }
}

/**
 * The state of a finished run, folded from its transcript. A run with no `run-end` line was
 * interrupted (survey 23 §7 item 15): it reads as finished with reason `error`, and the next start
 * writes the line that says so. A read never writes.
 */
export function runStateFromEntries(entries: readonly TranscriptEntry[]): AgentRunState {
  const first = entries[0];
  const runId = first?.runId ?? '';
  const conversationId = first?.conversationId ?? '';
  const folded = entries.reduce<AgentRunState>(
    applyTranscriptEntry,
    initialRunState({ runId, conversationId, intent: '', stepCap: AGENT_DEFAULT_STEP_CAP }),
  );
  if (folded.status === 'finished') {
    return folded;
  }
  return { ...folded, status: 'finished', endReason: 'error' };
}
