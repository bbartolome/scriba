# #18 Setup & auth: implementation survey

Sources: spec #18, decisions #1–#7, tracker #26, GLOSSARY.md (no new terms), sibling specs #16, #17, #19, #20 (headings and names only). Spec sections are in brackets.

**Map conflicts (map wins where they differ):**
- The loopback-peer check narrows #6's tailnet trust; #26 decided it (Q5). `frame-ancestors`, the port-suffixed cookie and the token-keyed cookie go beyond #6 (Q4). Server-side Max-Age does too (Q8).
- The Secure flag is #6's "verify first" (Q6). The installer's tokenless fallback conflicts with #6 step 6 (Q3).
- #26 gates other modules on the whole `phase:token-guard` (line 102). This survey gates on guard tickets (Q2). M2 and M3 labels stand, per #26.

## 1. Approach

- Build the token store and default-deny guard first, as one NestJS module. Other modules' HTTP tickets depend on it [The guard].
- A route is public only through an explicit marker. A test pins the public set: `/healthz`, handshake, identity, static bundle.
- Stateless cookie: a signed issue time keyed from the setup token, so replacing the token revokes every cookie. Compare with `crypto.timingSafeEqual`.
- Tailscale is read-only over the LocalAPI socket; normalise status in one pure function, tested on fixtures.
- Setup state and preferences are field-level merges into `settings.yaml` [/setup flow › Idempotent re-runs].

## 2. Files and modules

API, `apps/api/src/modules/setup-auth/`: `setup-auth.module.ts`; `guard/`; `identity/`; `token/`; `handshake/`; `setup/`; `tailscale/`; `compose-version/`; `test/` (integration tests, `fixtures/localapi/*.json`, the only tailscaled double).

Web, `apps/web/src/app/features/setup-auth/`: `setup-auth.routes.ts` (lazy `Routes`), `setup/`, `settings/`, `sign-in-notice/`.

Contracts: `packages/contracts/setup-auth` (Zod and TS); example payloads in a test file.

Edited elsewhere, by request: Platform composition root, migration hook and env; Shell route entry and proxy.

## 3. Phase plan

**phase:contract (M1).** Work: Zod and TS for every shape in [Contracts › Produces]. Done when: the subpath builds and the schemas accept the examples and reject a wrong `BackendState` and a tailnet identity without `login` [phase:contract]. Blocked by Platform `phase:scaffold`, which the spec omits. First test: `{via:'tailnet'}` fails to parse.

**phase:token-guard (M1).** Gates by ticket:
- Guard, token, handshake, sign-out and identity: Platform `phase:scaffold`. The spec's `SCRIBA_PORT` gate moves to the installer step, since the 8080 default suffices for tests (Q2).
- Minimal `/setup` page and sign-in notice: Shell `phase:core`.
- E2E setup leg: Platform `phase:test-harness` and Shell `phase:core`.
- Installer demo step: Platform `phase:installer`, which waits on `phase:smoke` and its manual tailnet checks.

