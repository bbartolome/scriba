# #16 Platform: implementation survey

Scope: Platform, phases `phase:scaffold` to `phase:examples-check`; checked against map #1 to #7, #13, #14 and sibling specs #17 to #21, #24. Map conflicts: four (§7 items 1 to 4; §8). Each needs owner confirmation. Spec amendments are owner stop points.

## 1. Approach

- **Contracts first, as built output:** ten `exports` subpaths, nine empty, so wave 1 unblocks at `phase:scaffold`.
- **Boot, then listen:** env, app-state and settings hook run before `listen(8080)`; a 200 from `/healthz` means ready.
- **`/events` is a raw response, not `@Sse()`,** so heartbeats, `retry` and backpressure stay in our hands.
- **Tailnet filter on `net.BlockList`:** block `100.64.0.0/10` and `fd7a:115c:a1e0::/48` after unwrapping `::ffff:` peers. A blocklist lets the Docker gateway pass.
- **Serial on one integration branch** in spec order; the integrate step lands it on `main` (§7 item 1).

## 2. Files and modules

Relative to the repo root; all new.

- Root: `package.json` (workspaces `packages/contracts`, `apps/api`, `apps/web`, `packages/packs`, `e2e`; scripts `dev`, `build`, `test`, `lint`, `e2e`, `mock:openai`), lockfile, `.nvmrc`, `.gitignore`, `tsconfig.base.json`, `eslint.config.mjs`, `README.md`, `docs/adr/0001-serve-mechanism.md`, `.github/workflows/{ci,publish}.yml`, `.releaserc.json`, `examples/.gitkeep`, `scripts/check-examples.ts`.
- `packages/contracts/src/platform.ts` and nine empty `src/<slug>.ts`; `packages/packs/` (workspace, `passWithNoTests`).
- `apps/api/src/{main.ts,app.module.ts}`, `modules/platform/` (`index.ts` as the `@Module`, controller, `events/`, `errors/`, `validation/`, `config/`, `settings/`, `static/`), `vitest.config.ts`, `test/`.
- `apps/web/`: generated Angular and Material app and `proxy.conf.js`, taken over by #17 at `phase:core` (§7 item 2).
- `e2e/`: Playwright workspace, `tests/journey.spec.ts`, `fixtures/mock-openai/`.
- `deploy/`: `Dockerfile`, `entrypoint.sh`, `compose.yaml`, `tailscale-serve.json`, `compose-version`, `dispenser.sh`, `build-multiarch.sh`, `RUNBOOK.md`, `smoke/image-smoke.sh`, `test/installer.test.ts`.

## 3. Phase plan

