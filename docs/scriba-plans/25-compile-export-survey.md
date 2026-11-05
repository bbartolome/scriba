# #25 Compile & export: implementation survey

Spec: `/tmp/scriba-specs/25.md`. Decisions: map #1, #2, #4, #5, #7, #9, #11–#14. Gates and labels: tracker #26, checked against the #20 and #23 bodies. Vocabulary: `GLOSSARY.md`.

## 1. Approach

- Step 0 is an owner stop on membership (§3). `OrderEntry` path validation depends on it.
- One deterministic core (membership, order, `project.yaml` store, five checks, Markdown assembler) sits behind the controller. Tests go through HTTP only.
- Writes take a per-project lock, then #20's document editing and `baseHash`. `revision` is checked before any write, so a stale request leaves `project.yaml` byte-identical. Whether settings are covered is OQ 18.
- Assemble the Markdown once and golden-test it. DOCX, EPUB and PDF are Pandoc runs over it, with a built-in Lua filter for format marks (dedication heading, page breaks). The spec bans only project-content filters. Each format gets structural checks.
- Images deviate from the spec's `--resource-path` = project root (OQ 17). The built-in filter rewrites image targets to staged copies in a temp directory, and drops absolute, remote and outside targets. The filter is the guard; `--sandbox` also blocks staged images (verify).
- Pandoc runs behind one runner: argument array, timeout, output cap, one export per project. Template checks run first, so the template test needs no binary.
- Snapshots copy top-level files first and write `snapshot.yaml` last, so an unfinished snapshot reads as `unreadable`.

## 2. Files and modules

Paths follow map #4. "Proposed" marks my choice.

- `packages/contracts/src/compile-export/` (proposed), with its subpath in `packages/contracts/package.json`.
- `apps/api/src/modules/compile-export/`: module, controller, `manuscript/`, `preflight/` (one file per check), `export/` (runner, writers, Lua filter, `templates/`), `snapshots/`, `events.ts`.
- `apps/api/src/app.module.ts` (one import), `apps/web/src/app/app.routes.ts` (one lazy entry, Shell).
- `apps/web/src/app/features/compile-export/` (proposed): routes, page, panels, typed client, `*.spec.ts`.
- `apps/api/test/compile-export/` (proposed): HTTP integration tests and fixture builders.
- `examples/nonfiction/` (proposed): order, statuses, export settings, third draft if needed.
- `e2e/`: manuscript step. `e2e/fixtures/mock-openai/`: read only, except as OQ 8 allows.
- `.github/workflows/` (Platform-owned, additive): Pandoc and Typst install, skip-to-fail flag, export smoke. `docs/adr/`: Typst ADR.

## 3. Phase plan

Before each phase, check its gates are closed in tracker #26.

**Step 0 (owner STOP).** #12 and #14 say "every top-level file". Spec #25 narrows that to `.md`. Any narrowing (hidden or non-text exclusion) also needs the owner's amendment comment on #12. Amending #25 alone works only if it keeps "every top-level file" and says how non-text files are handled. #20 already hides dot-entries and refuses non-text reads.

**`phase:contract`.** Gates: `#16 phase:scaffold`; `#20`, `#23`, `#24` at `phase:contract`. Work: the subpath, then the expand-only narrowing of #20's `order` and `export`. Done when: the subpath builds and imports from `apps/api` and `apps/web`; Zod tests pass; `project.yaml` accepts files with and without `order` and `export`; the nonfiction sample passes `#16 phase:examples-check`. That check is not a #26 gate, so this phase waits for it on that criterion only. First test: `OrderEntry` rejects status `done`, and a path outside the step 0 rule.

**`phase:assembly-preflight`.** Gates: this contract; `#20 phase:files`; `#18 phase:token-guard`. Work, in order: membership and effective order, tested through GET; word counts; reorder, status and part writes; `manuscript.updated`; the five checks, one fixture each; POST preflight; the Markdown builder; the nonfiction sample's order, statuses and export settings, plus a third draft if needed (OQ 8). Done when: the acceptance criteria hold, including the byte-identical conflict and one fixture per check. First test, after step 0: with no order field and no graph, GET lists top-level files alphabetically, drops `drafts/.versions/x/…`, another subfolder and a hidden file, and warns about a binary file.

