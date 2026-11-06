/**
 * The `@bbartolome/scriba-contracts/graph-runner` slice (#24, phase:contract). Zod schemas,
 * inferred types and constants only; no runtime behaviour. The validator, the run engine, the CRUD
 * service and the canvas are not in this slice.
 *
 * Folder layout follows the repo's per-module folders, as the tool-registry and project-store slices
 * do. The slice imports port types and tool names from `../tool-registry/index.js`, file and entity
 * references from `../project-store/index.js`, and the envelope and base error shape from
 * `../platform/index.js`. Those are the three imports phase:contract acceptance 1 allows.
 */
export * from './vocabulary.js';
export * from './common.js';
export * from './graph.js';
export * from './validation.js';
export * from './graphs.js';
