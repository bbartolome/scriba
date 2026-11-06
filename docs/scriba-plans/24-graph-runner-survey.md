# #24 Graph runner: survey

## 1. Approach

- **Contracts first.** Publish the `graph-runner` subpath (shapes and constants only) once #16 `phase:scaffold` and the #20 and #21 contract phases land. Rebuild contracts before API or web tests (#4).
- **Pure core, thin Nest wrapper.** Validation, scope, order, target choice and captured base are pure functions over the #21 catalog. Nest services connect them to the Project store, executor, pending-change provider and run log.
- **One controller per run.** An `AbortController` reaches the registry executor and the model call, so Stop meets the two-second budget. Run state is in memory. The JSONL log is durable and drives restart recovery.
- **Canvas behind one adapter layer.** Only `canvas/` imports ngx-vflow (#8), through host and node templates and the `Vflow` tuple. The four spike workarounds stay there: a handle template carrying the port id, handles in their own rows, the `Vflow` tuple import, and the `connect` output. Badges come from SSE and reconcile from current-run-state on load and wake (#4).

## 2. Files and modules

- `packages/contracts/src/graph-runner/` and `packages/contracts/test/graph-runner/`: shapes, constants, and fixtures kept out of `examples/` (#13).
- `apps/api/src/modules/graph-runner/graph-runner.module.ts`: the Nest `@Module`, imported into Platform's API root.
- `apps/api/src/modules/graph-runner/graphs/`: `/api/graphs` controller and CRUD service.
- `apps/api/src/modules/graph-runner/graph-file.ts`: the graph validator registered with the Project store for `graphs/`, and the schema-version refusal.
- `apps/api/src/modules/graph-runner/validation/`: recipe checks over #21 port descriptors, story checks, port-id parsing.
- `apps/api/src/modules/graph-runner/runs/`: `/api/graph-runs` controller, run engine, run registry, outputs, run log, SSE members.
- `apps/api/test/graph-runner/`: integration tests on the booted app. `e2e/fixtures/mock-openai/`: a Graph-runner scenario.
- `apps/web/src/app/features/graph-runner/`: `graph-runner.routes.ts` (lazy `Routes`), `api/`, `graph-list/`, `canvas/` (adapter, `connection-rules.ts`, `arrange.ts`, views, palette, nodes, side list), `run/` (status store, input dialog, controls, result preview).
- `e2e/graph-runner/canvas-gestures.spec.ts`: gestures. The M4 step also goes into Platform's e2e spec.
- `examples/nonfiction/graphs/chapter-opening.json`: the sample recipe.

## 3. Phase plan

**phase:contract** (wave 1)
- Work: the §4 surface, plus `story.json` and `recipe.json` fixtures.
- Gated by: #16 `phase:scaffold`; #20 and #21 `phase:contract`.
- Done when: the five checkboxes under Phases › phase:contract pass, including CI. No gate stub remains at close.
- First test: `recipe.json` parses through the schema. Then an `it.each` over the six rejections, starting with `schemaVersion: 2`.

**phase:engine** (M4, wave 2)
- Work, sliced: CRUD and `GRAPH_SCHEMA_INVALID`; newer-`schemaVersion` refusal (`GRAPH_SCHEMA_VERSION_UNSUPPORTED` on GET and save, file unchanged; no migrators in v1, since #20's registry ships in `phase:migrations`, M7); validator and `validate`; run refusals and start-time input checks; sequential runs on a fake executor, then the mock server; pending-change outputs; error, stop and "Run to here"; run log, current-run-state, restart; stop on project switch.
- Gated by: #21 `phase:loader-validation` and `phase:executor`; #20 `phase:files` and `phase:pending-review`.
- Done when: the ten checkboxes under Phases › phase:engine pass on the mock server. The output slice also needs Q5.
- First test: `POST /api/graphs` with `view: 'recipe'` writes `graphs/<slug>.json`, which parses against the contract. `GET /api/graphs` then lists it.

**phase:canvas** (M4, demo)
- Work: lazy route, list, phone gate, pending-change badge; adapter and story view; recipe view with registry tool nodes, typed handles and palette; wire refusal, chip drop, unpin; validation display, disabled Run, read-only canvas during runs; input dialog, controls, SSE badges; result preview with cited files and readable errors; missing-file badge, Open file, no Run on story graphs; Arrange and Material styling; sample recipe; Playwright step; 150-node measurement.
- Gated by: #17 `phase:core` and `phase:editor`; #21 `phase:form-renderer`; #22 `phase:nonfiction-workhorses`; #16 `phase:examples-check` (CI sample check, checkbox 9).
- Done when: the brief's "done when" under Phases › phase:canvas holds, with all ten checkboxes.
- First test: a rendered-route test. A chip dropped on a text port is refused with a reason, and the saved graph is unchanged (the fake API records saves).

## 4. Contracts

Exposes `@bbartolome/scriba-contracts/graph-runner`: the surface the spec's Contracts section names. Names are the spec's; TypeScript identifiers are mine.

Consumes:
- `/tool-registry` (#21): port-type enum, `x-scriba-*` keys, output enum, `{output, sourcesUsed}`. The executor takes an abort signal, which the spec's Consumes list omits. Entity resolution stays with the caller (Q1).
- `/project-store` (#20): path, file ref, entity ref, pending-change type with captured base, style profile ref, queue events, `project.switched`. Origin is `{kind:'recipe-run', runId, nodeId}`, which lacks graph id and sources used (Q5).
- `/platform`: SSE envelope and base error shape.

Gate stubs: none may remain when phase:contract closes, since its checkbox 1 forbids local port types. Gate stubs are allowed only in engine and canvas work, and each is removed before its phase closes. Permanent fixtures are not gate stubs (§5, §6).

## 5. Test strategy

- **Contract (Vitest over Zod):** the §3 fixtures and rejections. Never reads `examples/`.
- **API integration (primary):** the booted app on a temp library with an active project. Assert via HTTP, SSE order, files in `graphs/`, pending changes read through the Project store, `logs/recipe-runs/`, and restart. Internal-level tests are dropped (Testing Decisions). The mock scenario (#16 format) uses a delay step for stop timing and an HTTP 400 step for node failure, because the SDK retries 5xx by default. Two error paths replace the malformed-argument turn: a pinned entity whose file is deleted before the run (warning only, so the node errors readably, User Story 30), and a malformed graph output (the output-node schema error). Q15 covers the swap.
- **UI (Angular Vitest, rendered route):** fake API and SSE clients built from contract types, which the spec's UI seam requires. Covers list, dialog, badges and reconcile, validation display, drop outcome, phone gate.
- **Gestures (Playwright, desktop and touch emulation):** wire refusal (type mismatch and second wire), chip drop, pan, move, touch connect.
- **System:** Platform's e2e M4 step on the nonfiction sample (#13).
- **Manual:** iPad Safari and the 150-node measurement, recorded in the PR.

## 6. Dependencies

Gates (#26 and the owning specs):
- #16: `phase:scaffold`; `phase:test-harness`; `phase:examples-check`. Request a sixth placeholder step, "recipe run", after "accept change" (Q15).
- #21: `phase:contract`; `phase:loader-validation` and `phase:executor` (engine); `phase:form-renderer` (canvas).
- #20: `phase:contract`; `phase:files` and `phase:pending-review` (engine). The graph validator registers for `graphs/` at `phase:pending-review`. #20's generic "too new" refusal maps to `GRAPH_SCHEMA_VERSION_UNSUPPORTED`.
- #17: `phase:core`; `phase:editor` (Open file). #18: `phase:token-guard`. #22: `phase:nonfiction-workhorses` (sample only).
- Blocker: expand-contract request to #20 adding `graphId` and `sourcesUsed` to origin, before the output slice (Q5).
- Gap: #26 has no gate row for `#24 phase:contract`. The owner adds one.

Downstream, blocked by our phase:contract: #22 `phase:core-propose-graph` (#26), #23 `phase:pending-writes` (its gates), #25 `phase:assembly-preflight` (#26), and #16 `phase:examples-check` (#26).
Gate stubs (engine and canvas only): an in-memory Project store fake recording path, content, captured base and origin; a fake catalog whose executor waits on the `AbortSignal`; a placeholder form renderer; a pass-through guard.

## 7. Open questions

Each carries my recommendation. "MAP" marks a map decision that overrides the spec. Stop points are in §8.

1. **Entity resolution order (MAP wording).** #21 fixes the order: fill an empty style field "before resolving", validate (which returns IDs), resolve, execute. The owner confirms the #7 wording change only.
2. **Ajv timing.** #10 says Ajv checks shape when the run starts; the spec checks per node. Recommend: input values are checked at run start (`GRAPH_INPUT_INVALID`), and arguments as each node runs, since upstream results exist only then.
3. **`claims` and `check` outputs.** #10 says the output enum sets each target file kind, but no decision names a location. Recommend: keep the v1 validation error; the owner confirms it.
4. **Graph outputs (MAP).** #7 says graphs are written "by the agent loop"; #10 routes every output through pending changes. Recommend: keep the spec's `graph` outputs, since #10 is later and more specific.
5. **Origin fields (blocker).** Engine checkbox 4 needs sources used on origin, and Further Notes needs the graph id. Recommend: use kind `recipe-run` and file the expand-contract request on #20. No parallel record.
6. **Issue codes and client rules.** The spec names no issue codes, and contracts hold shapes only (#3). Recommend: enumerate the codes in the contract. Client wire checks use #21 port descriptors in `connection-rules.ts`; full validation is a debounced `validate` call.
7. **Targets and scope.** Unclear whether an output node can be a "Run to here" target, or whether out-of-scope keys are ignored. Recommend: allow output targets, and refuse out-of-scope keys with `GRAPH_INPUT_INVALID` or `GRAPH_TARGET_INVALID`.
8. **Story relation.** `relation` is optional in the edge shape, but GLOSSARY.md defines a story Relation as a named link. Recommend: story relations require a non-empty value; recipe wires forbid one.
9. **Slug collisions and rename.** Recommend: a numeric suffix on create. Renaming onto an existing id needs a new `GRAPH_` code.
10. **Vocabulary.** Entity, port, captured base, scope and chip are undefined in GLOSSARY.md. The canvas brief quotes "chapter recipe", which GLOSSARY.md lists under Avoid. Recommend: add the missing terms via domain-modeling, keep the quote, and prefer "wire" and "relation" in prose.
11. **Generated target collisions.** Two output nodes in one run can share a generated name. #20 folds a second propose within a run into the first change, breaking engine checkbox 4. Recommend: suffix generated names per run, and refuse duplicate explicit targets with `GRAPH_TARGET_INVALID`.
12. **Restart recovery and active project.** #20 keeps exactly one active project across restarts (its User Story 13). Recommend: take the active project from the Project store provider, rebuild that project's latest run from its log, and rebuild again on `project.switched`. The runner never reads `settings.yaml`.
13. **"On open" migration (MAP).** #7 and the spec say migrate on open. #20 migrates only from POSTs, as #6's GET-never-mutates invariant requires. Recommend: POST-only. The owner confirms the wording.
14. **Project switch mid-run.** #20 refuses requests that name a non-active project, so later reads would fail. Recommend: stop the run on `project.switched` with status `stopped` and reason `project-switched`; pending changes already created stay. Add the reason to the contract, alongside `interrupted`.
15. **Test departures (MAP and spec).** Two need owner approval: a sixth e2e step, "recipe run" after "accept change", against #7 and #16's five named steps (the map wins, so the owner decides); and replacing the malformed-argument turn, which departs from Testing Decisions. Recommend: approve both.

Checked, no change needed:
- Retries: #6 places schema-validation retries in the Agent loop, and #21 says the registry never retries. A bad argument is an immediate node error.
- Wave placement: #26 already records the wave-1 contract phase.
- #3's "Intent → graph" tool and "running a node/branch/graph" are superseded by #10, which the spec follows.

## 8. Driver brief

Goal: implement the Graph runner (#24) for Scriba's single author, in phases contract, engine and canvas, in that order. A story graph is an inert map and never runs. A recipe is the only runnable graph, wired through typed ports. Only output nodes create pending changes, and author saves are direct writes. The Graph runner and the Agent loop never call each other.

Done when: contract, the five checkboxes pass; engine, the ten checkboxes pass on the mock server; canvas, the brief's "done when" and its ten checkboxes pass.

Stop points, each resolved with the owner before its phase closes: contract, Q6 to Q10; engine, Q1 to Q5 and Q11 to Q14; canvas, Q15. A phase never closes while a §6 gate is stubbed.

Drive each phase through `/navigator:pair` and its navigator tools. Open with the phase goal and done-when. Put each stop-point question to the navigator, and record the answers in the phase PR. End a phase only when its checkboxes pass and no gate stub remains. All of decisions #1 to #15 bind. Where a map decision and the spec conflict, the map wins and the owner confirms. Use GLOSSARY.md terms. Build contracts before API or web tests. Report each gate stub.
