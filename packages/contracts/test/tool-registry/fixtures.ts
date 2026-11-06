/**
 * Test fixtures for the Tool registry slice. The cold-open fixture is shaped like the spike's
 * workhorse tool: one entity input of kind `person`, a text port, a style port, and a select that is
 * a params field. The content is the slice's own fixture and is not Genre packs content.
 */

export const COLD_OPEN_ENVELOPE = {
  schemaVersion: 1,
  name: 'cold_open',
  description: 'Open a chapter with a scene drawn from one person and their own notes.',
  inputs: {
    type: 'object',
    properties: {
      person: {
        type: 'string',
        title: 'Person',
        description: 'Entity ID of the person to open on.',
        'x-scriba-type': 'entity',
        'x-scriba-entity-kinds': ['person'],
        'x-scriba-port': true,
      },
      notes: {
        type: 'string',
        title: 'Notes',
        description: 'Free text the scene should use.',
        'x-scriba-type': 'text',
        'x-scriba-port': true,
      },
      style: {
        type: 'string',
        title: 'Style',
        description: 'Style-profile entity ID.',
        'x-scriba-type': 'style',
        'x-scriba-port': true,
      },
      tone: {
        type: 'string',
        title: 'Tone',
        enum: ['warm', 'dry', 'urgent'],
        default: 'warm',
        'x-scriba-control': 'select',
      },
    },
    required: ['person'],
    additionalProperties: false,
  },
  output: 'draft',
  enabled: true,
  prompt:
    'Write a cold open about {{entity person}}.\n{{#if notes}}Use these notes: {{notes}}{{/if}}\n',
} as const;

export const PERSON_ENTITY_TYPE = {
  schemaVersion: 1,
  kind: 'person',
  title: 'Person',
  description: 'A real person the book is about.',
  fields: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
} as const;

export const COLD_OPEN_FORM = {
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
      control: 'text',
      required: false,
      list: false,
      port: true,
      elementType: 'text',
    },
    {
      key: 'style',
      title: 'Style',
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
} as const;

export const COLD_OPEN_PORTS = {
  inputs: [
    { key: 'person', type: 'entity', list: false, required: true, title: 'Person' },
    { key: 'notes', type: 'text', list: false, required: false, title: 'Notes' },
    { key: 'style', type: 'style', list: false, required: false, title: 'Style' },
  ],
  output: { key: 'output', type: 'text', kind: 'draft' },
  params: ['tone'],
} as const;

export const COLD_OPEN_FUNCTION = {
  type: 'function',
  function: {
    name: 'cold_open',
    description: 'Open a chapter with a scene drawn from one person and their own notes.',
    parameters: {
      type: 'object',
      properties: {
        person: {
          type: 'string',
          description: 'Entity ID of the person to open on. Entity ID of kind person.',
        },
        notes: { type: 'string', description: 'Free text the scene should use.' },
        style: {
          type: 'string',
          description: 'Style-profile entity ID; defaults to the project style profile.',
        },
        tone: { type: 'string', enum: ['warm', 'dry', 'urgent'], default: 'warm' },
      },
      required: ['person'],
      additionalProperties: false,
    },
  },
} as const;

/** A resolved person, as the caller builds it from the Project store's entity reference and content. */
export const RESOLVED_PERSON = {
  id: 'ada-lovelace',
  type: 'person',
  path: 'entities/people/ada-lovelace.md',
  content: '# Ada Lovelace\n\nMathematician.\n',
} as const;
