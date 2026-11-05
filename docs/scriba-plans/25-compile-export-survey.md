# #25 Compile & export: implementation survey

Spec: `/tmp/scriba-specs/25.md`. Decisions: map #1, #2, #4, #5, #7, #9, #11–#14. Gates: tracker #26, checked against the #20 and #23 bodies. Vocabulary: `GLOSSARY.md`.

## 1. Approach

- Step 0 is an owner stop on membership (§3). `OrderEntry` path validation depends on it.
- One deterministic core (membership, order, `project.yaml` store, five checks, Markdown assembler) sits behind the controller. Tests go through HTTP only.
- Writes take a per-project lock, then #20's document editing and `baseHash`. `revision` is checked before any write, so a stale request leaves `project.yaml` byte-identical. Settings coverage is OQ 18.
- Assemble the Markdown once and golden-test it. DOCX, EPUB and PDF are Pandoc runs over it, with a built-in Lua filter for format marks (dedication heading, page breaks). Each format gets structural checks.
- Pandoc reads the body with `--from=markdown-yaml_metadata_block`, and its metadata comes only from a generated `--metadata-file`. Draft text therefore cannot set `cover-image` or `css`.
- Images deviate from the spec's project-root `--resource-path` (OQ 17). The filter rewrites every image and media target, in Markdown or raw HTML, to a staged copy, drops absolute, remote and outside targets, and drops raw typst, openxml and latex blocks.
- Pandoc runs behind one runner: argument array, timeout, output cap, one export per project. Template checks run first, so the template test needs no binary.
- Snapshots copy top-level files first and write `snapshot.yaml` last, so an unfinished snapshot reads as `unreadable`.

## 2. Files and modules

Paths follow map #4. "Proposed" marks my choice.

- `packages/contracts/src/compile-export/` (proposed), with its subpath in `packages/contracts/package.json`.
- `apps/api/src/modules/compile-export/`: module, controller, `manuscript/`, `preflight/` (one file per check), `export/` (runner, writers, Lua filter, `templates/`), `snapshots/`, `events.ts`.
- `apps/api/src/app.module.ts` (one import), `apps/web/src/app/app.routes.ts` (one lazy entry, Shell).
- `apps/web/src/app/features/compile-export/` and `apps/api/test/compile-export/` (proposed): UI and HTTP tests, fixture builders.
- `examples/nonfiction/` (proposed): order, statuses, export settings, third draft if needed.
- `e2e/`: manuscript step. `e2e/fixtures/mock-openai/`: read only, except as OQ 8 allows.
- `.github/workflows/` (Platform-owned, additive): Pandoc and Typst install, skip flag, export smoke. `docs/adr/`: Typst ADR.

## 3. Phase plan

Before each phase, check its gates are closed in tracker #26.

**Step 0 (owner STOP).** Spec #25 narrows #12 and #14's "every top-level file" to `.md`. Any narrowing also needs an owner comment on #12. Amending #25 alone works only if it keeps "every top-level file" (OQ 1).

**`phase:contract`.** Gates: `#16 phase:scaffold`; `#20`, `#23`, `#24` at `phase:contract`. Work: the subpath, then the narrowing of #20's `order` and `export`, which needs OQ 20 first. Done when: the subpath builds and imports from `apps/api` and `apps/web`; Zod tests pass; `project.yaml` accepts files with and without `order` and `export`; the nonfiction sample passes `#16 phase:examples-check`. That check is not a #26 gate, so the phase waits for it on this criterion only. First test: `OrderEntry` rejects status `done`, and a path outside the step 0 rule.

**`phase:assembly-preflight`.** Gates: this contract; `#20 phase:files`; `#18 phase:token-guard`. Work, in order: membership and effective order, tested through GET; word counts; reorder, status and part writes; `manuscript.updated`; the five checks, one fixture each; POST preflight; the Markdown builder; the nonfiction sample's order, statuses, export settings and any third draft (OQ 8). Done when: the acceptance criteria hold, including the byte-identical conflict and one fixture per check. First test, per the step 0 rule: with no order field and no graph, GET lists the included top-level files alphabetically and omits `drafts/.versions/x/…` and every other excluded file.

**`phase:export`.** Gates: `phase:assembly-preflight`; `#16 phase:image-compose` and `phase:ci-publish`; `#20`'s binary read (§6). Spikes first: the Typst spike (OQ 6, OQ 19) and a DOCX header and title-page probe (OQ 5). STOP: owner review, and the ADR. Then the runner, four formats, download GET, `export.finished`, templates, settings endpoints, CI and image steps. Done when: the acceptance criteria hold, including structural DOCX and EPUB checks, the PDF header, error mappings, the outside-project media tests (§5) and the image smoke on both architectures. First test: `POST export` with a missing `docxReferenceDoc` returns template invalid, and the runner spy is never called.

