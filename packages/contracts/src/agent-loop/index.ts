/**
 * The `@bbartolome/scriba-contracts/agent-loop` slice (#23, phase:contract). Zod schemas, inferred
 * types and constants only; no runtime behaviour.
 *
 * Folder layout follows the repo's per-module folders (survey item 21, open). The survey's
 * `src/agent-loop.ts` form is not used, because the package exports map and the exports test
 * expect `dist/agent-loop/index.js`.
 */
export * from './vocabulary.js';
export * from './routes.js';
export * from './common.js';
export * from './provenance.js';
export * from './grounding.js';
export * from './events.js';
export * from './run.js';
export * from './transcript.js';
export * from './settings.js';
