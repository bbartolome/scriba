import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EventStream } from '../../shell/sse/event-stream';
import { HEALTHZ_PATH, VERSION_PATH } from '../../shell/route-data';
import { FakeApi, provideFakeApi } from '../../testing/fake-api';
import {
  type FakeEventSourceControl,
  installFakeEventSource,
} from '../../testing/fake-event-source';
import { installViewport, type ViewportControl } from '../../testing/viewport';
import { foldToolCall, type ToolCardLike } from './tool-card';
import { ToolCardView } from './tool-card-view';
import { type ToolCard } from '@bbartolome/scriba-contracts/agent-loop';

const VERSION_INFO = {
  version: '1.4.0',
  revision: 'abc1234',
  builtAt: '2026-11-06T12:00:00.000Z',
  composeVersion: '1.4.0',
};

/**
 * Shared-components A5: an agent run's tool calls render with the card, using only the documented
 * agent-loop stream events. The test drives the events through the Shell's real stream, with the
 * fake event source at the browser boundary, folds them, and renders each card.
 */
describe('tool cards from an agent run on the stream', () => {
  let sse: FakeEventSourceControl;
  let viewport: ViewportControl | undefined;

  beforeEach(() => {
    sse = installFakeEventSource();
    const api = new FakeApi();
    api.reply('GET', HEALTHZ_PATH, 200, { status: 'ok', version: '1.4.0' });
    api.reply('GET', VERSION_PATH, 200, VERSION_INFO);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideFakeApi(api)],
    });
  });

  afterEach(() => {
    viewport?.restore();
    viewport = undefined;
    sse.restore();
  });

  it('folds a run into one card per call and renders each card', () => {
    const stream = TestBed.inject(EventStream);
    stream.start();

    const cards = new Map<string, ToolCard>();
    stream.forModule('agent-loop').subscribe((event) => {
      const { callId } = event.data as { callId: string };
      cards.set(callId, foldToolCall(cards.get(callId), event.type, event.data));
    });

    const source = sse.current();
    source.open();
    const run = { runId: 'run-1' };
    source.send({
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { ...run, seq: 0, callId: 'call-1', name: 'read_file', family: 'project' },
    });
    source.send({
      module: 'agent-loop',
      type: 'tool-call-args',
      data: {
        ...run,
        seq: 1,
        callId: 'call-1',
        arguments: { path: 'drafts/ch1.md' },
        validated: true,
      },
    });
    source.send({
      module: 'agent-loop',
      type: 'tool-call-result',
      data: {
        ...run,
        seq: 2,
        callId: 'call-1',
        summary: 'Read 1 file',
        output: 'Chapter one',
        sourcesUsed: [{ id: 'src-1', type: 'file', path: 'drafts/ch1.md' }],
      },
    });
    source.send({
      module: 'agent-loop',
      type: 'tool-call-started',
      data: { ...run, seq: 3, callId: 'call-2', name: 'write_file', family: 'project' },
    });
    source.send({
      module: 'agent-loop',
      type: 'tool-call-error',
      data: {
        ...run,
        seq: 4,
        callId: 'call-2',
        message: 'path is outside the project',
        attempt: 1,
      },
    });

    viewport = installViewport({ width: 1280, height: 800 });
    const labels = [...cards.values()].map((card: ToolCardLike) => {
      const fixture = TestBed.createComponent(ToolCardView);
      fixture.componentRef.setInput('card', card);
      fixture.detectChanges();
      return fixture.nativeElement.querySelector('.status')?.textContent?.trim();
    });

    expect(labels).toEqual(['Done', 'Error']);
  });
});
