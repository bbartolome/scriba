import { readFileSync } from 'node:fs';

/**
 * The example graph files (spec, phase:contract: "Write example graph files (one story graph and one
 * recipe) used as contract test fixtures"). They live under test/, so the contract never reads the
 * sample project's `examples/` folder (survey 24 §5).
 */
const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

export const STORY_GRAPH_FIXTURE = readFixture('story.json');
export const RECIPE_GRAPH_FIXTURE = readFixture('recipe.json');

/** A run id: a ULID, as the engine generates them. */
export const RUN_ID = '01HZX7K3M9Q2R5T8V0W4Y6B1C3';