Work: token; `setup-url` written in the init hook before listen, so a healthy `/healthz` implies the file exists [#16]; stdout print of the URL on every start; invalid-token page (no cookie, explains how to print the URL); handshake with `Referrer-Policy: no-referrer` and a token-free `Location`; cookie with the port in its name; sign-out; identity; loopback guard with Host allowlist and dev origins; `frame-ancestors 'none'`; Origin check; no CORS; accessor; both invariant tests. Done when: the acceptance list passes, the Secure-flag results are recorded, the installer step passes, and the author reaches the chat only through the setup URL. First test: on first start in a temp library, `setup-url` is mode 0600 and holds the URL; a restart keeps the same token.

**phase:setup-flow (M2).** Gates by ticket:
- Status, preferences and settings-section API: the guard ticket.
- Wizard, settings and sign-in UI: Shell `phase:core`.
- Providers embed and the e2e mock-provider leg: Model providers `phase:settings-ui`.
- First-project step (list, new, import, sample): Project store `phase:files`. The spec and #26 name `phase:contract` (#26 line 104); the requests are implemented in `phase:files` [#20 scope] (Q2).

Work: five-step wizard with skip and `complete`; idempotent re-runs; settings page (versions, compose warning, recovery, sign-out, re-run); routing; user docs. The e2e leg adds the mock OpenAI provider through the embedded panel [#19 System seam], then a nonfiction-sample project; until this phase lands, the sample step uses Project store's UI [Further Notes]. Done when: the acceptance list passes. First test: saving `theme` alone changes only that field in `settings.yaml`.

**phase:tailnet (M3).** Gates by ticket: LocalAPI client and status, Platform `phase:image-compose` (socket volume, `SCRIBA_TS_SOCKET`; release track); smoke test and Serve checks, Platform `phase:smoke` (ST-1). Stop before this phase until Q12 is answered. Work: LocalAPI client and status endpoint; Tailscale step and settings section; tailnet Host entry; tailnet credential, trusted only from a loopback peer; `https://` Origin; owner allowlist with lockout refusal; one rate-limited refresh on an unknown Host; socket smoke test, which this module adds to Platform's pre-release checklist directly (the one Platform-file exception in §8); Serve checks; docs on the app's control of tailscaled. Done when: the acceptance list passes and the manual checks are recorded. First test: a fake LocalAPI serving `NeedsLogin` with `AuthURL` makes status return `backendState: NeedsLogin` and that `authURL`.

Tailscale fixtures and UI states:
- `NeedsLogin` with `AuthURL` shows the login link.
- `NeedsLogin` with an empty `AuthURL` shows: run `docker compose restart`, or check `docker compose logs tailscale`.
- `NeedsMachineAuth` shows: approve this device in the Tailscale admin console (Machines). A restart does not help.
- `Running` with `CertDomains` shows the tailnet URL. Empty `CertDomains` shows the HTTPS hint. `MagicDNSEnabled: false` shows the MagicDNS hint [story 19].
- A missing socket shows `available: false`. Containerboot exits when the state leaves `Running` (for example after an admin-console logout), so the socket can vanish until the sidecar restarts. Loopback must still answer; a failure goes to Platform as a compose issue.

Late login is split: automated (the fixture flips to `Running`; an unknown Host gets one refresh, then is accepted) and manual (log in through the link on a real tailnet).

## 4. Contracts

Exposes `@bbartolome/scriba-contracts/setup-auth` [Contracts › Produces]:
- Setup status: `pending | done | skipped` for `access`, `tailscale`, `providers`, `preferences`, `firstProject`; `complete`; compose-mismatch flag.
- Identity: `{via: 'loopback'} | {via: 'tailnet', login}`.
- Tailscale status: `available`, `backendState`, `authURL`, `dnsName`, `tailnetURL`, `magicDNSEnabled`, `httpsCertsEnabled`, `ownerLogin`.
- `{enabled, logins[]}`; preferences; `{state, expected, actual}`; handshake; route constants for the seven endpoints.
- Error codes, per Platform's `SETUP_`/`AUTH_` rule [#16]: `SETUP_TOKEN_INVALID` (401, recommended); `SETUP_ALLOWLIST_LOCKOUT` (409, recommended); `AUTH_REQUIRED` (401); `AUTH_HOST_REJECTED`, `AUTH_ORIGIN_REJECTED`, `AUTH_IDENTITY_NOT_ALLOWED` (403, as the spec gives); `AUTH_IDENTITY_MISSING` (403, recommended; keeps it off the `/setup` 401 path, Q12).
- Non-contract: the guard and public marker, the identity accessor, the lazy routes.

Consumes:
- Platform: error shape; `SCRIBA_PORT` (must reach `scriba`, Q2); `SCRIBA_COMPOSE_VERSION`; `SCRIBA_DEV_ORIGINS`, `SCRIBA_SETUP_URL_BASE`, `SCRIBA_TS_SOCKET`; `/healthz`; version info (app version, expected compose version); composition root; migration hook.
- Shell: typed client, route entry, theming, dev proxy. Model providers: `/providers` slice and panel. Project store: `/project-store` requests, `genrePack`.

Stubs until merge:
- Shell: none for guard tickets; do not stub the root route table.
- Model providers: link to the providers settings until `phase:settings-ui`, as the spec allows.
- Project store: fake first-project requests in Vitest until `phase:files`, never in the composed app.
- Guard: never stubbed in the composed app.

## 5. Test strategy

- Unit (Vitest with unplugin-swc): pure functions only, such as status normalisation and Zod examples. No direct tests of the token store or signing helper.
- Integration (main seam): boot the composed app, or this module alone, on a temp library with the fake LocalAPI socket. Cover file modes, the stdout print, handshake headers, the invalid-token page, cookie attributes, the 401/403 matrix, no CORS, `frame-ancestors` and the `settings.yaml` merge.
- Loopback-peer rule: a predicate over (Host, peer address), as #16 tests its filter, plus an integration test from a non-loopback address when the runner has one.
- GET/HEAD sweep (owned here): enumerate routes from router metadata and fail on any unseeded route. A seed table maps path-parameter names to values and fails on unknown names. Snapshot the library tree and `settings.yaml`. Any envelope published during the sweep, except `platform/hello` and heartbeats, fails. Streaming GETs such as the events route are read for headers and first bytes, then aborted, so the sweep never waits for a stream to end. Exempt only `/books/.scriba/index/`. Until Project store lands, seed a fixture project on disk.
- Mutation guard: every non-GET/HEAD/OPTIONS route rejects no credential (401), a bad Origin or Host (403). The public set is pinned.
- UI: Angular Vitest with a fake client (step order, skip, prefills, Tailscale states, lockout, compose warning, 401 notice). e2e: Platform's Playwright harness (`phase:test-harness`); token-guard adds the setup leg, setup-flow the mock provider and sample project.
- Manual, recorded in module docs; the agent cannot run them: Secure-flag matrix (Safari, Chrome, Firefox on macOS); socket smoke test as the non-root UID (macOS, Linux); Serve header-stripping; late login; admin-console logout; phone demo.

## 6. Dependencies

Merge first:
- Platform `phase:scaffold` (gates every phase), `phase:test-harness` (e2e), `phase:installer` (installer step), `phase:image-compose` (socket volume), `phase:smoke` (ST-1, before tailnet).
- Platform cross-spec request: pass `SCRIBA_PORT` into `scriba`. Only `SCRIBA_COMPOSE_VERSION` is passed today [#16 compose]; otherwise any port other than 8080 fails the Host check.
- Shell `phase:core` (the `/setup` ticket and setup-flow UI; the spec omits it from token-guard), Project store `phase:files` (Q2), Model providers `phase:settings-ui` (providers step and e2e mock).

Reverse: Model providers `phase:client` (M1) and other HTTP tickets name this guard ticket [#19 Blocked by] (Q2).

## 7. Open questions

Owner or cross-spec before token-guard:
1. **Dev Host and Origin (Shell, Platform).** `SCRIBA_DEV_ORIGINS` "adds extra loopback origins", but the Host check matches host:port. Recommend: host:port pairs, added to the Host allowlist and the Origin set. Shell's proxy must forward Host and Origin unchanged, which its spec omits.
2. **Gates, deviations and `SCRIBA_PORT` (Platform, Shell).** Recommend: the per-ticket gates in §3 and §6, including guard-ticket edges and `phase:files`; moving the spec's `SCRIBA_PORT` env gate from guard tests to the installer step; and `SCRIBA_PORT` passed into `scriba`. Confirm all four.
3. **Installer fallback (Platform).** Platform #16 prints the loopback URL, which has no token, when `setup-url` is missing. Recommend: write `setup-url` before listen; the installer fails rather than print a tokenless URL.
4. **Review items (owner).** `frame-ancestors 'none'`, the port-suffixed cookie and the token-keyed cookie go beyond #6 and are marked "proposed". Recommend: adopt all three, with owner confirmation.

Decided:
5. **Loopback-peer check.** Decided by #26's cross-spec decisions. Platform's ST-1 must check real peer addresses.

Proceed on recommendation:
6. **Secure flag.** Ship with no `Secure` flag, the spec's fallback. The author records browser results.
7. **Unnamed identifiers.** Use the §4 codes, endpoint-named routes and `@Public()`.
8. **Cookie lifetime.** The server also rejects cookies older than Max-Age.
9. **Settings route.** `/settings`, confirmed by Shell.
10. **Default genre pack.** Project store's `genrePack` (includes user packs), not a fixed enum.
11. **Setup status storage.** A `setup` section in `settings.yaml`.

Stop before tailnet:
12. **Tailnet 403 notice (Shell).** The Shell sends only 401s to `/setup` and imports nothing from setup-auth [#17], but identity failures return 403. Recommend: the Shell's client shows `AUTH_*` 403s with this module's `sign-in-notice/`, in place. Shell decides.

## 8. Driver brief

Goal: implement Setup & auth (#18): a default-deny guard, a setup token that becomes a loopback cookie, a tailnet identity path, and a `/setup` wizard. Work in phase order: contract, token-guard, setup-flow, tailnet. Done when each phase's acceptance list in #18 passes, including the e2e legs. GET and HEAD never mutate, no response carries CORS headers, and every mutation checks Host and full Origin. Test through HTTP, the rendered UI with a fake client, and the e2e, never through the token store, the signing helper or internal services. The #6 decisions are owner calls: do not reopen them. Use the spec's names verbatim. Stop points: do not start a phase while a §7 question tagged for it is open; do not start tailnet until Q12 is answered; do not close token-guard or tailnet until the author records the manual checks in §5. Allowed edits: this module, the setup leg in Platform's `e2e/`, and this module's user docs. Other Platform, Shell and Project store changes are requests (§6, Q1, Q2). Exception: the socket smoke test entry in Platform's pre-release checklist. Raise anything else with the owner.
