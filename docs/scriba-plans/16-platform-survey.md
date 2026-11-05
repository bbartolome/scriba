# #16 Platform: implementation survey

Scope: Platform, phases `phase:scaffold` to `phase:examples-check`. Checked against spec #16, map #1 (decisions #1 to #15), tracker #26 (phase names, gates, milestones), `GLOSSARY.md`, and sibling surveys #17 to #25 (read for consistency only). Status: revised 2026-11-05 after round 3; re-review pending. Map conflicts: §7 items 1 to 4. Spec amendments and sibling requests are owner stop points. Names the spec does not give are marked `[proposed]`.

## 1. Approach

- **Contracts first, as built output:** ten `exports` subpaths, nine empty, so wave 1 unblocks at `phase:scaffold`. Each slice is a folder with `index.ts`, the layout the sibling surveys use.
- **Boot, then listen:** env, app-state check, settings hook and `[proposed: registerBootStep]` run before `listen(8080)`; a 200 from `/healthz` means ready.
- **`/events` is a raw response, not `@Sse()`,** so heartbeats, `retry` and backpressure stay in our hands.
- **Tailnet filter on `net.BlockList`:** block `100.64.0.0/10` and `fd7a:115c:a1e0::/48` after unwrapping `::ffff:` peers. A blocklist lets the Docker gateway pass.
- **One Platform integration branch,** phases in spec order, landed on `main` by the integrate step. Whether the release track runs beside wave 1 is §7 item 1.

## 2. Files and modules

Relative to the repo root. `git ls-files` shows no app, package, `deploy/`, `e2e/`, `examples/`, `scripts/` or `.github/` file yet, so everything below is new. Paths the spec does not name are `[proposed]`.

