# #20 Project store: implementation survey

Read: spec issue #20 (line numbers are `grep -n` on the body); map #1 and decisions #2–#15, including closing comments; tracker #26; `GLOSSARY.md`; sibling surveys #16–#25 (cross-check only). The author's brief is not in the repo and is cited by name only.

Status: revised for re-review. No reviewer pass has run yet. The README's map conflicts for #6 and #2 are §7 items 1, 4 and 22.

## 1. Approach

- **Repo state.** No app code exists. `git ls-files` shows no `apps/`, `packages/` or `examples/`, so every path in §2 is to be created.
- **Contract first.** Publish the Zod slice before module code. Platform's `phase:examples-check` imports the `project.yaml` schema.
- **One path guard.** Every entry point, HTTP or provider, calls one function. It applies the spec's path rules (lines 100–101), resolves symlinks to the real target or nearest existing ancestor, and checks reserved names on the real path. Links into `.scriba/` or `drafts/.versions/` are refused. Reserved names match case-insensitively on every OS (survey choice; line 103 requires case independence). Apply re-checks the stored `targetPath`. Writes go to a symlink's real path, so temp-and-rename never replaces the link.
- **Lock identity (survey choice).** Per-path locks key on `(dev, ino)` of the real target. Creates key on the parent's `(dev, ino)` plus the lower-cased name.
- **GET computes, POST persists (OQ4).** GET never writes (line 113). Search rebuilds, activation, migrations and persisted conflict flags run only from POSTs or the watcher. Apply is the only writer of agent and recipe output, through a temp file and rename.
- **API before UI.** Each phase lands its API first. The editor waits on Shell `phase:editor`. The review queue waits on `phase:shared-components` (§6).

## 2. Files and modules

All paths are [proposed], relative to the repo root.

- `packages/contracts/src/project-store/index.ts` — subpath entry `./project-store`.
- `packages/contracts/src/project-store/project-yaml.ts` — `project.yaml` schema.
- `packages/contracts/src/project-store/projects.ts` — summary, status, requests.
- `packages/contracts/src/project-store/files.ts` — file-API types.
- `packages/contracts/src/project-store/entities.ts` — entity reference, front-matter base, resolution.
- `packages/contracts/src/project-store/search.ts` — search request, passage.
- `packages/contracts/src/project-store/pending.ts` — pending change types.
- `packages/contracts/src/project-store/versions.ts` — draft-version listing.
- `packages/contracts/src/project-store/events.ts` — SSE members.
- `packages/contracts/src/project-store/routes.ts` and `errors.ts` — constants, codes.
- `packages/contracts/src/project-store/*.test.ts` — schema and round-trip tests.
- `apps/api/src/modules/project-store/project-store.module.ts` — `@Module`, imported by Platform's root.
- `apps/api/src/modules/project-store/library.service.ts` — discovery and statuses.
- `apps/api/src/modules/project-store/projects.controller.ts` — list, new, import, sample, activate.
- `apps/api/src/modules/project-store/active-project.service.ts` — `projects` section of `settings.yaml`.
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
- `examples/nonfiction/` — `project.yaml`, `sources/` (with `outline.md`), `drafts/` (three files), `.gitignore` (OQ14).
- `e2e/` (Platform-owned) — one added step; keep `e2e/fixtures/mock-openai/` paths in step.

## 3. Phase plan

