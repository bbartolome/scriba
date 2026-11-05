# #18 Setup & auth: implementation survey

Sources: spec #18; map #1 and decisions #2–#7 (auth is #6); tracker #26; GLOSSARY.md (no new terms); spec #16 for env names, error prefixes and boot order; sibling surveys #16, #17, #19–#21, #23–#25 for gates, names and cross-spec claims. Spec sections are in brackets. `[proposed]` marks anything not in the spec.

**Map conflicts (map wins where they differ; each is an owner stop point in §7):**
- The loopback-peer check on the identity header narrows #6's tailnet trust (Q5). The #16 spec asks for it and #26 records it.
- `frame-ancestors 'none'`, the port-suffixed cookie, the token-keyed cookie and server-side Max-Age go beyond #6 (Q4, Q8).
- #6 says to verify the `Secure` flag first (Q6).
- The installer's tokenless fallback (#16 spec, step 8) conflicts with #6 step 6, which prints `setup-url` after the healthcheck (Q3).
- #26 gates other modules on the whole `phase:token-guard`. This survey gates on guard tickets (Q2).
- #26 gates `phase:setup-flow` on #20 `phase:contract`. This survey adds `phase:files` (Q2).
- #7 puts e2e on the dev server; #16 uses the built bundle (#16 §7 item 4). The setup leg follows that answer (Q1).
- #6 "GET/HEAD never change state" against lazy migration in #20 and #21. The §5 sweep will flag it until the owner rules.
- Not a conflict: M2 and M3 labels stand, per #26. The spec calls them drafting choices.

## 1. Approach

- Build the token store and the default-deny guard first, as one NestJS module. Other modules' HTTP tickets depend on the guard [The guard; §6].
- Public routes are explicit: `/healthz`, the handshake, the identity endpoint and the static bundle. A test pins that set [The guard].
- Stateless cookie: a signed issue time keyed from the setup token, so replacing the token revokes every cookie. Compare tokens with `crypto.timingSafeEqual` [Token; Handshake].
- Tailscale is read-only over the LocalAPI socket. Normalise status in one pure function, tested on recorded fixtures [Tailscale LocalAPI].
- Setup state and preferences are field-level merges into `settings.yaml` [/setup flow › Idempotent re-runs].

## 2. Files and modules

API, `apps/api/src/modules/setup-auth/`, following #16's layout: `index.ts` (the `@Module`); `guard/`; `identity/`; `token/`; `handshake/`; `setup/`; `tailscale/`; `compose-version/`; `test/` (integration tests and `fixtures/localapi/*.json`, the only tailscaled double).

Web, `apps/web/src/app/features/setup-auth/`: `setup-auth.routes.ts` (lazy `Routes`), `setup/`, `settings/`, `sign-in-notice/`. The providers panel is imported through #19's one public export [#19 Q10, proposed], not from its folder.

Contracts: `packages/contracts/src/setup-auth.ts`, the empty file #16 creates at `phase:scaffold`. Example payloads sit in a test file.

Edited elsewhere, by request: Platform's composition root and boot hooks; the `SCRIBA_DEV_ORIGINS`, `SCRIBA_SETUP_URL_BASE` and `SCRIBA_TS_SOCKET` env entries (already in #16's env table); Shell route entries and proxy.

## 3. Phase plan

**phase:contract (M1).** Blocked by #16 `phase:scaffold` [#26, first-phase row]. Work: Zod and TS for every shape in §4. First test: `{via:'tailnet'}` without `login` fails to parse.
Acceptance:
- Subpath exports every shape and builds with the contracts package. [build]
- Zod accepts the examples; rejects a wrong `BackendState` and a tailnet identity without `login`. [contract seam]
- No runtime code beyond schemas and constants. [review at merge]

