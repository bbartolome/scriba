# #20 Project store: implementation survey

Read: spec `20.md`; decisions #1, #4–#7, #9–#14; `BRIEF.md`:37; sibling headers and phase blocks (#16–#25); tracker #26; `GLOSSARY.md`.

## 1. Approach

- **Contract first.** Publish the Zod slice before module code. Platform's examples check imports its `project.yaml` schema.
- **One path guard.** Every entry point calls one function for Path safety and the active-project check. It runs the reserved-name check on the real path, relative to the real root, so an in-project symlink into `.scriba/` or `drafts/.versions/` is refused. Apply re-checks the stored `targetPath`. A write to an in-project symlink goes to the link's real path, so temp+rename never replaces the link.
- **Lock identity, folded names.** Per-path locks key on `(dev, ino)` of the real target. For creates, they key on the parent's `(dev, ino)` plus a lower-cased name. Reserved names compare case-insensitively.
- **Reads compute, POSTs persist** (OQ4). Apply is the only writer of agent and recipe output, through a temp file and rename.
- **API before UI.** Each phase lands its API first. The editor and review diff wait on Shell `phase:editor` and `phase:shared-components`.

## 2. Files and modules

Relative to the repo root.

- `packages/contracts/src/project-store/index.ts` — subpath entry `./project-store`.
- `packages/contracts/src/project-store/project-yaml.ts` — `project.yaml` schema.
- `packages/contracts/src/project-store/projects.ts` — summary, status, requests.
- `packages/contracts/src/project-store/files.ts` — file-API types.
- `packages/contracts/src/project-store/entities.ts` — entity reference, front matter, resolution.
- `packages/contracts/src/project-store/search.ts` — search request, passage.
- `packages/contracts/src/project-store/pending.ts` — pending change types.
- `packages/contracts/src/project-store/versions.ts` — draft-version listing.
- `packages/contracts/src/project-store/events.ts` — SSE members.
- `packages/contracts/src/project-store/routes.ts` and `errors.ts` — constants, codes.
- `packages/contracts/src/project-store/*.test.ts` — schema and round-trip tests.
- `apps/api/src/modules/project-store/project-store.module.ts` — `@Module`, imported by Platform's root.
- `apps/api/src/modules/project-store/library.service.ts` — discovery and statuses.
- `apps/api/src/modules/project-store/projects.controller.ts` — list, new, import, sample, activate.
- `apps/api/src/modules/project-store/active-project.service.ts` — `settings.yaml` `projects` section.
- `apps/api/src/modules/project-store/path-guard.ts` — the single path check.
- `apps/api/src/modules/project-store/file-api.service.ts` — list, read, write, edit, atomic writes.
- `apps/api/src/modules/project-store/file-api.controller.ts` — file-API routes.
- `apps/api/src/modules/project-store/project-yaml.document.ts` — comment-preserving YAML edits.
- `apps/api/src/modules/project-store/entities.service.ts` — resolution, entity list.
- `apps/api/src/modules/project-store/search/fts-index.ts` — `node:sqlite` FTS5.
- `apps/api/src/modules/project-store/search/manifest.ts` — `(path, mtime, size)` diff.
- `apps/api/src/modules/project-store/search/search.controller.ts` — search and rebuild POSTs.
- `apps/api/src/modules/project-store/pending/pending-store.ts` — JSON store.
- `apps/api/src/modules/project-store/pending/propose.service.ts` — propose, overlay, base handling.
- `apps/api/src/modules/project-store/pending/three-way.ts` — three-way check, merge.
- `apps/api/src/modules/project-store/pending/validators.ts` — per-path validator registry.
- `apps/api/src/modules/project-store/pending/pending.controller.ts` — queue and actions.
- `apps/api/src/modules/project-store/versions/draft-versions.service.ts` — versions, restore.
- `apps/api/src/modules/project-store/migrations/registry.ts` — per-kind registry.
- `apps/api/src/modules/project-store/migrations/project-yaml.migrators.ts` — `project.yaml` migrators.
- `apps/api/src/modules/project-store/provider.ts` — in-process API.
- `apps/api/src/modules/project-store/watcher.ts` — optional watcher (`SCRIBA_WATCHER`).
- `apps/api/src/modules/project-store/events.ts` — Platform publisher wrapper.
- `apps/api/test/project-store/*.int.test.ts` — integration suites.
- `apps/web/src/app/features/project-store/project-store.routes.ts` — lazy `Routes`.
- `apps/web/src/app/features/project-store/project-picker/` — picker.
- `apps/web/src/app/features/project-store/files/` — tree and read-only viewer.
- `apps/web/src/app/features/project-store/review-queue/` — queue, history, diff actions.
- `apps/web/src/app/features/project-store/project-store.api.ts` — typed client.
- `examples/nonfiction/` — `project.yaml`, `sources/`, `drafts/`, `.gitignore` (OQ14).
- `e2e/` (Platform-owned) — one added step; keep `e2e/fixtures/mock-openai/` paths in step.