**`phase:export`.** Gates: `phase:assembly-preflight`; `#16 phase:image-compose` and `phase:ci-publish`; `#20`'s binary read (§6). Spikes first: (1) the Typst spike (OQ 6, OQ 19); (2) a DOCX header and title-page probe (OQ 5). STOP: the owner reviews both, and the ADR is written. Then the runner, four formats, download GET, `export.finished`, templates, settings endpoints, CI and image steps. Done when: the acceptance criteria hold, including structural DOCX and EPUB checks, the PDF header, error mappings, the outside-project image test (§5), and the image smoke on both architectures. First test: `POST export` with a missing `docxReferenceDoc` returns template invalid, and the runner spy is never called. No Pandoc needed.

**`phase:manuscript-snapshots`.** Gates: `phase:export`; `#17 phase:core`; `#20 phase:pending-review` (restore conflict, e2e accept step); `#23 phase:pending-writes` and `phase:grounding`. Work: snapshot create, list and restore with pre-restore; SSE; the lazy route with the read-only phone layout; the e2e manuscript step. Demo: a new step before preflight runs "Check grounding" on the grounding-claims draft, a real model call (OQ 16). STOP: the manual Word and EPUB check (M5 done-when). Done when: the snapshot, restore and UI criteria and the e2e pass. First test: POST create writes `snapshots/<label>-<ts>/` with the top-level drafts and a valid manifest, and GET lists it first.

## 4. Contracts

Produced (spec names): `ManuscriptStatus`, `ManuscriptPart`, `OrderEntry`, `ExportSettings`; the view model (`entries`, `totals.body`, `totals.manuscript`, `orderSource`, `warnings`, `revision`); `PreflightCheckId` and the placeholder constants; `ExportFormat`; the snapshot summary; the `snapshot.yaml` manifest with `schemaVersion`; SSE `manuscript.updated`, `export.finished`, `snapshot.created`, `snapshot.restored`; and the ten error codes. The spec names no request types. Proposed: `ReorderRequest`, `StatusRequest`, `PartRequest`, `PreflightRequest`, `ExportRequest`, `SettingsWriteRequest`, `CopyDefaultTemplateRequest`, `SnapshotCreateRequest`, `SnapshotRestoreRequest`, `SnapshotListResponse`. Add `ExportSettings.identifier`, a uuid set on the first settings write, as the EPUB identifier, since #20's project id changes on rename.

Consumed: Platform (SSE envelope, error convention, composition root, contracts package); `#18` guard; `#20` (`project.yaml` schema, file API with `baseHash`, references, path safety, `files.changed`); `#24` graph schema (`view: 'story'`, story-node `kind`, `label`, `path`; edge `{id, from, to, relation?}`; relation `order`); `#23` claims artefact (latest result per draft in `logs/`, with path, hash and verdicts; read it, not transcripts); `#22` (Source `citation` and URL; banned phrases); `#17` (API and SSE clients).

Stubs: none for the file API or the guard. Both gate `phase:assembly-preflight`, and the spec's seam boots the real guard. Fixtures only: a claims artefact in `#23`'s shape, and Genre-pack fields until `#22 phase:nonfiction-workhorses` merges. Any file API stub must return #20's real refusals: binary, over 5 MB, delete unsupported, reserved paths.

## 5. Test strategy

- **Unit (Vitest):** Zod tests, and Angular Vitest UI tests on a fake API and SSE client (`#17 phase:core`). No tests of helpers alone.
- **Integration (primary seam):** a Nest test app with Platform's root and the real token guard, one temp library per test. Assert on HTTP results, `project.yaml` bytes, snapshot folders, unzipped DOCX and EPUB, and the PDF header.
- **Outside-project image:** an absolute path and a symlink to a file outside the project are embedded in no format. Preflight flags them without blocking.
- **Mock OpenAI** (`#16 phase:test-harness`): zero requests during preflight and export.
- **Pandoc and Typst:** real in CI. Locally they skip, and the CI flag fails a skip.
- **E2E** (`#16 phase:test-harness`): one manuscript step after accept change. No export.
- **Image smoke** and the nonfiction order check (reads `examples/`) belong in e2e or the CI sample check.

## 6. Dependencies

Merge order follows §3's gates. Not needed: `#19`, `#21`. `#23 phase:compile-tools` waits for this module, not the reverse.

Cross-spec stops for the owner:
- **#20:** delete, binary read and write, and a module-owned export location. #20 puts delete and binary files out of v1 and reserves `.scriba/` and `drafts/.versions/`. Restore, export, copy-default, binary `docxReferenceDoc` overrides and image staging need them. Staging uses #20's binary read, never a direct filesystem read (OQ 15).
- **#23:** confirm the claims artefact's per-draft path, and that provenance is written to transcript `pending-change` entries, since draft front matter carries none.

