/**
 * The `@bbartolome/scriba-contracts/tool-registry` slice (#21, phase:contract). Zod schemas,
 * inferred types and constants only; no runtime behaviour. The form renderer, the loader, the lint
 * rules, the template engine and the executor are not in this slice.
 *
 * Folder layout follows the repo's per-module folders, as the agent-loop and project-store slices
 * do. The survey's file names are [proposed] and are not used as paths.
 *
 * Survey 21 §7 decisions with no contract surface are recorded here, because the code they affect
 * lives outside this slice: the phase order (item 3), the editor host (item 9), the mock-server
 * gate (item 17) and the form-renderer gate on the Project store's file API (item 18).
 */
// provisional: survey 21 §7 item 3
// provisional: survey 21 §7 item 9
// provisional: survey 21 §7 item 17
// provisional: survey 21 §7 item 18
export * from './vocabulary.js';
export * from './common.js';
export * from './tool-spec.js';
export * from './entity-type.js';
export * from './lint.js';
export * from './descriptors.js';
export * from './function-schema.js';
export * from './calls.js';