1. **`phase:scaffold`** (M1). Work: workspaces and pins; `/platform` slice with nine empty subpaths; composition root (env with `SCRIBA_PORT`, app-state check, tailnet filter, error filter, Zod pipe, `/healthz`, version, `/events`, echo, settings hook); SIGTERM closes streams; `Cache-Control: no-cache, no-transform`, no compression, no CORS; dev library defaults (git-ignored repo-local `SCRIBA_BOOKS_DIR`; `SCRIBA_PACKS_DIR` and `SCRIBA_EXAMPLES_DIR` at `packages/packs` and `examples/`); boundaries rule covering `apps/web` feature folders; `ci.yml` with the PR-title check; bare `apps/web`. Done when: every acceptance criterion under Phases > `phase:scaffold`, and a PR whose title is not a Conventional Commit fails the PR-title check (Scope only, so no checkbox covers it). Demo (four steps): placeholder page; `/healthz`; hello, then three echoes; refusal on a high `schemaVersion`. First test: in-process app on a temp `SCRIBA_BOOKS_DIR`; `GET /healthz` returns 200 with `{status:'ok', version}`.
2. **`phase:test-harness`** (M1). Work: mock server with path-selected scenarios, recording, reset, two scenarios, `mock:openai`, Playwright harness with five placeholder steps, e2e in `ci.yml`. Done when: every acceptance criterion under Phases > `phase:test-harness`. First test: openai SDK against `…/scenario/tool-call/v1`, asserting split `arguments` chunks.
3. **`phase:image-compose`** (M1, release). Work: two-stage Dockerfile; `SETUP=true` stub; compose with `init: true` and `restart: unless-stopped`; `SCRIBA_PORT` passed into the `scriba` service; Serve candidate; healthcheck; multi-arch build script. Done when: every acceptance criterion under Phases > `phase:image-compose`. Owner-only: a host with `/dev/net/tun` and `NET_ADMIN`, and an arm64 host. First test: `docker run` with no `/books` mount exits non-zero, naming the UID/GID.
4. **`phase:smoke`** (M1, release). Work: ST-1 to ST-3 on real hardware; ADR; compose set to the ST-1 winner; Linux Ollama hint; runbook with map #2's tailnet prerequisites, ST-4 marked deferred. Done when: every acceptance criterion under Phases > `phase:smoke`. Manual. First check: ST-1 step 1 on the Mac.
5. **`phase:installer`** (M1, release). Work: dispenser; first install; re-run merge with backups; `SCRIBA_COMPOSE_VERSION` stamp; untouched override file; setup-url printing with loopback fallback (not in image-compose); fast-path, pinning and rollback docs. Done when: every acceptance criterion under Phases > `phase:installer`. Demo (four steps): one-liner prints the URL; `~/Books/.scriba/` ownership; silent re-run with backups; `docker compose ps` healthy. First test: Vitest with the stub `docker` on `PATH` (records calls, serves the `tar` extraction) and an empty temp `HOME`; with no `docker` on `PATH`, the script exits non-zero and writes nothing.
6. **`phase:ci-publish`** (M1, release). Work: `publish.yml` plan, build, smoke, merge, release; `concurrency` group so plan and release cannot race; semantic-release that never commits back; Hub secrets; pre-release checklist linking the ST runbook, with #18's socket-permission smoke test and the ST-1 peer-address check. Done when: every acceptance criterion under Phases > `phase:ci-publish`. Gated on #18 `phase:token-guard` (§7 item 9). Owner-only: Hub secrets, pushes to `main`, releases. First test: semantic-release dry run over a `chore:`-only range prints no release.
7. **`phase:examples-check`** (M1, extended to M6). Work: excluded-folder check; Project store, Graph runner and Tool registry validators; a lint rule that no unit-test file outside `e2e/` reads `examples/` or `SCRIBA_EXAMPLES_DIR` [proposed: ESLint `no-restricted-syntax` on those string literals in `**/*.test.ts`]; all wired into `lint` (§7 item 5). Done when: every acceptance criterion under Phases > `phase:examples-check`, and a unit test that reads `examples/` fails lint (Scope only, so no checkbox covers it). Starts only when its Blocked-by edges close. First test: a fixture containing `.scriba/` fails, naming the path.

## 4. Contracts

Spec names verbatim; `[proposed]` marks invented names.

**Produces, `@bbartolome/scriba-contracts/platform`:**
- Module slugs: ten, shared by subpath names and the envelope's `module` field (eight in the enum; `shell` and `genre-packs` publish nothing). Route prefixes: pending §7 item 18 (recommended: not shared).
- Envelope `{module, type, data}`; `platform/hello {streamId, version, serverTime}`; `platform/echo {seq, sentAt}`.
- Stream constants: `/events`, retry hint, 15 s heartbeat, `POST /api/platform/echo` with `{count, intervalMs}`.
- `SCRIBA_*` names and defaults; `/healthz` `{status: 'ok', version}`; version info `{version, revision, builtAt, composeVersion}`.
- Error shape `{error: {code, message, details?}}`; `PLATFORM_VALIDATION_FAILED`, `PLATFORM_NOT_FOUND`, `PLATFORM_PAYLOAD_TOO_LARGE`, `PLATFORM_INTERNAL`.
- Empty subpaths: `/setup-auth`, `/providers`, `/project-store`, `/tool-registry`, `/agent-loop`, `/graph-runner`, `/compile-export`, `/shell`, `/genre-packs`.

