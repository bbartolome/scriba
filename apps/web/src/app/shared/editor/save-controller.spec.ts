import { IDLE_SAVE_MS, type SaveState, SaveController, type WriteOutcome } from './save-controller';

interface Write {
  readonly content: string;
  readonly baseHash: string;
  answer(outcome: WriteOutcome): void;
}

/** A controller whose writes wait for the test to answer them, so each state can be observed. */
function harness(text = 'alpha\n', hash = 'h0') {
  const writes: Write[] = [];
  const states: SaveState[] = [];
  const controller = new SaveController({
    text,
    hash,
    write: (content, baseHash) =>
      new Promise<WriteOutcome>((resolve) => {
        writes.push({ content, baseHash, answer: resolve });
      }),
    onState: (state) => states.push(state),
  });
  return { controller, writes, states };
}

/** Lets the promise chains that the controller awaits run to the next state. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) {
    await Promise.resolve();
  }
}

describe('SaveController (spec #17 editor A3 and A4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts saved and writes nothing on its own', () => {
    const { controller, writes } = harness();

    expect(controller.state).toBe('saved');
    expect(controller.dirty).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(writes).toHaveLength(0);
  });

  it('saves once, with the latest text, after about 1.5 s idle (A3)', () => {
    const { controller, writes } = harness();

    controller.edit('alpha\nbeta\n');
    vi.advanceTimersByTime(IDLE_SAVE_MS - 1);
    expect(writes).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.content).toBe('alpha\nbeta\n');
    expect(writes[0]?.baseHash).toBe('h0');
  });

  it('restarts the idle timer on each edit', () => {
    const { controller, writes } = harness();

    controller.edit('alpha\nb');
    vi.advanceTimersByTime(1000);
    controller.edit('alpha\nbe');
    vi.advanceTimersByTime(1000);
    expect(writes).toHaveLength(0);

    vi.advanceTimersByTime(500);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.content).toBe('alpha\nbe');
  });

  it('moves unsaved, saving, saved (A4)', async () => {
    const { controller, writes, states } = harness();

    controller.edit('alpha\nbeta\n');
    expect(controller.state).toBe('unsaved');

    vi.advanceTimersByTime(IDLE_SAVE_MS);
    expect(controller.state).toBe('saving');

    writes[0]?.answer({ kind: 'saved', hash: 'h1' });
    await settle();
    expect(controller.state).toBe('saved');
    expect(controller.dirty).toBe(false);
    expect(states).toEqual(['unsaved', 'saving', 'saved']);
  });

  it('an explicit save writes at once, even with no edits, with the loaded text', async () => {
    const { controller, writes } = harness('alpha\r\nbeta\n', 'h0');

    void controller.saveNow();

    expect(writes).toHaveLength(1);
    expect(writes[0]?.content).toBe('alpha\r\nbeta\n');
    expect(writes[0]?.baseHash).toBe('h0');
    writes[0]?.answer({ kind: 'saved', hash: 'h1' });
    await settle();
    expect(controller.state).toBe('saved');
  });

  it('coalesces the saves requested during an in-flight save into one follow-up (A3)', async () => {
    const { controller, writes } = harness();

    void controller.saveNow();
    controller.edit('alpha\nb');
    void controller.saveNow();
    void controller.saveNow();
    expect(writes).toHaveLength(1);

    writes[0]?.answer({ kind: 'saved', hash: 'h1' });
    await settle();
    expect(writes).toHaveLength(2);
    expect(writes[1]?.content).toBe('alpha\nb');
    expect(writes[1]?.baseHash).toBe('h1');

    writes[1]?.answer({ kind: 'saved', hash: 'h2' });
    await settle();
    expect(writes).toHaveLength(2);
    expect(controller.state).toBe('saved');
  });

  it('a failed write shows failed, keeps the text, and retries only on the next edit (A4)', async () => {
    const { controller, writes } = harness();

    controller.edit('alpha\nb');
    void controller.saveNow();
    writes[0]?.answer({ kind: 'failed', message: 'server unreachable' });
    await settle();

    expect(controller.state).toBe('failed');
    expect(controller.dirty).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(writes).toHaveLength(1);

    controller.edit('alpha\nbc');
    expect(controller.state).toBe('unsaved');
    vi.advanceTimersByTime(IDLE_SAVE_MS);
    expect(writes).toHaveLength(2);
    expect(writes[1]?.content).toBe('alpha\nbc');
  });

  it('a conflict shows conflict and does not overwrite the file (A4)', async () => {
    const { controller, writes } = harness();

    controller.edit('alpha\nb');
    void controller.saveNow();
    writes[0]?.answer({ kind: 'conflict' });
    await settle();

    expect(controller.state).toBe('conflict');
    vi.advanceTimersByTime(10_000);
    controller.edit('alpha\nbc');
    vi.advanceTimersByTime(10_000);
    expect(writes).toHaveLength(1);
    expect(controller.state).toBe('conflict');
  });

  it('an explicit save after a conflict sends the same stale base, so the server decides', async () => {
    const { controller, writes } = harness();

    controller.edit('alpha\nb');
    void controller.saveNow();
    writes[0]?.answer({ kind: 'conflict' });
    await settle();

    void controller.saveNow();
    expect(writes).toHaveLength(2);
    expect(writes[1]?.baseHash).toBe('h0');
  });

  it('a save requested during a write that then conflicts still runs once, with the stale base', async () => {
    const { controller, writes } = harness();

    void controller.saveNow();
    void controller.saveNow();
    expect(writes).toHaveLength(1);

    writes[0]?.answer({ kind: 'conflict' });
    await settle();
    expect(writes).toHaveLength(2);
    expect(writes[1]?.baseHash).toBe('h0');
    expect(controller.state).toBe('saving');

    writes[1]?.answer({ kind: 'conflict' });
    await settle();
    expect(writes).toHaveLength(2);
    expect(controller.state).toBe('conflict');
  });

  it('typing back to the saved text returns to saved and cancels the idle save', () => {
    const { controller, writes } = harness('alpha\n');

    controller.edit('alpha\nx');
    expect(controller.state).toBe('unsaved');
    controller.edit('alpha\n');
    expect(controller.state).toBe('saved');
    expect(controller.dirty).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect(writes).toHaveLength(0);
  });

  it('flush writes only when the text is unsaved', () => {
    const { controller, writes } = harness();

    void controller.flush();
    expect(writes).toHaveLength(0);

    controller.edit('alpha\nx');
    void controller.flush();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.content).toBe('alpha\nx');
  });

  it('dispose cancels a pending idle save', () => {
    const { controller, writes } = harness();

    controller.edit('alpha\nx');
    controller.dispose();
    vi.advanceTimersByTime(10_000);
    expect(writes).toHaveLength(0);
  });
});
