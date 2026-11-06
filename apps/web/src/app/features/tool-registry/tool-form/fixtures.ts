import type { EntityListItem } from '@bbartolome/scriba-contracts/project-store';
import { type ToolDetail, ToolDetailSchema } from '@bbartolome/scriba-contracts/tool-registry';

/**
 * The cold-open response, as GET /api/tools/cold_open answers it. The UI tests build it from the
 * contract schema, so a fixture that drifts from the contract fails here.
 */
export const COLD_OPEN: ToolDetail = ToolDetailSchema.parse({
  name: 'cold_open',
  origin: 'nonfiction',
  enabled: true,
  yaml: 'name: cold_open\n',
  lint: { diagnostics: [] },
  form: {
    fields: [
      {
        key: 'person',
        title: 'Person',
        description: 'Entity ID of the person to open on.',
        control: 'entity-picker',
        required: true,
        list: false,
        entityKinds: ['person'],
        port: true,
        elementType: 'entity',
      },
      {
        key: 'notes',
        title: 'Notes',
        description: 'Free text the scene should use.',
        control: 'text',
        required: false,
        list: false,
        port: true,
        elementType: 'text',
      },
      {
        key: 'style',
        title: 'Style',
        description: 'Style profile the scene is written in.',
        control: 'style-picker',
        required: false,
        list: false,
        port: true,
        elementType: 'style',
      },
      {
        key: 'tone',
        title: 'Tone',
        control: 'select',
        required: false,
        default: 'warm',
        options: ['warm', 'dry', 'urgent'],
        list: false,
        port: false,
      },
    ],
  },
  ports: {
    inputs: [
      { key: 'person', type: 'entity', list: false, required: true, title: 'Person' },
      { key: 'notes', type: 'text', list: false, required: false, title: 'Notes' },
      { key: 'style', type: 'style', list: false, required: false, title: 'Style' },
    ],
    output: { key: 'output', type: 'text', kind: 'draft' },
    params: ['tone'],
  },
});

/** One tool with a field for each of the eight controls, to check that each one draws. */
export const EVERY_CONTROL: ToolDetail = ToolDetailSchema.parse({
  name: 'every_control',
  origin: 'user',
  enabled: true,
  yaml: 'name: every_control\n',
  lint: { diagnostics: [] },
  form: {
    fields: [
      { key: 'title', title: 'Title', control: 'text', required: true, list: false, port: false },
      {
        key: 'summary',
        title: 'Summary',
        control: 'textarea',
        required: false,
        list: false,
        port: false,
      },
      {
        key: 'count',
        title: 'Count',
        control: 'number',
        required: false,
        list: false,
        port: false,
        minimum: 1,
        maximum: 9,
      },
      {
        key: 'weight',
        title: 'Weight',
        control: 'slider',
        required: false,
        list: false,
        port: false,
        minimum: 0,
        maximum: 10,
      },
      {
        key: 'mood',
        title: 'Mood',
        control: 'select',
        required: false,
        list: false,
        port: false,
        options: ['calm', 'tense'],
      },
      {
        key: 'vivid',
        title: 'Vivid',
        control: 'toggle',
        required: false,
        default: true,
        list: false,
        port: false,
      },
      {
        key: 'person',
        title: 'Person',
        control: 'entity-picker',
        required: false,
        list: false,
        port: false,
        entityKinds: ['person'],
      },
      {
        key: 'style',
        title: 'Style',
        control: 'style-picker',
        required: false,
        list: false,
        port: false,
      },
    ],
  },
});

/** The active project's entities. Only `person` entities fit the cold-open picker. */
export const PROJECT_ENTITIES: readonly EntityListItem[] = [
  { id: 'ada-lovelace', type: 'person', path: 'entities/people/ada-lovelace.md' },
  { id: 'charles-babbage', type: 'person', path: 'entities/people/charles-babbage.md' },
  { id: 'engine-claim', type: 'claim', path: 'entities/claims/engine.md' },
  { id: 'house-style', type: 'style-profile', path: 'entities/house-style.md' },
];
