/**
 * The registry-owned cold-open fixture (survey 21 §3, phase:form-renderer). It is a test fixture,
 * not Genre packs content, and the loader replaces it in phase:loader-validation.
 *
 * `style` is listed in `required` on purpose. The emitter must still treat a style field as
 * optional in every view (spec, "Emission"), and the integration tests check that through GET.
 */
export const COLD_OPEN_FIXTURE_SOURCE = `schemaVersion: 1
name: cold_open
description: Open a chapter with a scene drawn from one person and their own notes.
inputs:
  type: object
  properties:
    person:
      type: string
      title: Person
      description: Entity ID of the person to open on.
      x-scriba-type: entity
      x-scriba-entity-kinds: [person]
      x-scriba-port: true
    notes:
      type: string
      title: Notes
      description: Free text the scene should use.
      x-scriba-type: text
      x-scriba-port: true
    style:
      type: string
      title: Style
      description: Style profile the scene is written in.
      x-scriba-type: style
      x-scriba-port: true
    tone:
      type: string
      title: Tone
      enum: [warm, dry, urgent]
      default: warm
      x-scriba-control: select
  required: [person, style]
  additionalProperties: false
output: draft
enabled: true
prompt: |
  Write a cold open about {{entity person}}.
  {{#if notes}}Use these notes: {{notes}}{{/if}}
`;