## 3. Phase plan

**phase:contract (M1)**
- Work: Zod slice from the Contracts list; loose objects for `export`, `order`, unknown keys; `PROJECT_` codes; routes under `/api/project-store/`.
- Done when: acceptance 1–4 pass.
- First test: `project-yaml.test.ts`. A minimal file parses without `order`; a missing `schemaVersion` is rejected; unknown keys survive a round trip.

**phase:files (M1)**
- Work: discovery; New, Import, Start from sample; activation; path guard; file API with `baseHash`, atomic writes and the `upgraded` read marker; in-process provider on the same guard; resolution; YAML document edits; supported-version table and too-new refusal (OQ20); nonfiction skeleton; `project.switched`; project picker (statuses, New/Import/Start-from-sample cards, switch, active project in the Shell nav slot, phone width) and read-only files UI after #17 `phase:core`; Platform e2e step "project from sample", gated on #16 `phase:test-harness` and #17 `phase:core`.
- Done when: the nine acceptance items pass. The GET item is gated on #18 `phase:token-guard`'s GET/HEAD test; until then, suites snapshot the library around each GET. M1 demo steps 1, 2, 5 run (OQ7).
- First test: `GET /api/project-store/projects` on a temp library with a dot-folder, a `project.yaml` folder and a bare folder. Expect one `ok`, one `importable`.

**phase:search (M2)**
- Work: per-project FTS5 database; paragraph passages; manifest diff on activation and before each query; POST rebuild; `user_version` rebuild; orphan pruning; POST search endpoint and the same search on the in-process provider; search box.
- Done when: acceptance 1–5 pass.
- First test: POST search for a `sources/` phrase returns `{path, offset, snippet, score}`, and the file's text at `offset` starts that passage.

**phase:pending-review (M3)**
- Work: propose with origin and a caller-supplied base (OQ10); per-run read overlay, with same-run folds keeping the first base; pending JSON store; validators; conflict flags on watcher, apply or POST (OQ4); three-way apply; refresh; accept-anyway with backup; reject; draft versions, listing, read, restore; SSE; optional watcher (debounced `files.changed`, `SCRIBA_WATCHER` toggle); review queue and history UI; files editor with direct save and stale-base warning (US18–19) after #17 `phase:editor`. The spec lists the editor under phase:files, but it is gated on M3. File the "accept change" e2e follow-up ticket, blocked by #23 `pending-writes`.
- Done when: acceptance 1–8 pass, and demo steps 2–4 run with pending changes created through the provider: accept and check the version on disk; host-edit conflict, refresh, reject; restore a version.
- First test: propose on an existing file with no caller base leaves its bytes unchanged, captures disk content as base, and emits one pending-created event.

**phase:migrations (M7)**
- Work: registry keyed by kind and version, open to other modules (Graph runner registers `graphs/`); `project.yaml` on activation; other kinds on first write; GET returns an upgraded in-memory view; backups; `logs/migrations.log`.
- Done when: acceptance 1–4 pass.
- First test: with a test v1→v2 migrator, activating a v1 project rewrites it to v2 with comments intact, writes a backup and log line, and creates no pending change.

## 4. Contracts

Produced by `/project-store`, names verbatim:
- `project.yaml`: `schemaVersion`, `title`, `genrePack`, `styleProfile?`, `export?`, `model?` (`{providerId, model}`, defined here), `order?`.
- Project summary; status `ok | invalid | too-new | importable`; New, Import, Start-from-sample, Activate requests.
- Project-relative path; file reference; file-API list, write, edit, propose; `baseHash`.
- Read `{path, origin?}`: `origin` returns that run's overlay. Response `{path, content, hash, mtime, upgraded?}`. `hash` covers disk bytes; `upgraded` marks an in-memory view (spec line 194).
- Entity reference; front-matter base `{id, type, links?}`; resolution; entity list.
- Search request `{query, limit?, scope?}`; passage `{path, offset, snippet, score}`.
- Pending change; origin `{kind:'agent-run', runId, toolCallId?}` or `{kind:'recipe-run', runId, nodeId}`; conflict `{reason, detectedAt}`; accept, reject, refresh, accept-anyway requests.
- Draft-version listing `{draftPath, versions}`.
- Events: `pending.created|updated|resolved`, `files.changed {paths}`, `project.switched`. Wire names wait on OQ13.
- Route constants; `PROJECT_` codes for the 19 error names.

