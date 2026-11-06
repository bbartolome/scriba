import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type AgentRunState,
  type AgentSettings,
  type ConversationSummary,
} from '@bbartolome/scriba-contracts/agent-loop';
import { ApiError, EventStream, type ModuleEvent } from '../../../shell';
import { ToolCardView } from '../../../shared/tool-card/tool-card-view';
import { AgentLoopApi } from '../agent-loop.api';
import { agentEventOf, applyAgentEvent, endText, stepText } from './chat-state';

/** [proposed] The intent sent by Continue. The spec names the action but no text. */
const CONTINUE_INTENT = 'Continue';

/** The step cap a setting may hold (the contract's bounds, [proposed]). */
const STEP_CAP_MIN = 1;
const STEP_CAP_MAX = 100;

/** The sentence for a refused start, by its code. Other failures show the server's own message. */
function startMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'AGENT_RUN_ACTIVE':
        return 'This project already has an agent run. Stop it first, or wait for it to end.';
      case 'AGENT_NO_PROVIDER':
        return 'No model provider is set up. Add one in the provider settings, then try again.';
      case 'AGENT_NO_ACTIVE_PROJECT':
        return 'Activate this project to use the chat.';
      default:
        return error.message;
    }
  }
  return 'The agent run did not start. Try again.';
}

/**
 * The chat panel for one project (survey 23 §3, phase file-tools-chat). It shows the conversation's
 * runs, streams the active one, and reads the run state again after a reconnect, a wake or a
 * result, so the view always matches the server.
 */
// provisional: survey 23 §7 item 19 (the project is named in the route)
@Component({
  selector: 'app-agent-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolCardView],
  template: `
    <h1>Chat</h1>
    <nav class="conversations" aria-label="Conversations">
      <button type="button" (click)="newConversation()">New conversation</button>
      @for (summary of conversations(); track summary.conversationId) {
        <button
          type="button"
          [attr.aria-pressed]="summary.conversationId === conversationId()"
          (click)="selectConversation(summary.conversationId)"
        >
          {{ summary.firstIntent || 'Conversation' }} ({{ summary.runCount }})
        </button>
      }
    </nav>

    <section class="stream" aria-live="polite" aria-label="Messages">
      @for (run of runs(); track run.runId) {
        <article class="run" [attr.data-status]="run.status">
          <p class="intent"><span class="who">You</span> {{ run.intent }}</p>
          @for (card of run.cards; track card.callId) {
            <div class="step">
              <app-tool-card [card]="card" />
              @if (card.error; as failure) {
                <p class="attempt">
                  Attempt {{ failure.attempt
                  }}{{ failure.withdrawn ? ', the tool is withdrawn for this run' : '' }}
                </p>
              }
            </div>
          }
          @if (run.assistantText) {
            <p class="text">{{ run.assistantText }}</p>
          }
          @if (run.status === 'finished' && endOf(run) !== '') {
            <p class="end">{{ endOf(run) }}</p>
          }
        </article>
      } @empty {
        <p class="empty">Ask for something. The agent reads your project and shows each step.</p>
      }
    </section>

    @if (error(); as text) {
      <p class="error" role="alert">{{ text }}</p>
    }

    <footer class="intent-bar">
      @if (active() && view(); as run) {
        <p class="progress" aria-live="polite">{{ stepLabel(run) }}</p>
        <button type="button" class="stop" (click)="stop()">Stop</button>
      } @else if (canContinue()) {
        <button type="button" class="continue" (click)="continueRun()">Continue</button>
      }
      <form (submit)="send($event)">
        <label for="agent-intent">Ask the agent</label>
        <textarea
          id="agent-intent"
          rows="2"
          [value]="intent()"
          (input)="onIntent($event)"
        ></textarea>
        <button type="submit" [disabled]="sendDisabled()">Send</button>
      </form>
    </footer>

    <details class="settings" (toggle)="onSettingsToggle($event)">
      <summary>Agent settings</summary>
      <label for="step-cap">Step cap</label>
      <input
        id="step-cap"
        type="number"
        [min]="stepCapMin"
        [max]="stepCapMax"
        [value]="stepCapText()"
        (input)="stepCapText.set(valueOf($event))"
      />
      <button type="button" (click)="saveSettings()">Save</button>
      @if (settingsNote(); as note) {
        <p class="note" role="status">{{ note }}</p>
      }
    </details>
  `,
  styles: `
    :host {
      display: block;
      max-width: 44rem;
    }
    .conversations,
    .intent-bar,
    .settings {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
    }
    button {
      min-height: 44px;
      min-width: 44px;
    }
    .stream {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin: 16px 0;
    }
    .run {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .who {
      font: var(--mat-sys-label-large);
      margin-right: 8px;
    }
    .step {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .attempt,
    .end,
    .progress {
      font: var(--mat-sys-label-large);
      margin: 0;
    }
    .text {
      white-space: pre-wrap;
      margin: 0;
    }
    .error {
      color: var(--mat-sys-error);
    }
    .intent-bar {
      position: sticky;
      bottom: 0;
      background: var(--mat-sys-surface);
      padding: 8px 0;
    }
    form {
      display: flex;
      flex: 1 1 16rem;
      flex-wrap: wrap;
      gap: 8px;
    }
    textarea {
      flex: 1 1 14rem;
      font: inherit;
      min-height: 44px;
    }
    input {
      min-height: 44px;
      width: 6rem;
    }
  `,
})
export class AgentChatPage implements OnInit {
  /** The project, from the route. */
  readonly projectId = input.required<string>();

  private readonly api = inject(AgentLoopApi);
  private readonly stream = inject(EventStream);

