# Genre packs (#22) survey

Round-4 revision (README row). Checked against spec #22, map #1 (decisions #1 to #15), tracker #26, and sibling surveys #16, #20, #21, #23, #24 and #25. Re-review is still needed. No app code is tracked (`git ls-files` has no `packages/`, `apps/`, `examples/`, `e2e/` or `deploy/`), so every path below is to be created unless noted.

## 1. Approach

- Packs are YAML plus tests, with no runtime code (spec, Pack layout). Vitest runs #21's pack-lint step.
- Consume the wave-1 contracts (#20, #21, #23, #24) without copying them. Only two stubs exist (§4).
- Build a tracer bullet first: pack lint plus one `propose-graph` golden (spec, Further Notes: the M2 critical path).
- Goldens run through `POST /api/tools/:name/execute`, with the caller resolving entities (#21 lines 182, 383).
- 24 tools: 3 in `core`, 16 in `nonfiction`, 5 in `fiction`. Twelve are enabled (propose-graph, the four workhorses, the five fiction tools, throughline-check, remix). Twelve ship disabled.
- The spec's kebab-case tool names fail #21's lower snake case rule (#21 line 93). Owner decision O1, before P1.

## 2. Files and modules

- `packages/packs/package.json`: workspace member with a test script. The root workspaces entry is #16's.
- `packages/packs/{core,nonfiction,fiction}/tools/<name>.yaml`: 24 tool specs. File and function names use snake_case [proposed, O1]; the spec's kebab-case names stay in prose.
- `packages/packs/{core,nonfiction,fiction}/entity-types/<kind>.yaml`: envelope `{schemaVersion, kind, title, description, fields}`. The folder is #21's (line 83). `title` needs O10. Kinds: `source` and `style-profile` (core); `person`, `claim`, `concept` (nonfiction); `character`, `place`, `world-rule` (fiction).
- `packages/packs/test/`: `pack-lint.test.ts`, `common-inputs.test.ts`, `remix-shapes.test.ts`, `golden/<name>.test.ts` with `__golden__/` snapshots, `fixtures/broken/*.yaml`, and test-only entities [all proposed names]. Unit tests never read `examples/` (#13).
- `apps/api/test/samples.test.ts` [proposed]: sample and start-from-sample checks (§5). It reads `examples/`, which O14 addresses.
- Dockerfile: #16's file. This module supplies the pack copy, narrowed to `tools/` and `entity-types/` (O7). It does not edit the Dockerfile.
- `e2e/fixtures/mock-openai/`: per-tool fixtures. #16 owns the server.
- `examples/nonfiction/entities/*.md`: five entities (one `person`, two `claim`s, one `concept`, one `style-profile`). The skeleton, including `sources/` and `drafts/`, is #20's (#13). The nonfiction recipe is #24's (`phase:canvas`), not ours.
- `examples/fiction/`: `project.yaml`, `entities/` (five files), `drafts/` (three files), `graphs/` (story graph and recipe).
- The unwritable-image check goes into #16's image smoke jobs (`deploy/smoke/image-smoke.sh`, per #16's survey). It is not a file here.

## 3. Phase plan

P1 and P2 are wave 1. P3 and P4 are wave 3 (#26). Each phase is one `/navigator:pair` session that ends at its acceptance list. Phase names are the spec's, verbatim.

Stops, each an open item in §7:
- Before P1: O1, O6, O10, O11, O16. The `TK` stub is settled and stays until #25 `phase:contract` merges.
- Before P2: O2, O8, O14.
- Before P3: O3, O4, O5, O12, O15.
- Before P4: O9, O13.
- P1's closing ticket: O7.

**phase:core-propose-graph** (M2, wave 1; first demoed at M4, polished in M7)
- Work: `packages/packs` scaffold; `source` and `style-profile` types; pack-lint suite with broken fixtures; golden harness and fixture convention; `propose-graph` with story and recipe prompts and `{{toolCatalog}}`; image copy step.
- Done when: pack lint runs on every push and fails the five broken fixtures (bad output kind, unknown hint, template naming an undeclared input, duplicate name, multi-line description). `propose-graph` validates. A call without `view` returns `TOOL_ARGS_INVALID` with an issue at `view` (the spec says "Ajv error"; O1 aligns the wording). Both-view goldens parse against the Graph runner's schema and match their checked-in prompt goldens. `GET /api/tools` lists `propose-graph` from `core`.
- Closing ticket (O7): the built image contains `/opt/scriba/packs/core`, and the app user cannot write to it. Open until #16 `phase:ci-publish` merges.
- Blocked by: §6.
- First test: pack lint rejects `fixtures/broken/bad_output.yaml` [proposed]. Then a `propose-graph` call without `view` returns `TOOL_ARGS_INVALID` with issue path `view`.

**phase:nonfiction-workhorses** (M2, wave 1)
- Work: `person`, `claim` and `concept` types; `cold-open`, `mystery-question`, `myth-buster` and `numbers-to-people` on one prompt skeleton with the five common inputs; mock fixtures; goldens; manual eval cases; five sample entities; Source front matter on skeleton sources if missing (O2).
- Done when: all four pass pack lint, and their common inputs are identical. Each golden's rendered prompt holds every input entity with its ID, the citation rule and the placeholder instructions. `sourcesUsed` equals the entity references from entity-typed inputs (O8). Sample entities validate and every reference resolves (`samples.test.ts`). The examples check excludes `.scriba/`, `logs/`, `snapshots/` and `drafts/.versions/` (spec user stories 41 and 42). CI checks `sourcesUsed` and draft provenance with the builder stubbed. The PR states sample text provenance. The manual `[@id]` check waits on the Agent loop. Demo (under five minutes, needs #23's M2 phase): cold open from the nonfiction sample in chat, tool card, pending change with `[@id]` citations, Myth-buster, reject both.
- Blocked by: §6.
- First test: the `cold_open` golden. Its prompt holds the `person` with its ID, the citation and the placeholder instructions. `sourcesUsed` equals the entity references from entity-typed inputs, not Source entities unless `entityIds` names them.

**phase:fiction** (M6, wave 3)
- Work: `character`, `place` and `world-rule` types; `character-builder`, `scene-builder`, `dialogue`, `plot-manager` and `world-builder`, with goldens, mock fixtures and manual eval cases; the whole fiction sample. `project.yaml` has `genrePack: fiction`, a style profile ref and no `order`. It also has five entities, three drafts, a story graph and a recipe.
- Done when: all five pass pack lint. Every entity input names an existing type as its filter, and `ruleIds` takes `place` and `world-rule`. The Dialogue golden prompt holds both characters' `voice` and relationship notes, plus the distinct-voice instruction. One character returns `TOOL_ARGS_INVALID` at `characterIds` (the spec says "fails Ajv"). The fiction sample validates against the graph schema, `project.yaml`, the entity types and the recipe's tool references. Every story-node `path` exists. Two scene nodes share `drafts/arrival.md`. There is one label-only beat and one file-backed beat. Start-from-sample manuscript order is `arrival.md`, `the-storm.md`, `ledger.md`. The manual voice eval (small and larger model) and the six-step author demo run.
- Blocked by: §6.
- First test: `dialogue` with one `characterIds` entry returns `TOOL_ARGS_INVALID` at `characterIds`. Then the Dialogue golden.

**phase:remaining-shapes** (M7, wave 3)
- Work: `throughline-check` and `remix` enabled; twelve tier 2–3 shapes with `enabled: false` (named-concept, comparison-set, objection-handler, contrast, profile, zoom, reader-challenge, framework-builder, method-first, timeline, flashback, stockdale-tension); Remix `targetShape` enum with one prompt line per shape; 14 goldens; the Remix enum check; manual evals (wait).
- Done when: all 14 pass pack lint and their goldens pass. Twelve are disabled and two enabled. Remix's enum matches the 17 shipped draft tools, and CI fails otherwise. `PUT /api/tools/:name/enabled` makes a disabled shape callable and a canvas node (O9). The four-step demo runs, including Throughline check on a chapter with one drifting paragraph and Remix of a cold open (O13).
- Blocked by: §6.
- First test: `remix-shapes.test.ts` fails when a draft tool is added without updating Remix's enum.

## 4. Contracts

**Exposes** (spec names; tool names as amended by O1):
- Pack folders `core`, `nonfiction` and `fiction` at `/opt/scriba/packs/`, read by the Tool registry. `SCRIBA_PACKS_DIR` is #16's variable (#16 lines 93, 182).
- The 24 tool names and camelCase input keys. Saved recipes address ports as `<nodeId>.<key>`.
- Entity kinds and fields in `entity-types/<kind>.yaml`. Compile & export reads `source` citation and URL fields and the style profile's banned phrases (#25).
- Hint names: `x-scriba-type`, `x-scriba-port`, `x-scriba-entity-kinds` (a list, #21 line 111) and `x-scriba-control`.
- Citation form `[@id]`. Recipe port keys follow #26's convention: a tool's output is `output`, input nodes use `out` and output nodes use `in`. The propose-graph prompt uses these.
- Sample content: nonfiction entities (M2) and the fiction project (M6), in `examples/` (#13).

**Consumes** (consume, do not copy):
- #21 `phase:contract`: tool-spec envelope (Zod), hint vocabulary, port-type enum `text | entity | style`, output enum, template helper set including `{{toolCatalog}}`, `POST /api/tools/:name/execute` returning `{output, sourcesUsed}`, and errors `TOOL_ARGS_INVALID` (issues `{path, message}`), `TOOL_ENTITY_UNRESOLVED` and `TOOL_ENTITY_KIND_MISMATCH`.
- #24 `phase:contract`: graph file schema, story-node fields, recipe node shape `{id, kind, position, tool?, params?}`, port ids, relations.
- #20 `phase:contract`: entity front-matter base `{id, type, links?}`, entity reference, file reference, and `project.yaml` with its optional `styleProfile` ref.
- #23 `phase:contract` (P2 only): draft provenance `{runId, toolCallId, tool, entityIds, sourcesUsed, model, at}`.
- #16: scaffold, image-compose, ci-publish, examples-check, and the mock OpenAI server.

**Stubs** (test-only; the only two):
- The #25 placeholder constant: `TK`, `TKTK`, `TODO`, `FIXME`, `XXX` and unrendered `{{…}}` (#25 line 187), until #25 `phase:contract` merges.
- The provenance builder, until #23 `phase:narrative-tools` merges. Only the builder is stubbed; the type is consumed.

## 5. Test strategy

- **Unit** (Vitest, `packages/packs/test/`): pack lint per the spec and #21. It checks the output enum, hint vocabulary, entity-kind filters naming an existing type (O12), templates that parse and use declared inputs and known helpers, unique names, and one-line descriptions of at most 120 characters that start with a verb [proposed limit; the spec says "about 120"]. It also covers Ajv compile of inputs and entity-type schemas, common-input identity, the Remix enum, and the five broken fixtures.
- **Integration** (Vitest): one golden per tool through `POST /api/tools/:name/execute` against the mock OpenAI server, plus `TOOL_ARGS_INVALID` cases. Goldens change only with their prompt edit, in the same PR.
- **Samples** (`apps/api/test/samples.test.ts` [proposed]): reads `examples/`, so it is integration, not unit. It covers what #16's examples check omits: story-node paths, the shared file, both beats, and fiction order through the start-from-sample HTTP flow. O14 decides its lint placement.
- **E2E:** none added. The Playwright e2e is unchanged (#13).
- **Manual eval:** cases go in #16's eval script, owned by #23. Small and larger model: citation presence for the workhorses, voice separation for Dialogue. Not a gate for the build.
- **Image check:** in #16's image smoke jobs (O7). `ci.yml` builds no image.
- **Tooling:** Vitest. There is no prior art in the repo.

## 6. Dependencies

Edges from #26's gates table that involve #22. The consumer waits on the producer.
- `#22 phase:core-propose-graph` waits on `#21 phase:contract` and `#24 phase:contract`.
- `#22 phase:nonfiction-workhorses` waits on `#21 phase:contract` and `#20 phase:files` (sample skeleton).
- `#24 phase:canvas` waits on `#22 phase:nonfiction-workhorses` (sample recipe). Here #22 is the producer.
- #26's "every module's first phase" row: P1 waits on `#16 phase:scaffold`.

Edges the spec or this survey adds that #26 omits:
- P1 also waits on `#20 phase:contract` (spec), `#21 phase:loader-validation` and `phase:executor` (spec: the golden tests need the loader and execution), and `#16 phase:image-compose` (Dockerfile copy). Its closing ticket waits on `#16 phase:ci-publish`, which waits on `#16 phase:installer` and `#18 phase:token-guard` (#16 spec; #16 survey item 9). O7 says the closing ticket does not block P2.
- P2 also waits on `#23 phase:contract` (provenance type) and `#16 phase:examples-check`. That check waits on the `#20` and `#24` contracts and `#21 phase:loader-validation`.
- P3 waits on P2. The spec's Blocked-by list ends there. O15 would also hold P3 until `#24 phase:canvas` and `#25 phase:assembly-preflight` merge.
- P4 waits on P3 and `#21 phase:loader-validation` (the enable endpoint).
- Stubs: §4 only. Wave 3 waiting on wave 2 is by design (#3 wave table).

Sibling edges this survey does not adopt:
- #23's survey gates `phase:narrative-tools` on `#22 phase:nonfiction-workhorses`. #26 gates it on `#21 phase:executor` only. #23 to resolve.
- #20's `project.yaml` schema lets `genrePack` name a user pack. The spec and #21's offering rule use built-in packs only. This survey assumes built-in only; #20 to amend.

## 7. Open questions

**Settled or checked (no owner action):**
- `x-scriba-entity-kinds` is a list (#21 line 111).
- `sourcesUsed` holds the entity references from entity-typed inputs, with the style profile excluded and no one-hop (#21 line 160).
- Golden surface and inputs: `POST /api/tools/:name/execute`, with the caller resolving entities (#21 lines 182, 383). Entity inputs are lists and style is one ref (#24 line 341).
- Claim status is `supported | weak | unsupported`, matching the grounding verdicts (#23 line 138). Verdicts stay in `logs/`.
- Placeholders: `TK` and `{{…}}` come from the #25 constant (#25 line 187). Stub until #25 `phase:contract`.
- Remix's enum is the 17 shipped draft tools except `remix`, fiction tools included, static, checked by CI (spec).
- Common inputs: all five on every draft tool; entity, check and graph tools take a subset (spec).

**Open (owner decisions):**
- **O1 Names (before P1).** The spec's kebab-case tool names fail #21 line 93 (lower snake case); #21 line 400 gives the reason. Recommend snake_case file and function names [proposed], for example `cold_open`, with spec names kept in prose. Amend #22 before P1, and change "Ajv error" to `TOOL_ARGS_INVALID` (#21 line 133). Owner also confirms the kinds `style-profile` and `world-rule`.
- **O2 Source front matter (CONFLICT, map #13).** The spec has this module add front matter to skeleton sources, but map #13 gives the skeleton to Project store. Recommend that #20 adds the fields to its skeleton, after agreeing names with #20. #20's survey (item 14) proposes a `type: source` default instead, which does not supply `citation`. Fields: `id`, `type: source`, `title`, `citation`, `url`, `reliability`. This module edits no skeleton file. Amend #22's nonfiction scope and #20's Samples section (lines 195–197).
- **O3 Nested `relationships` (before P3).** #21 line 104 bans nested objects. Recommend a flat list of character references in front matter, with relationship notes in the body. `{{entity id}}` renders the body (#21 line 144).
- **O4 Dialogue `coreIdea` (before P3).** #24 line 140 refuses a required port with no wire or pinned value, and the spec's fiction recipe has neither. Recommend a text Input node, "Core idea", wired to `dialogue.coreIdea`. Amend the recipe.
- **O5 Entity IDs for new entities (before P3).** #23 line 127 routes `entity` outputs to `entities/` with no ID rule, yet the front-matter base requires `id`. Recommend that Project store assigns IDs on accept and prompts never invent them. Ask #20 and #23.
- **O6 Catalogue scope (before P1).** `{{toolCatalog}}` lists enabled tools (#21 line 145), while the offering rule (#21 line 89) also filters by project. #21's `phase:executor` scope omits the helper. Recommend that the caller passes the project-filtered list, and that #21 adds `{{toolCatalog}}` to `phase:executor`.
- **O7 Image copy and smoke (README item; P1 closing ticket).** The unwritable-image check now sits in #16 `phase:ci-publish`, and #16's image smoke list does not include it yet. Recommend that #16 narrows the Dockerfile copy (#16 line 196) to `tools/` and `entity-types/`, and adds to `phase:ci-publish`'s smoke jobs a check that the app user cannot write `/opt/scriba/packs/core`. Also recommend that the closing ticket does not block P2.
- **O8 `sourcesUsed` wording (before P2).** The spec's golden says "sources derived from the input entity IDs". #21 line 160 returns entity references, which include `person` and `claim` entities. Map #7 ("computed from the input entity IDs") fits either. Recommend the golden say "entity references (#21)". This is wording, not a map conflict.
- **O9 Enable path (before P4; CONFLICT, spec vs #21).** The spec enables a shape through a copy-on-write user-pack copy. #21 line 167 says toggling never forks, and line 179 gives `PUT /api/tools/:name/enabled`, with the override stored in `settings.yaml` (line 166). Recommend #21's path and amend the criterion.
- **O10 Envelope `title` (before P1; CONFLICT, spec vs #21).** #21 line 138 has no `title`, but the spec requires one. Recommend that #21 adds a root `title`. It must not go in `fields`, where `title` is Source's property.
- **O11 Zod for the spec shape (before P1; map conflict #7).** Map #7 says "No Zod for tool specs". #3 and #21 (line 229) use Zod for the envelope, and the spec's pack suite does too. Recommend Zod for the envelope, with `inputs` as JSON Schema checked by Ajv (#21 line 380). Owner amends #7's wording or accepts this.
- **O12 Unknown-kind severity (before P3; CONFLICT, spec vs #21).** The spec says pack lint fails unknown entity kinds. #21 makes them warnings (lines 111 and 197). Recommend keeping #21's warning for author saves, and having this module's pack suite fail any warning on built-in packs. No #21 change needed.
- **O13 Sample chapter for the M7 demo (before P4).** The demo needs a chapter with one drifting paragraph and a cold open for Remix. No sample scope provides one: #13 is silent, #20's skeleton has two or three drafts, and the fiction sample is fixed. Recommend one additive nonfiction chapter in `examples/nonfiction/drafts/`, with #20's sign-off.
- **O14 `samples.test.ts` against #16's lint rule (before P2).** #16's survey (item 7) proposes banning `examples/` reads in any `**/*.test.ts` outside `e2e/`. Recommend that #16 exempts this integration file, which keeps #13's rule for unit tests. The alternative is to move it to `e2e/`.
- **O15 P3 hold (before P3).** The spec's Blocked-by list stops at `nonfiction-workhorses`, but its demo needs `#24 phase:canvas` and `#25 phase:assembly-preflight`. Recommend holding P3's start until both merge, following #3's wave rule. This hold is not in the spec or #26; owner confirms.
- **O16 Empty `/genre-packs` (before P1).** #3's wording says each producer publishes a slice. The spec and #16 (line 99) keep this one empty. Recommend keeping it empty; owner confirms the #3 wording.

**Map conflicts:** #13 (O2); #7 Zod (O11); #3 wording (O16). Sibling-spec conflicts: O6, O7, O8, O9, O10, O12, O14, and the §6 notes.

## 8. Driver brief

Genre packs is YAML tool specs and entity-type envelopes under `packages/packs`, with tests and no runtime code. Run four `/navigator:pair` sessions in §3 order, holding P3 per O15 if the owner keeps it. Clear the stops in §3 first. Use the spec's phase names verbatim. Tool names follow O1 once settled. Input keys are camelCase and stable. Stub only `TK` and the provenance builder. Use GLOSSARY terms (recipe, story graph, story node, scene, beat, input, tool and output nodes, wire, run, pending change). Prompts cite `[@id]`, emit `TK` rather than invent facts, and never ask the model to list its sources. Do not edit GitHub issues. Send O1, O2, O7, O10 and O11 to the owner.