**phase:token-guard (M1).** Blocked by: #16 `phase:scaffold` (Q2); #17 `phase:core` for the minimal `/setup` page and sign-in notice [#26, feature UI]; #16 `phase:test-harness` for the e2e leg; #16 `phase:installer` for the installer demo step.
Work: token and `setup-url`, written before `listen` so a healthy `/healthz` implies the file exists [#16 boot order]; URL printed on every start; invalid-token page with no cookie; handshake with `Referrer-Policy: no-referrer` and a token-free `Location`; cookie name with the port [proposed: the Host port the browser used]; sign-out; identity endpoint; loopback guard with Host allowlist and dev origins (Q1); `frame-ancestors 'none'` [proposed]; full-Origin check; no CORS; identity accessor; both invariant tests (§5); e2e setup leg.
First test: first start in a temp library gives a 0600 `setup-url` holding the URL; a restart keeps the same token.
Acceptance:
- First start creates the token and 0600 `setup-url` and prints the URL. Restart keeps the token. Deleting the token file makes a new one; old cookies get 401. [integration: modes, stdout, restart]
- Setup URL sets HttpOnly, SameSite=Strict, host-only cookie; redirects to `/setup` with no token in the URL. Wrong token gets the explanatory page and no cookie. [integration: handshake]
- Without a cookie, every non-public API route returns 401 in Platform's error shape. [integration: 401 matrix]
- Host outside the allowlist gets 403, except `/healthz`. Mutation with missing, `null` or foreign Origin, or wrong scheme, gets 403. [integration: 403 matrix]
- No `Access-Control-*` headers on any response. [integration]
- `Secure` behaviour recorded for Safari, Chrome and Firefox on `http://127.0.0.1`; cookie attributes match. [manual, §5; Q6]
- Both invariant tests run in CI against the composed app and pass. [integration]
- M1 share: the author reaches the chat only through the setup URL. [e2e setup leg]
- Demo under 5 min: installer one-liner, 401 on a direct API call, setup URL, reload stays signed in, foreign-Origin 403, sign-out. [demo; needs #16 `phase:installer`]
Done when every item passes and the Secure matrix is recorded.

**phase:setup-flow (M2).** Follows token-guard (same module). Blocked by: #17 `phase:core`; #19 `phase:settings-ui` (embedded panel, or a link until it lands, per the spec); #20 `phase:contract` and `phase:files` (Q2).
Work: five-step wizard (Access; Tailscale, shown as unavailable until `phase:tailnet`; Model providers; Preferences; First project) with skip and `complete`; setup-status and preferences endpoints; `settings.yaml` sections with migration registration; idempotent re-runs; settings page (identity, preferences, providers, versions, compose warning, recovery, re-run, sign out); SPA routing to `/setup`; user docs. The e2e setup leg adds the mock provider through the embedded panel and a nonfiction-sample project [#19 System seam].
First test: saving `theme` alone changes only that field in `settings.yaml`.
Acceptance:
- Fresh library walks all five steps. Skipping providers and preferences still completes; both show as `skipped`. [UI; e2e]
- Re-run shows every saved value as a default. Saving one step changes only its fields in the settings files; projects unchanged. [integration: merge; UI]
- First-project step creates a nonfiction-sample project through the Project store API. Re-run lists existing projects and creates none unless asked. [e2e; UI]
- Providers step renders the Model providers component and duplicates none of its forms. [UI]
- `SCRIBA_COMPOSE_VERSION` unset or older than expected: `/setup` and settings show the warning with the update one-liner. Matching value: no warning. [integration; UI]
- e2e setup leg passes in CI. [e2e]
- Demo under 5 min: embedded Ollama model, author name, nonfiction sample, re-open `/setup` with answers prefilled, change only the theme, old compose version shows the warning. [demo]

**phase:tailnet (M3).** Blocked by: #16 `phase:image-compose` (socket volume, `SCRIBA_TS_SOCKET`); #16 `phase:smoke` (ST-1). Follows token-guard (same module). Stop before this phase until Q5 and Q12 are answered.
Work: LocalAPI client and normalised status endpoint, cached, with one rate-limited refresh on an unknown Host; Tailscale step and settings section; tailnet Host entry from `Self.DNSName`; tailnet credential trusted only from a loopback peer (Q5); `https://` Origin check; owner allowlist with auto-seed and lockout refusal; socket smoke test added to Platform's pre-release checklist (§8 exception); Serve checks; docs on the app's control of tailscaled.
First test: a fake LocalAPI serving `NeedsLogin` with `AuthURL` makes status return `backendState: NeedsLogin` and that `authURL`.
Fixtures and states:
- Spec fixtures: logged out; `NeedsLogin` with `AuthURL` (link); `Running` with `CertDomains` (tailnet URL); `Running` without `CertDomains` (HTTPS hint). MagicDNS-off hint [story 19].
- [proposed] extras: `NeedsLogin` with empty `AuthURL` (restart or check logs); `NeedsMachineAuth` (approve the device in the admin console); missing socket (`available: false`, loopback still answers).
- [unverified, check in ST-1] the sidecar may restart when the state leaves `Running`, which can remove the socket for a while.
- Late login: automated (fixture flips to `Running`; unknown Host gets one refresh, then is accepted) and manual (link on a real tailnet).
Acceptance:
- Without tailscaled (dev): status reads "unavailable", loopback works, tailnet Host refused. [integration]
- Recorded fixtures: `NeedsLogin` with `AuthURL` shows the link; `Running` shows the tailnet URL; empty `CertDomains` shows the HTTPS hint. [integration; UI]
- Tailnet Host with injected login: API calls succeed with no cookie. Same header on loopback is ignored and gets 401. Tailnet POST with `http://` Origin gets 403. [integration]
- Allowlist on: login not in list gets 403 with the explanatory code. Enabling it from a login that would be excluded is refused. Loopback with cookie still works. [integration; UI]
- Late login: starting logged out, the link makes `https://<tailnet name>` work without restart. [fixture flip; manual]
- Socket smoke test passes as the non-root UID on macOS (Docker Desktop) and Linux; result recorded. [manual]
- Demo under 5 min: settings page, login link, `Running`, tailnet URL on the phone with no token, allowlist refusal, allowlist off. [demo]
Done when every item passes and the manual checks are recorded, including Serve Host preservation and header stripping on a real tailnet.

## 4. Contracts

Exposes `@bbartolome/scriba-contracts/setup-auth` [Contracts › Produces]. Spec names are verbatim.
- Setup status: `pending | done | skipped` for `access`, `tailscale`, `providers`, `preferences`, `firstProject`; `complete`; compose-mismatch flag.
- Token handshake: token request, redirect semantics, error codes.
- Identity: `{via: 'loopback'} | {via: 'tailnet', login}`.
- Tailscale status: `available`, `backendState` (`BackendState`), `authURL`, `dnsName`, `tailnetURL`, `magicDNSEnabled`, `httpsCertsEnabled`, `ownerLogin`.
- `{enabled, logins[]}`; preferences (author display name, theme, default genre pack; field names [proposed]); `{state: 'ok' | 'mismatch' | 'unknown', expected, actual}`.
- Route constants for the seven endpoints [proposed names]. Paths follow #16 §7 item 18 (route prefixes, open).
- Error codes: SCREAMING_SNAKE with the `SETUP_` / `AUTH_` prefixes from the #16 spec. Names are [proposed]; the spec gives cases and, for some, statuses: `SETUP_TOKEN_INVALID` (401, proposed), `AUTH_REQUIRED` (401), `AUTH_HOST_REJECTED` (403), `AUTH_ORIGIN_REJECTED` (403), `AUTH_IDENTITY_MISSING` (403, proposed), `AUTH_IDENTITY_NOT_ALLOWED` (403), `SETUP_ALLOWLIST_LOCKOUT` (409, proposed).
- Non-contract: the global guard and its public marker `@Public()` [proposed], the identity accessor, the `/setup` and settings lazy routes.

Consumes:
- Platform (#16 `phase:scaffold`): error shape `{error: {code, message, details?}}`; `SCRIBA_PORT`, `SCRIBA_COMPOSE_VERSION`, `SCRIBA_DEV_ORIGINS`, `SCRIBA_SETUP_URL_BASE` (default `http://127.0.0.1:${SCRIBA_PORT}`), `SCRIBA_TS_SOCKET`; version info `{version, revision, builtAt, composeVersion}`; `/healthz`; composition root; settings hook [proposed name `registerSettingsSection`].
- Shell: typed client (401 to the sign-in notice), route entries, theming, dev proxy that forwards Host and Origin unchanged.
- Model providers: `/providers` contract and the embeddable panel export (#19 Q10).
- Project store: `/project-store` list, new, import and start-from-sample requests; `genrePack`.

Stubs until merge:
- Shell: none for guard tickets; do not stub the root route table. A parity test here checks the Shell's `/setup` and `/settings` constants against this module's routes [#17 Q3].
- Model providers: link to the providers settings until `phase:settings-ui`, as the spec allows.
- Project store: fake first-project requests in Vitest until `phase:files`, never in the composed app.
- Guard: never stubbed in the composed app. Module tests of other modules may boot behind a pass-through guard (#21 and #24 plan to).

## 5. Test strategy

- Unit (Vitest with unplugin-swc): pure functions only. Status normalisation, the loopback-peer predicate (including `::ffff:127.0.0.1`), Zod examples. No direct tests of the token store or the signing helper.
- Integration (main seam): the composed app, or this module alone, on a temp library with the fake LocalAPI socket. Cover file modes, stdout print, handshake headers, invalid-token page, cookie attributes, the 401/403 matrix (Host × credential × Origin × method), no CORS, `frame-ancestors`, the `settings.yaml` merge. Fixtures: the spec's four plus the §3 extras.
- Loopback-peer rule: predicate over (Host, peer address), as #16 tests its filter; plus an integration test from a non-loopback address when the runner has one.
- GET/HEAD sweep (owned here): enumerate routes from router metadata; fail on any unseeded route. A seed table maps path parameters and fails on unknown names. Snapshot the library tree and `settings.yaml`. Any envelope published during the sweep, except `platform/hello` and heartbeats, fails. Streaming GETs such as `/events` are read for headers and first bytes, then aborted. Exempt only `/books/.scriba/index/`. Until Project store lands, seed a fixture project on disk.
- Mutation guard: every non-GET/HEAD/OPTIONS route rejects no credential (401) and a bad Origin or Host (403). The public set equals the spec's four.
- UI (Angular Vitest, fake client built from `/setup-auth` contract types): step order, skip, prefills, Tailscale states, lockout message, compose warning, 401 notice.
- e2e (Platform's Playwright harness): token-guard adds the setup leg (read `setup-url`, open it); setup-flow adds the mock provider and sample project. Dev stack or built bundle follows #16 §7 item 4 (Q1).
- Manual, recorded in module docs; the agent cannot run them: Secure matrix (Safari, Chrome, Firefox on macOS); socket smoke test as the non-root UID (macOS, Linux); Serve Host preservation and header stripping; late login on a real tailnet; admin-console logout; phone demo.

## 6. Dependencies

"Waits on" means this module waits for the other side. "Gates" means the other side waits for this module.

Waits on:
- #16 `phase:scaffold`: this module's first phase, `phase:contract` [#26, first-phase row]. Later phases follow it.
- #17 `phase:core`: every feature UI phase (the minimal `/setup`, wizard, settings) [#26].
- #19 `phase:settings-ui`: `setup-flow`, for the embedded providers panel [#26]. #19 `phase:contract` is implied [spec].
- #20 `phase:contract`: `setup-flow` [#26]. #20 `phase:files`: `setup-flow`'s first-project step (Q2; #26 names the contract only).
- Not in #26, from the spec or #16: #16 `phase:test-harness` (e2e leg), #16 `phase:installer` (token-guard demo), #16 `phase:image-compose` and `phase:smoke` (tailnet), Shell's dev proxy (Q1).

Gates:
- #18 `phase:token-guard`: every module's public routes [#26].
- Named by sibling surveys, not in #26 (Q13): #19 `phase:client` (spec's Blocked-by; #19 Q18 would make it a release gate); #16 `phase:ci-publish` (#16 §7 item 9); #20's GET item (the GET/HEAD test); #21 `phase:loader-validation` (implementation gate); #23 `phase:file-tools-chat` (its P2); #24's gate list; #25 `phase:assembly-preflight`.

## 7. Open questions

**Owner stop points before token-guard** (README row: Q1–Q4 and Q11):
1. **Dev Host and Origin (Shell, Platform).** `SCRIBA_DEV_ORIGINS` "adds extra loopback origins" [#16 env table], but the Host allowlist matches host:port. #17 Q2 raises the same residual. Recommend: accept `host:port` pairs in the Host allowlist and the Origin set; the Shell's proxy forwards Host and Origin unchanged. Blocks token-guard.
2. **Gates and `SCRIBA_PORT` (owner confirmation).** Recommend: (a) token-guard waits on #16 `phase:scaffold`, which parses `SCRIBA_PORT` [#16 §7 item 17]; the spec's compose gate moves to #16 `phase:installer`, which owns the installed-image demo; tests use the 8080 default. (b) `SCRIBA_PORT` reaches `scriba` through #16 `phase:image-compose`, which already lists it. An earlier note here said only `SCRIBA_COMPOSE_VERSION` is passed; that was wrong. (c) setup-flow's first-project step waits on #20 `phase:files`, as #20 OQ18 proposes. (d) consumers may gate on the guard tickets (guard, public marker, identity accessor), not all of token-guard. Blocks token-guard (a, b, d); setup-flow (c).
3. **Installer fallback (Platform).** #16 spec step 8 and its acceptance line print the loopback URL while `setup-url` is missing. That URL has no token. Recommend: write `setup-url` before `listen`; the installer fails rather than print a tokenless URL. This amends #16's installer step. Blocks token-guard.
4. **Review items beyond #6 (owner).** `frame-ancestors 'none'`, the port-suffixed cookie, the token-keyed cookie; the spec marks all three "proposed". Recommend: adopt all three, with owner confirmation. Blocks token-guard.
8. **Server-side Max-Age (owner).** The spec gives a long Max-Age and an issue time in the signed value, not server-side rejection. Recommend: reject cookies older than a fixed Max-Age [proposed], set to the spec's browser cap of about 400 days; confirm with Q4. Blocks token-guard.
11. **Setup status storage (owner).** The spec does not say where setup status lives. Recommend: a `setup` section in `settings.yaml`, registered through Platform's settings hook with `(section, fromVersion)` keying [#16 §7 item 7]. Alternative: fields under `preferences`. Blocks token-guard.

**Owner stop points before tailnet:**
5. **Loopback-peer check on the identity header (owner).** Narrows #6's "trust the header when Host is the tailnet name". #16's spec Further Notes ask for it; #26 records it as a drafting decision, not an owner call. Recommend: keep it; test as a predicate (§5); ST-1 checks real peer addresses. If published-port traffic can arrive from loopback on some Docker setup, use the second, unpublished Serve listener (spec). Blocks tailnet.
12. **Tailnet 403 notice (Shell decides).** The Shell sends only 401s to `/setup` and imports nothing from setup-auth [#17]. Identity failures are 403s. Recommend: the Shell's client shows `AUTH_*` 403s with this module's `sign-in-notice/`. Blocks tailnet.

**Owner stop points before setup-flow:**
10. **Default genre pack (Project store, Tool registry).** Recommend: store a pack id, validated on save against the packs the Tool registry loads. Open: #21 Q6 recommends built-in packs only, while #20's `genrePack` also accepts user packs; #20 Q9 says New takes no pack, so the preference has no entry point unless #20 accepts a pack on New or this step writes `project.yaml` after creation. Blocks setup-flow.
14. **Theme precedence (Shell decides).** #17 Q8 says the #17 spec's "no server-side preference" line conflicts with `preferences.theme`. Recommend: keep the theme as the app default in `settings.yaml`, with a browser override and then `prefers-color-scheme` (#17's order); amend the #17 spec line. Blocks setup-flow.

**Owner, before consumers start (#26):**
13. **Gate edges siblings name but #26 does not.** Recommend: record them in #26 as the consumer surveys state them, with #19 Q18 as the release-gate exception for `phase:client`. Blocks the consumers' phases, not this module's.

**Proceed on recommendation:**
6. **Secure flag (recorded check).** Ship with no `Secure` flag, the spec's fallback, unless the recorded Safari, Chrome and Firefox results say otherwise. The author records them. Blocks closing token-guard.
7. **Identifiers.** Use the §4 codes as `[proposed]`. Routes are endpoint-named, with paths following #16 §7 item 18. Public marker: `@Public()` [proposed].
9. **Settings route.** Recommend `/settings`. #17 Q3 asks #18 to confirm it; the parity test in §4 covers it. Shell confirms. Blocks setup-flow.

## 8. Driver brief

Goal: implement Setup & auth (#18): a default-deny guard, a setup token that becomes a loopback cookie, a tailnet identity path, and a `/setup` wizard. Work in phase order: contract, token-guard, setup-flow, tailnet. Done when each phase's acceptance list in §3 passes, including the e2e legs and the recorded manual checks. Invariants: GET and HEAD never mutate; no response carries CORS headers; every mutation checks Host and the full Origin; the public set is pinned. Test through HTTP, the rendered UI with a fake client, and the e2e. Never test through the token store, the signing helper or internal services. The #6 decisions are owner calls: do not reopen them. Use the spec's names verbatim and mark invented names `[proposed]`.

Stop points (§7 items): token-guard waits for 1–4, 8 and 11; setup-flow for 2 (`phase:files`), 9, 10 and 14; tailnet for 5 and 12; consumers' phases for 13. Do not close token-guard until the Secure matrix (6) is recorded. Do not close tailnet until the §5 manual checks are recorded.

Allowed edits: this module, the setup leg in Platform's `e2e/`, and this module's docs. Platform, Shell and Project store changes are requests (§6, Q1, Q2). The one Platform-file exception is the socket smoke test entry in Platform's pre-release checklist. Raise anything else with the owner.
