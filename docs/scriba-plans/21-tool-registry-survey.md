# #21 Tool registry: implementation survey

Revised after round 3, for owner review, not re-reviewed. Checked against spec #21 (cited by section name, because earlier line numbers had gone stale), map #1 decision comments #3, #4, #6, #7, #8, #10 and #15, tracker #26, and the sibling spec bodies #16 to #25. The repo has no app code: `git ls-files` shows docs, skills and config only, so every path in §2 is new.

## 1. Approach
- One parsed tool spec is the only source. The catalog derives the three views (function schema, form descriptor, port descriptor) and an Ajv validator from it at load (Solution; Implementation Decisions › Emission).
- Parser, lint, emitters and renderer are pure. Lint and render share one template parser [proposed].
- Phase order: `phase:contract` first (#3, #26), then the form-renderer spike, which tests the `x-scriba-*` vocabulary before the loader is built. #7 puts the form renderer first; that is Open question 3.
- The executor takes validated arguments and caller-resolved entities, calls the model through the Model providers client, and returns `{output, sourcesUsed}`. It never writes files.
- Built-ins load at startup. The user pack is re-scanned by `(path, mtime, size)` before each list, get or call. GET never writes files or `settings.yaml` (#6; Open question 4).
- A phase's gate is the producer's contract, not its implementation, unless §6 says otherwise (#3).

## 2. Files and modules
All file and folder names below are [proposed]. The spec names only `packages/packs`, `tools/`, `entity-types/`, the `tools` settings section and the routes. Paths are from the repo root. `apps/api/src/modules/<m>/` and `apps/web/src/app/features/<m>/` follow #4.
- `packages/contracts/src/tool-registry/`: contract slice. Platform pre-creates the empty subpath (#16).
- `apps/api/src/modules/tool-registry/`: `tool-registry.module.ts` (Nest `@Module`, additive import into Platform's root), `tool-registry.controller.ts` (`/api/tools`, behind the guard; Open question 16).
- `.../catalog/`: `catalog.service.ts`, `pack-loader.ts` (precedence, rescan, refusal, duplicate names, migration), `offering.ts` (core, genre pack, user pack), `active-project.ts` (real reader gated on #20 `phase:files`).
- `.../spec/`: `tool-spec.ts`, `entity-type.ts`, `emit.ts`, `lint.ts` (line and column via the `yaml` LineCounter; block scalars make this bigger than it looks), `args-validate.ts` (Ajv over the stripped `parameters`, because strict mode rejects unknown `x-` keywords).
- `.../template/`: `parser.ts` (loader-validation), `renderer.ts` (executor).
- `.../executor/`, `.../settings/tools-section.ts`, `.../events/catalog-events.ts`.
- `packages/packs/`: built into `/opt/scriba/packs/{core,nonfiction,fiction}` (#4, #7). This module reads it and creates no folders. #22 owns the content and #16 the copy step.
- `apps/api/test/fixtures/packs/`, `apps/api/test/tool-registry/`: fixture packs, cold-open fixture, integration tests.
- `apps/web/src/app/features/tool-registry/`: `routes.ts` (lazy `Routes`; additive entry in the Shell's route table), `tool-form/`, `tools-page/` (CodeMirror 6 YAML editor with `@codemirror/lint`), `api/`.
- `e2e/fixtures/mock-openai/`: this module's scenarios, added to #16's server (additive).
- `.github/workflows/ci.yml`: pack-lint step (additive, Platform's job).
- `SCRIBA_PACKS_DIR` is already in #16's env table, default `/opt/scriba/packs`. Nothing to add.

## 3. Phase plan
Acceptance criteria (ACs) are the spec's, summarised. Gates are in §6.

**phase:contract** (M2)
- Gates: Platform `phase:scaffold` (which also publishes `/platform`); Project store `phase:contract`.
- Work: publish the slice. Tool-spec envelope in Zod + TS, with `inputs` as JSON Schema checked by Ajv (Open question 1). `schemaVersion` constant. `x-scriba-*` key and control constants. Port-type and output enums. Output port key. Port-derivation rule as a doc comment on the port-descriptor shape. Form-descriptor, port-descriptor and function-schema shapes. Entity-type envelope (Open question 14). Lint-result shape. Request and response shapes for every endpoint, including the tool-call request and `{output, sourcesUsed}`. Error codes, routes, `catalog-changed`. `toolCatalog` entry [proposed]. `sourcesUsed` item `{id, type, path}` [proposed] (Open question 12).
- ACs:
  - the slice builds and imports from NestJS and Angular with no other subpath;
  - Zod tests accept a cold-open-shaped fixture envelope and reject a wrong output kind, a bad name and a missing `prompt`;
  - the output enum has exactly five values, and the port-type enum exactly three;
  - Genre packs, Agent loop and Graph runner can reference every type their specs consume (§4, §6).
- First test: the output enum equals `draft, entity, claims, graph, check`; `video` is rejected; a cold-open-shaped envelope parses.

**phase:form-renderer** (M2, spike)
- Gates: `phase:contract`; Frontend shell `phase:core`; Platform `phase:scaffold`. #26 also gates it on #20 `phase:files`, with a fake entity list until then (Open question 18).
- Work: emit form, port and function schemas. Fixture-backed `GET /api/tools/:name` serving the registry-owned cold-open fixture, a test fixture that the loader replaces. Full-mode validate for the fixture. Angular form renderer in both layouts, every control type, kind-filtered entity picker, style picker, inline issues. Dev preview route on the Tools page.
- ACs (spike: one workhorse tool rendered end to end):
  - one response for the cold-open fixture drives both a full form and a node body; the node body shows typed ports for the `entity`, `text` and `style` fields marked as ports, and the other controls as `params`;
  - the entity picker offers only the fixture's kind (`person`) and accepts a dropped chip;
  - submit sends the arguments to `validate`; missing required and wrong enum values show readable inline messages; a valid submit shows the arguments with defaults applied;
  - the emitted function schema has no `x-` key and passes Ajv's draft-07 meta-schema;
  - the closing ticket's spike note records any hint the workhorse needed. A vocabulary change goes through expand–contract before `phase:loader-validation`.
- First test: fixture fields come back in declared order; function `parameters` has no `x-` key and passes the draft-07 meta-schema. Also: entity and style descriptions carry the plain kind hint; style fields are never required.

**phase:loader-validation** (M2)
- Gates: `phase:form-renderer`; Setup & auth guard, implementation (§6).
- Work: pack loader (copy-on-write precedence, manifest re-scan, `schemaVersion` refusal and migration hook, entity-type schema loading, invalid-copy fallback, duplicate-name error). Template parser for lint. Full lint rule set. List, get, builtin, functions, entity-types, lint, save, delete and enabled endpoints; `functions` and `entity-types` are declared before `:name`. `tools` overrides in `settings.yaml`. `params`-mode validate. `catalog-changed`. Exported catalog service. CI pack-lint step. About six tickets.
- ACs:
  - with fixture packs, `GET /api/tools` lists core, genre and user tools; a user file named like a built-in replaces it, and deleting it restores the built-in;
  - `PUT` on a built-in writes `/books/.scriba/packs/user/tools/<name>.yaml` and never touches the packs root;
  - YAML with an unknown `x-scriba-*` key, a template variable that is not an input, or an out-of-subset keyword returns 422 with line-numbered diagnostics and writes no file;
  - a user file with a newer `schemaVersion` is listed as refused with `TOOL_SCHEMA_VERSION_UNSUPPORTED`, and the other tools still load;
  - a file added to the user pack on the host appears in the next list without a restart, and `catalog-changed` is emitted (Open question 4);
  - disabling a tool removes it from `GET /api/tools/functions`, and the switch persists across a restart and a built-in update;
  - `params`-mode validate passes a node whose only missing fields are ports;
  - the CI pack-lint step fails on a deliberately broken fixture pack.
- First test: with fixture packs, `GET /api/tools` lists core, genre and user tools; a user file named like a built-in replaces it, and deleting it restores the built-in.
- Also: a fiction tool is absent from a nonfiction project's `functions` (Stories 34, 35); a fixture entity type is listed; a kind in `x-scriba-entity-kinds` that no schema declares gives a warning (Open question 15); a broken entity-type fixture fails pack-lint; two built-ins with one name fail load.

**phase:executor** (M2)
- Gates: `phase:loader-validation`; Model providers `phase:client` (implementation) and `phase:contract`; Project store `phase:contract`.
- Work: template renderer for the subset, including `{{toolCatalog}}` (Open question 11). Render and execute endpoints and the executor service. Entity resolution and kind checks. One system message per output kind. Provider call with abort, on the active project's model. `sourcesUsed`. Refusals. Plain-completion mock scenario (Open question 5), added to `e2e/fixtures/mock-openai/`.
- ACs:
  - `render` with fixture arguments and resolved entities returns the expected prompt; `{{entity id}}` inside `#each` inserts each entity's header and content; an absent optional field renders nothing;
  - `execute` against the mock server returns `{output: {kind: 'draft', content}, sourcesUsed}`; `sourcesUsed` is exactly the resolved references for the entity-typed inputs, de-duplicated, with the style profile left out;
  - malformed arguments return `TOOL_ARGS_INVALID` naming every bad field; a wrong-kind or unresolved entity returns its own readable error; none of these calls the model;
  - a disabled tool returns `TOOL_DISABLED`; an aborted call stops the model request;
  - brief M2 done-when, at API level: each workhorse-shaped fixture tool produces a draft that cites its source files through `sourcesUsed`.
- First test: `POST /api/tools/:name/render` with two resolved people in an `#each` returns each header and content; an empty optional field renders nothing.
- Also: `toolCatalog` render test (enabled, offered tools only; name, one-line description, port keys and types, output kind); `TOOL_MODEL_ERROR` keeps the provider message; `graph` output loses its one code fence.

**phase:editor-ui** (M2)
- Gates: `phase:executor`; Frontend shell `phase:editor` and `phase:shared-components` (diff view; M3, Open question 9); Project store file-API phase (implementation, for the Try panel). The last AC also waits on #22 `phase:nonfiction-workhorses` (§6).
- Work: list with enable toggles and phone view. YAML editor with save lint and debounced live lint. Customize, Revert, Compare (stubbed until M3), New, Duplicate, Delete. Previews. Try panel. Live refresh on `catalog-changed`.
- ACs:
  - an invalid save shows diagnostics on their lines and keeps the previous version active; a save with only warnings succeeds and shows them;
  - Customize on a built-in opens an editable copy; after save the list shows it as user-owned, overriding the built-in; Revert returns to the built-in;
  - editing `x-scriba-port` updates the node preview's ports live, and changing `x-scriba-entity-kinds` changes what the picker offers;
  - the Try panel runs a tool against the active project and shows output and sources used; no pending change is created;
  - on a phone-sized viewport only the list and toggles are reachable;
  - brief M2 done-when: each of the four nonfiction workhorses produces a draft that cites its source files, once Genre packs ships them.
- First test: a Vitest component test with a fake client: a save with errors shows diagnostics on the right lines and keeps the previous version active.
- Demo (under 5 minutes): the spec's six steps. Step 5 needs the Agent loop's registry phase.

## 4. Contracts
- **Exposes** `@bbartolome/scriba-contracts/tool-registry`: envelope, `x-scriba-*` vocabulary, enums, port, form and function-schema shapes, entity-type envelope, lint result, endpoint shapes, `toolCatalog` entry [proposed], error codes, routes, `catalog-changed`. The template-helper set that #22 expects in this slice is Open question 11.
- **Exposes** `{output, sourcesUsed}`. `sourcesUsed` items are `{id, type, path}` [proposed] (Open question 12). The resolved-entity input is the entity reference plus its content, built by the caller from #20.
- **In-process, not contracts:** the catalog and executor services; the tool-form Angular component.
- **Consumes Platform (#16):** `/platform` error base, SSE envelope, `SCRIBA_PACKS_DIR`, settings envelope and migration hook. Stub: none.
- **Consumes Project store (#20):** entity reference (a string ID), generic front matter `{id, type, links}`, entity list filterable by `type`, file reference, `project.yaml` `genrePack`, `styleProfile` and `model`. Stub: fake entity list and active-project resolver until `phase:files`. The `genrePack` wording is Open question 6.
- **Consumes Model providers (#19):** `/providers` model choice and the client. Stub: a local model-choice type until #19's contract lands, and a fake `ModelClient` until `phase:client`.
- **Consumes Setup & auth (#18):** the one guard. Stub: pass-through guard; add a 401 test when `phase:token-guard` lands.
- **Consumes Frontend shell (#17):** `phase:core` API and SSE clients. The gate has no stub; UI tests use fakes built from the contract types (§5). The editor is the registry's own CodeMirror 6 YAML instance (Open question 9).

## 5. Test strategy
- **Integration (most tests):** Vitest with NestJS via `unplugin-swc`. Boot the module behind a pass-through guard, with a temp library, fixture packs via `SCRIBA_PACKS_DIR`, and #16's mock OpenAI server. Assert HTTP responses, files, `catalog-changed` on SSE, and zero mock requests after a rejected call. Supertest [proposed].
- **Emission:** through `GET /api/tools/:name` only. No `x-` key, passes the draft-07 meta-schema, and the form and port descriptors match the fixture's declared fields and order.
- **Unit:** only phase:contract shape tests. The spec forbids parser, loader and emitter tests.
- **UI:** Vitest with Angular's runner and a fake API and SSE client built from the contract types. Covers each control, the kind-filtered picker, node-body port rows, inline issues, editor diagnostics, Customize and Revert, and the phone gate.
- **Contract:** Zod tests for the slice.
- **CI:** pack-lint runs on the real built-in packs, and on broken-tool, broken-entity-type and duplicate-name fixtures. An unknown-kind fixture covers Open question 15.
- **E2E:** none owned here. The Agent loop adds a registry tool call to Platform's Playwright run at M2.
- **Fixtures:** unit tests keep their own, including the cold-open fixture, and never read `examples/` or the real packs (#13).

## 6. Dependencies
Notation: "A → B" means A lands first. Gate is **contract** (per #3) or **impl** (implementation, where #26 deviates from #3). Stub is the stand-in until the gate passes. **[missing]** marks an edge that is in a spec but not in #26's gates table.

**Upstream (producer → #21):**

| Edge | Gate | Stub | Source |
|---|---|---|---|
| #16 `phase:scaffold` and `/platform` → #21 `phase:contract` | contract | none | #26 "every module's first phase" |
| #16 `phase:test-harness` → #21 `phase:executor`, §5 integration | impl | none | #16 "Who builds on Platform" (mock scenarios). [missing]. The spec gates the mock server on `phase:scaffold` (Open question 17). |
| #20 `phase:contract` → #21 `phase:contract` | contract | fake entity reference | spec. [missing] |
| #20 `phase:contract` → #21 `phase:executor` | contract | fake entity reference | spec. [missing] |
| #20 `phase:files` → #21 `phase:form-renderer`, `phase:editor-ui` | impl | fake entity list, active project | #26 "#21 UI phases". The spec's form-renderer line omits it; #26 governs. |
| #19 `phase:contract` → #21 `phase:executor` | contract | local model-choice type | spec Consumes. [missing] |
| #19 `phase:client` → #21 `phase:executor` | impl | fake `ModelClient` | #26 |
| #18 `phase:token-guard` → #21 `phase:loader-validation` | impl | pass-through guard | spec. [missing]. #26's guard row covers public routes, and #21 has none. |
| #17 `phase:core` → #21 `phase:form-renderer`, `phase:editor-ui` | impl | none (tests use fakes) | #26 "every feature UI phase" |
| #17 `phase:shared-components` (M3 diff) → #21 `phase:editor-ui` | impl | Compare stubbed | spec. [missing] |
| #17 `phase:editor` (M3) → #21 `phase:editor-ui` | impl | own CodeMirror 6 YAML instance | #26. Conflicts with M2 (Open question 9). |
| #22 `phase:nonfiction-workhorses` → #21 `phase:editor-ui` (last AC and demo) | impl | none | spec. [missing] |

**Downstream (#21 → consumer):**

| Edge | Gate | Stub | Source |
|---|---|---|---|
| #21 `phase:contract` → #22 `phase:core-propose-graph` | contract | none | #26; #22 Blocked by |
| #21 `phase:contract` → #22 `phase:nonfiction-workhorses` | contract | none | #26. #22 names only core-propose-graph, so this is transitive. |
| #21 `phase:loader-validation` and `phase:executor` → #22 golden tests | impl | none | #22 Blocked by states it for core-propose-graph; each tool's golden test follows the same rule. [missing] |
| #21 `phase:executor` → #23 `phase:narrative-tools` | impl | none | #26. #23 also names the registry API, which is `loader-validation` and already needed by the executor. |
| #21 `phase:contract` → #23 `phase:contract` (M1) | contract | none | #23's contract carries `sourcesUsed` in draft provenance, but its gate names only Platform `phase:scaffold`. [missing]. Milestone clash (Open question 12). |
| #21 `phase:contract` → #24 `phase:contract` (wave 1) | contract | none | #24 AC: imports port types from `/tool-registry`. [missing] |
| #21 `phase:loader-validation` and `phase:executor` → #24 `phase:engine` | impl | none | #26 |
| #21 `phase:form-renderer` → #24 `phase:canvas` | impl | none | #26 |
| #21 `phase:loader-validation` → #16 `phase:examples-check` | impl | none | #26. #16 uses the loader and `params` validate for recipe tool references. |
| #21 `phase:contract` → #19 `phase:client` (M1) | contract | local OpenAI-style type | #19 Consumes. [missing]. Milestone clash (Open question 10). |
| #21 → #25 | none | none | Checked #25's spec and #26: no edge. |

- **Proposed additions to #26's gates table:** the eleven [missing] rows above. The #16 test-harness row waits on Open question 17.
- **Sibling conflicts (their owners fix these, not this survey):** #22's enable acceptance criterion needs a copy-on-write copy to enable a shape, which #21 forbids (toggling never forks, via `PUT /api/tools/:name/enabled`). #24 story 7 offers a tool node for every enabled tool, while #21 keeps disabled tools' nodes on the canvas. These agree only if #24 means new nodes. #23 reserves built-in function names and drops clashing registry tools; #21 needs no change.

## 7. Open questions
Owner stop points (S) carry a recommendation. Items marked (N) are recorded for owner review in the phase ticket and do not stop the build.

1. **(S, owner) Zod against map #7.** #7's resolution says "No Zod for tool specs". #3 says contracts are TS + Zod, #21's own contract lists the envelope in Zod, and #22's CI suite expects Zod on the spec shape. Recommendation: Zod for the envelope only, with `inputs` opaque to Zod and checked by Ajv; no `z.toJSONSchema()`. Owner confirms before phase:contract.
2. **(S, owner) Migration (map #7 vs spec).** #7 migrates project files lazily, with a backup and a `logs/` entry. The spec migrates in memory on load and writes back on save. Recommendation: migrate in memory on read; back up and write back only on PUT (or `settings.yaml` at startup, as #7 says); never during a GET rescan; skip `logs/`. Owner confirms before phase:contract.
3. **(S, owner) Phase order (map #7 vs #3).** #7 calls the form renderer the Tool registry's first phase. #3 says a producer's first phase publishes its slice. The spec's Further Notes say the form renderer "comes first", but its phase list starts with `phase:contract`. Recommendation: keep `phase:contract` first, per #3 and #26; the spike still gates `phase:loader-validation`. Owner confirms before phase:contract.
4. **(S, owner) GET never mutates (#6).** The spec requires a host-side file to appear on the next list with `catalog-changed`, so a GET rescan emits an event. Recommendation: the rescan updates memory only; a test checks that files and `settings.yaml` are byte-identical after a GET; the event is an in-memory change, not a state change. Owner confirms whether #6's invariant covers SSE events. Before phase:loader-validation.
5. **(N) Mock fixture.** `phase:executor` says "for a tool call", but execute sends no `tools`. Recommendation: a plain-completion scenario in #16's format.
6. **(S, owner, with #20) `genrePack`.** #20 lets `genrePack` name "a user pack". #22 says it names `nonfiction` or `fiction`. The offering rule adds the user pack regardless, so the contract blurs it. Recommendation: `genrePack` names built-in packs only; raise with #20. Owner confirms before phase:loader-validation.
7. **(N) Style default.** The executor renders no style when none is given. The caller fills the project's style-profile ref before resolving, and the function schema describes this default. #24 uses the same order.
8. **(N) Live lint.** #7 lints on save; the spec adds debounced live lint. Keep both; only save blocks.
9. **(S, owner) Editor host.** #17 `phase:editor` is M3 and wraps CodeMirror 6 for Markdown only. Compare needs the M3 diff, and `editor-ui` is M2. Options: (a) our own CodeMirror 6 YAML instance, with Compare stubbed until M3; (b) move `editor-ui` out of M2 and correct #26's "#21 UI phases" row. Recommendation: (a), since the registry saves through its own PUT. Owner confirms before phase:editor-ui.
10. **(S, owner, with #19) Function-schema shape at M1.** #19 `phase:client` (M1) consumes #21's function-schema shape, an M1 consumer of an M2 contract. #19's survey (Q14) suggests inline types. Recommendation: #19 types `tools` locally as the OpenAI function-tool shape and adds a compatibility test once #21 publishes. Owner confirms with #19 before phase:contract.
11. **(S, owner) `{{toolCatalog}}` scope and narrowing.** The Template subset includes it and #22 needs it, but `phase:executor` omitted it, so this survey adds it. The spec says "currently enabled tools"; this survey narrows the list to tools offered to the project and enabled (Stories 34, 35). #22 also expects the helper set in this contract. Recommendation: owner accepts both. Owner confirms before phase:executor.
12. **(S, owner, with #23) `sourcesUsed` item shape.** The spec says "a list of entity references", but #20's reference is a bare string ID. #23's spec records the IDs passed and the `sourcesUsed` paths, and its survey treats them as references. Recommendation: `{id, type, path}`, style excluded; both sides cite it. Owner confirms with #23 before phase:contract. This is also an M1/M2 clash (§6).
13. **(S, owner, with #24) `params` and pinned ports.** #24 stores entity chips dropped on an unwired port in the tool node's `params`. #10 defines `params` as non-port settings, and #21's params-mode validate ignores ports. Recommendation: `params` holds non-port settings only. #24 keeps pins in its own field, which changes #24's node shape, so the owner confirms it. The registry's params-mode rejects port keys. Owner confirms before phase:contract.
14. **(S, owner, with #22) Entity-type envelope `title`.** #21's envelope is `schemaVersion`, `kind`, `description`, `fields`. #22 requires a `title`. Recommendation: keep `kind` and add a required root `title`; no entity-type schema has shipped, so nothing migrates. #22 owns the values. Owner confirms before phase:contract.
15. **(S, owner, with #22) Unknown entity kind: warning or failure.** #21 makes an undeclared `x-scriba-entity-kinds` kind a lint warning, and pack-lint fails only on errors. #22's CI suite checks that each entity-reference filter names an existing type, which makes it a failure. Recommendation: a warning in the editor and the user pack; an error in built-in pack-lint, which runs in CI. Owner confirms before phase:loader-validation.
16. **(S, owner, with Platform #16) Route prefix.** #21 mounts `/api/tools`. #16's convention is `/api/<module>/…`, and #16's survey (item 18) asks the owner to decide. Recommendation: keep `/api/tools`, and record in Platform that slugs govern only subpaths and the envelope's `module`. Owner confirms before phase:contract, since routes are contract constants.
17. **(N) Mock server gate.** The spec's Platform row gates the mock server on `phase:scaffold`; #16 puts the Tool registry's scenarios in `phase:test-harness`. Recommendation: the executor waits on `phase:test-harness` (§6), and the spec's line is corrected. Record in the executor ticket.
18. **(N) Form renderer before files.** The spec's form-renderer blocked-by line omits #20 `phase:files`; #26 includes it. Recommendation: follow #26, with a fake entity list until then.

## 8. Driver brief
Goal: implement the Scriba Tool registry (#21). One YAML tool spec yields the function schema, form, port descriptor and Ajv validator. A pure executor returns `{output, sourcesUsed}`. Read the spec's Solution, Implementation Decisions, Phases and Testing Decisions, and the map decisions #3, #4, #6, #7, #8, #10 and #15. The registry never writes project files, and GET never mutates. Test through HTTP, SSE and the rendered UI only. Stub as §4 and §6 say, and work the phases in order. Use GLOSSARY terms (Tool node, Wire, Input node, Output node, Recipe, Pending change); a tool call is not a Run. Inputs are JSON Schema, not Zod (#7); the envelope's Zod status is Open question 1. No pack content beyond test fixtures (#22 owns it).

Stop and ask the owner: before phase:contract, for 1, 2, 3, 10, 12, 13, 14 and 16; before phase:loader-validation, for 4, 6 and 15; before phase:executor, for 11; before phase:editor-ui, for 9; and after the spike, for any vocabulary change. Hold editor-ui's last AC until #22 `phase:nonfiction-workhorses` ships. Apply 5, 7, 8, 17 and 18 without stopping, and record them in the phase tickets. Never edit other modules' code except the additive registrations in §2.
