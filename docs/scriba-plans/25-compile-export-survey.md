# #25 Compile & export: implementation survey

Spec: `/tmp/scriba-specs/25.md`. Decisions: map #1–#7, #9–#14 (#8 and #15 do not apply). Gates: tracker #26. Cross-spec checks: the #16, #20 and #23 specs and the sibling surveys. Vocabulary: `GLOSSARY.md`. Status: revised for re-review; not yet reviewed.

Markers: **STOP** is an owner stop point. `[proposed]` marks an invented name. `[survey]` marks a gate or criterion this survey adds to the spec.

## 1. Approach

- Step 0 is an owner stop on membership (§3, OQ 1). `OrderEntry` path validation depends on it.
- The module reads only the `order` edges of story graphs (#24's schema). It never runs a graph and never calls a model.
- One deterministic core (membership, effective order, `project.yaml` store, five checks, Markdown builder) sits behind the controller. Tests go through HTTP only (§5).
- Writes take a per-project lock (OQ 10), check `revision` before anything is written, then write through #20: the file API with `baseHash`, or its in-process YAML key update. A stale request leaves `project.yaml` byte-identical. Settings are covered by `revision` only if OQ 18 is accepted.
- The Markdown is built once and golden-tested. DOCX, EPUB and PDF are Pandoc runs over that Markdown, with a built-in Lua filter for format marks (unnumbered matter, dedication, page breaks).
- Pandoc reads the body with `--from=markdown-yaml_metadata_block`. Metadata comes only from a generated `--metadata-file`, so draft text cannot set `cover-image` or `css`.
- Pandoc never reads a project path. The Lua filter copies each image and media target (Markdown, raw HTML `img`, `video`, `audio`, `source`) into the temp directory, and rewrites it there. Template overrides are staged the same way (staged copies `[proposed]`). Absolute, remote and outside-project targets are dropped with a warning. Raw `typst`, `openxml` and `latex` blocks are dropped. This departs from the spec's project-root `--resource-path` (map conflict #5, OQ 17). Staging needs binary reads from #20 (OQ 15).
- Pandoc runs behind one runner: argument array, no shell, temp directory, timeout, output cap, one export per project. Template checks run first, so the template test needs no binary.
- Snapshots copy top-level files first and write `snapshot.yaml` last, so an unfinished snapshot reads as `unreadable`.

## 2. Files and modules

Paths follow map #4. "(proposed)" marks my choice. `git ls-files` lists no `apps/`, `packages/`, `e2e/`, `examples/`, `docs/adr/` or `.github/` path, so no app code exists. Every path below is created by this module or by a sibling phase.

- `packages/contracts/src/compile-export/` (proposed). The `/compile-export` subpath already exists, empty, from `#16 phase:scaffold`. `phase:contract` fills it and never edits package config.
- `apps/api/src/modules/compile-export/`: module, controller, `manuscript/`, `preflight/` (one file per check), `export/` (runner, writers, Lua filter, `templates/`), `snapshots/`, `events.ts`.
- `apps/api/src/app.module.ts` (one import in Platform's root) and `apps/web/src/app/app.routes.ts` (one lazy entry in the Shell's table).
- `apps/web/src/app/features/compile-export/` and `apps/api/test/compile-export/` (proposed): UI and HTTP tests, fixture builders.
- `examples/nonfiction/` (additive edit to #20's skeleton): `order` and `export` in `project.yaml` (#13). Draft count: OQ 8.
- `e2e/`: one manuscript step. `e2e/fixtures/mock-openai/`: read only, except as OQ 8 allows.
- `.github/workflows/` (Platform-owned, additive request): Pandoc and Typst install, CI skip flag, export smoke. `docs/adr/`: Typst ADR (new).

## 3. Phase plan

Before each phase, check its gates are closed in tracker #26, and its [survey] gates (§6).

**Step 0 (owner STOP).** #12, as amended by #14 q3 and approved, says every top-level file in `drafts/`. The spec narrows that to `.md` files. Nothing else starts until OQ 1 is answered.

**`phase:contract`.** Gates: `#16 phase:scaffold`; `#20`, `#23`, `#24` at `phase:contract` (the spec's gates; §6 notes that #26 differs). Work: the shapes and constants in §4, filling the empty subpath; the narrowing of #20's `order` and `export`, once OQ 20 is answered. Done when:
- the subpath builds, exports only shapes and constants, and imports from `apps/api` and `apps/web`;
- Zod tests accept valid examples and reject an unknown status or part, an order entry with a path outside `drafts/` (and any non-`.md` path, if step 0 narrows), a reorder that isn't a list of paths, and an unknown export format;
- `project.yaml` accepts files with and without `order` and `export`;
- the nonfiction sample passes Platform's CI sample check, on the timing in OQ 21.

First test: `OrderEntry` rejects status `done` and a path outside `drafts/`.

**`phase:assembly-preflight`.** Gates: this module's `phase:contract`; `#20 phase:contract` and `phase:files`; `#24 phase:contract`; `#23 phase:contract`; `#18 phase:token-guard`; [survey] `#16 phase:test-harness` (mock OpenAI for the no-call test). Work, in order: membership and effective order, read through GET; word counts (`Intl.Segmenter`, `isWordLike`); reorder, status and part writes with `revision` and full materialisation; `manuscript.updated`; the five checks; POST preflight; the Markdown builder; the nonfiction sample's order, statuses and export settings. Done when:
- no order field and no graph: alphabetical; `drafts/.versions/…`, other subfolders and non-`.md` files are absent;
- with an order field: listed files first, unlisted files appended alphabetically; a stale entry is ignored and reported by `orphan-scenes`;
- with a story graph: `order` edges give topological order with alphabetical ties; a same-file edge is ignored; files outside the graph follow `project.yaml`; a cycle falls back to `project.yaml` and sets `graphCycle`;
- a stale `revision` returns a conflict and leaves `project.yaml` byte-identical; a valid reorder writes every entry and keeps comments and other keys;
- each check has a fixture that triggers it, with the right check id, severity, path and line; a clean fixture passes all five;
- unsupported claims reads a claims artefact fixture: `unsupported` is an error, `weak` a warning, a changed file `info`;
- preflight sends no request to the mock OpenAI server;
- the nonfiction sample, started from "start from sample", returns its authored order and statuses.

First test: with no order field and no graph, GET lists the included `.md` files alphabetically and omits `drafts/.versions/x/…` and every other excluded file.

**`phase:export`.** Gates: `phase:assembly-preflight`; `#16 phase:image-compose` and `phase:ci-publish` (Pandoc 3.13 and Typst in the image, CI); [survey] `#20`'s binary read and a module-owned `.scriba/exports/` write (OQ 15). Spikes first: the Typst quality spike (OQ 6), with its checklist written before it runs, and a DOCX header and title-page probe (OQ 5) `[proposed]`. STOP: owner review of both results, and the ADR in `docs/adr/`. Then the runner; `md`, `docx`, `epub`, `pdf`; download GET; `export.finished`; built-in templates; override and "copy default" endpoints; settings read and write; the latest file per format under `.scriba/exports/`; CI and image steps. Done when:
- each format exports the fixture through HTTP, and the download GET returns bytes with no side effects;
- `md` matches its golden file and parses under Pandoc;
- unzipped DOCX: chapters in effective order; styles from the reference doc (the override's, when set); title page with author, contact block and rounded word count;
- unzipped EPUB: spine and nav in effective order with matter placed; title, author, language and identifier; bibliography present for a nonfiction fixture and absent when `off`;
- PDF starts with `%PDF-` and is produced with `--pdf-engine=typst`;
- error mappings: a missing override returns template invalid without calling Pandoc; a Pandoc failure returns Pandoc failed with the stderr tail; a timeout returns Pandoc timeout; a second concurrent export returns busy;
- export attaches the preflight summary and succeeds when preflight has errors;
- CI runs the export tests with real Pandoc and Typst; locally they skip with a message, and the CI flag turns a skip into a failure;
- the image smoke exports all four formats on amd64 and arm64;
- the Typst spike ADR is merged;
- [survey] outside-project media tests (§5) pass in every format.

First test: `POST export` with a missing `docxReferenceDoc` returns template invalid, and the runner spy is never called.

**`phase:manuscript-snapshots`.** Gates: `phase:export`; `#17 phase:core`; [survey] `#20 phase:pending-review` (restore conflict, e2e accept step); [survey] `#23 phase:pending-writes` and `phase:grounding` (e2e agent run and accept, grounding demo). Work: snapshot create, list and restore with pre-restore; SSE; the lazy route with the outline, preflight panel (links to locations), export settings panel, snapshots panel and read-only phone layout; the e2e manuscript step. Demo: a new step runs "Check grounding" on the grounding-claims draft, a real model call (OQ 16). STOP: the manual Word and EPUB check (M5 done-when). Done when:
- create writes `snapshots/<label>-<ts>/` with the top-level drafts and a valid manifest; list is newest first;
- restore brings back drafts, order and statuses, removes files created after the snapshot, and creates a `pre-restore` snapshot; `drafts/.versions/` is byte-identical before and after; a pending change against a restored file shows as a conflict;
- [survey] restoring a missing or unreadable snapshot returns snapshot not found or unreadable;
- UI tests: a drag sends a reorder with the current `revision`; graph-ordered rows can't be dragged; a conflict shows the reload prompt; `manuscript.updated` refetches; preflight errors open the confirm dialog before export; restore needs confirmation;
- the e2e passes with the manuscript step;
- the manual Word and EPUB check (STOP) passes.

First test: POST create writes `snapshots/<label>-<ts>/` with the top-level drafts and a valid manifest, and GET lists it first.

## 4. Contracts

Produced under `@bbartolome/scriba-contracts/compile-export`, spec names: `ManuscriptStatus`, `ManuscriptPart`, `OrderEntry`, `ExportSettings`; the view model (`entries` as `{path, part, status, words, graphOrdered, inOrderField}`, `totals.body`, `totals.manuscript`, `orderSource` as `'alphabetical' | 'project' | 'graph+project'`, `warnings` for graph cycle, invalid graph and stale entries, `revision`); `PreflightCheckId` (`placeholders | unsupported-claims | orphan-scenes | entity-links | banned-phrases`), the preflight result `{ranAt, revision, checks}`, the finding `{check, severity, path, line?, offset?, length?, message, ref?}`, and the placeholder constants (`TK`, `TKTK`, `TODO`, `FIXME`, `XXX`, unrendered `{{…}}`); `ExportFormat` and the export result `{format, fileName, bytes, downloadUrl, preflight, warnings}`; the snapshot summary and the `snapshot.yaml` manifest `{schemaVersion, label, createdAt, appVersion, order, words}`; SSE `manuscript.updated`, `export.finished`, `snapshot.created`, `snapshot.restored`; the ten error codes; route constants.

The spec gives request bodies in prose and names no request types: reorder `{revision, front, body, back}`, status `{revision, path, status}`, part `{revision, path, part}`, export `{format}`, snapshot create `{label}`, restore `{id}`. Proposed type names: `ReorderRequest`, `StatusRequest`, `PartRequest`, `PreflightRequest`, `ExportRequest`, `SettingsWriteRequest`, `CopyDefaultTemplateRequest`, `SnapshotCreateRequest`, `SnapshotRestoreRequest`, `SnapshotListResponse` `[proposed]`. Routes sit under the prefix that #16 §7 item 18 settles.

Proposed field: `ExportSettings.identifier` `[proposed]`, the EPUB identifier, written once on the first export POST (OQ 7). The spec's `ExportSettings` shape does not have it.

Consumers: Frontend shell (lazy route entry); Platform (the e2e and CI steps this module adds); #22, which stubs the `TK` and `{{…}}` constants until this `phase:contract` merges.

Consumed:
- Platform: SSE envelope, error convention, composition root, contracts package.
- Setup & auth: the guard, and the GET-never-mutates invariant.
- Project store (`/project-store`): the `project.yaml` schema with reserved `order` and `export`; the file API (list, read, write with `baseHash`); file, entity and reference types; path safety; the entity front-matter base (`id`, `type`, `links`); `files.changed`; the in-process YAML key update (#20's `project-yaml.document.ts` plan).
- Graph runner (`/graph-runner`): graph schema (`view: 'story'`); story-node `kind`, `label`, `path`; edge `{id, from, to, relation?}`; relation `order`.
- Agent loop (`/agent-loop`): the grounding result shape, and the claims artefact `{schemaVersion, targetPath, contentHash, checkedAt, runId, claims}`, kept per draft under `logs/` (#23's survey proposes `logs/claims/<draft path>.json`). This replaces the spec's transcript-format fixture (OQ 13). Draft provenance: OQ 14.
- Genre packs: Source `citation` and URL; Style profile banned phrases. Fixtures until `#22 phase:nonfiction-workhorses` merges.
- Frontend shell `phase:core`: API and SSE clients, route table.

Stubs: none for the file API or the guard, which both gate `phase:assembly-preflight`. Fixtures only: a claims artefact in #23's shape, and Genre-pack fields. Any file API stub returns #20's real refusals.

## 5. Test strategy

- **Unit (Vitest):** Zod tests; Angular Vitest UI tests on a fake API and SSE client (`#17 phase:core`). No tests of helpers alone, and none of Pandoc's argument list.
- **Integration (primary seam):** a Nest test app with Platform's root and the real token guard, one temp library per test. Fixtures are built in the test. Assert on HTTP results, `project.yaml` bytes, snapshot folders, unzipped DOCX and EPUB, the PDF header and the `md` golden file.
- **Outside-project media** `[survey]`: absolute and symlinked images; raw HTML `img`, `video`, `audio` or `source` targets; a mid-draft YAML block setting `cover-image` or `css`. None is embedded or read in any format. Preflight flags them without blocking.
- **Mock OpenAI** (`#16 phase:test-harness`): zero requests during preflight and export.
- **Pandoc and Typst:** real in CI. Locally, tests skip with a message; the CI flag turns a skip into a failure. DOCX and EPUB are checked structurally, never byte for byte.
- **E2E** (`#16 phase:test-harness`; target per #7, a conflict that #16 and #17 own): one manuscript step after the accept change. No export.
- **Image smoke** and the nonfiction order check (reads `examples/`): e2e or CI sample check, never a unit test.
- **Manual:** the M5 done-when (Word and an EPUB reader) and the Typst spike review, recorded in the demo script and the ADR.

## 6. Dependencies

Merge order follows §3's gates. The consumer waits for the producer.

Edges from #26's gates table that involve #25:
- `#25 phase:assembly-preflight` ← `#20 phase:contract` and `phase:files`; `#24 phase:contract`; `#23 phase:contract`.
- `#23 phase:compile-tools` ← `#25` implementation. The direction is #23 waiting on #25, not the reverse. #26 names no phase (OQ 24).
- Generic rows that apply: `#16 phase:scaffold` before `#25 phase:contract`; `#17 phase:core` before the manuscript UI; `#18 phase:token-guard` for public routes. #25 has no public routes. Its tests boot the real guard.

Edges this survey adds, not in #26:
- `#25 phase:export` ← `#20` binary read and a module-owned `.scriba/exports/` write (OQ 15).
- `#25 phase:manuscript-snapshots` ← `#20 phase:pending-review`; `#23 phase:pending-writes` and `phase:grounding`.
- `#25 phase:assembly-preflight` ← `#16 phase:test-harness`; and `#23 phase:grounding`, if OQ 8 makes the grounding draft a chapter.
- `#25 phase:contract` sample check ← `#16 phase:examples-check`, which #26 blocks on `#21 phase:loader-validation` (OQ 21).
- `#22` (producer side): `#22` consumes `TK` and `{{…}}` from `#25 phase:contract`, and its survey holds a phase until `#25 phase:assembly-preflight`. Neither is in #26 (owner decides whether to add them).

Not needed: `#19`, `#21`. `#22` supplies fixtures only.

Gate mismatch for the owner: the spec gates `phase:contract` on the `#20`, `#23` and `#24` contracts. #26 lists those on `phase:assembly-preflight`. This survey keeps the spec's gates, because the narrowing needs the `project.yaml` schema and the claims shape at contract time. Owner confirms, or amends #26.

Requests and stops:
- **#20:** delete of top-level drafts (restore step 3; #20's Out of Scope puts delete out of v1); binary read (template overrides and staged images; #20 refuses non-text reads); a module-owned `.scriba/exports/` operation (a reserved path); confirmation that the in-process YAML key update is callable here; a skeleton of two draft files (OQ 8); a named hash algorithm (OQ 22); body entity syntax (OQ 23). See OQ 15 and OQ 20.
- **#23:** the claims artefact as the grounding source (OQ 13); per-draft provenance (OQ 14). #23's survey proposes the artefact path.
- **Platform (#16):** additive steps in `ci.yml` and the publish smoke job, which Platform owns. Pandoc 3.13 for arm64 is unverified (#16 survey item 15), and the image smoke depends on it.
- **Temp files:** #20's temp files are dot-prefixed (#20 survey item 17), so membership skips them. Consistent; no action.

## 7. Open questions

Each has a recommendation. Map conflicts recorded in the README: membership (OQ 1), path safety against Pandoc (OQ 17), and lazy migration (OQ 20).

1. **Membership (map conflict: #12 and #14 against `.md`-only). STOP.** #12 as amended by #14 q3 says every top-level file. Recommend: narrow to `.md`, with an owner comment on #12 (and #14) recording the narrowing, plus this amendment to #25. An amendment to #25 alone leaves the approved #12 text in conflict.
2. **Graph block versus reorder.** A non-graph file placed between graph-ordered files is accepted, then ignored, since the block leads. Recommend: reject such orders with invalid reorder, and reject part changes for graph-ordered files. The spec rejects only moves of graph files relative to one another, so this extends it.
3. **Dropped stale entries.** Writes drop entries that point at missing files before preflight can report them, though the spec says preflight reports them first. Recommend: the reorder response lists dropped entries as warnings, and preflight still reports the stale entries it finds.
4. **Restore and versions.** Snapshot restore overwrites drafts with no per-draft version. #14 q1 says the brief requires every draft to be versioned, and #14 q6 gives versioning on pending-change apply to the Project store. Recommend: keep the spec's rule; the `pre-restore` snapshot is the net. Owner confirms, since restore then leaves no per-draft history.
5. **DOCX header and title page (probe). STOP.** `[proposed]` Pandoc probably does not fill the running header from metadata (verify). Recommend: optional `shortTitle` in export settings, surname from `author`, header XML patched after Pandoc, title-page `custom-style` divs. Owner reviews the probe before the runner.
6. **Typst quality spike. STOP.** Verify that `--to=typst --pdf-engine=typst -o x.pdf` writes a PDF, that `--root` loads staged images, and that copy-default writes a self-contained template (partials need checking). Recommend: the checklist is written before the spike runs; owner reviews the results before the runner.
7. **EPUB identifier (spec wording: "derived from the project"). STOP.** Option A (recommended): a uuid persisted as `export.identifier` on the first export POST. It survives folder renames, at the cost of one `project.yaml` write. Option B: a hash of the project id (#20 defines the id as the folder name). Nothing is written, but a rename changes the book's identity. Under A, the write moves `revision` if OQ 18 is accepted, so the UI refetches on `export.finished` before its next reorder. If the write fails, fall back to B.
8. **Third chapter (spec adds a draft; #13 does not). STOP.** The spec says this module adds a third draft when the skeleton has fewer than three. #13's ownership table gives this module no draft, and the sample is 2–3 draft files in total. The Agent loop adds `grounding-claims.md` at M3 (#13 q6). Recommend: #20 ships two skeleton drafts, and `grounding-claims.md` is the third chapter. No file is added here, and the mock-OpenAI paths stay as #23 sets them. Owner confirms the grounding draft counts as a chapter for the demo. If not, the owner picks a third draft, and #13 gets a new row.
9. **Manifests and migrations.** Recommend: a too-new `snapshot.yaml` lists as `unreadable` and is never restored, matching the spec's `snapshot unreadable` code. An older one is upgraded in memory and never rewritten. #20's too-new refusal covers `project.yaml`, not snapshot manifests, which this module reads itself.
10. **Concurrency** `[proposed]`. Recommend: one per-project lock for reorder, status, part, settings, restore and export, with export reading under it. The spec needs only the export busy error and `revision` conflicts, so the lock is an addition.
11. **Early Markdown route. STOP.** The spec tests the builder through preflight and the view model until `phase:export`, then through `md` export. A minimal `md` route in `phase:assembly-preflight` would test it directly, but adds an endpoint the spec does not list. Recommend: no early route. The golden file lands with `md` export.
12. **FTS request (closed).** #20 indexes only `sources/` and `entities/` (its Search section), so `snapshots/` never enters the index. This module uses no FTS. Nothing to request.
13. **Grounding source (spec departs). STOP.** The spec reads grounding "through the Agent loop's transcript entry format". #23 keeps the latest result per draft as a claims artefact in `logs/`, with `targetPath` and `contentHash`, and its spec asks Compile to consume that shape. Recommend: read the artefact, and amend #25's Solution and Consumes lines. Owner decision, since this changes a published spec.
14. **Draft provenance (spec departs). STOP.** The spec reads draft provenance from the file, for the entity-link check and the "cited only" bibliography. #23 puts provenance on the pending change and in transcripts, not in draft files (#23 spec). #20's pending-change shape has `origin` but no provenance field, and this module cannot read `.scriba/`. Recommend: #23 writes a per-draft provenance record under `logs/`, the same pattern as OQ 13 (option (b) in #23's survey). If #23 declines, "cited only" uses body references, and the check covers body references only.
15. **Direct file access (#20 requests). STOP.** #20 puts delete, rename, move and binary files out of v1, and reserves `.scriba/`. Restore needs delete, templates and staged images need binary reads, and the export folder is reserved. Recommend: ask #20 for delete of top-level drafts, binary read, and a module-owned `.scriba/exports/` operation. Until then, restore, export and staging wait.
16. **Demo grounding. STOP.** The spec's demo step 3 shows unsupported-claims findings from the grounding-claims draft, but samples ship no `logs/` (#13). Recommend: a separate demo step runs "Check grounding" as a real model call, its cost accepted by the owner. Do not pre-seed `logs/` (#13). Keep this step out of the e2e.
17. **Pandoc routes (map conflict #5 against Pandoc reading project paths). STOP.** The spec's `--resource-path` is the project root, and raw HTML and mid-draft metadata can reach outside the project (verify both). Recommend: §1's design. Alternative: `--sandbox` with `pandoc.mediabag.insert` staging (verify). Either needs an owner-approved amendment. Also verify that a mid-draft `---` block renders as literal text under `markdown-yaml_metadata_block`.
18. **Revision and settings.** The spec hashes only order and the file set, yet settings writes carry `revision`, so a stale settings write goes through. Recommend: include `export` in `revision`. See OQ 7 for the interaction.
19. **Offline.** Pandoc fetches remote images, and Typst templates can `#import` `@preview` packages. Recommend: drop remote targets with a warning, reject `@preview` imports, and run Typst offline if its flag allows (verify).
20. **Lazy migration (map conflict #12 and #7 against narrowing at `schemaVersion` 1). STOP.** #7 and #12 route per-file schema changes through a `schemaVersion` bump and lazy, backed-up migration, which #20 lands at M7. The spec calls the narrowing "expand-only", but tightening a passthrough field rejects values that v1 files may already hold, and #20's activation validates `project.yaml`. Recommend: keep version 1. Read `order` and `export` tolerantly, drop bad entries with a warning, and keep `OrderEntry` strict for writes. Alternative: gate `phase:contract` on `#20 phase:migrations` (M7), which delays M5. Owner decides.
21. **Contract sample check timing** `[proposed]`. The `phase:contract` criterion about Platform's CI sample check waits on `#16 phase:examples-check`, which #26 blocks on `#21 phase:loader-validation` (M2). Recommend: #25's own Zod test checks the sample at contract time, and `examples-check` takes over when it exists. Owner confirms this reading.
22. **Hash algorithm** `[proposed]`. #20's `hash` and #23's `contentHash` are both "a content hash", with no algorithm named. The "changed since grounding check" finding needs them to match. Recommend: one algorithm, SHA-256 over disk bytes, named in both contracts. Owner confirms with #20 and #23.
23. **Body entity syntax.** The broken-link check reads body references "using the Project store's entity reference syntax". #20's survey (item 16) proposes front-matter `links` only in v1, which would leave no body syntax. Recommend: #20 confirms whether it defines body references in v1. If not, the check covers front-matter links only, and the spec's wording changes.
24. **`compile-tools` phase (tracker ambiguity).** #26 says #23 `phase:compile-tools` waits for "#25 (implementation)", with no phase. #23's survey reads it as `phase:assembly-preflight` and `phase:export`. Recommend: `phase:export` closed, which includes assembly-preflight. Owner names the phase in #26.
25. **Beyond the map (owner to confirm).** Union of all story graphs; the graph-ordered block leads; phone download (#2 names reading, not downloads). Kept as the spec has them.
26. **Vocabulary.** GLOSSARY's "Story node" makes label-only temporary, but #11 makes beats label-only by default. Recommend: fix via `/domain-modeling`, and add manuscript, snapshot, preflight and order entry.

## 8. Driver brief

Full survey: `/tmp/scriba-plans/25-compile-export-survey.md`. Build Scriba's Compile & export module (paths in §2) from `/tmp/scriba-specs/25.md`, in §3's phase order. Goal: top-level `drafts/` files, subject to OQ 1, form one ordered manuscript that preflight checks, exports and snapshots, with every write guarded by `revision`. Do not resolve a map conflict, a spec departure or an owner decision yourself. Map conflicts and spec departures are OQ 1, 13, 14, 17 and 20. Other owner decisions are OQ 5–8, 11, 15 and 16. Do step 0 first, then stop. Before each phase, check its gates in #26 and its [survey] gates in §3.

Done when, per phase:
- contract: the subpath builds and its shapes are filled in; Zod tests and the sample check (OQ 21) pass.
- assembly-preflight: its acceptance criteria pass, including the byte-identical conflict and one fixture per check.
- export: the four formats, error mappings and outside-project media tests pass with real binaries in CI.
- manuscript-snapshots: the snapshot, restore and UI criteria and the e2e pass. The Word and EPUB check is manual.

First export tickets: the Typst spike, then the DOCX header probe. STOP for owner review before the runner. Also STOP for the ADR, the Word and EPUB check, and the #20 and #23 requests (OQ 13–15, 22 and 23). Never run a graph, call a model in preflight or export, read or write `drafts/.versions/`, or write `project.yaml` outside `order` and `export`. Use the spec's names verbatim, and mark invented names `[proposed]`.
