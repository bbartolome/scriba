import {
  type ToolCard,
  type ToolCardState,
  ToolCallArgsDataSchema,
  ToolCallErrorDataSchema,
  ToolCallResultDataSchema,
  ToolCallStartedDataSchema,
} from '@bbartolome/scriba-contracts/agent-loop';

/**
 * The four statuses the card shows (survey 17 §3, shared-components A1). `pending` is the Shell's
 * own: a call the stream has named but no event has folded yet. The other three map from the
 * contract's wire states (`running`, `done`, `failed`), per the status-model decision.
 */
export type ToolCardStatus = 'pending' | 'running' | 'done' | 'error';

/**
 * A card as the Shell holds it. The call's identity is always known; the folded contract fields
 * are present only once an event has arrived. A call with no `state` is `pending`.
 */
export type ToolCardLike = Pick<ToolCard, 'callId' | 'name' | 'family'> &
  Partial<Omit<ToolCard, 'callId' | 'name' | 'family'>>;

const STATUS_BY_STATE: Readonly<Record<ToolCardState, ToolCardStatus>> = {
  running: 'running',
  done: 'done',
  failed: 'error',
};

/** The card's status. A card with no wire state is pending. */
export function toolCardStatus(card: ToolCardLike): ToolCardStatus {
  return card.state === undefined ? 'pending' : STATUS_BY_STATE[card.state];
}

/**
 * Folds one `tool-call-*` event into the card for its `callId`. The fold is pure: it returns a new
 * card and never mutates its input. Each event's `data` is validated with the contract's schema,
 * so only documented inputs reach the card.
 *
 * A `tool-call-args`, `tool-call-result` or `tool-call-error` for a call that has not started is a
 * protocol error, so the fold throws rather than invent the call's name and family.
 */
export function foldToolCall(
  card: ToolCardLike | undefined,
  type: string,
  data: unknown,
): ToolCard {
  switch (type) {
    case 'tool-call-started': {
      const started = ToolCallStartedDataSchema.parse(data);
      return {
        callId: started.callId,
        name: started.name,
        family: started.family,
        state: 'running',
        sourcesUsed: [],
      };
    }
    case 'tool-call-args': {
      const args = ToolCallArgsDataSchema.parse(data);
      return { ...requireStarted(card, type), arguments: args.arguments };
    }
    case 'tool-call-result': {
      const result = ToolCallResultDataSchema.parse(data);
      const started = requireStarted(card, type);
      return {
        ...started,
        state: 'done',
        summary: result.summary,
        output: result.output,
        diffPreview: result.diffPreview,
        sourcesUsed: result.sourcesUsed,
      };
    }
    case 'tool-call-error': {
      const failure = ToolCallErrorDataSchema.parse(data);
      return {
        ...requireStarted(card, type),
        state: 'failed',
        error: {
          message: failure.message,
          attempt: failure.attempt,
          ...(failure.withdrawn === undefined ? {} : { withdrawn: failure.withdrawn }),
        },
      };
    }
    default:
      throw new Error(`not a tool-call event: ${type}`);
  }
}

/** The card a follow-up event folds into. Its absence is a protocol error. */
function requireStarted(card: ToolCardLike | undefined, type: string): ToolCardLike & ToolCard {
  if (card === undefined || card.state === undefined) {
    throw new Error(`${type} arrived before tool-call-started`);
  }
  return card as ToolCardLike & ToolCard;
}