Serial. Every phase is gated on Platform `phase:scaffold` (#26). Phase names are the tracker's and the spec's.

**phase:contract (M1)**
- Work: `project.yaml` schema with reserved `order` and `export` as passthrough objects; project summary and status enum; New, Import, Start-from-sample and Activate requests; project-relative path and file reference; file-API types (list, read, write, edit, propose); entity reference, front-matter base `{id, type, links?}`, resolution and entity list; search request and passage; pending change, origin, conflict and the accept, reject, refresh and accept-anyway requests; draft-version listing; SSE members; route constants and error codes.
- Done when: acceptance 1–4 pass. (1) The slice builds and imports from `apps/api` and `apps/web`, with only Zod at runtime. (2) Schema tests accept `project.yaml` with and without `order`, reject a missing `schemaVersion`, and keep unknown keys. (3) Pending-change, search and entity-reference schemas round-trip. (4) Platform's sample check imports the `project.yaml` schema.
- First test: `project-yaml.test.ts`. A minimal file parses without `order`; a missing `schemaVersion` is rejected; unknown keys survive a round trip.

**phase:files (M1)**
- Work: discovery and statuses; New, Import and Start from sample; the one active project with switching, persistence and "project not active"; path guard and reserved paths; file API (list, read, write with `baseHash`, edit) with atomic writes; in-process provider on the same guard; resolution and entity list; `project.yaml` YAML-document edits; "schema too new" refusal and the supported-version table (OQ20); nonfiction skeleton; `project.switched`; project picker and read-only files tree (`ngx-markdown`); Platform e2e "project from sample" step.
- Done when: the nine acceptance items pass. (a) Discovery lists exactly the non-dot immediate subfolders with `project.yaml` and marks the rest `importable`. (b) New makes the layout without `structure/`, with a `.gitignore` containing `.scriba/`. Import leaves every other file byte-identical (OQ8). (c) Start from sample copies the nonfiction sample under a chosen name; nothing is copied at startup. (d) The path-safety table passes over HTTP: `..`, absolute, backslash, NUL, symlink out (refused), symlink within (allowed), `.scriba/…` and `drafts/.versions/…` (reserved). (e) Requests naming a non-active project fail, and switching publishes `project.switched`. (f) `edit` fails distinctly on zero and on multiple matches; `write` with a stale `baseHash` fails with a write conflict. (g) Resolution returns contents for IDs in `entities/` and `sources/` and reports unknown and duplicate IDs. (h) A too-new `project.yaml` lists as `too-new` and cannot be activated. (i) Every GET is side-effect free. Item (i) waits on #18 `phase:token-guard`'s GET/HEAD test; until then, suites snapshot the library around each GET. Routes merge to `main` only after #18 `phase:token-guard` (§6). M1 demo steps 1, 2 and 5 run (OQ7).
- First test: `GET /api/project-store/projects` on a temp library with a dot-folder, a `project.yaml` folder and a bare folder. Expect one `ok` and one `importable`.

**phase:search (M2)**
- Work: per-project FTS5 database over `sources/` and `entities/`; paragraph passages; `(path, mtime, size)` manifest diff on activation and before queries; POST rebuild; `user_version` rebuild; orphan pruning; POST search and the same search on the provider; search box in the files UI.
- Done when: acceptance 1–5 pass. (1) Ranked `{path, offset, snippet, score}`, with the passage text at `offset`. (2) A host edit appears in the next query and a deleted file disappears, with no manual rebuild. (3) `drafts/` never appears. (4) An index with a different `user_version` is rebuilt and results stay correct. (5) FTS5 syntax characters (`"`, `*`, `-`, `NEAR`) do not error.
- First test: POST search for a `sources/` phrase returns `{path, offset, snippet, score}`, and the file text at `offset` starts that passage.

**phase:pending-review (M3)**
- Work: propose (write or edit with `origin`), with the per-run read overlay and same-run fold that keeps the first base; pending JSON store and `resolved/` folder; captured base (caller-supplied or captured); per-path validators; eager conflict detection; three-way check on apply; refresh; accept-anyway with backup; reject; draft versions on apply, with listing, read and restore; queue SSE events; optional watcher; review queue and version-history UI; the files editor with its stale-base warning (US18–19), moved here from `phase:files` (OQ7, OQ22); Platform e2e "accept change" assertion (OQ26).
- Done when: acceptance 1–8 pass. (1) Propose never changes the target on disk and emits one `pending.created`. (2) A second propose from the same run updates the change and keeps its base; a different run gets its own change. (3) Apply writes the proposal and, for an existing top-level draft, saves the previous content under `drafts/.versions/<name>/`. (4) A host edit before apply flags `base-changed` with `pending.updated`, and apply is refused; refresh clears the flag only when the edits do not overlap. (5) Accept-anyway keeps the overwritten disk content as a version or backup. (6) A proposed `graphs/` file that fails a registered validator is refused. (7) The queue works at phone width (list, diff, accept, reject) in a narrow-viewport UI test. (8) Restore saves the current content first. Demo steps 2–4 run through the provider at phase end; the phone-diff part of step 2 is the UI check.
- First test: propose on an existing file with no caller base leaves its bytes unchanged, captures disk content as the base, and emits one `pending.created` (name per OQ13).

**phase:migrations (M7, and before any file kind ships `schemaVersion` 2)**
- Work: registry keyed by kind and version, open to other modules (the Graph runner registers `graphs/`); `project.yaml` migrates on activation; other kinds on first write or an owning module's POST; GET returns the upgraded in-memory view; backups; `logs/migrations.log`.
- Done when: acceptance 1–4 pass. (1) With a test v1→v2 migrator, activating a v1 project rewrites `project.yaml` to v2, writes a backup and a log line, and creates no pending change. (2) A GET of a v1 file returns the upgraded view and leaves the file byte-identical. (3) A too-new file is refused for read and write. (4) Comments in `project.yaml` survive.
- First test: with a test v1→v2 migrator, activating a v1 project rewrites it to v2 with comments intact, writes a backup and log line, and creates no pending change.

## 4. Contracts

Produced by `@bbartolome/scriba-contracts/project-store`. Names are the spec's unless marked [proposed].

- `project.yaml`: `schemaVersion` (integer from 1), `title`, `genrePack` (OQ9, OQ24), `styleProfile?` (entity reference), `export?` and `order?` (passthrough until #25's contract phase narrows them, by expand–contract), `model?` `{providerId, model}` (defined here, OQ6). Unknown keys are preserved.
- Project summary: id (folder name), title, genre pack, active flag, status `ok | invalid | too-new | importable`. New, Import, Start-from-sample and Activate requests: field names [proposed].
- Project-relative path (POSIX string) and file reference.
- File API: list `{path, kind, size, mtime}`; read `{path, content, hash, mtime}`, plus `upgraded?` and `origin?` [proposed] (OQ20 and the overlay read); write `{path, content, baseHash?}`; edit `{path, old, new}`; propose: write or edit semantics plus `origin` and `base?` [proposed].
- Entity reference (a string ID); front-matter base `{id, type, links?}`; resolution result `{id, type, path, content}`; entity list filterable by `type`; prose syntax (OQ16).
- Search request `{query, limit?, scope?}`, with `scope` as `('sources'|'entities')[]`; passage `{path, offset, snippet, score}`.
- Pending change `{id, projectId, targetPath, kind: create|modify, diff, capturedBase: {hash, content} | null, proposed, origin, status, conflict, createdAt, updatedAt}`. `status` is `pending|accepted|rejected`. `conflict` is `null` or `{reason: base-changed|target-missing|target-exists, detectedAt}`. `origin` is `{kind:'agent-run', runId, toolCallId?}` or `{kind:'recipe-run', runId, nodeId}` (additions in OQ11).
- Draft-version listing `{draftPath, versions: [{id, createdAt, size}]}`.
- Events: `pending.created`, `pending.updated`, `pending.resolved`, `files.changed {paths}`, `project.switched`. Wire names follow OQ13.
- Routes under `/api/project-store/` (#16 line 106 mounts module controllers there); sub-paths [proposed]. Error codes use the `PROJECT_` prefix (#16 lines 159–168). The 19 spec error names become `PROJECT_` SCREAMING_SNAKE codes [proposed].

Consumed: Platform's envelope, error base and `SCRIBA_BOOKS_DIR`, `SCRIBA_WATCHER` and `SCRIBA_EXAMPLES_DIR`; Setup & auth's single global guard; Shell's API and SSE clients, diff view, editor, and the active-project nav slot; Model providers' `ModelChoice`, which Model providers asserts is compatible and does not import (OQ6). The `projects` section of `settings.yaml` belongs to this module.

Stubs until merged: an Agent-loop stand-in that calls the provider; a fake Shell client built from contract types; a test-registered `graphs/` validator. No guard stand-in: nothing ships publicly before the global guard.

## 5. Test strategy

- **Unit:** Zod schemas and round trips (contracts only).
- **Integration (primary):** the booted Nest app, or this module in a test app, against a temp library (`SCRIBA_BOOKS_DIR`) and a tiny temp sample (`SCRIBA_EXAMPLES_DIR`). Assert HTTP, SSE and disk bytes. Use real symlinks and no mock model, because this module never calls one. Suites follow the spec: discovery and creation; path safety; file API; active project; search; pending changes; migrations.
- **Linux path rows:** `.SCRIBA/…`, `Drafts/.Versions/…`, `drafts/.VERSIONS/…`, and symlinks into `.scriba/` and `drafts/.versions/`. Lock rows: hard-link and symlink aliases must serialise. Case-variant aliases need a case-insensitive mount, which Linux CI lacks.
- **Cross-spec lint risk:** the integration suites set `SCRIBA_EXAMPLES_DIR` to a temp sample. #16's proposed lint rule bans that literal in `*.test.ts` outside `e2e/` (#16 survey, examples-check item). Either the rule exempts `apps/api/test/project-store/` or the suites use another route. Flag to #16.
- **UI:** Angular Vitest with fake clients built from contract types. The narrow-viewport check uses Vitest browser mode [proposed].
- **Contract:** Zod tests in the contracts package. Platform's CI check validates `examples/` against the `project.yaml` schema (#13).
- **e2e:** Platform's one Playwright run. "Project from sample" at M1; "accept change → draft written and version created" at M3 (OQ26).
- **Fixtures:** unit and integration tests build their own temp projects and never read `examples/` (#13).

## 6. Dependencies

"A ← B" means B blocks A. Rows marked (tracker) are in the #26 gates table. Rows marked (spec) are not, and OQ28 asks to reconcile them.

**#20 is gated by**
- #16 `phase:scaffold`: every #20 phase (tracker). Hard gate.
- #17 `phase:core`: #20's UI phases, including the picker and files tree (tracker).
- #17 `phase:shared-components` and `phase:editor`: the review-queue diff and the merge view (spec, Consumes table).
- #18 `phase:token-guard`: public routes in every module (tracker). #20's routes merge to `main` after it. The GET item (line 281) waits on its GET/HEAD test (#18 line 28).
- Platform e2e steps "project from sample" and "accept change": #16 `phase:test-harness` and #17 `phase:core` (survey assumption, plus OQ26).
- #19: none from its contract. #19 checks that the model override stays compatible (tracker).

**#20 gates**
- #17 `phase:editor` ← #20 `phase:contract` (tracker).
- #18 `phase:setup-flow` ← #20 `phase:contract` (tracker). The first-project requests come from `phase:files`, so the survey recommends that gate (OQ18).
- #19 `phase:project-override` ← #20 `phase:contract` + `phase:files` (tracker).
- #16 `phase:examples-check` ← #20 `phase:contract` (tracker).
- #21 `phase:contract` ← #20 `phase:contract` (spec: #21 line 226; not in tracker).
- #21 `phase:executor` ← #20 `phase:contract` (spec: #21 line 280; the tracker lists only #19 client).
- #21 UI phases ← #20 `phase:files` (tracker), and ← #17 `phase:editor`.
- #22 `phase:core-propose-graph` ← #20 `phase:contract` (spec: #22 line 183; the tracker lists only #21 and #24 contracts).
- #22 `phase:nonfiction-workhorses` ← #20 `phase:files`, for the sample skeleton (tracker).
- #23 `phase:file-tools-chat` ← #20 `phase:files` (tracker).
- #23 `phase:pending-writes` ← #20 `phase:pending-review`. #23 `phase:grounding` ← #20 `phase:search` (tracker).
- #24 `phase:contract` ← #20 `phase:contract` (spec: #24 line 273 imports file and entity references from `/project-store`; not in tracker).
- #24 `phase:engine` ← #20 `phase:files` + `phase:pending-review` (tracker).
- #25 `phase:contract` ← #20 `phase:contract` (spec: #25 line 262; not in tracker). #25's narrowing of `order` and `export` lands here (#25 line 276).
- #25 `phase:assembly-preflight` ← #20 `phase:contract` + `phase:files` (tracker; also #25 line 285).

Runtime, not a gate: the Graph runner registers its `graphs/` validator with #20. #24's survey places that at `phase:pending-review`; #23's survey places it at engine (OQ28 and #24 to settle).

Stubs meanwhile: fake UI without Shell core; read-only files and diff without the editor (spec-allowed); a fake validator without the Graph runner; the §4 stand-in without the Agent loop.

## 7. Open questions (recommended answers)

Owner stop points, each with a recommendation. Items 1–4 and 22 are map conflicts: the map wins, so the owner confirms each. Items that amend a spec line or a sibling spec name it.

1. **Migration trigger (map).** #7 and #12 say project files migrate "lazily on open" (closing comments). #6 and the GET invariant say GET never mutates. The spec already migrates only from POSTs (line 189). Rec: keep activation and first-write; owner amends the "on open" wording in #7 and #12 (#24 line 115 uses it too).
2. **Every draft versioned (map).** #14 q1 says every draft. #14 q6 and spec lines 177–178 version only on apply, and only existing top-level drafts. Rec: apply-only, since per-save versions flood `drafts/.versions/`. Owner confirms #14 q1 as amended.
3. **`structure/` (map).** The brief's layout includes `structure/`. No closed decision names it (#5, #11 and #13 are silent). The spec drops it (lines 88 and 403) by citing #11. Rec: keep it dropped; owner records that in #11 or the glossary.
4. **GET conflict flags and the queue GET (map).** #6 forbids GET writes. Line 162 sets flags when the queue is listed and publishes `pending.updated` when a flag changes. The Graph runner badges graphs from the queue listing (#24 line 127). The entity list and ID→path map rebuild from the manifest "on the next request" (line 130), which is also a GET write. #21's GET re-scans the user pack (#21 line 86), the same issue for #21. Rec: GET computes flags and maps in memory; conflict flags persist only from the watcher or a POST; `pending.updated` fires on persist. #21 settles its own GET.
5. **Restore (spec).** Line 177 says versions are written only on apply. Line 179 and AC line 328 say Restore writes one first. Rec: restore saves a version first, as the AC says; amend line 177. Snapshot restore is a separate path. #25 line 237 writes no per-draft version there and asks the Project store to confirm (#25 survey item 4). Owner confirms.
6. **Model override (spec).** Line 122 and the Consumes line (251) name Model providers' choice type. The Contracts table (line 379) and the tracker define it here. Rec: local `{providerId, model}`; amend lines 122 and 251. #19's Q4 asks for the same.
7. **M1 demo steps 3–4, and editor placement (spec).** Steps 3–4 (lines 288–289) need the editor, which waits on Shell `phase:editor` (line 268). Rec: at M1, show the write and the conflict through the API (after #18, with cookie and Origin). The UI parts move to `phase:pending-review` at M3, as §3 shows. Owner confirms the move out of `phase:files`.
8. **Import versus byte identity (spec).** Line 89 appends `.scriba/` to `.gitignore`. AC line 274 says import leaves "every other file byte-identical". Rec: only `.gitignore` (when the line is missing) and a minimal `project.yaml` may change; an invalid folder writes nothing (US8, line 31). Amend AC line 274.
9. **`genrePack` on New and import (spec).** Line 117 lists it as required (no `?`). New (line 88) takes no pack, and minimal import (line 89) writes only title and `schemaVersion`. Rec: New takes an optional pack, defaulting to the Setup & auth preference when set, else `nonfiction`; minimal import writes `nonfiction`. #18 Q10 raises the same default.
10. **Agent write base and timing (spec; sibling #23).** #23 captures the base at first read (its line 122), keeps its own run overlay, and creates pending changes once at run end (its lines 121 and 124). #20 proposes per call and captures the base at first propose unless the caller supplies one (lines 111, 150–152). A host edit between first read and first write would be absorbed silently. Rec: agent writes propose per call and always pass the first-read base. The Agent loop uses #20's read overlay, not its own, as #23's survey proposes. Owner amends #23 line 124.
11. **Origin and provenance are thin (spec; siblings #23, #24).** #24 needs `graphId` and `sourcesUsed` on the recipe origin (#24 line 194). #23 attaches provenance `{runId, toolCallId, tool, entityIds, sourcesUsed, model, at}` to the pending change (#23 line 118). The same-run fold (line 111) is keyed by target, so two output nodes that share a target merge, which breaks #24's one change per output node. Rec: add optional fields in `phase:contract`: `graphId` and `sourcesUsed` on the recipe origin, and optional `provenance` on the change. Key the fold on `(run, target)`. The Graph runner gives each output node its own target and refuses duplicate explicit targets.
12. **Edited and partial accept (sibling #17).** #17 line 118 sends edited text from the merge view and leaves the accept request's shape to #20. The spec's accept request has no content field. Rec: optional `content` on accept, through the same three-way check; no partial accept in v1.
13. **Event names and `projectId` (sibling #16).** Platform requires kebab-case `type` (#16 line 141). Its example is `platform/echo` (#16 line 153). The spec uses dotted names (lines 169–172, 364). Rec: `pending-created`, `pending-updated`, `pending-resolved`, `files-changed`, `project-switched`, with `projectId` in `data` for project-scoped events. Answer before the contract merges.
14. **Samples (spec; siblings #13, #22, #25).** Rec: (a) the nonfiction sample ships a `.gitignore` with `.scriba/`, since demo step 2 (line 287) needs it, and #13's skeleton list omits it, so the owner adds it. (b) `sources/` front matter is optional, and a file without it defaults to `type: source`. Sample sources do carry `id`, `type: source`, `title`, `citation`, `url` and `reliability`, as #22 asks (#22 line 116); field names agreed with #22. (c) Three drafts, inside #13's 2–3 range, as #25 asks (#25 survey item 8). (d) No `.scriba/`, `logs/`, `snapshots/` or `.versions/` ships (line 419).
15. **Refresh on missing or existing targets.** Rec: refresh only for `base-changed`. The spec's merge (line 166) covers overlapping hunks only. `target-missing` and `target-exists` resolve by accept-anyway or reject.
16. **Prose entity syntax (spec gap; siblings #22, #25).** The spec defines no prose syntax (line 127). #22 uses Pandoc-style `[@id]` citations (#22 lines 82, 329). #25 checks "the Project store's entity reference syntax" in manuscript bodies (#25 line 198). Rec: publish `[@id]` as the prose form in `phase:contract`, as a pattern constant and parser that resolution uses, and use front-matter `links` for entity links. If the owner rejects prose syntax, #22 and #25 change.
17. **Temp files in `drafts/` (spec).** Line 108 writes temp files in the same folder. Rec: dot-prefixed temp names, swept on activation. Compile skips hidden files (#25 line 114).
18. **Terms and gates.** `GLOSSARY.md` has no "agent run", though the spec uses `agent-run` and "agent run" (line 143). "Run" is recipe-only. The tracker's `#18 setup-flow` gate names `phase:contract`, but #18's first-project requests come from `phase:files` (#18 survey Q2). Rec: add "Agent run" through `/domain-modeling` before the contract merges; owner moves the tracker gate to `phase:files`.
19. **Stale `projectId` after a rename (US31).** A renamed folder gets a new id (line 84). Pending JSON stores `projectId` (line 141) and travels with a move or copy (US31, line 54). Rec: derive the id from the folder name on load; rewrite stored values only in a POST, never in a GET.
20. **Migration hash and older files.** Rec: `hash` covers disk bytes. A GET of an older file returns an upgraded view with `upgraded` [proposed]. Apply checks the captured base against the disk hash, then migrates (backup and log line) and writes. Refresh merges against the upgraded in-memory view. Ship the supported-version table in `phase:files`.
21. **Defaults.** Rec: SHA-256 of UTF-8 for `hash`; NUL sniff plus an extension allowlist for "not text"; the 5 MB cap (line 107) applies to writes too; search `limit` 10, max 50; ULID pending IDs (line 148 asks for sortable, time-based IDs). All [proposed].
22. **Phone scope versus editor gating (map #2).** #2's closing comment gives phones "reading, light edits". #17 (lines 8, 112, 126) agrees. The spec puts the editor on desktop and tablet (line 212) and keeps phone files read-only (line 213). Rec: follow the map. Phones get the edit and preview toggle for light edits once #17 `phase:editor` lands (M3); at M1 phone files stay read-only. Owner amends line 212, or defers phone editing and amends #2. #17's survey recommends the same.
23. **Shell route project versus the one active project (sibling #17).** #17 reads the active project from the route (`projects/:projectId/`, #17 line 86). The spec has one library-wide active project (lines 94–95). A tab on another project's route gets "project not active". Rec: keep the spec rule. The Shell shows a "not the active project" notice with a switch action, refreshed on `project.switched`. Owner confirms with #17.
24. **`genrePack` values (siblings #18, #21, #22).** The spec allows a user pack (line 119). #22 names only `nonfiction` and `fiction` (#22 line 72). #21 proposes built-in names only. #18 wants user packs as the default option. Rec: the schema keeps a free string (spec, and forward-compatible). v1 offers built-in names. An unknown name gets core tools only, plus a warning from the Tool registry. #18, #21 and #22 confirm.
25. **Bulk and binary I/O for #25 (sibling #25).** The spec puts delete, rename, move and binary files out of v1 (line 408). #25 needs snapshot copy and restore (the spec allows a bulk primitive, #25 line 109), a binary read for export, and an exports location (#25 survey item 15). Rec: add a provider-only copy-tree and binary read, both behind the same guard and scoped to `snapshots/` and export inputs. Delete and HTTP binary I/O stay out of v1. Owner confirms with #25.
26. **e2e "accept change" timing (spec).** Line 318 asks for the assertion at M3. The survey defers it as a follow-up blocked by #23 `pending-writes`, which is also M3. Rec: land it when #23 `pending-writes` merges, and use the follow-up only if that merge slips. Owner confirms.
27. **Entity IDs for new entity files (sibling #22; #23 line 127).** Rec: the Project store does not assign IDs. A file with no `id` resolves by stem (line 128), and duplicates are reported on resolution. The Agent loop and #22's prompts supply `id`.
28. **Tracker gaps (siblings).** §6 lists the spec-level edges to #20 that the #26 table omits: #21 contract and executor, #22 core-propose-graph, #24 contract, and #25 contract. Rec: add them to #26, since the specs already state them. Owner confirms. Also reconcile the Graph validator's registration phase (§6).

Answer before the contract merges: 1, 4, 6, 9–13, 16, 19–21 and 24.

## 8. Driver brief

Implement `project-store` in `bbartolome/scriba` (npm workspaces), API before UI, phases in order. Non-negotiables: every request names `projectId`; every path passes one guard; GET never mutates (compute on read; persist only in POSTs and the watcher); only POSTs write; agent and recipe output is a pending change, never a direct write; errors use `PROJECT_`; only project-relative paths leave the module. Do not touch Agent loop or Graph runner code. Use GLOSSARY terms exactly: "Run" is recipe-only; use "agent run" for the agent once OQ18 lands; "proposal" stays out of prose (use "propose" for the operation and "pending change" for the object).

Wave order: the contract gates the #21 and #24 contracts and #22 core-propose-graph (all wave 1). #25's contract is wave 2 (#26). Settle the owner OQs before the contract merges (§7).

Done when: contract, acceptance 1–4; files, nine items (GET and public routes gated on #18 `phase:token-guard`) and demo steps 1, 2, 5; search, acceptance 1–5; pending-review, acceptance 1–8 and demo steps 2–4 through the provider; migrations, acceptance 1–4, before any file kind ships `schemaVersion` 2.

Stop points: each phase end (report acceptance results); each unmerged gate in §6; each unanswered OQ. Every §7 item is an owner stop, and OQ1–4 and 22 are map conflicts. The navigator may draft answers for OQ15, 17, 20 and 21 only, each checked against its cited line. It never decides a map conflict.

`/navigator:pair`: start the driver with this brief and §3. The driver checks each answer against the cited line.
