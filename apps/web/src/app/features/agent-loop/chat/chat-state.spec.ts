import { type AgentRunState } from '@bbartolome/scriba-contracts/agent-loop';
import { agentEventOf, applyAgentEvent, endText, stepText } from './chat-state';

const RUN: AgentRunState = {
  runId: 'run-1',
  conversationId: 'conv-1',
  intent: 'summarize my outline',
  status: 'active',
  endReason: null,
  step: 1,
  stepCap: 12,
  assistantText: 'Hel',
  cards: [],
  groundingResults: [],
  pendingChangeIds: [],
  lastSeq: 1,
};

function event(type: string, data: Record<string, unknown>) {
  const parsed = agentEventOf(type, { runId: 'run-1', ...data });
  if (parsed === undefined) {
    throw new Error(`not an agent event: ${type}`);
  }
  return parsed;
}

/** The chat's rules for the stream (survey 23 §3: UI seam). */
describe('agent chat state', () => {
  it('appends tokens, and ignores an event at or below the state lastSeq', () => {
    const first = applyAgentEvent(RUN, event('token-delta', { seq: 2, text: 'lo' }));
    expect(first.state?.assistantText).toBe('Hello');
    expect(first.state?.lastSeq).toBe(2);

    const replay = applyAgentEvent(first.state, event('token-delta', { seq: 2, text: 'lo' }));
    expect(replay.state?.assistantText).toBe('Hello');
    expect(replay.refresh).toBe(false);
  });

  it('moves a card from started to done, and asks for a read after its result', () => {
    const started = applyAgentEvent(
      RUN,
      event('tool-call-started', { seq: 2, callId: 'c1', name: 'list_files', family: 'project' }),
    );
    expect(started.state?.cards[0]).toMatchObject({ callId: 'c1', state: 'running' });
    expect(started.refresh).toBe(false);

    const args = applyAgentEvent(
      started.state,
      event('tool-call-args', {
        seq: 3,
        callId: 'c1',
        arguments: { path: 'sources' },
        validated: true,
      }),
    );
    expect(args.state?.cards[0]?.arguments).toEqual({ path: 'sources' });

    const result = applyAgentEvent(
      args.state,
      event('tool-call-result', {
        seq: 4,
        callId: 'c1',
        summary: 'Listed 2 entries',
        output: {},
        sourcesUsed: [],
      }),
    );
    expect(result.state?.cards[0]).toMatchObject({ state: 'done', summary: 'Listed 2 entries' });
    expect(result.refresh).toBe(true);
  });

  it('keeps the attempt number and the withdrawal on a failed card', () => {
    const started = applyAgentEvent(
      RUN,
      event('tool-call-started', { seq: 2, callId: 'c1', name: 'read_file', family: 'project' }),
    );
    const failed = applyAgentEvent(
      started.state,
      event('tool-call-error', {
        seq: 3,
        callId: 'c1',
        message: 'bad',
        attempt: 3,
        withdrawn: true,
      }),
    );
    expect(failed.state?.cards[0]?.error).toEqual({ message: 'bad', attempt: 3, withdrawn: true });
    expect(failed.refresh).toBe(true);
  });

  it('asks for a fresh read when an event names a run the view does not show', () => {
    const other = applyAgentEvent(RUN, event('token-delta', { runId: 'run-2', seq: 0, text: 'x' }));
    expect(other.state).toBe(RUN);
    expect(other.refresh).toBe(true);
    expect(
      applyAgentEvent(null, event('run-started', { seq: 0, conversationId: 'c' })).refresh,
    ).toBe(true);
  });

  it('finishes a run on run-ended, and asks for the server state', () => {
    const ended = applyAgentEvent(
      RUN,
      event('run-ended', { seq: 2, reason: 'stopped', pendingChangeIds: [] }),
    );
    expect(ended.state).toMatchObject({ status: 'finished', endReason: 'stopped' });
    expect(ended.refresh).toBe(true);
  });

  it('drops an event that does not match the contract', () => {
    expect(agentEventOf('token-delta', { runId: 'run-1' })).toBeUndefined();
    expect(agentEventOf('not-a-type', {})).toBeUndefined();
  });

  it('words the step counter and the end of a run', () => {
    expect(stepText(RUN)).toBe('Step 1 of 12');
    expect(endText({ ...RUN, endReason: 'completed' }, undefined)).toBe('');
    expect(endText({ ...RUN, endReason: 'capped' }, undefined)).toContain('Continue');
    expect(endText({ ...RUN, endReason: 'error' }, 'The model is not reachable.')).toBe(
      'The model is not reachable.',
    );
  });
});