  /** The live run, or the latest one, as the server last described it, folded with the stream. */
  readonly view = signal<AgentRunState | null>(null);
  /** The runs of the selected conversation, oldest first. The live run is shown on top of them. */
  readonly history = signal<AgentRunState[]>([]);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly conversationId = signal<string | null>(null);
  readonly intent = signal('');
  readonly starting = signal(false);
  readonly error = signal<string | null>(null);
  /** The readable message of each run that ended with an error, by run id. */
  readonly endMessages = signal<Readonly<Record<string, string>>>({});

  readonly settings = signal<AgentSettings | null>(null);
  readonly stepCapText = signal('');
  readonly settingsNote = signal<string | null>(null);
  readonly stepCapMin = STEP_CAP_MIN;
  readonly stepCapMax = STEP_CAP_MAX;

  readonly active = computed(() => this.view()?.status === 'active');
  readonly runs = computed<AgentRunState[]>(() => {
    const view = this.view();
    const earlier = this.history().filter((run) => run.runId !== view?.runId);
    return view === null ? earlier : [...earlier, view];
  });
  readonly canContinue = computed(() => {
    const view = this.view();
    return view !== null && view.status === 'finished' && view.endReason === 'capped';
  });
  readonly sendDisabled = computed(
    () => this.starting() || this.active() || this.intent().trim() === '',
  );

  constructor() {
    this.stream
      .forModule('agent-loop')
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.onStreamEvent(event));
    this.stream.reconcile$.pipe(takeUntilDestroyed()).subscribe(() => this.refresh());
  }

  ngOnInit(): void {
    this.refresh();
    this.loadConversations();
  }

  stepLabel(run: AgentRunState): string {
    return stepText(run);
  }

  endOf(run: AgentRunState): string {
    return endText(run, this.endMessages()[run.runId]);
  }

  onIntent(event: Event): void {
    this.intent.set(this.valueOf(event));
  }

  valueOf(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value
      : '';
  }

  send(event: Event): void {
    event.preventDefault();
    this.start(this.intent().trim());
  }

  continueRun(): void {
    this.start(CONTINUE_INTENT, this.view()?.conversationId);
  }

  stop(): void {
    const view = this.view();
    if (view === null) {
      return;
    }
    this.api.stop(this.projectId(), view.runId).subscribe({
      next: () => this.refresh(),
      error: (error: unknown) => this.error.set(startMessage(error)),
    });
  }

  newConversation(): void {
    this.conversationId.set(null);
    this.history.set([]);
  }

  selectConversation(conversationId: string): void {
    this.conversationId.set(conversationId);
    this.api.conversation(this.projectId(), conversationId).subscribe({
      next: (answer) => this.history.set(answer.runs),
      error: (error: unknown) => this.error.set(startMessage(error)),
    });
  }

  onSettingsToggle(event: Event): void {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.open || this.settings() !== null) {
      return;
    }
    this.api.settings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        this.stepCapText.set(String(settings.stepCap));
      },
      error: () => this.settingsNote.set('The settings could not be read.'),
    });
  }

  saveSettings(): void {
    const current = this.settings();
    const cap = Number(this.stepCapText());
    if (current === null) {
      this.settingsNote.set('The settings have not loaded yet.');
      return;
    }
    if (!Number.isInteger(cap) || cap < STEP_CAP_MIN || cap > STEP_CAP_MAX) {
      this.settingsNote.set(`Enter a whole number from ${STEP_CAP_MIN} to ${STEP_CAP_MAX}.`);
      return;
    }
    this.api.saveSettings({ ...current, stepCap: cap }).subscribe({
      next: (saved) => {
        this.settings.set(saved);
        this.settingsNote.set('Saved. It applies to the next agent run.');
      },
      error: () => this.settingsNote.set('The settings could not be saved.'),
    });
  }

  private start(intent: string, conversationId?: string): void {
    if (intent === '' || this.starting() || this.active()) {
      return;
    }
    this.starting.set(true);
    this.error.set(null);
    this.api
      .start(this.projectId(), {
        intent,
        ...(conversationId === undefined ? {} : { conversationId }),
      })
      .subscribe({
        next: (answer) => {
          this.starting.set(false);
          this.intent.set('');
          this.conversationId.set(answer.conversationId);
          this.refresh();
          this.selectConversation(answer.conversationId);
          this.loadConversations();
        },
        error: (error: unknown) => {
          this.starting.set(false);
          this.error.set(startMessage(error));
        },
      });
  }

  private onStreamEvent(event: ModuleEvent): void {
    const parsed = agentEventOf(event.type, event.data);
    if (parsed === undefined) {
      return;
    }
    const step = applyAgentEvent(this.view(), parsed);
    this.view.set(step.state);
    if (parsed.type === 'run-ended' && parsed.data.message !== undefined) {
      this.rememberMessage(parsed.data.runId, parsed.data.message);
    }
    if (step.refresh) {
      this.refresh();
    }
  }

  /** Reads current-run-state and replaces the view with it. Events after its lastSeq then apply. */
  private refresh(): void {
    this.api.currentRunState(this.projectId()).subscribe({
      next: (answer) => {
        this.view.set(answer.run);
        if (answer.run !== null && this.conversationId() === null) {
          this.conversationId.set(answer.run.conversationId);
          this.selectConversation(answer.run.conversationId);
        }
      },
      error: (error: unknown) => this.error.set(startMessage(error)),
    });
  }

  private loadConversations(): void {
    this.api.conversations(this.projectId()).subscribe({
      next: (answer) => this.conversations.set(answer.conversations),
      error: (error: unknown) => this.error.set(startMessage(error)),
    });
  }

  private rememberMessage(runId: string, message: string): void {
    this.endMessages.update((messages) => ({ ...messages, [runId]: message }));
  }
}