## 7. Open questions

Each has my recommended answer. Where I depart from the spec, I say so.

1. **Membership** (step 0 STOP). Recommend: an owner comment on #12 for any narrowing, plus the #25 amendment.
2. **Graph block versus reorder.** A non-graph file dropped between graph-ordered files is accepted, then ignored. Recommend: reject such orders, and part changes for graph-ordered files.
3. **Dropped stale entries.** Writes drop them before preflight can report them. Recommend: the reorder response lists them as warnings.
4. **Restore and versions.** Restore overwrites drafts with no per-draft version, though #14 says every draft is versioned. Recommend: keep the spec; the pre-restore snapshot is the net. Project store to confirm.
5. **DOCX header** (probe STOP). Pandoc probably does not fill header text from metadata (verify). Recommend: optional `shortTitle`, surname from `author`, header XML patched after Pandoc, and title-page blocks in `custom-style` divs.
6. **Typst** (spike). Verify that `--to=typst --pdf-engine=typst -o x.pdf` writes a PDF, that `--root` loads staged images, and that copy-default writes a self-contained template (Pandoc templates support partials).
7. **EPUB identifier.** Recommend: `ExportSettings.identifier`, set on the first settings write.
8. **Third draft.** #13 gives the skeleton to Project store at M1, and mock-openai paths are a contract. Recommend: Project store ships three drafts at M1. Otherwise this PR adds the file and updates `e2e/fixtures/mock-openai/` in the same change.
9. **Manifests and migrations.** #20 migrates project files lazily, with a "schema too new" refusal. Recommend: a too-new `snapshot.yaml` lists as `unreadable` and is never restored. An older one is upgraded in memory and never rewritten.
10. **Concurrency.** Reorder, status, restore and export share state. Recommend: one per-project lock, which export also reads under.
11. **Early Markdown tests.** Owner stop: a minimal `md` route in `phase:assembly-preflight` would test the builder directly, at a phase-scope cost.
12. **Cross-spec.** Drop the FTS request for `snapshots/`, since #20 indexes only `sources/` and `entities/`. Refresh on `files.changed` and on demand, since the watcher is optional.
13. **Beyond the map.** Union of all story graphs; graph block leads; phone download, which #2 does not list. Keep, and the owner to confirm.
14. **Vocabulary.** GLOSSARY's "Story node" makes label-only temporary, but #11 makes beats label-only by default. Fix via `/domain-modeling`.
15. **Direct file access.** Recommend: ask #20 (§6) for delete, binary I/O and an exports location. Until then restore, export and staging wait, and no direct filesystem read may stand in.
16. **Demo grounding.** The unsupported-claims finding needs a real grounding run. Recommend: a separate demo step, with the owner accepting its cost in the 5-minute budget. Do not pre-seed `logs/` (#13).
17. **Pandoc root.** Reading the project root directly skips #5's checks, and Pandoc reads absolute paths whatever `--resource-path` says (verify). Recommend: an owner-approved spec amendment to staged copies.
18. **Revision and settings.** The spec puts `revision` on settings writes, but defines it as a hash of order and file set. A server `baseHash` cannot catch a client editing from stale settings unless the client sends the hash it read. Recommend: include the `export` key in `revision`.
19. **Offline.** Pandoc fetches remote images, and Typst templates can `#import` `@preview` packages. Recommend: the filter drops remote targets with a warning; reject `@preview` imports as template invalid; run Typst offline if its flag allows (verify).

## 8. Driver brief

Full survey: `/tmp/scriba-plans/25-compile-export-survey.md`. Build Scriba's Compile & export module (`apps/api/src/modules/compile-export/`, `apps/web/src/app/features/compile-export/`) from `/tmp/scriba-specs/25.md`, in §3's phase order. Goal: top-level `drafts/` files form one ordered manuscript that preflight checks, exports and snapshots, with every write guarded by `revision`. Where the map and the spec disagree, the map wins. Do step 0 first and stop for the owner. Check each phase's gates in #26 first. Done when, per phase: contract, the subpath builds and its Zod tests pass; assembly-preflight, its acceptance criteria pass, including the byte-identical conflict; export, the four formats and error mappings pass with real binaries in CI; snapshots, the snapshot, restore and UI criteria and the e2e pass. First export tickets: the Typst spike, then the DOCX header probe. STOP for owner review before the runner. Other STOPs: the ADR, the Word and EPUB check, and the #20 and #23 requests. Never run a graph, call a model in preflight or export, read `drafts/.versions/`, or write `project.yaml` outside `order` and `export`.