Consumed: Platform's envelope, error base, `SCRIBA_*` names; Setup & auth's single global guard; Shell's clients, diff view, editor. Model providers' shape is not imported (OQ6).

**Stubs until merged:** an Agent-loop stand-in that calls the provider; a fake Shell client built from contract types; a test-registered `graphs/` validator. No guard stand-in: nothing is published before the global guard.

## 5. Test strategy

- **Unit (Vitest, contracts only):** Zod schemas and round trips.
- **Integration (primary):** the Nest app with `SCRIBA_BOOKS_DIR` on a temp library and `SCRIBA_EXAMPLES_DIR` on a tiny test sample. Assert on HTTP, SSE and disk bytes. Real symlinks. No mock OpenAI server. Path-table rows run on Linux: `.SCRIBA/…`, `Drafts/.Versions/…`, `drafts/.VERSIONS/…`, and in-project symlinks into `.scriba/` and `drafts/.versions/`. Lock tests: a hard link and a symlink alias to one file must serialise. Case-variant aliases share the same `(dev, ino)` key on a case-insensitive mount; that mount is not in Linux CI.
- **UI:** Angular Vitest with fake clients. The narrow-viewport check uses Vitest browser mode. No Playwright suite of its own.
- **e2e:** Platform's single Playwright run. This module adds "project from sample" (gated per section 3). "Accept change" is the follow-up ticket.

## 6. Dependencies

- **Hard gate:** #16 `phase:scaffold`. It is a gate, not a stub.
- **Files UI:** #17 `phase:core`. **GET-invariant AC:** #18 `phase:token-guard`. **M3 editor and queue:** #17 `phase:editor` and `phase:shared-components`.
- **We gate, contract:** #16 `phase:examples-check`; #17 `phase:editor`; #21 `phase:contract` (wave 1) and `phase:executor` (21.md:285); #22 `phase:core-propose-graph` (22.md:188); #24 `phase:contract` (wave 1, 24.md:278); #25 `phase:contract` (wave 2, 25.md:267).
- **We gate, phases:** #18 `phase:setup-flow` (needs `phase:files`, OQ18); #19 `phase:project-override`; #21 UI phases (files); #22 `phase:nonfiction-workhorses`; #23 `phase:file-tools-chat` (files), `pending-writes` and `grounding`; #24 `phase:engine`; #25 `phase:assembly-preflight`.
- **Stubs meanwhile:** no Shell core means fake UI; no Shell editor means read-only files and diff (spec-allowed); no Graph runner means a fake validator; no Agent loop means the section 4 stand-in.

## 7. Open questions (recommended answers)

Items 1–4 are map conflicts. The map wins, so the owner must confirm each.

