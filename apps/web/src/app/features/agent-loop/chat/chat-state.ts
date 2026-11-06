import {
  AgentLoopEventSchema,
  type AgentLoopEvent,
  type AgentRunState,
} from '@bbartolome/scriba-contracts/agent-loop';
import { foldToolCall } from '../../../shared/tool-card/tool-card';

/**
 * The chat's view of one run, folded from the stream (survey 23 §3: the UI seam). Pure functions, so
 * the rules a reconnect depends on can be tested without the page.
 *
 * The stream is the same for every tab, so an event can belong to another run. An event for a run
 * the view does not show asks for a fresh read of current-run-state. An event at or below the view's
 * `lastSeq` is already in the state, so it is ignored.
 */

/** The result of one event: the new state, and whether the page should read the run state again. */
export interface StreamStep {
  readonly state: AgentRunState | null;
  readonly refresh: boolean;
}

/** Parses one agent-loop message off the stream, or undefined when it is not one. */
export function agentEventOf(type: string, data: unknown): AgentLoopEvent | undefined {
  const parsed = AgentLoopEventSchema.safeParse({ module: 'agent-loop', type, data });
  return parsed.success ? parsed.data : undefined;
}

/** Folds one event into the view. */
export function applyAgentEvent(state: AgentRunState | null, event: AgentLoopEvent): StreamStep {
  if (state === null || state.runId !== event.data.runId) {
    return { state, refresh: true };
  }
  if (event.data.seq <= state.lastSeq) {
    return { state, refresh: false };
  }
  const lastSeq = event.data.seq;
  switch (event.type) {
    case 'token-delta':
      return keep({ ...state, assistantText: state.assistantText + event.data.text, lastSeq });
    case 'tool-call-started':
    case 'tool-call-args':
    case 'tool-call-result':
    case 'tool-call-error':
      return foldCard(state, event, lastSeq);
    case 'run-ended':
      return {
        state: {
          ...state,
          status: 'finished',
          endReason: event.data.reason,
          pendingChangeIds: [...event.data.pendingChangeIds],
          lastSeq,
        },
        refresh: true,
      };
    default:
      return keep({ ...state, lastSeq });
  }
}

/** A result or error changes the step count the server holds, so the page reads the state again. */
function foldCard(
  state: AgentRunState,
  event: Extract<
    AgentLoopEvent,
    { type: 'tool-call-started' | 'tool-call-args' | 'tool-call-result' | 'tool-call-error' }
  >,
  lastSeq: number,
): StreamStep {
  const existing = state.cards.find((card) => card.callId === event.data.callId);
  let folded;
  try {
    folded = foldToolCall(existing, event.type, event.data);
  } catch {
    // The stream named a card it never started, so the view is out of step. Read the server's state.
    return { state, refresh: true };
  }
  const cards =
    existing === undefined
      ? [...state.cards, folded]
      : state.cards.map((card) => (card.callId === folded.callId ? folded : card));
  const next = { ...state, cards, lastSeq };
  return {
    state: next,
    refresh: event.type === 'tool-call-result' || event.type === 'tool-call-error',
  };
}

function keep(state: AgentRunState): StreamStep {
  return { state, refresh: false };
}

/** The step counter's text, while a run is active. */
export function stepText(state: AgentRunState): string {
  return `Step ${state.step} of ${state.stepCap}`;
}

/** The sentence that closes a finished run. A completed run needs none. */
export function endText(state: AgentRunState, message: string | undefined): string {
  switch (state.endReason) {
    case 'stopped':
      return 'Stopped.';
    case 'capped':
      return 'Stopped at the step cap. Continue to carry on with a fresh cap.';
    case 'project-switched':
      return 'The project was switched, so this run stopped.';
    case 'error':
      return (
        message ?? 'The run ended with an error. The transcript in logs/agent-runs has the details.'
      );
    default:
      return '';
  }
}
