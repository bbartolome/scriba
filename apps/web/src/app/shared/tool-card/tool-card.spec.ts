import { foldToolCall, toolCardStatus } from './tool-card';

const CALL = { callId: 'call-1', name: 'read_file', family: 'project' as const };
const RUN = { runId: 'run-1', seq: 0 };

function started(seq = 0) {
  return { ...RUN, seq, ...CALL };
}

describe('toolCardStatus', () => {
  it('shows pending for a call no event has folded yet', () => {
    expect(toolCardStatus(CALL)).toBe('pending');
  });

  it('maps the contract states onto the four UI statuses', () => {
    expect(toolCardStatus({ ...CALL, state: 'running', sourcesUsed: [] })).toBe('running');
    expect(toolCardStatus({ ...CALL, state: 'done', sourcesUsed: [] })).toBe('done');
    expect(toolCardStatus({ ...CALL, state: 'failed', sourcesUsed: [] })).toBe('error');
  });
});

describe('foldToolCall', () => {
  it('starts a card as running with no sources', () => {
    const card = foldToolCall(undefined, 'tool-call-started', started());

    expect(card).toEqual({ ...CALL, state: 'running', sourcesUsed: [] });
  });

  it('adds the arguments from tool-call-args without changing the state', () => {
    const running = foldToolCall(undefined, 'tool-call-started', started());
    const withArgs = foldToolCall(running, 'tool-call-args', {
      ...RUN,
      seq: 1,
      callId: CALL.callId,
      arguments: { path: 'drafts/ch1.md' },
      validated: true,
    });

    expect(withArgs.state).toBe('running');
    expect(withArgs.arguments).toEqual({ path: 'drafts/ch1.md' });
  });

  it('closes a card as done with its summary, output and sources from tool-call-result', () => {
    const running = foldToolCall(undefined, 'tool-call-started', started());
    const done = foldToolCall(running, 'tool-call-result', {
      ...RUN,
      seq: 2,
      callId: CALL.callId,
      summary: 'Read 1 file',
      output: { lines: 12 },
      sourcesUsed: [{ id: 'src-1', type: 'file', path: 'drafts/ch1.md' }],
    });

    expect(done.state).toBe('done');
    expect(done.summary).toBe('Read 1 file');
    expect(done.output).toEqual({ lines: 12 });
    expect(done.sourcesUsed).toEqual([{ id: 'src-1', type: 'file', path: 'drafts/ch1.md' }]);
  });

  it('marks a card failed with its attempt and withdrawal from tool-call-error', () => {
    const running = foldToolCall(undefined, 'tool-call-started', started());
    const failed = foldToolCall(running, 'tool-call-error', {
      ...RUN,
      seq: 3,
      callId: CALL.callId,
      message: 'path is outside the project',
      attempt: 2,
      withdrawn: true,
    });

    expect(failed.state).toBe('failed');
    expect(failed.error).toEqual({
      message: 'path is outside the project',
      attempt: 2,
      withdrawn: true,
    });
    expect(toolCardStatus(failed)).toBe('error');
  });

  it('does not change the card it is given', () => {
    const running = foldToolCall(undefined, 'tool-call-started', started());
    foldToolCall(running, 'tool-call-result', {
      ...RUN,
      seq: 2,
      callId: CALL.callId,
      summary: 'done',
      output: 'ok',
      sourcesUsed: [],
    });

    expect(running.state).toBe('running');
    expect(running.summary).toBeUndefined();
  });

  it('refuses a follow-up event for a call that has not started', () => {
    expect(() =>
      foldToolCall(undefined, 'tool-call-result', {
        ...RUN,
        seq: 1,
        callId: CALL.callId,
        summary: 'x',
        output: 'x',
        sourcesUsed: [],
      }),
    ).toThrow(/arrived before tool-call-started/);
  });

  it('rejects data that the contract does not document', () => {
    expect(() =>
      foldToolCall(undefined, 'tool-call-started', { ...RUN, seq: 0, callId: 'call-1' }),
    ).toThrow();
  });

  it('rejects an event that is not a tool-call event', () => {
    expect(() => foldToolCall(undefined, 'token-delta', started())).toThrow(
      /not a tool-call event/,
    );
  });
});
