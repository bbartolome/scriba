# #21 Tool registry: implementation survey

## 1. Approach
- One parsed tool spec is the only source. At load the catalog derives the function schema, form descriptor, port descriptor and Ajv validator, and caches them (Solution; Emission).
- Parser, lint, emitters and renderer are pure. Lint and render share one template parser (Template subset).
- Contract first (#3). Then the form-renderer spike tests the `x-scriba-*` vocabulary before the loader, lint and editor depend on it (Further Notes).
- The executor takes validated arguments and caller-resolved entities, calls the model, and returns `{output, sourcesUsed}`. It never writes files (Tool executor).
- The catalog reads disk on demand: built-ins at startup, user pack rescanned by `(path, mtime, size)` manifest before each call (Pack layout and loading).

## 2. Files and modules
Paths from the scriba repo root; folder names follow #4's `<m>` rule.
- `packages/contracts/src/tool-registry/`: contract slice (subpath pre-created by Platform, #3).
- `apps/api/src/modules/tool-registry/`: `tool-registry.module.ts` (Nest `@Module`), `tool-registry.controller.ts` (`/api/tools`, behind the guard).
- `.../catalog/`: `catalog.service.ts`, `pack-loader.ts` (precedence, rescan, refusal, duplicate names, migration hook), `offering.ts`, `active-project.ts` (real reader gated on #20 `phase:files`).
- `.../spec/`: `tool-spec.ts`, `entity-type.ts`, `emit.ts`, `lint.ts` (positions via `yaml` LineCounter; block scalars make this bigger than it looks), `args-validate.ts` (Ajv over stripped `parameters`, since strict mode rejects unknown `x-` keywords).
- `.../template/template.ts`: one parser and renderer for lint and render, with `{{toolCatalog}}`.
- `.../executor/` (`executor.service.ts`, `system-messages.ts`); `.../settings/tools-section.ts`; `.../events/catalog-events.ts`.
- `packages/packs/`: read by the loader. No folders created here; #22 and #16 own content and the copy step.
- `apps/api/test/fixtures/packs/`, `apps/api/test/tool-registry/`: fixture packs, cold-open fixture, integration tests.
- `apps/web/src/app/features/tool-registry/`: `routes.ts` (lazy `Routes`; one entry in Shell's route table), `tool-form/` (both layouts, pickers), `tools-page/` (list, detail, YAML editor with `@codemirror/lang-yaml` and `@codemirror/lint`, previews, Try panel), `api/` (typed client, SSE).
- `e2e/fixtures/mock-openai/`: our scenarios, added to #16's server (Platform's folder).
- `.github/workflows/ci.yml`: pack-lint step (Platform's job).

## 3. Phase plan
**phase:contract** (M2)
- Work: publish the slice: envelope (Zod, `inputs` opaque), constants, enums, shapes, `toolCatalog` entry, `sourcesUsed` item, error codes, routes, SSE member.
- Done when: Phases › phase:contract › Acceptance criteria.
- First test: the output enum equals `draft, entity, claims, graph, check`; `video` is rejected; a cold-open-shaped envelope parses (Open question 1).

**phase:form-renderer** (spike)
- Work: emit form, port and function schemas; fixture-backed `GET /api/tools/:name`; full-mode validate; Angular form renderer in both layouts; dev preview route.
- Done when: Phases › phase:form-renderer › Acceptance criteria (five items).
- First test: fixture fields come back in declared order, and function `parameters` has no `x-` key and passes Ajv's draft-07 meta-schema.
- Also: entity and style descriptions carry the plain kind hint; style fields are never required.

**phase:loader-validation**
- Work: pack loader (precedence, rescan, invalid-copy fallback, `schemaVersion` refusal and hook, duplicate built-in names as a load error); entity-type schema loading and validation (`schemaVersion`, `kind`, `description`, `fields`); full lint; offering rule (core, `project.yaml` genre pack, user pack; enabled and valid) for `functions` and `toolCatalog`; list, get, builtin, lint, save, delete, enabled and entity-types endpoints (`functions` and `entity-types` declared before `:name`); `tools` settings; `params` validate; `catalog-changed`; CI pack-lint over tool specs and entity-type schemas. Split into about six tickets.
- Done when: Phases › phase:loader-validation › Acceptance criteria (eight items).
- First test: with fixture packs, `GET /api/tools` lists core, genre and user tools; a user file named like a built-in replaces it, and deleting it restores the built-in.
- Also: a fiction tool is absent from a nonfiction project's `functions` (Stories 34, 35); a fixture entity type is listed; a kind in `x-scriba-entity-kinds` that no schema declares gives a lint warning; a broken entity-type fixture fails pack-lint; two built-ins with one name fail load.

**phase:executor**
- Work: template subset with `{{toolCatalog}}`; render and execute endpoints; entity and kind checks; one system message per output kind; provider call with abort, on the active project's model; `sourcesUsed`; refusals; a plain-completion mock scenario.
- Done when: Phases › phase:executor › Acceptance criteria (five items).
- First test: `POST /api/tools/:name/render` with two resolved people in an `#each` returns each header and content; an empty optional field renders nothing.
- Also: `toolCatalog` render test (offered, enabled tools only; name, one-line description, port keys and types, output kind); `TOOL_MODEL_ERROR` keeps the provider message; `graph` output loses its one code fence.

**phase:editor-ui**
- Work: list with toggles and phone view; YAML editor with save lint and debounced live lint; Customize, Revert, Compare (stubbed until M3, Open question 9), New, Duplicate, Delete; previews; Try panel; live refresh.
- Done when: Phases › phase:editor-ui › Acceptance criteria (six items; the last waits on #22, §6).
- First test: a Vitest component test with a fake client: a save with errors shows diagnostics on the right lines and keeps the previous version active.

## 4. Contracts
- **Exposes** `@bbartolome/scriba-contracts/tool-registry`: envelope, `schemaVersion`, `x-scriba-*` keys and controls, enums, output port key, port, form and function-schema shapes, entity-type envelope, lint result, endpoint request and response shapes, `toolCatalog` entry, error codes, routes, `catalog-changed`.
- **Exposes** `{output, sourcesUsed}`, where `sourcesUsed` items are `{id, type, path}` (Open question 12). The resolved-entity input is #20's `{id, type, path, content}` (20.md:133).
- **In-process:** catalog and executor services. Not a contract: the tool-form component.
- **Consumes Platform (#16):** `/platform` error base, SSE envelope, `SCRIBA_PACKS_DIR`, settings envelope and hook. Stub: none.
- **Consumes Project store (#20):** entity reference (string ID), resolution result, entity list filterable by `type` (20.md:134), `project.yaml` `genrePack`, `styleProfile`, `model`. Stub on the branch with local types until #20's contract merges; active project: fake resolver until `phase:files`.
- **Consumes Model providers (#19):** `/providers` model choice and the provider client. Stub on the branch: a fake `ModelClient`; the executor merges only after the client phase.
- **Consumes Setup & auth (#18):** the guard. Stub: pass-through guard; add a 401 test when `phase:token-guard` lands.
- **Consumes Shell (#17):** `phase:core` fake API and SSE clients, reused. The editor is the registry's own CodeMirror 6 YAML instance (Open question 9).

## 5. Test strategy
- **Integration (most tests):** Vitest with NestJS via `unplugin-swc`. Boot the module behind a pass-through guard, with a temp library, `SCRIBA_PACKS_DIR` at fixture packs and #16's mock OpenAI server. Assert HTTP responses, files in `packs/user/tools/` and the `tools` section, `catalog-changed` on SSE, and zero mock requests after a rejected call. Supertest is my pick.
- **Unit:** only phase:contract shape tests; the spec forbids parser, loader and emitter tests.
- **UI:** Vitest with Angular's runner and #17's fake clients.
- **E2E:** none owned here; Agent loop adds a registry call at M2.
- **CI:** pack-lint is checked with broken tool, broken entity-type and duplicate-name fixtures.

## 6. Dependencies
Marks: "contract gate" (per #3) or "implementation gate" (deviates from #3, per #26). "Stub" is the stand-in until the gate passes.
- #16 `phase:scaffold` and `/platform` slice → our phase:contract: contract gate; no stub. (21.md:351 files the mock server under `phase:scaffold`; #16 puts it in `phase:test-harness`.)
- #16 `phase:test-harness` (16.md:359, 467) → executor and §5 integration: implementation gate; no stub.
- #20 `phase:contract` → our phase:contract: contract gate; stub on branch. #20 `phase:files` → form-renderer (dev picker) and editor-ui (Try panel): implementation gate; fake entity list and active project.
- #19 `phase:contract` → executor: contract gate + stub (local model-choice type). #19 `phase:client` → executor: implementation gate + stub (fake `ModelClient`).
- #18 `phase:token-guard` → loader-validation: implementation gate; pass-through guard.
- #17 `phase:core` → form-renderer: implementation gate; no stub (fake clients ship in core). #17 `phase:shared-components` (M3 diff) → editor-ui Compare: implementation gate; Compare stubbed. #17 `phase:editor` (M3) → editor-ui (M2): implementation gate, conflicts with #26; Open question 9. #26's "#21 UI phases" row applies to editor-ui only, because the form renderer uses no editor.
- #22 `phase:nonfiction-workhorses` → our phase:contract: contract gate (#26 table). Its gate on editor-ui's last criterion and the demo: implementation gate.
- #22 `phase:core-propose-graph` golden tests → our loader-validation and executor (22.md:188): implementation gate.
- #23 `phase:narrative-tools` → our contract and executor (23.md:249): implementation gate on the M2 critical path.
- Downstream, on us: #24 `phase:engine` (loader-validation, executor), #24 `phase:canvas` (form-renderer), #16 `phase:examples-check` (loader-validation): implementation gates.
- Reverse: #19 `phase:client` (M1) needs our M2 contract; Open question 10.

## 7. Open questions
1. **Zod against map #7 (owner).** #7 says "No Zod for tool specs"; #3 makes contracts TS + Zod, and #22 uses Zod for the spec shape (22.md:287). Recommendation: a Zod envelope with `inputs` opaque (lint and Ajv check it; no `z.toJSONSchema`), keeping the spec's Zod tests. Owner confirms before phase:contract.
2. **Migration (map #7 vs spec).** #7 migrates project files lazily, with a backup and a `logs/` entry; the spec migrates in memory and writes back only on save. Recommendation: follow #7 with a backup under `/books/.scriba/`; skip `logs/`. Owner confirms before phase:contract.
3. **Phase order (map #7 vs spec).** #7 calls the form renderer first; #3 requires contract first. Keep the spec's order.
4. **GET never mutates (#6).** A GET can rescan and fire `catalog-changed`. Recommendation: the rescan updates memory only; a test checks that GET leaves files and `settings.yaml` byte-identical. Owner confirms before loader-validation.
5. **Mock fixture.** phase:executor says "for a tool call", but execute sends no `tools`. Recommendation: a plain-completion scenario in #16's format.
6. **`genrePack` (entity list answered).** #20 publishes the entity list (20.md:134). #20 also lets `genrePack` name "a user pack" (20.md:124), which breaks the offering rule. Recommendation: raise with #20; `genrePack` names built-in packs only.
7. **Style default.** The executor renders no style when none is given; callers and the Try panel fill the project's style-profile ref.
8. **Live lint.** #7 says lint on save; the spec adds debounced live lint. Keep both; only save blocks.
9. **Editor host (stop point, owner).** #17 `phase:editor` is M3, Markdown-only, and saves through the file API (17.md:210–211); Compare needs the M3 diff. Options: (a) the registry hosts its own CodeMirror 6 YAML instance and stubs Compare until M3; (b) move #21's M2 completion and update #26. Recommendation: (a); the registry saves through its own PUT endpoint.
10. **#19 client needs our contract (stop point).** #19 `phase:client` (M1) consumes our function-schema shape (19.md:246). Recommendation: #19 types `tools` locally as an OpenAI function-tool shape. Owner confirms, with #19, before phase:contract.
11. **Scope gaps and a narrowing.** `{{toolCatalog}}` is in the Template subset and #22 needs it (22.md:162), but phase:executor omits it. The offering rule (Stories 34, 35) is in no phase. The spec says "currently enabled tools" (21.md:150; 22.md:162); I narrowed this to offered and enabled tools without asking. Recommendation: owner accepts both.
12. **`sourcesUsed` item shape (stop point).** The spec says "a list of entity references" (21.md:165), but #20's entity reference is a bare string ID (20.md:132). The tool-call card shows source paths (17.md, `phase:shared-components`), and #23 records them. Recommendation: `{id, type, path}`, style excluded. Owner confirms with #23 before phase:contract.

## 8. Driver brief
Goal: implement the Scriba Tool registry (#21). One YAML tool spec yields a function schema, a form descriptor, a port descriptor and an Ajv validator, and a pure executor returns `{output, sourcesUsed}` through the providers client. Read the spec's Solution, Implementation Decisions, Phases and Testing Decisions, and the map decisions it cites (#3, #4, #6, #7, #10). The registry never writes project files, and GET never mutates. Test through HTTP, SSE and rendered UI only. Stub as §4 and §6 say; never edit #16 to #20 code. Use GLOSSARY terms (Tool node, Wire, Input node, Output node, Recipe, Pending change); a tool call is not a Run. No Zod for tool inputs, and no pack content beyond test fixtures (#22 owns it). Work the phases in order. Stop and ask the owner only: before phase:contract, for 1, 2, 10 and 12 (12 also needs #23); before loader-validation, for 4; after the spike, to record its note and approve any vocabulary change; before editor-ui, for 9; and before editor-ui's last criterion, until #22 `phase:nonfiction-workhorses` ships. Apply the recommendations for 3 and 5 to 8 without stopping; record 11 in the phase tickets for owner review; and send the `genrePack` point in 6 to #20.
