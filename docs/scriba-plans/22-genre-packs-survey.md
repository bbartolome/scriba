# Genre packs (#22) survey

## 1. Approach

- Packs are YAML plus tests, with no runtime code (Implementation Decisions > Pack layout and shipping). Vitest runs #21's pack-lint step.
- Consume the wave-1 contracts (#20, #21, #23, #24) without copying them. Only two stubs exist: the #25 `TK` constant and the provenance builder (§4).
- Build a tracer bullet first: pack lint plus one `propose_graph` golden (Further Notes: the M2 critical path).
- Common inputs must match across draft tools (CI). Goldens run through `POST /api/tools/:name/execute`, with the test resolving entities (#21).
- The spec's kebab-case names fail #21's rule (lower snake case). Amend them before P1 (S0).

## 2. Files and modules

- `packages/packs/package.json`: workspace member with a test script. The root workspaces entry is Platform's (#3).
- `packages/packs/{core,nonfiction,fiction}/tools/<name>.yaml`: 24 tool specs, snake_case names (S0).
- `packages/packs/{core,nonfiction,fiction}/entity-types/<kind>.yaml`: envelope `{schemaVersion, kind, title, description, fields}`. `title` needs #21 (O12). Kinds: `source`, `style-profile`, `person`, `claim`, `concept`, `character`, `place`, `world-rule`.
- `packages/packs/test/pack-lint.test.ts` and `test/fixtures/broken/*.yaml`: the CI suite and its broken fixtures.
- `packages/packs/test/common-inputs.test.ts`, `remix-shapes.test.ts`, `golden/<name>.test.ts` with `__golden__/` snapshots, and `test/fixtures/` entities. Unit tests never read `examples/` (#13).
- `deploy/Dockerfile`: Platform's file, narrowed on our ask (O9). This module does not edit it.
- `e2e/fixtures/mock-openai/`: per-tool fixtures. Platform owns the server.
- `examples/nonfiction/entities/*.md` and `examples/fiction/` (project, entities, three drafts, two graphs). Project store owns `examples/` and the skeleton (#13, #20).
- `apps/api/test/samples.test.ts`: sample and start-from-sample checks (§5).

## 3. Phase plan

P1 and P2 are wave 1. P3 and P4 are wave 3 (#26). Each phase is one `/navigator:pair` session that ends at its list below.

Stops:
- **S0, before P1 (owner):** amend #22 to snake_case tool names and `entity-types/<kind>.yaml`. Use `x-scriba-entity-kinds` and `{{toolCatalog}}`. Assert `TOOL_ARGS_INVALID`. Confirm `style-profile` and `world-rule` as kinds, and Q1 and Q3 as checked in §7. Settle O2, O8, O9, O10, O11 and O12.
- **S1, before P1 goldens:** confirm the `TK` placeholder (Q8).
- **S2, after P2:** hold P3 until #24 `phase:canvas` and #25 `phase:assembly-preflight` merge.
- **S3, before P3 and P4:** settle O3, O4, O6 and O7.
- **S4, before P4:** settle O5.

**phase:core-propose-graph** (wave 1)
- Work: workspace scaffold; `source` and `style-profile` types; pack lint with broken fixtures; golden harness; `propose_graph` with story and recipe prompts and `{{toolCatalog}}`.
- Done when (Acceptance criteria): pack lint fails the broken fixtures. `propose_graph` validates, and a call without `view` returns `TOOL_ARGS_INVALID`. Both-view goldens parse against the Graph runner's schema. `GET /api/tools` lists `propose_graph`. The unwritable-image check is a closing ticket, open until #16 `phase:ci-publish` merges (O9). `ci.yml` builds no image.
- Blocked by: #21 `phase:contract`, `phase:loader-validation` and `phase:executor`; #24, #20 and #23 `phase:contract`; #16 `phase:image-compose`. The closing ticket also needs #16 `phase:ci-publish`.
- First test: pack lint rejects `broken/bad_output.yaml`. Then a `propose_graph` call without `view` returns `TOOL_ARGS_INVALID` with an issue at path `view`.

**phase:nonfiction-workhorses** (wave 1)
- Work: `person`, `claim` and `concept` types; four workhorse YAMLs on one skeleton; mock fixtures; goldens; five sample entities; a check that skeleton sources carry the O2 fields.
- Done when (brief M2): each workhorse's draft cites its source files, checked in CI through `sourcesUsed` and draft provenance (builder stubbed). The manual `[@id]` check waits on the Agent loop. Also: common inputs are identical; sample entities validate and their references resolve (`samples.test.ts`); the examples check excludes `.scriba/`, `logs/`, `snapshots/` and `drafts/.versions/` (user stories 41–42). The PR states sample text provenance. Demo steps run once Agent loop M2 lands.
- Blocked by: P1; #21 `phase:contract`; #20 `phase:files`; #16 `phase:examples-check`; #23 `phase:contract` (provenance type).
- First test: the `cold_open` golden. The prompt holds `person` with its ID, the citation and placeholder instructions. `sourcesUsed` equals the entity references resolved from its entity-typed inputs (#21), which are not Source entities unless `entityIds` names them (O10).

**phase:fiction** (wave 3)
- Work: `character`, `place` and `world-rule` types; five tools; the fiction sample.
- Done when (brief M6): `dialogue` keeps each voice distinct and respects relationship notes (manual eval waits). Also: all five pass lint; pack lint fails unknown entity kinds on every tool (#21 lines 111, 197); `ruleIds` takes `place` and `world-rule`; in `samples.test.ts`, every story-node `path` exists, two scene nodes share `drafts/arrival.md`, one label-only beat and one file-backed beat exist, and start-from-sample order is `arrival.md`, `the-storm.md`, `ledger.md`. Demo steps run.
- Blocked by: P2; #24 `phase:canvas`; #25 `phase:assembly-preflight`; #20 `phase:files`; #16 `phase:examples-check`.
- First test: `dialogue` with one `characterIds` entry returns `TOOL_ARGS_INVALID` at path `characterIds`. Then the golden: the prompt holds both characters' `voice` and relationship notes, plus the distinct-voice instruction.

**phase:remaining-shapes** (wave 3)
- Work: `throughline_check` and `remix` enabled; twelve tier 2–3 shapes with `enabled: false`; Remix enum and one prompt line per shape; 14 goldens; manual evals (waits).
- Done when (Acceptance criteria): all 14 pass lint, and their 14 goldens pass. Two are enabled and twelve are not. The Remix enum matches the shipped draft tools (CI). Enabling a shape with `PUT /api/tools/:name/enabled` makes it callable and a canvas node (O11). Demo steps run.
- Blocked by: P3; #21 `phase:loader-validation`.
- First test: `remix-shapes.test.ts` fails when a draft tool is added without updating Remix's enum.

## 4. Contracts

**Exposes** (spec names; tool names as amended in S0):
- Pack folders `core`, `nonfiction`, `fiction` at `/opt/scriba/packs/`. `SCRIBA_PACKS_DIR` is #16's variable.
- The 24 catalogue tool names. Input keys stay camelCase and verbatim.
- Entity kinds and fields from Entity types, in `entity-types/<kind>.yaml`.
- Hint names used by the packs: `x-scriba-type`, `x-scriba-port`, `x-scriba-entity-kinds`, `x-scriba-control` (#21).
- Citation form `[@id]`.

**Consumes** (consume, do not copy):
- #21 `phase:contract`: tool-spec envelope (Zod), hint vocabulary, port and output enums, `POST /api/tools/:name/execute` returning `{output, sourcesUsed}`, and errors `TOOL_ARGS_INVALID` (issues `{path, message}`), `TOOL_ENTITY_UNRESOLVED` and `TOOL_ENTITY_KIND_MISMATCH`.
- #24 `phase:contract`: graph file schema, story-node fields, recipe node shape, port ids and relations.
- #20 `phase:contract`: entity front-matter base `{id, type, links?}`, entity reference, file reference, and `project.yaml` with its optional `styleProfile` ref.
- #23 `phase:contract`: the draft provenance type `{runId, toolCallId, tool, entityIds, sourcesUsed, model, at}`.
- #16 Platform: scaffold, CI, Dockerfile, image smoke, mock OpenAI server, examples check.

**Stubs** (test-only; the only two):
- The #25 placeholder constant: `TK` and unrendered `{{…}}` (#25 line 187), until #25 `phase:contract` merges.
- The provenance builder, until #23 `phase:narrative-tools` merges. Only the builder is stubbed; the type is consumed.

## 5. Test strategy

- **Unit** (Vitest, `packages/packs/test/`): pack lint (#21), with unknown entity kinds made failures for every tool; Ajv compile of inputs; descriptions of one line, at most 120 characters, starting with a verb; common-input identity; the Remix enum; template parse.
- **Integration** (Vitest): one golden per tool through `POST /api/tools/:name/execute` against the mock OpenAI server, plus `TOOL_ARGS_INVALID` cases. `samples.test.ts` reads `examples/` and runs the checks #16's examples check omits (entity types, references, story-node paths, shared file, both beats, fiction order). Alternatively, #16 extends `phase:examples-check` (owner choice).
- **E2E:** none added. The nonfiction sample paths stay fixed (#13).
- **Manual eval:** the Agent loop owns the eval script (#16 line 495, #23). Each done-when's manual half waits on it.
- **Image check:** this spec's test, run in #16 `phase:ci-publish`'s image smoke jobs (#16 line 480). `ci.yml` builds no image.

## 6. Dependencies

- Before P1: #16 `phase:scaffold` and `phase:image-compose`; #21 `phase:contract`, `phase:loader-validation` and `phase:executor`; #24, #20 and #23 `phase:contract`. The P1 closing ticket also needs #16 `phase:ci-publish`. #26's gate row omits these (map gap).
- P2: P1; #21 `phase:contract`; #20 `phase:files`; #16 `phase:examples-check`; #23 `phase:contract`. The Agent loop is not a blocker (#26 keeps wave 1 free of wave 2).
- P3: P2, plus the S2 wait on #24 `phase:canvas` and #25 `phase:assembly-preflight`.
- P4: P3 and #21 `phase:loader-validation` (the enable endpoint).
- Stubs: §4 only. Wave 3 waiting on wave 2 is by design (#3 wave table).

## 7. Open questions

**Settled or checked:**
- Q1, Zod: #21 line 229 publishes the envelope in Zod and line 380 keeps inputs JSON Schema. The spec's line stays; #7's wording is a gap.
- Q3, `/genre-packs`: keep it empty (#16 line 99; #25 line 432). #3's publish-slice rule is a wording gap for a content module.
- Q4, filters: `x-scriba-entity-kinds` is a list (#21 line 111). Absent means any.
- Q7, `sourcesUsed`: #21 line 160. Entity references from entity-typed fields, style excluded, no one-hop.
- Q8, placeholder: #25 line 187 (`TK`, `{{…}}`). Prompts emit `TK` (S1).
- Q9, golden surface and Input values: `POST /api/tools/:name/execute`, with the caller resolving (#21 line 383). Entity inputs are lists and style is one ref (#24 line 341).
- Q11, claim status: #23 lines 140 and 407. Verdicts stay in `logs/`; status is author data.
- Q15 and Q16: `SCRIBA_PACKS_DIR` (#16 lines 93, 182) and the optional `styleProfile` ref (#20 lines 117–120).

**Open (owner decisions):**
- **O2, Source front matter (CONFLICT, map #13):** the spec has this module add front matter to skeleton sources, but #13 gives the skeleton to Project store. Amend #22 (nonfiction scope, Samples bullet) and #20 (Samples, lines 195–197), agreeing field names with #20 first. Fields: `id`, `type: source`, `title`, `citation`, `url`, `reliability` (the spec's Source row). This module edits no skeleton file.
- **O3, nested `relationships`:** #21 bans nested objects (line 104). Recommend flat character refs in front matter and the notes in the body, which `{{entity id}}` still renders (#21 line 144).
- **O4, dialogue `coreIdea`:** #24 line 140 refuses a required port with no wire or pinned value. Recommend a text Input node "Core idea" wired to `dialogue.coreIdea`. Amend the fiction recipe.
- **O5, Remix (Q6):** Remix never calls another tool. Its enum is the 17 shipped draft tools except `remix`, fiction tools included, with one prompt line each.
- **O6, common inputs (Q5):** `coreIdea` is required on draft tools and optional on `world-builder`, as its row says. Remix declares all five.
- **O7, new entity IDs (Q12):** #23 line 128 routes `entity` outputs to `entities/` with no ID rule. Recommend Project store assigns IDs; prompts never invent them. Ask #20 and #23.
- **O8, catalogue scope:** `{{toolCatalog}}` lists enabled tools (#21 line 145), not the project's pack. Recommend the caller passes the project-filtered list (#21 line 89). Ask #21 to add `{{toolCatalog}}` to `phase:executor`'s scope, which omits it.
- **O9, image copy and smoke:** narrow the Dockerfile copy to `tools/` and `entity-types/` (§2). Ask Platform to change #16 line 196 in `phase:image-compose`, and to add the unwritable check to `phase:ci-publish`'s image smoke jobs. This module does not edit the Dockerfile.
- **O10, sources wording (CONFLICT, map #7 vs Q7):** the spec's "sources derived from the input entity IDs" conflicts with #21's entity-reference rule. Amend the P2 golden to "entity references".
- **O11, enable path (CONFLICT, spec vs #21):** the spec enables a shape through a copy-on-write user-pack copy. #21 line 167 says toggling never creates a fork, and uses `PUT /api/tools/:name/enabled`. Amend the #22 criterion.
- **O12, envelope title (CONFLICT, spec vs #21):** #21 line 138 gives the envelope no `title`, but #22 line 105 requires one. Ask #21 to add a root `title`. It cannot go in `fields`, where `title` is the Source property name.

**Map conflicts:** #13 (O2); #7 (O10); #21 (O11, O12); #26 gate row (§6). #7 pure templates: #21 and #23 agree, so my registry-resolves idea is withdrawn. The #3 Agent-loop-M3 wait is dropped.

## 8. Driver brief

Genre packs is YAML tools and entity-type envelopes under `packages/packs`, with tests and no runtime code. Run four `/navigator:pair` sessions in §3 order, holding at S2. Clear the stops first. Tool names are snake_case and input keys camelCase, both stable. Stub only `TK` and the provenance builder. Use GLOSSARY terms. Prompts cite `[@id]`, leave `TK` rather than invent facts, and never list the model's sources. Do not edit GitHub issues; send O2, O9 and O12 to the owner.
