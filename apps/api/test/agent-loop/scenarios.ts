import { type Scenario } from '../../../../e2e/fixtures/mock-openai/scenario.js';
import { content, holdReply, scenario, step, toolCall } from '../providers/support.js';

/**
 * The scripted turns of the agent tests. They are written in the Platform mock's own format and
 * parsed by its parser, so the mock is used as it is on main. They live here because the Platform
 * e2e tree belongs to Platform, and this phase does not add to it.
 */

/** A `read_file` call whose arguments are not valid JSON. The mock sends them as sent. */
const malformedRead = (id: string) => toolCall(id, 'read_file', ['{"path": "sources/outline.md"']);

const SCRIPTS: Readonly<Record<string, () => Scenario>> = {
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
