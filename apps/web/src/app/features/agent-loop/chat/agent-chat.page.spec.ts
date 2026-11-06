import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type AgentRunState, type ToolCard } from '@bbartolome/scriba-contracts/agent-loop';
import { EventStream } from '../../../shell/sse/event-stream';
import { HEALTHZ_PATH, VERSION_PATH } from '../../../shell/route-data';
import { FakeApi, provideFakeApi } from '../../../testing/fake-api';
import {
  type FakeEventSourceControl,
  installFakeEventSource,
} from '../../../testing/fake-event-source';
import { installViewport, type ViewportControl } from '../../../testing/viewport';
import { AgentChatPage } from './agent-chat.page';

const BASE = '/api/agent-loop/projects/book';
const CURRENT = `${BASE}/current-run-state`;
const CONVERSATIONS = `${BASE}/conversations`;
const CONVERSATION = `${BASE}/conversations/conv-1`;
const RUNS = `${BASE}/runs`;
const VERSION_INFO = {
  version: '1.4.0',
  revision: 'abc1234',
  builtAt: '2026-11-06T12:00:00.000Z',
  composeVersion: '1.4.0',
};

/** A run in progress: one streamed sentence so far, at seq 1. */
function activeRun(overrides: Partial<AgentRunState> = {}): AgentRunState {
  return {
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
    ...overrides,
  };
}

/**
 * The chat panel, against the fake API and the fake event source. The page is the feature under
 * test: the stream rules, the reconnect, the stop control and the phone layout.
 */
