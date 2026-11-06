import { type Scenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import { content, holdReply, scenario, step, toolCall } from '../providers/support.js';

/**
 * The scripted turns of the agent tests. They are written in the Platform mock's own format and
 * parsed by its parser, so the mock is used as it is on main. They live here because the Platform
 * e2e tree belongs to Platform, and this phase does not add to it.
 */

/** A `read_file` call whose arguments are not valid JSON. The mock sends them as sent. */
const malformedRead = (id: string) => toolCall(id, 'read_file', ['{"path": "sources/outline.md"']);

/**
 * A call with its arguments as JSON, cut in two so the stream is put back together from pieces. The
 * narrative tools take entity IDs, which the loop resolves before the registry runs the tool.
 */
function narrativeCall(id: string, name: string, args: Record<string, unknown>) {
  const text = JSON.stringify(args);
  const cut = Math.floor(text.length / 2);
  return toolCall(id, name, [text.slice(0, cut), text.slice(cut)]);
}

/**
 * A narrative tool turn. The model calls the tool at turn 0. The registry then makes its own plain
 * completion, which is turn 1, and it returns the draft the scenario names. Turn 2 is the answer.
 */
function narrativeTurns(
  name: string,
  tool: string,
  args: Record<string, unknown>,
  draft: string,
): () => Scenario {
  return () =>
    scenario(name, [
      step([narrativeCall(`call_${tool}`, tool, args)], { turn: 0 }),
      step([content(draft)], { turn: 1 }),
      step([content('Here is the draft.')], { turn: 2 }),
    ]);
}

/** The arguments of the four nonfiction workhorses, over the nonfiction sample's entities. */
export const WORKHORSE_ARGS = {
  cold_open: {
    coreIdea: 'Practice shows that improvement needs effortful work.',
    person: 'violinist',
    entityIds: ['expertise-notes'],
    styleProfile: 'style-house',
  },
  mystery_question: {
    coreIdea: 'Most learners stop improving at a plateau.',
    puzzle: 'Why do most learners stop improving?',
    entityIds: ['claim-plateau', 'expertise-notes'],
  },
  myth_buster: {
    coreIdea: 'Practice reveals what talent cannot.',
    belief: 'Talent sets the limit.',
    claimIds: ['claim-plateau'],
    entityIds: ['expertise-notes'],
  },
  numbers_to_people: {
    coreIdea: 'Plateaus are common.',
    statistic: 'Most learners stop improving after their first plateau.',
    person: 'violinist',
  },
} as const;

const SCRIPTS: Readonly<Record<string, () => Scenario>> = {
  // One scenario per workhorse. Each draft cites the entities it was built from.
  'workhorse-cold-open': narrativeTurns(
    'workhorse-cold-open',
    'cold_open',
    WORKHORSE_ARGS.cold_open,
    'The cold open starts mid-scene with the violinist [@violinist], and pulls back to the idea from the notes [@expertise-notes].',
  ),
  'workhorse-mystery-question': narrativeTurns(
    'workhorse-mystery-question',
    'mystery_question',
    WORKHORSE_ARGS.mystery_question,
    'Why do learners stop? The clues point to the plateau [@claim-plateau], as the notes say [@expertise-notes].',
  ),
  'workhorse-myth-buster': narrativeTurns(
    'workhorse-myth-buster',
    'myth_buster',
    WORKHORSE_ARGS.myth_buster,
    'Talent sets the limit, people say. The evidence breaks that belief at the plateau [@claim-plateau], as the notes show [@expertise-notes].',
  ),
  'workhorse-numbers-to-people': narrativeTurns(
    'workhorse-numbers-to-people',
    'numbers_to_people',
    WORKHORSE_ARGS.numbers_to_people,
    'Most learners stop after their first plateau. One of them was a violinist [@violinist] who stopped at the same point.',
  ),

  // The cold open with no style argument. The loop fills the project's own style profile in.
  'workhorse-cold-open-default-style': narrativeTurns(
    'workhorse-cold-open-default-style',
    'cold_open',
    {
      coreIdea: WORKHORSE_ARGS.cold_open.coreIdea,
      person: 'violinist',
      entityIds: ['expertise-notes'],
    },
    'The cold open starts with the violinist [@violinist].',
  ),

  // A narrative call with an unknown entity ID, then the same call with a real one. The unknown ID
  // is a readable error and the first retry; the registry runs only with the real one.
  'narrative-unknown-entity': () =>
    scenario('narrative-unknown-entity', [
      step(
        [
          narrativeCall('call_bad_entity', 'cold_open', {
            ...WORKHORSE_ARGS.cold_open,
            person: 'no-such-person',
          }),
        ],
        { turn: 0 },
      ),
      step([narrativeCall('call_good_entity', 'cold_open', WORKHORSE_ARGS.cold_open)], {
        turn: 1,
      }),
      step([content('The cold open starts with the violinist [@violinist].')], { turn: 2 }),
      step([content('Here is the draft.')], { turn: 3 }),
    ]),

  // A project search for one word, then the answer.
  'search-notes': () =>
    scenario('search-notes', [
      step([toolCall('call_search', 'search_notes', ['{"query": "plateau"}'])], { turn: 0 }),
      step([content('The notes discuss the plateau.')], { turn: 1 }),
    ]),

  // A text-only turn: the agent run ends with reason completed.
  'text-only': () => scenario('text-only', [step([content('Hello ', 'there.')])]),

  // Lists sources, reads the outline, then answers. The outline is the nonfiction sample's.
  outline: () =>
    scenario('outline', [
      step([toolCall('call_list', 'list_files', ['{"path": "sources"}'])], { turn: 0 }),
      step([toolCall('call_read', 'read_file', ['{"pa', 'th": "sources/outline.md"}'])], {
        turn: 1,
      }),
      step([content('The outline sets out ', 'the three parts of the book.')], {
        hasToolResult: true,
      }),
    ]),

  // Calls a tool every step, forever: the step cap ends it.
  endless: () =>
    scenario('endless', [step([toolCall('call_loop', 'list_files', ['{"path": ""}'])])]),

  // Streams one delta, then holds the connection until the client leaves: the stop test.
  hold: () => scenario('hold', [step([content('Working...'), holdReply(15000)])]),

  // Three invalid calls to read_file in a row, then a text answer. The third withdraws the tool.
  'three-invalid': () =>
    scenario('three-invalid', [
      step([malformedRead('call_bad_1')], { turn: 0 }),
      step([malformedRead('call_bad_2')], { turn: 1 }),
      step([malformedRead('call_bad_3')], { turn: 2 }),
      step([content('I could not read the outline.')], { turn: 3 }),
    ]),

  // Reads a big file, then a long one, then answers: the context budget and the read cut both apply.
  budget: () =>
    scenario('budget', [
      step([toolCall('call_big', 'read_file', ['{"path": "sources/big.md"}'])], { turn: 0 }),
      step([toolCall('call_huge', 'read_file', ['{"path": "sources/huge.md"}'])], { turn: 1 }),
      step([content('Both files read.')], { turn: 2 }),
    ]),

  // A read outside the project, then a text answer once the refusal is in.
  'outside-project': () =>
    scenario('outside-project', [
      step([toolCall('call_out', 'read_file', ['{"path": "../secret.md"}'])], { turn: 0 }),
      step([content('I cannot read that file.')], { hasToolResult: true }),
    ]),
};

/** The scenario with this name, built from its script. A name with no script is a test bug. */
export function scenarioFor(name: string): Scenario {
  const build = SCRIPTS[name];
  if (build === undefined) {
    throw new Error(`no agent test scenario named ${name}`);
  }
  return build();
}
