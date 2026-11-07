/**
 * The save states the editor shows (survey 17 §4: `saved | saving | unsaved | failed | conflict`).
 * `saved` is the state after a load. `conflict` is a precondition failure: the file changed on disk
 * since the editor read it, and nothing is written over it.
 */
export type SaveState = 'unsaved' | 'saving' | 'saved' | 'failed' | 'conflict';

/** What one write came back with. A write that never got an answer is `failed`. */
export type WriteOutcome =
  | { readonly kind: 'saved'; readonly hash: string }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'failed'; readonly message: string };

/** Writes `content` on top of the base the editor read, `baseHash`. */
export type WriteFn = (content: string, baseHash: string) => Promise<WriteOutcome>;

/** The idle time after the last edit before a changed document saves (spec #17 editor A3). */
export const IDLE_SAVE_MS = 1500;

export interface SaveControllerOptions {
  /** The text as loaded. It is the first saved text. */
  readonly text: string;
  /** The base hash the read gave. Every write sends it, so a stale base fails. */
  readonly hash: string;
  readonly write: WriteFn;
  readonly onState?: (state: SaveState) => void;
  /** The idle delay. Defaults to `IDLE_SAVE_MS`. */
  readonly idleMs?: number;
}

/**
 * The save state machine for one open document. It holds no DOM and no Angular, so its timing and
 * its coalescing can be tested with fake timers.
 *
 * - An edit restarts the idle timer. When the timer fires on a changed document, the controller
 *   saves. An explicit save writes at once, even with no edits.
 * - A save requested while a write is in flight sets one follow-up flag. The follow-up writes the
 *   latest text once, however many saves were requested.
 * - A failed write keeps the text and waits for the next edit or an explicit save. It is not retried
 *   on a timer.
 * - A conflict stops automatic saves. An explicit save still sends the same stale base, so the server
 *   refuses it again. Nothing is written over a changed file.
 */
export class SaveController {
  private readonly write: WriteFn;
  private readonly onState: ((state: SaveState) => void) | undefined;
  private readonly idleMs: number;

  private text: string;
  private savedText: string;
  private baseHash: string;
  private current: SaveState = 'saved';
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private followUp = false;

  constructor(options: SaveControllerOptions) {
    this.write = options.write;
    this.onState = options.onState;
    this.idleMs = options.idleMs ?? IDLE_SAVE_MS;
    this.text = options.text;
    this.savedText = options.text;
    this.baseHash = options.hash;
  }

  get state(): SaveState {
    return this.current;
  }

  /** True while the text differs from the last saved text. */
  get dirty(): boolean {
    return this.text !== this.savedText;
  }

  /** Records the editor's text after an edit. */
  edit(text: string): void {
    this.text = text;
    if (!this.dirty) {
      this.cancelIdle();
      if (this.current === 'unsaved' || this.current === 'failed') {
        this.set('saved');
      }
      return;
    }
    if (this.current === 'saved' || this.current === 'failed') {
      this.set('unsaved');
    }
    if (this.current !== 'conflict') {
      this.scheduleIdle();
    }
  }

  /** An explicit save (the button, Ctrl or Cmd with S, and the "save now" path). Always writes. */
  saveNow(): Promise<void> {
    this.cancelIdle();
    if (this.running !== undefined) {
      this.followUp = true;
      return this.running;
    }
    this.running = this.drain();
    return this.running;
  }

  /** A save on blur or on leaving the route. It writes only when the text is unsaved. */
  flush(): Promise<void> {
    if (this.dirty) {
      return this.saveNow();
    }
    return this.running ?? Promise.resolve();
  }

  /** Cancels a pending idle save. The controller is done with its document. */
  dispose(): void {
    this.cancelIdle();
  }

  private async drain(): Promise<void> {
    try {
      do {
        this.followUp = false;
        const content = this.text;
        const base = this.baseHash;
        this.set('saving');
        const outcome = await this.attempt(content, base);
        if (outcome.kind === 'saved') {
          this.baseHash = outcome.hash;
          this.savedText = content;
          this.set(this.dirty ? 'unsaved' : 'saved');
        } else {
          // A save requested during this write still runs once more, so the user's request is not
          // dropped. A conflict is refused again, because the base is still stale.
          this.set(outcome.kind === 'conflict' ? 'conflict' : 'failed');
        }
      } while (this.followUp);
    } finally {
      this.running = undefined;
    }
  }

  private async attempt(content: string, base: string): Promise<WriteOutcome> {
    try {
      return await this.write(content, base);
    } catch (error) {
      return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    }
  }

  private scheduleIdle(): void {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      if (this.dirty && this.current !== 'conflict') {
        void this.saveNow();
      }
    }, this.idleMs);
  }

  private cancelIdle(): void {
    if (this.idleTimer !== undefined) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  private set(state: SaveState): void {
    if (state !== this.current) {
      this.current = state;
      this.onState?.(state);
    }
  }
}