**`phase:manuscript-snapshots`.** Gates: `phase:export`; `#17 phase:core`; `#20 phase:pending-review` (restore conflict, e2e accept step); `#23 phase:pending-writes` and `phase:grounding`. Work: snapshot create, list and restore with pre-restore; SSE; the lazy route with the read-only phone layout; the e2e step. Demo: a new step runs "Check grounding" on the grounding-claims draft, a real model call (OQ 16). STOP: the manual Word and EPUB check (M5 done-when). Done when: the snapshot, restore and UI criteria and the e2e pass. First test: POST create writes `snapshots/<label>-<ts>/` with the top-level drafts and a valid manifest, and GET lists it first.

## 4. Contracts

Produced (spec names): `ManuscriptStatus`, `ManuscriptPart`, `OrderEntry`, `ExportSettings`; the view model (`entries`, `totals.body`, `totals.manuscript`, `orderSource`, `warnings`, `revision`); `PreflightCheckId` and the placeholder constants; `ExportFormat`; the snapshot summary; the `snapshot.yaml` manifest with `schemaVersion`; SSE `manuscript.updated`, `export.finished`, `snapshot.created`, `snapshot.restored`; and the ten error codes. The spec names no request types. Proposed: `ReorderRequest`, `StatusRequest`, `PartRequest`, `PreflightRequest`, `ExportRequest`, `SettingsWriteRequest`, `CopyDefaultTemplateRequest`, `SnapshotCreateRequest`, `SnapshotRestoreRequest`, `SnapshotListResponse`.

`ExportSettings.identifier` is the EPUB identifier: a uuid generated on the first export POST and persisted. No sample ships one, since samples are copied (OQ 7).

Consumed: Platform (SSE envelope, error convention, composition root, contracts package); `#18` guard; `#20` (`project.yaml` schema, file API with `baseHash`, references, path safety, `files.changed`); `#24` graph schema (`view: 'story'`, story-node `kind`, `label`, `path`; edge `{id, from, to, relation?}`; relation `order`); `#23` claims artefact (latest result per draft in `logs/`, with path, hash and verdicts). I read the artefact, not transcripts. That departs from the spec's transcript-format fixture (§6). `#22` (Source `citation` and URL; banned phrases); `#17` (API and SSE clients).

Stubs: none for the file API or the guard. Both gate `phase:assembly-preflight`, and the spec's seam boots the real guard. Fixtures only: a claims artefact in `#23`'s shape, and Genre-pack fields until `#22 phase:nonfiction-workhorses` merges. Any file API stub must return #20's real refusals.

## 5. Test strategy

- **Unit (Vitest):** Zod tests, and Angular Vitest UI tests on a fake API and SSE client (`#17 phase:core`). No tests of helpers alone.
- **Integration (primary seam):** a Nest test app with Platform's root and the real token guard, one temp library per test. Assert on HTTP results, `project.yaml` bytes, snapshot folders, unzipped DOCX and EPUB, and the PDF header.
- **Outside-project media:** absolute and symlinked images, raw HTML `img`, `video`, `audio` or `source` targets, and a mid-draft YAML block setting `cover-image` or `css` outside the project. None is embedded or read in any format. Preflight flags them without blocking.
- **Mock OpenAI** (`#16 phase:test-harness`): zero requests during preflight and export.
- **Pandoc and Typst:** real in CI. Locally they skip, and the CI flag fails a skip.
- **E2E** (`#16 phase:test-harness`): one manuscript step after accept change. No export.
- **Image smoke** and the nonfiction order check (reads `examples/`) belong in e2e or the CI sample check.

## 6. Dependencies

Merge order follows §3's gates. Not needed: `#19`, `#21`. `#23 phase:compile-tools` waits for this module, not the reverse.

Cross-spec stops for the owner:
- **#20:** delete, binary read and write, and a module-owned export location. #20 puts delete and binary files out of v1 and reserves `.scriba/` and `drafts/.versions/`. Restore, export, copy-default, binary overrides and staging need them. Staging never uses direct filesystem reads (OQ 15).
- **#23:** confirm the per-draft claims artefact path, and that provenance goes to transcript `pending-change` entries, since draft front matter carries none. Reading the artefact departs from the spec's transcript-format fixture, which needs owner sign-off.

## 7. Open questions

Each has my recommended answer. Where I depart from the spec, I say so.