describe('agent chat page', () => {
  let api: FakeApi;
  let sse: FakeEventSourceControl;
  let viewport: ViewportControl | undefined;
  let fixture: ComponentFixture<AgentChatPage>;

  function settle(): void {
    fixture.detectChanges();
  }

  async function settled(): Promise<void> {
    await fixture.whenStable();
    settle();
  }

  function text(selector: string): string {
    return (
      (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? ''
    );
  }

  function has(selector: string): boolean {
    return (fixture.nativeElement as HTMLElement).querySelector(selector) !== null;
  }

  function serverStateIs(run: AgentRunState | null): void {
    api.reply('GET', CURRENT, 200, { run });
  }

  async function open(run: AgentRunState | null): Promise<void> {
    serverStateIs(run);
    fixture = TestBed.createComponent(AgentChatPage);
    fixture.componentRef.setInput('projectId', 'book');
    TestBed.inject(EventStream).start();
    sse.current().open();
    settle();
    await settled();
  }

  beforeEach(() => {
    sse = installFakeEventSource();
    api = new FakeApi();
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    api.reply('GET', VERSION_PATH, 200, VERSION_INFO);
    api.reply('GET', CONVERSATIONS, 200, { conversations: [] });
    api.reply('GET', CONVERSATION, 200, { conversationId: 'conv-1', runs: [] });
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(api)],
    });
  });

  afterEach(() => {
    viewport?.restore();
    viewport = undefined;
    sse.restore();
  });

  it('appends streamed tokens to the open run', async () => {
    await open(activeRun());
    sse.current().send({
      module: 'agent-loop',
      type: 'token-delta',
      data: { runId: 'run-1', seq: 2, text: 'lo' },
    });
    settle();
    expect(text('.text')).toBe('Hello');
  });

  it('moves a tool card from running to done, and shows a failed attempt with its number', async () => {
    await open(activeRun());
    const source = sse.current();
    source.send({
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { runId: 'run-1', seq: 2, callId: 'c1', name: 'list_files', family: 'project' },
    });
    settle();
    expect(text('.card .status')).toBe('Running');

    serverStateIs(
      activeRun({
        lastSeq: 3,
        cards: [
          {
            callId: 'c1',
            name: 'list_files',
            family: 'project',
            state: 'done',
            summary: 'Listed 2 entries',
            output: {},
            sourcesUsed: [],
          },
        ],
      }),
    );
    source.send({
      module: 'agent-loop',
      type: 'tool-call-result',
      data: {
        runId: 'run-1',
        seq: 3,
        callId: 'c1',
        summary: 'Listed 2 entries',
        output: {},
        sourcesUsed: [],
      },
    });
    await settled();
    expect(text('.card .status')).toBe('Done');

    source.send({
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { runId: 'run-1', seq: 4, callId: 'c2', name: 'read_file', family: 'project' },
    });
    const done: ToolCard = {
      callId: 'c1',
      name: 'list_files',
      family: 'project',
      state: 'done',
      summary: 'Listed 2 entries',
      output: {},
      sourcesUsed: [],
    };
    serverStateIs(
      activeRun({
        lastSeq: 5,
        cards: [
          done,
          {
            callId: 'c2',
            name: 'read_file',
            family: 'project',
            state: 'failed',
            error: { message: 'Not in the project.', attempt: 2 },
            sourcesUsed: [],
          },
        ],
      }),
    );
    source.send({
      module: 'agent-loop',
      type: 'tool-call-error',
      data: { runId: 'run-1', seq: 5, callId: 'c2', message: 'Not in the project.', attempt: 2 },
    });
    await settled();
    expect(text('.attempt')).toBe('Attempt 2');
  });

  it('shows Stop only while a run is active', async () => {
    await open(activeRun());
    expect(has('button.stop')).toBe(true);
    expect(text('.progress')).toBe('Step 1 of 12');

    const ended = activeRun({ status: 'finished', endReason: 'completed', lastSeq: 2 });
    serverStateIs(ended);
    sse.current().send({
      module: 'agent-loop',
      type: 'run-ended',
      data: { runId: 'run-1', seq: 2, reason: 'completed', pendingChangeIds: [] },
    });
    await settled();
    expect(has('button.stop')).toBe(false);
  });

  it('on a reconnect, replaces the view from the run state and ignores events at or below lastSeq', async () => {
    await open(activeRun());
    const source = sse.current();
    serverStateIs(activeRun({ assistantText: 'Hello', lastSeq: 2 }));

    source.drop();
    source.open();
    await settled();
    expect(text('.text')).toBe('Hello');

    source.send({
      module: 'agent-loop',
      type: 'token-delta',
      data: { runId: 'run-1', seq: 2, text: 'lo' },
    });
    settle();
    expect(text('.text')).toBe('Hello');

    source.send({
      module: 'agent-loop',
      type: 'token-delta',
      data: { runId: 'run-1', seq: 3, text: ' there' },
    });
    settle();
    expect(text('.text')).toBe('Hello there');
  });

  /** A finished run with one done card, so the card's expanded state is what the test reads. */
  function oneCardRun(): AgentRunState {
    return activeRun({
      status: 'finished',
      endReason: 'completed',
      lastSeq: 3,
      cards: [
        {
          callId: 'c1',
          name: 'list_files',
          family: 'project',
          state: 'done',
          summary: 'Listed 2 entries',
          output: {},
          sourcesUsed: [],
        },
      ],
    });
  }

  it('collapses the tool cards on a phone', async () => {
    viewport = installViewport({ width: 375, height: 700 });
    await open(oneCardRun());
    expect(text('.card .name')).toBe('list_files');
    expect(text('.card .status')).toBe('Done');
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('button.head')
        ?.getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('expands the tool cards on a desktop', async () => {
    viewport = installViewport({ width: 1280, height: 800 });
    await open(oneCardRun());
    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('button.head')
        ?.getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('sends the intent as a start request, and shows the run it starts', async () => {
    await open(null);
    api.reply('POST', RUNS, 201, { runId: 'run-1', conversationId: 'conv-1' });
    serverStateIs(activeRun({ assistantText: '' }));

    const textarea = (fixture.nativeElement as HTMLElement).querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    textarea.value = 'summarize my outline';
    textarea.dispatchEvent(new Event('input'));
    settle();
    const form = (fixture.nativeElement as HTMLElement).querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settled();

    const start = api.requests.find(
      (request) => request.method === 'POST' && request.path === RUNS,
    );
    expect(start?.body).toEqual({ intent: 'summarize my outline' });
    expect(has('button.stop')).toBe(true);
  });
});