**Exposed, not contracts:** the `@Module` import; `[proposed: StreamPublisher]`; `[proposed: ZodValidationPipe]`; settings hook `[proposed: registerSettingsSection]` taking `{fromVersion → step}`, with atomic `[proposed: readSection]` and `[proposed: writeSection]`; mock `…/scenario/<name>/v1` with `[proposed: …/__mock/requests]` and `[proposed: …/__mock/reset]`.

**Consumes:** Project store `project.yaml` schema and front-matter base (#20 `phase:contract`); Graph runner graph schema (#24 `phase:contract`); Tool registry loader and Ajv (#21 `phase:loader-validation`). No guard stub: #18 `phase:token-guard` adds the default-deny guard. Until then the API is unguarded in dev only, and no image publishes.

## 5. Test strategy

- **Unit (Vitest):** `/platform` Zod schemas; the tailnet predicate, tested directly as the spec allows, including `::ffff:100.64.0.1`.
- **Integration (Vitest, primary seam):** in-process app on a temp library: `/healthz`, version info, `/events` (hello, echo order, fan-out, heartbeat, backpressure), error bodies, SPA fallback, settings backup and migration. Inject the heartbeat interval. Three pre-listen failures (newer `schemaVersion`, unwritable `.scriba/`, bad `SCRIBA_*`) use a spawned process and never bind a port. A boot test resolves the ten subpaths in Node and in the Angular build.
- **Lint:** boundaries rule via `RuleTester`; `graph-runner` importing `agent-loop`, and the reverse, must fail. In phase 7, a unit-test fixture reading `examples/` must fail the examples-read rule (`RuleTester` case).
- **Installer:** Vitest never uses the real `docker` (a stub on `PATH`, or none for the abort case). It runs `deploy/entrypoint.sh` with `SETUP=true` on the host, using an installer-files override because the files live at `/opt/installer` in the image [proposed: `SCRIBA_INSTALLER_DIR`, a new `SCRIBA_*` name the spec's env table omits]. `ci.yml` runs `test` before `build` and builds no image. Non-TTY cases run under `setsid`.
- **Mock OpenAI:** the official `openai` SDK as client.
- **E2E:** one Playwright spec against the dev stack (Angular dev server with proxy, temp `SCRIBA_BOOKS_DIR`, mock server); app-loads live, five steps pending (§7 item 4).
- **Image and manual:** `deploy/smoke/image-smoke.sh` runs in `publish.yml` and locally; ST-1 to ST-3 and the re-run pull check are manual (§7 item 19).

## 6. Dependencies

- **Merge first:** nothing. Platform is wave 0; map decisions #1 to #15 are closed.
- **Platform gates:** #17 to #25 on `phase:scaffold`; #18 on `phase:image-compose` (LocalAPI socket); #19, #21, #23, #24 on `phase:test-harness` for scenarios.
- **Platform waits on:** #20 and #24 contracts and #21 `phase:loader-validation` (the #26 gate row) before `phase:examples-check` starts; #18 `phase:token-guard` before `phase:ci-publish`.
- **Stubs:** none.

## 7. Open questions

Map conflicts, each an owner stop point:

1. **Phase order (#3 vs spec).** #3 says serial phases, one integration branch per spec, merged to `main` by integrate-v1. The spec's Phases blocks `phase:test-harness` and `phase:image-compose` only on `phase:scaffold`, and Further Notes > Waves lets the release track run alongside wave 1. Recommend: serial, on one integration branch in listed order. Owner confirms, or amends #3 or the spec.
2. **Web root (#4).** #4 gives the Shell `app.config.ts`, route table and `proxy.conf.js`; the Platform spec has Platform generate a bare `apps/web` in scaffold. Recommend: Platform generates them; #17 takes over at `phase:core`.
3. **ST-4 (#7 vs #4).** #7's checklist lists ST-1 to ST-4; #4 defers ST-4, and the spec follows #4. Recommend: ST-4 stays deferred; amend #7.
4. **E2E target (#7 vs built bundle).** #7 and #17's Testing Decisions use the dev server with the Shell's proxy; Platform's Testing Decisions use the built bundle. Recommend: the dev stack.

Others:

5. **Examples check timing.** Scripts puts the check in `lint`, but the phase waits on #20, #24 and #21 `phase:loader-validation` (M2, blocked by #18) and is labelled M1. Recommend: scaffold `lint` runs boundaries and Prettier only; the check joins `lint` at `phase:examples-check`.
6. **Checker placement.** It imports the Tool registry loader, which the boundary rule forbids. Recommend: `scripts/check-examples.ts` as an exempt tooling entry point, confirmed with #21.
7. **`fromVersion`.** One file `schemaVersion`; #18 to #21 each register section migrations. Is `fromVersion` the file's or the section's? Recommend: key steps by `(section, fromVersion)`; bump the file version only with the envelope.
8. **Smoke "no sidecar returns 200".** The spec also requires a failure with no mount. Recommend: smoke mounts a temp directory owned by UID 1000.
9. **Publishing gate.** Recommend: record in #26 that #16 `phase:ci-publish` is blocked by #18 `phase:token-guard`.
10. **Dev listen address.** All-interface binding in dev exposes plain HTTP to the LAN (story 7). Recommend: bind all interfaces only when the entrypoint passes a flag; default `127.0.0.1`.
11. **Installer tests location.** `deploy/` is not a workspace, but `npm test` covers every workspace. Recommend: `deploy/test/` in the root Vitest config.
12. **Install folder.** `.secret` is safe only outside `SCRIBA_LIBRARY`. Recommend: warn and refuse to write `.secret` inside the library.
13. **Module format.** Recommend ESM with an `exports` map, falling back to CJS only if the boot test fails on the pinned Node.
14. **Name collision.** `.secret` (installer) and the `.scriba/` secrets file (Model providers). Recommend: keep both, explained in the README.
15. **Pins.** Pin Angular 22, per #17. Pandoc 3.13 is unverified for both arches; if unavailable, raise a #4 issue rather than substitute. Pin NestJS, Zod, TypeScript and Node on the day.
16. **Reviewer confirmations** (spec Further Notes). Recommend: accept all, including the new `SCRIBA_INSTALLER_DIR` name in §5.
17. **`SCRIBA_PORT` phase.** #18 `phase:token-guard` needs the port in the app environment. Recommend: `phase:scaffold` parses it, since the setup URL default already depends on it; compose passing stays in phase 3.
18. **Route prefixes (spec vs #21, #24).** The spec mounts controllers under `/api/<module>`; #21 mounts `/api/tools`, #24 `/api/graphs` and `/api/graph-runs`. Recommend: slugs govern only subpaths and the envelope `module`; each slice owns its prefixes. Otherwise amend #21 and #24. Owner decides.
19. **Local registry ref.** Installer runs before ci-publish, so the manual re-run pull needs a local `registry:2`, which changes the image ref the dispenser pins. Recommend: take the image ref from a build-time or env value defaulting to `bbartolome/scriba:<tag>`. Owner confirms.

## 8. Driver brief

Goal: build Platform (#16), wave 0, in its seven phases in spec order on one integration branch. Context: no app code exists yet; #1 to #15 are closed, and the map wins on conflict. Owner confirmations needed first: §7 items 1 to 4, 18 and 19. Use the spec's names verbatim; mark invented names. Platform alone owns the root `package.json`, lockfile, compose and CI; modules use only `@bbartolome/scriba-contracts/<m>` and their `@Module`. Run one phase per `/navigator:pair` session, starting each with its first test and ending when every acceptance criterion under its Phases heading passes. Stop for review and merge after `phase:scaffold`, which opens the gate for #17 to #25, and on any open question blocking the next phase. Owner-only steps: a Docker host with `/dev/net/tun` and `NET_ADMIN`; an arm64 host; a clean machine for the installer; the tailnet and host checks for ST-1 to ST-3; Docker Hub secrets, pushes to `main` and releases. The installer runs before ci-publish, so no image is published yet. Publish nothing until #18 `phase:token-guard` merges, and wait on #20, #21 and #24 before `phase:examples-check` starts. Do not fake owner-only steps.