1. **Membership** (step 0 STOP). Recommend: an owner comment on #12 for any narrowing, plus the #25 amendment.
2. **Graph block versus reorder.** A non-graph file dropped between graph-ordered files is accepted, then ignored. Recommend: reject such orders, and part changes for graph-ordered files.
3. **Dropped stale entries.** Writes drop them before preflight can report them. Recommend: the reorder response lists them as warnings.
4. **Restore and versions.** Restore overwrites drafts with no per-draft version, though #14 says every draft is versioned. Recommend: keep; the pre-restore snapshot is the net. Project store to confirm.
5. **DOCX header** (probe STOP). Pandoc probably does not fill header text from metadata (verify). Recommend: optional `shortTitle`, surname from `author`, header XML patched after Pandoc, title-page `custom-style` divs.
6. **Typst** (spike). Verify that `--to=typst --pdf-engine=typst -o x.pdf` writes a PDF, that `--root` loads staged images, and that copy-default writes a self-contained template (partials need checking).
7. **EPUB identifier.** Recommend: the §4 uuid, generated on the first export POST. If that write conflicts, fall back to a hash of the project id.
8. **Third draft.** #13 gives the skeleton to Project store at M1, and mock-openai paths are a contract. Recommend: Project store ships three drafts at M1. Otherwise this PR adds the file and updates `e2e/fixtures/mock-openai/` in the same change.
9. **Manifests and migrations.** #20 migrates project files lazily, with a "schema too new" refusal. Recommend: a too-new `snapshot.yaml` lists as `unreadable`, never restored. An older one is upgraded in memory, never rewritten.
10. **Concurrency.** Recommend: one per-project lock for reorder, status, restore and export, with export reading under it.
11. **Early Markdown tests.** Owner stop: a minimal `md` route in `phase:assembly-preflight` would test the builder directly, at a phase-scope cost.
12. **Cross-spec.** Drop the FTS request for `snapshots/`: #20 indexes only `sources/` and `entities/`. Refresh on `files.changed` and on demand.
13. **Beyond the map.** Union of all story graphs; graph block leads; phone download (#2 omits it). Keep; owner to confirm.
14. **Vocabulary.** GLOSSARY's "Story node" makes label-only temporary, but #11 makes beats label-only by default. Fix via `/domain-modeling`.
15. **Direct file access.** Recommend: ask #20 (§6) for delete, binary I/O and an exports location. Until then, restore, export and staging wait.
16. **Demo grounding.** Recommend: a separate demo step for the real grounding run, its model cost accepted by the owner. Do not pre-seed `logs/` (#13).
17. **Pandoc routes.** Project-root `--resource-path`, raw HTML and mid-draft metadata all reach outside the project (verify). Recommend: §1's design. Alternative: `--sandbox` with `pandoc.mediabag.insert` staging (verify). Either needs an owner-approved amendment.
18. **Revision and settings.** The spec puts `revision` on settings writes but hashes only order and file set. A server `baseHash` cannot catch a client editing stale settings unless the client sends the hash it read. Recommend: include `export` in `revision`.
19. **Offline.** Pandoc fetches remote images; Typst templates can `#import` `@preview` packages. Recommend: drop remote targets with a warning, reject `@preview` imports, and run Typst offline if its flag allows (verify).
20. **Lazy migration.** #12 and #7 route schema changes through a `schemaVersion` bump and a lazy migrator, which #20 lands at M7. Narrowing `order` and `export` at version 1 makes hand-written entries invalid, and #20 refuses activation. Recommend: keep version 1, parse tolerantly, drop bad entries with a warning. Alternative: owner gates `phase:contract` on `#20 phase:migrations`.

## 8. Driver brief

Full survey: `/tmp/scriba-plans/25-compile-export-survey.md`. Build Scriba's Compile & export module (paths in §2) from `/tmp/scriba-specs/25.md`, in §3's phase order. Goal: top-level `drafts/` files form one ordered manuscript that preflight checks, exports and snapshots, with every write guarded by `revision`. Where the map and the spec disagree, the map wins. Do step 0 first and stop for the owner. Check each phase's gates in #26 first.

Done when, per phase:
- contract: the subpath builds, and its Zod tests and the sample check pass.
- assembly-preflight: its acceptance criteria pass, including the byte-identical conflict.
- export: the four formats and error mappings pass with real binaries in CI.
- snapshots: the snapshot, restore and UI criteria and the e2e pass.

First export tickets: the Typst spike, then the DOCX header and title-page probe. STOP for owner review before the runner. Other STOPs: the ADR, the Word and EPUB check, the #20 and #23 requests, and OQ 20. Never run a graph, call a model in preflight or export, read `drafts/.versions/`, or write `project.yaml` outside `order` and `export`.