- Root: `package.json` (workspaces `packages/contracts`, `apps/api`, `apps/web`, `packages/packs`, plus `e2e` because Playwright needs its own dev dependencies; scripts `dev`, `build`, `test`, `lint`, `e2e`, `mock:openai`), lockfile, `.nvmrc`, `.gitignore`, `tsconfig.base.json`, `eslint.config.mjs`, `README.md` (security notes, including the app's control of tailscaled), `docs/adr/0001-serve-mechanism.md`, `.github/workflows/{ci,publish}.yml`, `.releaserc.json`, `examples/.gitkeep`, `scripts/check-examples.ts` (§7 item 6).
- `packages/contracts/src/platform/` and nine empty `src/<slug>/index.ts`; `packages/contracts/test/platform/`. `packages/packs/` is a workspace with `passWithNoTests` until #22 adds tests.
- `apps/api/src/{main.ts,app.module.ts}`, `modules/platform/` (`index.ts` as the `@Module`, controller, `events/`, `errors/`, `validation/`, `config/`, `settings/`, `static/`, `boot/`), `vitest.config.ts`, `test/`.
- `apps/web/`: generated Angular and Material app and `proxy.conf.js`, which forwards `/api`, `/healthz` and `/events` and leaves `Host` and `Origin` unchanged (#18 requires it). #17 takes both over at `phase:core` (§7 item 2).
- `e2e/`: Playwright workspace, `tests/journey.spec.ts`, `fixtures/mock-openai/`.
- `deploy/`: `Dockerfile`, `entrypoint.sh`, `compose.yaml`, `tailscale-serve.json` (the Serve candidate), `compose-version`, `dispenser.sh`, `build-multiarch.sh`, `RUNBOOK.md`, `smoke/image-smoke.sh`, `test/installer.test.ts`.
- Additive edits by siblings to Platform files: `ci.yml` steps from #21 and #25 (§7 item 23); dependency lines in `apps/api/package.json` and the lockfile; one `@Module` import per module in the composition root.

## 3. Phase plan

1. **`phase:scaffold`** (M1). Blocked by: nothing. Work: workspaces and pins; `/platform` slice with nine empty subpaths; composition root (env with `SCRIBA_PORT`, app-state check, tailnet filter, error filter, Zod pipe, `/healthz`, version, `/events`, echo, settings hook); SIGTERM closes streams; `Cache-Control: no-cache, no-transform`, no compression, no CORS; dev library defaults (git-ignored repo-local `SCRIBA_BOOKS_DIR`; `SCRIBA_PACKS_DIR` and `SCRIBA_EXAMPLES_DIR` at `packages/packs` and `examples/`); dev proxy with `/events` unbuffered (#17 core acceptance 1); boundaries rule covering `apps/web` feature folders; `ci.yml` with the PR-title check; bare `apps/web`. Acceptance coverage (spec order):
   - `npm ci && npm run dev` serves the placeholder through the Angular dev server, with `/api`, `/healthz` and `/events` proxied. Demo step 1, plus a proxy check.
   - `build`, `test` and `lint` pass from the root and cover every workspace. CI run.
   - All ten subpaths resolve in the API runtime and the Angular build; no root barrel. Boot test (§5).
   - `GET /healthz` returns 200 `{status:'ok', version}`; `GET /api/platform/version` returns the version info shape. Integration.
   - `/events`: `platform/hello` first; `POST /api/platform/echo` delivers `count` echo envelopes in order to every open stream; heartbeat at least every 15 s. Integration with two streams and an injected interval.
   - Invalid body to a test controller using the pipe returns `PLATFORM_VALIDATION_FAILED`; unknown `/api` route returns `PLATFORM_NOT_FOUND`; non-API path returns `index.html`.
   - A `settings.yaml` that is behind is backed up and migrated by registered section steps before `/healthz` answers; a newer `schemaVersion` exits non-zero with a clear message. The refusal uses a spawned process.
   - Unwritable `/books/.scriba/` exits non-zero with a message naming the UID/GID. Spawned process.
   - A Tailscale-range peer is refused; loopback is not. Predicate test (§5).
   - A test import from `modules/graph-runner` into `modules/agent-loop`, and the reverse, fails lint.
   - `ci.yml` is green on the scaffold PR. Scope only: a non-Conventional PR title fails the PR-title check.
   
   Done when: every criterion above passes. Demo (four steps): placeholder page; `/healthz`; hello, then three echoes; refusal on a high `schemaVersion`. First test: in-process app on a temp `SCRIBA_BOOKS_DIR`; `GET /healthz` returns 200 with `{status:'ok', version}`.
2. **`phase:test-harness`** (M1). Blocked by: `phase:scaffold`. Work: mock server with path-selected scenarios (`…/scenario/<name>/v1`), data-file steps (content deltas, tool-call arguments split across chunks, status with headers, delay, dropped connection), request recording, per-scenario reset, the two baseline scenarios `tool-call` and `malformed-tool-call`, `npm run mock:openai`; Playwright harness with five placeholder steps; e2e in `ci.yml`. Mock additions requested by #19 are §7 item 21. Acceptance coverage:
   - The official `openai` SDK on `…/scenario/tool-call/v1` gets a streamed tool call with arguments split across chunks, then a text answer after the tool result is sent. First test.
   - `malformed-tool-call` returns invalid arguments on turn 1 and valid ones on the retry.
   - A scenario can return a status with headers (429 with `Retry-After`), delay, or drop the connection; recorded requests are readable and resettable per scenario.
   - Two tests on different scenarios in parallel do not interfere.
   - `npm run e2e` boots the app against a temp library and the mock server, passes the app-loads check, and reports the five journey steps as pending.
   - CI runs the e2e and uploads Playwright traces on failure.
3. **`phase:image-compose`** (M1, release track; not needed for the dev-server M1 demo). Blocked by: `phase:scaffold`. Work: two-stage Dockerfile; entrypoint (app, or the `SETUP=true` stub); compose with both services, `init: true`, `restart: unless-stopped`, and `SCRIBA_PORT` passed into `scriba`; shared LocalAPI socket volume at `/var/run/tailscale` (the acceptance below needs it); Serve candidate; healthcheck; local multi-arch build script; packs copy narrowed if §7 item 23 is accepted. Acceptance coverage:
   - The runtime stage has Node LTS, Pandoc 3.13, Typst and `ca-certificates`, and no git or compiler; the size is measured and recorded.
   - `docker run` with no sidecar and no library mount fails clearly on the app-state check; with a writable `/books` mount, `/healthz` returns 200.
   - `docker compose up -d` with no auth key reaches `healthy`; the app answers on `127.0.0.1:${SCRIBA_PORT}` and on no other host interface. Owner-only host (`/dev/net/tun`, `NET_ADMIN`).
   - Files the app writes into the library are owned by `SCRIBA_UID:SCRIBA_GID` on the host.
   - As its non-root UID, `scriba` gets `BackendState` from `GET /localapi/v0/status` over the shared socket (`NeedsLogin` before login).
   - `host.docker.internal` resolves inside `scriba`.
   - The image builds natively on amd64 and arm64. Owner-only arm64 host.
   
   First test: `docker run` with no `/books` mount exits non-zero, naming the UID/GID.
4. **`phase:smoke`** (M1, release track). Blocked by: `phase:image-compose`. Work: ST-1 to ST-3 runbook in `deploy/RUNBOOK.md` with map #2's tailnet prerequisites, ST-4 marked deferred; ST-1 to ST-3 run on real hardware; ST-1 decides `TS_SERVE_CONFIG` vs the CLI loop (tracker); ADR `docs/adr/0001-serve-mechanism.md` [proposed filename]; compose set to the ST-1 winner; Linux Ollama hint. Acceptance coverage (manual):
   - ST-1 passes for one Serve variant, and compose ships that variant. The ADR records both attempts and their results.
   - ST-1 extras: `http://scriba` and `http://<100.x>:8080` are refused from another tailnet device.
   - ST-2: ten `platform/echo` envelopes over the tailnet URL arrive unbatched, within about 250 ms of `sentAt`, over HTTP/2.
   - ST-3 passes on a Mac (Docker Desktop) and on Linux (Docker Engine); the Linux host-binding requirement is written into the installer hint and the setup guidance.
   - The runbook names ST-4 as deferred (§7 item 3).
   
   First check: ST-1 step 1 on the Mac. Owner-only throughout.
5. **`phase:installer`** (M1, release track). Blocked by: `phase:smoke` (the compose it installs is final). Work: dispenser emitted by `SETUP=true`; first install; re-run merge with backups; `SCRIBA_COMPOSE_VERSION` stamp; `compose.override.yaml` never written; setup-URL printing (fallback per §7 item 11); fast-path, pinning and rollback docs. Acceptance coverage:
   - On a clean machine the one-liner checks Docker and Compose v2, creates `~/Books/.scriba/`, writes `.env` (host UID/GID), the compose file and an optional `.secret` (0600), starts the stack, waits for healthy, and prints the setup URL. It falls back to the loopback URL if `setup-url` is absent, unless §7 item 11 changes this.
   - With no TTY, first install uses defaults without prompting; nothing but the script goes to stdout.
   - A missing Docker or Compose v2 aborts before anything is written.
   - Re-run with `.env` present prompts for nothing; `.env` and the compose file are backed up with a timestamp; existing values are kept, new keys added, `SCRIBA_COMPOSE_VERSION` updated, and `compose.override.yaml` untouched.
   - A second re-run changes nothing beyond new backups.
   - Setting `SCRIBA_IMAGE_TAG` to an older tag and running `up -d` rolls back; this is documented with the backup restore.
   
   Demo (four steps): one-liner prints the URL; `~/Books/.scriba/` ownership; silent re-run with backups; `docker compose ps` shows both services healthy. First test: Vitest with the stub `docker` on `PATH` (records calls, serves the `tar` extraction) and an empty temp `HOME`; with no `docker` on `PATH`, the script exits non-zero and writes nothing.
6. **`phase:ci-publish`** (M1, release track). Blocked by: `phase:installer`, and `[proposed]` #18 `phase:token-guard` (§7 item 9). Work: `publish.yml` plan, build, smoke, merge, release; `concurrency` group so plan and release cannot race; semantic-release that never commits back; Docker Hub secrets; pre-release checklist linking the ST runbook, with #18's socket-permission smoke test and the ST-1 peer-address check; image smoke jobs. Acceptance coverage:
   - A push to `main` with no releasable commit publishes `latest` and `sha-<short>` for both arches and creates no git tag.
   - A `feat:` or `fix:` commit also publishes the semver tag, then creates the git tag and GitHub release; the image reports that semver from `/healthz`.
   - A failure in any build or smoke job leaves no new Docker Hub tag and no git tag.
   - The smoke checks pass on both arches: dispenser output passes `bash -n` with nothing else on stdout; the manifest lists amd64 and arm64; `pandoc --version` reports 3.13 and `typst --version` runs; a Markdown file converts to DOCX, EPUB and PDF (via Typst) inside the image; `docker run` with no sidecar returns 200 from `/healthz`; an FTS5 `MATCH` through `node:sqlite` returns a row. The conversion checks go beyond #7's version checks. The #22 packs check is added here if §7 item 23 is accepted.
   - No step relies on a tag push triggering another workflow, and no PAT or App token is required.
   
   Owner-only: Hub secrets, pushes to `main`, releases. First test: semantic-release dry run over a `chore:`-only range prints no release.
7. **`phase:examples-check`** (M1, extended through M6 as the samples grow). Blocked by: `phase:test-harness`; #20 `phase:contract`; #24 `phase:contract`; #21 `phase:loader-validation`. Work: `examples/` check (wired into `lint` per §7 item 5); Project store, Graph runner and Tool registry validators; excluded-folder check; lint rule that no unit-test file outside `e2e/` reads `examples/` or `SCRIBA_EXAMPLES_DIR` `[proposed: ESLint no-restricted-syntax on those string literals in **/*.test.ts]`. Acceptance coverage:
   - Every `project.yaml` parses with the Project store schema; every entity's front matter parses with the entity base; every `graphs/` file parses with the Graph runner schema.
   - Every recipe tool node names a built-in tool, and its params validate against that tool's inputs.
   - A sample containing `.scriba/`, `logs/`, `snapshots/` or `drafts/.versions/` fails the check.
   - A deliberately broken sample file fails CI with its path and the schema issue.
   - The check passes on an `examples/` folder holding only the nonfiction skeleton, and keeps passing as milestones add content. The skeleton comes from #20 `phase:files`; §7 item 5 covers the tracker row that omits it.
   
   Scope only: a unit test that reads `examples/` fails lint. First test: a fixture containing `.scriba/` fails, naming the path.

## 4. Contracts

Spec names verbatim; `[proposed]` marks invented names.

**Produces, `@bbartolome/scriba-contracts/platform`:**
- Module slugs: ten, shared by subpath names and the envelope's `module` field (eight in the enum; `shell` and `genre-packs` publish nothing). Route prefixes: §7 item 18.
- Envelope `{module, type, data}`. The spec's shorthand `platform/hello` means module `platform`, type `hello`; the wire `type` is kebab-case with no prefix. This answers the Platform question in #20 OQ13. Members: `platform/hello {streamId, version, serverTime}`, `platform/echo {seq, sentAt}`.
- Stream constants: `/events`, retry hint, 15 s heartbeat, `POST /api/platform/echo` with `{count, intervalMs}`.
- `SCRIBA_*` names and defaults; `/healthz` `{status: 'ok', version}`; version info `{version, revision, builtAt, composeVersion}`.
- Error shape `{error: {code, message, details?}}`; `PLATFORM_VALIDATION_FAILED`, `PLATFORM_NOT_FOUND`, `PLATFORM_PAYLOAD_TOO_LARGE`, `PLATFORM_INTERNAL`.
- Empty subpaths: `/setup-auth`, `/providers`, `/project-store`, `/tool-registry`, `/agent-loop`, `/graph-runner`, `/compile-export`, `/shell`, `/genre-packs`.

**Exposed, not contracts:** the `@Module` import; `[proposed: StreamPublisher]`; `[proposed: ZodValidationPipe]`; `[proposed: registerBootStep]` (pre-listen, after settings migration, used by Setup & auth to write `setup-url`, §7 item 11); settings hook `[proposed: registerSettingsSection]` taking `{fromVersion → step}` keyed by section (§7 item 7), with atomic `[proposed: readSection]` and `[proposed: writeSection]`; mock `…/scenario/<name>/v1` with `[proposed: …/__mock/requests]` and `[proposed: …/__mock/reset]`.

**Consumes:** Project store `project.yaml` schema and entity front-matter base (#20 `phase:contract`); Graph runner graph schema (#24 `phase:contract`); Tool registry loader and Ajv validation (#21 `phase:loader-validation`); Setup & auth's global guard (#18 `phase:token-guard`), which Platform's guarded routes (`/events`, version info, echo) adopt. `/healthz` and the static bundle stay public, as #18's public set pins them. No guard stub: until `phase:token-guard` lands, the API is unguarded in dev only and no image publishes. The `SCRIBA_DEV_ORIGINS` format is pending §7 item 10.

## 5. Test strategy

- **Unit (Vitest):** `/platform` Zod schemas; the tailnet predicate, tested directly as the spec allows, including `::ffff:100.64.0.1`.
- **Integration (Vitest, primary seam):** in-process app on a temp library: `/healthz`, version info, `/events` (hello, echo order, fan-out, heartbeat, backpressure), error bodies, SPA fallback, settings backup and migration. Inject the heartbeat interval. The three pre-listen failures (newer `schemaVersion`, unwritable `.scriba/`, bad `SCRIBA_*`) use a spawned process and never bind a port. A boot test resolves the ten subpaths in Node and in the Angular build.
- **Lint:** boundaries rule via `RuleTester`; `graph-runner` importing `agent-loop`, and the reverse, must fail. In phase 7, a unit-test fixture reading `examples/` must fail the examples-read rule.
- **Installer:** Vitest never uses the real `docker` (a stub on `PATH`, or none for the abort case). It runs `deploy/entrypoint.sh` with `SETUP=true` on the host, using `SCRIBA_INSTALLER_DIR` `[proposed]` because the files live at `/opt/installer` in the image (§7 item 20). `ci.yml` runs `test` before `build` and builds no image. Non-TTY cases run under `setsid`. The installer tests sit in `deploy/test/` under the root Vitest config (§7 item 25).
- **Mock OpenAI:** the official `openai` SDK as client. Step types as §3 phase 2, plus the two `[proposed]` capabilities in §7 item 21.
- **E2E:** one Playwright spec, `e2e/tests/journey.spec.ts`, against the dev stack, provisional until §7 item 4 is confirmed (Angular dev server with proxy, temp `SCRIBA_BOOKS_DIR`, mock server); app-loads live, five steps pending (§7 items 4 and 22). Traces on failure.
- **Image and manual:** `deploy/smoke/image-smoke.sh` runs in `publish.yml` and locally. ST-1 to ST-3 are manual. The re-run pull check `[proposed]` needs a local registry, see §7 item 19.

## 6. Dependencies

- **Merge first:** nothing. Platform is wave 0; map decisions #1 to #15 are closed.
- **Tracker rows involving Platform** (the consumer waits on the producer):
  - Every module's first phase (#17 to #25) waits on Platform `phase:scaffold`.
  - Platform `phase:examples-check` waits on #20 `phase:contract`, #24 `phase:contract` and #21 `phase:loader-validation`.
  - Public routes in every module wait on #18 `phase:token-guard`. Read here as covering Platform's guarded routes (`/events`, version info, echo) and its public `/healthz`; the tracker does not say so explicitly.
- **Platform's own chain (spec Blocked by):** `test-harness` ← `scaffold`; `image-compose` ← `scaffold`; `smoke` ← `image-compose`; `installer` ← `smoke`; `ci-publish` ← `installer`; `examples-check` ← `test-harness` plus the three contracts above.
- **Edge not in the tracker or the spec:** `ci-publish` ← #18 `phase:token-guard` (§7 item 9).
- **Platform gates requested by sibling surveys** (not in #26; the owner adds or declines):
  - #18: the token-guard e2e leg ← `test-harness`; installer demo step ← `installer`; `tailnet` ← `image-compose` (socket volume) and `smoke` (ST-1).
  - #19 `phase:client` ← `test-harness`, for the mock server.
  - #20 `phase:files` ← `test-harness`, for the "project from sample" step.
  - #21 `phase:executor` ← `test-harness`, for mock scenarios.
  - #22 `phase:core-propose-graph` ← `image-compose`, and its closing ticket ← `ci-publish`; `phase:nonfiction-workhorses` ← `examples-check`.
  - #23 `phase:file-tools-chat` ← `scaffold` and `test-harness`.
  - #24 `phase:engine` ← `test-harness`; `phase:canvas` ← `examples-check`.
  - #25 `phase:contract` ← `examples-check` (its nonfiction-sample criterion); `phase:export` ← `image-compose` and `ci-publish`.
- **Critical path:** the release track (`image-compose`, `smoke`, `installer`, `ci-publish`) gates #18 `tailnet`, #22's closing ticket and #25 `phase:export`. A slip there delays M3 and M5 even though wave 1 is free to start.
- **Stubs:** none from Platform. Sibling stubs of Platform pieces belong to those surveys.

## 7. Open questions

Map conflicts (items 1 to 4) each need owner confirmation before the phase they block closes. The rest are spec amendments, sibling requests or Platform-internal choices, as labelled.

1. **Phase order and branch (map #3 vs spec Waves).** Owner stop point. #3 says each spec runs on its own integration branch with serial phases. The spec's Further Notes (Waves) lets the release track run beside wave 1, which needs a second Platform branch. Recommend: one Platform integration branch in listed order; wave-1 modules branch from `phase:scaffold` once it merges; the release track stays on the Platform branch after scaffold. Owner confirms, or amends #3 or the spec.
2. **Web root (map #4 vs spec).** Owner stop point. #4 gives the Shell `app.config.ts`, the route table and `proxy.conf.js`; the spec has Platform generate a bare `apps/web` in scaffold. Recommend: Platform generates them; #17 takes over at `phase:core`, as #17's survey already assumes.
3. **ST-4 (map #7 vs #4 and spec).** Owner stop point. #7's pre-release checklist lists ST-1 to ST-4. #4 defers ST-4 and the spec follows #4. Recommend: ST-4 stays deferred; amend #7.
4. **E2E target (map #7 vs spec).** Owner stop point. #7 says one Playwright run against the dev server, and the spec's Scripts line agrees. The spec's harness line instead says "the dev build of the API (serving the web bundle)". #17 Q6 also asks for a second, production-build Playwright project for PWA checks (installability, service-worker exclusions, streaming after install, reload prompt, axe). Recommend: the dev stack for the one run; align the harness line to it; PWA checks as a separate production-build project, approved as an exception to #7's one run.
5. **Examples check timing (spec vs #26).** Owner stop point. The spec puts the check in `lint` and labels the phase M1, but it waits on M2 work (#21 `phase:loader-validation`). #22 `phase:nonfiction-workhorses`, #24 `phase:canvas` and #25 `phase:contract` also wait on it. Recommend: scaffold `lint` runs boundaries and Prettier only; the check joins `lint` at `phase:examples-check`. Separately, acceptance item 5 needs the nonfiction skeleton from #20 `phase:files`, which #26's row omits; the owner adds it.
6. **Checker placement.** Owner stop point. `scripts/check-examples.ts` imports the Tool registry loader, which the boundary rule forbids. Recommend: an exempt tooling entry point, confirmed with #21.
7. **`fromVersion` key.** Owner stop point. One file `schemaVersion` (spec); #18 to #21 each register section steps. Recommend: key steps by `(section, fromVersion)`; bump the file version only with the envelope.
8. **Smoke "no sidecar returns 200".** Recommend. The spec also requires the failure case with no mount. Recommend: the smoke mounts a temp directory owned by UID 1000 for the 200 case; the no-mount failure stays in `phase:image-compose`.
9. **Publishing gate.** Owner stop point. The spec blocks `phase:ci-publish` on `phase:installer` only, but also says no image is published while the API is unguarded. Recommend: add #18 `phase:token-guard` as a blocked-by edge and record it in #26.
10. **Dev binding and dev origins.** Owner stop point. The app binds all interfaces, and in dev there is no Docker publish, so binding all interfaces exposes plain HTTP to the LAN (user story 7). `SCRIBA_DEV_ORIGINS` is pending #18 Q1 (host:port pairs), and #17 Q2 asks that the dev Host be admitted. Recommend: bind all interfaces only when the entrypoint passes a flag, default `127.0.0.1`; `SCRIBA_DEV_ORIGINS` as host:port pairs added to the Host allowlist and the Origin set; dev served at `127.0.0.1:4200` with no proxy rewrite.
11. **Installer fallback and pre-listen hook (spec vs #18 Q3).** Owner stop point. The spec's installer criterion falls back to the loopback URL when `setup-url` is absent. #18 says a tokenless URL must never print: it wants `setup-url` written before listen, so a healthy `/healthz` implies the file exists. That needs `[proposed: registerBootStep]`. Recommend: adopt #18; Setup & auth writes `setup-url` in a pre-listen step; the installer waits for it and fails rather than print a tokenless URL; amend the spec's criterion.
12. **Install folder.** Confirmed under item 16. The spec puts the install folder in the current directory, outside the library, so the app cannot read `.secret`. Recommend: the installer warns and refuses to write `.secret` inside `SCRIBA_LIBRARY`.
13. **Module format.** Recommend. ESM with an `exports` map, falling back to CJS only if the boot test fails on the pinned Node.
14. **Name collision.** Owner stop point. `.secret` (installer, Tailscale auth key) and the secrets file under `.scriba/` (Model providers). #19 Q5 proposes `/books/.scriba/secrets/secrets.yaml`, with that module creating `secrets/` at 0700. Recommend: keep both names, explained in the README.
15. **Pins.** Recommend. Angular 22, per #17. Pandoc 3.13 is unverified for both arches; if unavailable, raise a #4 issue rather than substitute. Pin NestJS, Zod, TypeScript and Node on the day.
16. **Reviewer confirmations (spec Further Notes).** Owner stop point. The spec asks reviewers to confirm seven decisions made where the map is silent: the tailnet-address filter; the `/events` route; SCREAMING_SNAKE codes with module prefixes; the install folder (item 12); semantic-release inside `publish.yml`; no SSE replay; `settings.yaml` ownership. It also flags one phase naming deviation: `phase:scaffold` is Platform's contract phase. Recommend: accept all eight.
17. **`SCRIBA_PORT` phase.** Owner stop point. The spec parses `SCRIBA_PORT` at scaffold and passes it into `scriba` at image-compose. #18 Q2 moves its own port gate to the installer step and needs the port to reach `scriba`, since any other port fails its Host check. Recommend: keep the parse at scaffold and the compose passing at image-compose; adopt #18's gate move.
18. **Route prefixes (spec vs #21, #24).** Owner stop point. The spec says slugs are shared with API route prefixes and mounts controllers under `/api/<module>`. #20 (`/api/project-store/`) and #19 (`/api/providers`) match their slugs; #21 uses `/api/tools`, and #24 uses `/api/graphs` and `/api/graph-runs`, which do not. Recommend: slugs govern only subpaths and the envelope `module`; each slice owns its prefixes. Otherwise amend #21 and #24.
19. **Local registry ref.** Owner confirms. The installer runs before `ci-publish`, so the manual re-run pull check needs a local `registry:2`, which changes the image ref the dispenser pins. Recommend: take the image ref from a build-time or env value that defaults to `bbartolome/scriba:<tag>`.
20. **`SCRIBA_INSTALLER_DIR` (new name).** Owner stop point. The spec's env table omits it. §5 uses it so the installer test can run `deploy/entrypoint.sh` on the host. Recommend: add it to `/platform` as a test-only override with a spec amendment; or use a non-`SCRIBA_` test variable, which keeps the contract's env table unchanged.
21. **Mock capabilities (#19 Q19).** Owner stop point. #19 needs the mock to record client disconnects and to serve an empty `GET /v1/models` per scenario. The spec's steps record requests and drop connections, but do neither. Recommend: add both as data-file steps in `phase:test-harness`, agreed with #19. The alternative is a mock code edit by #19, which the owner approves.
22. **E2E files and a sixth step.** Owner stop point. Siblings add their own specs: #23 `e2e/tests/agent-loop.e2e.ts` and #24 `e2e/graph-runner/canvas-gestures.spec.ts`. The spec describes one Playwright test that modules grow. #24 Q15 asks for a sixth step, "recipe run", after "accept change"; #7 and the map name five. Recommend: one journey spec with the five steps; module-only gesture tests stay in their own folder outside the journey; the sixth step needs owner approval.
23. **Sibling requests on Platform files.** Owner stop point. (a) #22 O9: narrow the image's packs copy to `tools/` and `entity-types/` in `phase:image-compose`, and add #22's unwritable-image check to the `phase:ci-publish` smoke jobs. That check is not in the spec's smoke list, and its exact assertion should be confirmed with #22. (b) Additive `ci.yml` steps: #21's pack-lint at `phase:loader-validation`, and #25's Pandoc and Typst install with a skip flag at `phase:export`, where a skip fails CI. Recommend: accept (a) and (b); the owner confirms the new smoke check.
24. **Boundaries and DI exports (#19 Q13).** Owner stop point, to confirm with #19. #19 wants its DI token, types and fake exported through the module's `index.ts` at `phase:contract`. The boundary rule (a module may import another only through its `@Module` and contracts) allows that only if `index.ts` may export tokens and test fakes. Recommend: allow it, and add a `RuleTester` case.
25. **Installer tests location.** Recommend. `deploy/` is not a workspace, but `npm test` covers every workspace. Recommend: `deploy/test/` under the root Vitest config.

## 8. Driver brief

Goal: build Platform (#16), wave 0, in its seven phases in spec order on one Platform integration branch (§7 item 1). Context: `git ls-files` shows no app code; #1 to #15 are closed, and the map wins on conflict. Use the spec's names verbatim and mark invented names `[proposed]`. Platform alone owns the root `package.json`, lockfile, compose, CI and `deploy/`; sibling edits to those files are the additive requests in §7 item 23. Modules use only `@bbartolome/scriba-contracts/<m>` and their `@Module`. Run one phase per `/navigator:pair` session, starting each with its first test and ending when every acceptance criterion under its Phases heading passes.

Stop points, each resolved before the phase it blocks closes:
- `phase:scaffold`: §7 items 1 to 5, 10, 11, 16, 24.
- `phase:test-harness`: items 4, 21, 22.
- `phase:image-compose`: item 23(a) (packs copy).
- `phase:installer`: items 11, 12, 14, 17, 20.
- `phase:ci-publish`: items 3, 9, 19, 23(a) (smoke check).
- `phase:examples-check`: items 5, 6.

Stop for review and merge after `phase:scaffold`, which opens the gate for #17 to #25. Publish nothing until #18 `phase:token-guard` merges (item 9). Owner-only steps: a Docker host with `/dev/net/tun` and `NET_ADMIN`; an arm64 host; a clean machine for the installer; the tailnet and host checks for ST-1 to ST-3; Docker Hub secrets, pushes to `main` and releases. The installer runs before ci-publish, so no image is published yet. Do not fake owner-only steps.