1. **Migration trigger (map conflict).** #7 and #12 say "lazily on open"; #6 says GET never mutates. Rec: keep the spec's activation and first-write rule, and the owner amends #7.
2. **Every draft versioned (map conflict).** #14 q1 says every draft; q6 versions only on apply. Rec: apply-only, since per-save versions flood `drafts/.versions/`.
3. **`structure/` (map conflict).** `BRIEF.md`:37 and #5 include it in New's layout; #11 q4 never names it. Rec: drop it, since the outline lives in `sources/`. The owner confirms, because this changes the scaffold.
4. **GET conflict flags (map conflict).** #6 says GET never mutates; the spec sets flags when the queue is listed. Rec: compute on read; persist from the watcher or a POST only.
5. **Restore (spec-internal).** Line 182 says versions are written "only when a pending change is applied"; Restore also writes one (line 184, AC line 333). Rec: restore versions too; amend line 182.
6. **Model override (spec-internal).** Lines 127 and 256 name Model providers' shape; line 384 and the tracker define it here. Rec: local `{providerId, model}`; amend lines 127 and 256.
7. **M1 demo steps 3–4 need editing,** which is M3 UI. Rec: show the write and conflict via the API at M1. After #18, curl needs the cookie and Origin header. Move the UI warning to M3.
8. **Import versus byte identity.** Import appends `.gitignore`, which the AC seems to forbid. Rec: only `.gitignore` and a minimal `project.yaml` change; `invalid` returns the error and writes nothing (US8).
9. **`genrePack` source.** Required, but New takes no pack. Rec: optional on New and minimal import, defaulting to `nonfiction`.
10. **Agent write base.** #23:127 captures at first read; #20 captures at first propose, so a host edit between read and write is silently overwritten. #23:126 keeps its own run overlay and proposes at run end. Per-call propose reads through this module's overlay and shows changes live in the queue; run-end propose never reads it. Rec: agent writes always supply the first-read base; choose per-call for live queue updates.
11. **Origin is thin.** The Graph runner needs `graphId` and `sourcesUsed`; the Agent loop needs provenance. Rec: optional fields in phase:contract.
12. **Edited and partial accept.** Shell expects both. Rec: optional `content` through the same three-way check; no partial accept in v1.
13. **Event names and `projectId`.** Platform requires kebab-case `type` (16.md:146; its example at :447 uses a slash). Rec: `pending-created`, `files-changed`, `project-switched`, and `projectId` on project-scoped events. Answer before contract merge.
14. **Samples.** Rec: `.gitignore` in the nonfiction sample; `sources/` files without front matter default to `type: source`.
15. **Refresh on `target-missing` or `target-exists`** is undefined. Rec: refresh only for `base-changed`; the others resolve by accept-anyway or reject.
16. **Entity syntax in prose.** Compile assumes one. Rec: front-matter `links` only in v1; tell Compile.
17. **Temp files in `drafts/`.** A crash leftover enters Compile's assembly. Rec: dot-prefixed temp names, hidden, swept on activation, skipped by Compile.
18. **Terms and gates.** `agent-run` is absent from GLOSSARY, and the tracker's `#18 setup-flow` gate should be `phase:files`. Rec: add "Agent run" via `/domain-modeling` before contract merge.
19. **Stale `projectId` (US31).** A rename changes the id, and pending JSON keeps the old one. Rec: derive it from the folder name on load; rewrite the stored value only on a POST (activation or the next update), never during a GET.
20. **Migration hash and older files.** Rec: `hash` covers disk bytes, not the upgraded view. Applying to an older file first checks the captured base against the disk hash, then migrates (backup, log line) and writes. Refresh merges against the upgraded in-memory view of disk, so all three sides are at one version. Ship the supported-version table in phase:files.
21. **Defaults.** Rec: SHA-256 of UTF-8; NUL sniff plus extension allowlist for "not text"; 5 MB cap on writes too; search `limit` 10, max 50; ULID pending IDs.

## 8. Driver brief

Implement `project-store` for Scriba (`bbartolome/scriba`, npm workspaces), API before UI, in phase order. Non-negotiables: every request names `projectId`; every path passes one guard; GET never mutates; only POSTs write; agent and recipe output becomes a pending change, never a direct write; errors use `PROJECT_`; only project-relative paths reach the UI, logs and tools. Do not touch Agent loop or Graph runner code. Use GLOSSARY terms exactly ("Run" for recipe runs only; no "proposal" in prose).

Wave order matters. `phase:contract` gates #21 (wave 1), #22 core-propose-graph, and #24's contract (wave 1). #25's contract is wave 2 (#26). Settle the owner OQs before the contract merges, not after.

Done when: contract, acceptance 1–4; files, nine items (GET item gated on #18) and M1 demo steps 1, 2, 5; search, acceptance 1–5; pending-review, acceptance 1–8 and demo steps 2–4 through the provider; migrations, acceptance 1–4.

Stop points: (a) at each phase end, report the acceptance results; (b) at each unmerged external gate in section 6; (c) before any unanswered OQ. Map conflicts (OQ1–4) and spec amendments (lines 127, 182, 256; #7) are owner stop points. Answer OQ1–4, 6, 7, 9, 10, 11, 13, 18, 19, 20 and 21 before `phase:contract` merges.

Using `/navigator:pair`: start the driver with this brief and section 3 as context. The navigator takes one non-owner OQ at a time and proposes an answer. The driver checks it against the cited line before accepting, and the navigator never decides a map conflict.
