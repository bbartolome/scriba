# #19 Model providers: implementation survey

Sources: spec `/tmp/scriba-specs/19.md`; decisions #1 to #7; the #16 to #23 specs; tracker #26.

## 1. Approach

- Wrap the official `openai` SDK behind our own `ProviderClient`. Always pass `baseURL` and `apiKey`, and set `maxRetries` to 0 so we own retries and timeouts (Provider kind and SDK, Retry boundary).
- Keep the retry rules in one pure function that knows whether a chunk has reached the caller. Retry only before the first chunk.
- Store config in the `providers` section of `settings.yaml`, and keys only through a reusable secrets helper (Registry and storage, Further Notes).
- Resolve the model in one pure function: project override, app default, provider model, `auto`. The client and `GET /api/providers` both call it. Cache the `auto` lookup in memory per provider, cleared on update. Never cache an empty or failed list, so a retry after `ollama pull` works.

## 2. Files and modules

Paths are relative to the scriba repo root. The layout comes from #4. Platform `phase:scaffold` sets the exact subpaths.

- `packages/contracts/src/providers/`: create. Zod schemas, defaults, presets, error codes, seeded example.
- `apps/api/src/modules/providers/`: create. `providers.module.ts` (`@Module`, imported by Platform's root), `providers.controller.ts`, `resolution.ts`, `connection-test.ts`; `client/` holds `provider-client.ts`, `openai-compatible.ts` (the only file importing `openai`), `retry-policy.ts` (pure) and `errors.ts`; `registry/` holds `providers-section.ts` and `secrets-file.ts` (reusable).
- `apps/web/src/app/features/providers/`: create. `providers.routes.ts` (lazy), `providers-panel.component.ts` (embedded by `/setup`), `project-model-panel.component.ts` (host in Q16).
- `e2e/fixtures/mock-openai/scenarios/providers-*.json`: add, in Platform's step format. Disconnect recording and scenario-set model lists need Q19.
- Additive edits only: (1) Platform's composition root, one import; (2) `apps/api/package.json` and the lockfile, adding `openai` (Platform owns shared files, #3); (3) the Shell's route table, one lazy entry; (4) the e2e provider helper (Q17); (5) mock code, only if Q19 is declined.

## 3. Phase plan

Serial: `contract`, `client`, `settings-ui`, `project-override`.

**phase:contract (M1).** Work: the Zod union on `kind` (one member), config, read view, defaults, presets, model list, connection test, `ModelChoice`, default and override requests, effective response, key request, error codes (Q15), the seeded-section example, and the client's types, DI token and fake, exported through the public `@Module` (pending Q13).
Done when: Acceptance criteria 1 to 4. The slice builds in api and web. Unknown `kind`, non-URL `baseURL`, and negative `timeout` or `retries` are rejected. No response type carries a raw key.
First test: Zod rejects `kind: 'anthropic'`.

**phase:client (M1).** Work: SDK wrapper; tool-call assembly by index; abort; our own first-byte and idle-gap timers (Q7); the section and seeding; the secrets file; `auto` resolution; the HTTP API, including the connection test; new mock scenarios. If Q13 is rejected, the types, token and fake become this phase's first ticket.
Done when: Acceptance criteria 1 to 8, plus the Seeding tests: an existing empty `list: []` is untouched, and a newer `schemaVersion` is refused. Deleting a provider deletes its secret entry. Startup tightens looser secrets-file modes and warns. The connection test's draft key is never stored. The `auto` cache never stores an empty or failed model list. The M1 milestone part also needs the real stack (Q2).
First test: boot on an empty temp library. `settings.yaml` has a `list` containing `id: ollama` at the seeded URL with no `keyRef`. A second boot leaves the bytes unchanged.

**phase:settings-ui (M2).** Work: lazy route, provider list, preset add, edit form, model picker with free-text fallback, masked key, staged test, hints, default selector, standalone panel.
Done when: Acceptance criteria 1 to 7: masked keys, picker fallback, stage hints, Ollama hints, refused default deletion, the panel in a bare host, and phone-width default switching.
First test: the panel renders against a fake client. After a key is saved, only the masked hint shows.

**phase:project-override (M2).** Work: read `model` in resolution; set and clear it through the Project store file API; the project model panel and readout.
Done when: Acceptance criteria 1 to 5, and the type test that `ModelChoice` and the `project.yaml` `model` field stay compatible (Further Notes; the tracker relies on it).
First test: golden diff. Setting an override changes only the `model` line.

## 4. Contracts

**Exposed, `@bbartolome/scriba-contracts/providers`** (spec names): the provider config `{id, kind, baseURL, model, temperature, contextSize, maxTokens, timeout, retries, keyRef}`; the read view with `keySet`; defaults; presets; model list; connection test request and result; `ModelChoice {providerId, model}`; app default and override requests; effective response `{choice, source, contextSize, warning?}`; write-only key request; the eight codes, plus Q15's three if approved.
Proposed names, not in the spec: `ProviderConfigSchema`, `PROVIDER_DEFAULTS`, `PRESETS`, `keyHint`.
Proposed section shape, since the spec says "a list": `providers: {appDefault: {providerId, model}, list: [ProviderConfig]}`.

**Exposed in-process, not on the wire.** `ProviderClient` with `stream()`, `collect()` and `resolve()` (proposed). Events: text delta; tool call completed `{id, name, rawArguments}`; finish `{reason: stop | tool calls | length | aborted}`; usage. Types, DI token and fake: placement pending Q13.

**Consumed.** Platform: the error base, `PROVIDER_` prefix, migration hook. Setup & auth: its guard (Platform, Guards). Project store: `project.yaml` field `model`, matching `ModelChoice`. Tool registry: the function schema `{type:'function', function:{name, description, parameters}}`, typed inline (Q14).

**Stubs.** None: the §6 gates land each dependency first.

## 5. Test strategy

No unit tests of internal functions, since the spec tests external behaviour only. Pure rules are checked through the seams, with fake timers.
- **Client seam** (Vitest against the mock): 429 with `Retry-After`, 503-then-200 and persistent 503, 401 not retried, timeouts, `auto` cache. Abort closing the connection and an empty model list need Q19.
- **HTTP and disk seam** (Vitest, Nest test app, temp library): the API; file bytes and modes; seeding; the key appears only in the mock's `Authorization` header.
- **Contract, UI, e2e:** Zod schemas and the `examples/` model-override check; the panel against a fake client typed from `/providers`; no new Playwright specs, with the provider set through the helper (Q17).
- **Manual:** the real-model eval script (#7) and the ST-3 host check.

## 6. Dependencies

Must merge first (issue numbers from the #1 map):
- #16 `phase:scaffold`, the gate for every module.
- #16 `phase:test-harness`, before `client`: the mock server, plus the Q19 capabilities (Q1, Q19).
- #17 `phase:core`, before `settings-ui`.
- #20 `phase:contract` and `phase:files`, before `project-override`.

The guard, #18 `phase:token-guard`, is a release gate, not a dev merge gate (Q18).

Waiting on us: #21 `phase:executor` and #23 `phase:file-tools-chat` (Q13); #18 `phase:setup-flow` needs `settings-ui`.

Tracker gap: only #19 `phase:client` ← #16 `phase:test-harness` is missing. The guard row exists ("public routes in every module").

## 7. Open questions

**Decision check.** No conflicts with #1, #2, #4, #5, #6 or #7. #13 says unit tests never read `examples/`, and the nonfiction sample is the e2e fixture. So project-override criterion 5 runs through the e2e "project from sample" step, or a copied fixture plus Platform's examples check, not a unit test. One conflict is with #3 on consumer gating (Q13). The spec goes beyond the decisions on `auto` (Q9), the key hint and the idle-gap timeout. It cites #2 for phone settings, which #2 does not list.

**Q1. Mock server phase.** The spec's Consumes and `phase:client` name Platform `phase:scaffold`. Platform puts the mock in `phase:test-harness` (16.md). *Recommend:* correct the spec.

**Q2. Real stack for M1.** The milestone part and demo steps 1 to 3 need `image-compose`, `smoke` (ST-3) and `installer`, which the tracker's M1 list omits. The dev server runs outside Docker, where `host.docker.internal` may not resolve, so a dev-server M1 cannot show zero-config Ollama. *Recommend:* gate M1 on the dev server and mock, with the compose check as a manual release step. This relaxes an acceptance criterion, so the owner confirms.

**Q3. Search API key.** #23 `phase:research` (M7) needs a write-only key for a keyed search API. That falls outside every phase here, and our key APIs are provider-scoped. Options: (a) #23 owns its key route and reuses this module's secrets helper in-process, as Further Notes allow; (b) later, add a named-secret request to `/providers` through expand–contract. *Recommend:* (a). Nothing is built now.

**Q4. `project.yaml` shape.** Approve editing #20 lines 127 and 256 to say the model shape is defined locally, as line 384, the tracker and our spec already say? Yes or no.

**Q5. Secrets location.** #5 says a 0600 file in a 0700 directory but names neither. *Recommend:* `/books/.scriba/secrets/secrets.yaml`, with this module creating `secrets/` at 0700. No Platform change.

**Q6. Terms.** The spec's "run" means an agent-loop execution, but GLOSSARY's **Run** is recipe-only. *Recommend:* use "agent run" in code, and add terms through `/domain-modeling` later.

**Q7. Client names and SDK timeouts.** The spec gives no method names, and asks us to verify SDK timeout semantics. *Recommend:* the section 4 names, and our own timers rather than the SDK's.

**Q9. `auto` fallback.** #6 says the author picks the model, but the spec keeps `auto` permanently. *Recommend:* keep it, show "auto" in the UI, never persist it, and confirm with the owner.

**Q10. Panel location.** #18 embeds our panel from another feature folder. *Recommend:* one public export, which #18 imports.

**Q11. Override writes.** The spec makes `project.yaml` writes direct author actions, not pending changes; #5 is silent. *Recommend:* a direct write with the Project store's write precondition, confirmed by the owner.

**Q12. `max_tokens`.** *Recommend:* send `max_tokens` now, and verify it in `phase:client`.

**Q13. Client types and consumer gate (#3).** #3 says consumers wait on the producer's contract phase, but the spec and tracker block #21 and #23 on `phase:client`. *Recommend:* put the types, DI token and fake in `phase:contract`, through the public `@Module`. #16 confirms the lint passes that path. The fallback, the `/providers` subpath, contradicts spec line 92 and Further Notes line 287, so the owner decides. M1 still merges `client` before #23 `file-tools-chat` (#23 line 216). If Q13 is rejected, the types become `phase:client`'s first ticket.

**Q14. Inline function schema.** Typing it inline drops the spec's dependency on #21 `phase:contract`, which the tracker places in M2. *Recommend:* inline now, and add a compatibility test once #21 publishes.

**Q15. Missing error codes.** The spec has no code for the 409 default-deletion refusal, an unknown provider id, or out-of-credit replies. *Recommend:* add `PROVIDER_IN_USE` (409), `PROVIDER_NOT_FOUND` (404) and `PROVIDER_QUOTA_EXCEEDED` (402, or 429 with `insufficient_quota`). The last is not retried, which changes the spec's rule that 429 is retried. The owner confirms.

**Q16. Project model panel host.** No spec owns a project settings area. The Shell mounts project-scoped routes under `projects/:projectId/` (17.md), and #20 rejects requests for a non-active project (20.md line 100). *Recommend:* a project-scoped route, with writes limited to the active project.

**Q17. e2e provider helper.** The shared e2e has no provider step yet. *Recommend:* one helper that calls `/api/providers` against the mock, agreed with the #18 and #23 owners.

**Q18. Guard gate.** The spec's Blocked-by puts `client` behind #18 `phase:token-guard`, but Platform allows unguarded dev routes until the guard lands. *Recommend:* a release gate only. The owner confirms.

**Q19. Mock capabilities.** Client criterion 5 needs the mock to show the connection close, and the Testing Decisions need an empty `GET /v1/models` list. Platform's steps (16.md lines 272–273) record requests and can drop connections, but not client disconnects or scenario-set model lists. *Recommend:* ask #16 `phase:test-harness` to add both. Otherwise make an additive mock code edit, agreed with #16.

## 8. Driver brief

Scriba is a local-first writing harness for one author. This module gives the Agent loop and Tool registry one streaming client over an `openai-compatible` provider; keys live only in the secrets file. Build in the folders in section 2, in phase order, to the done-when in section 3. Decisions are #6, #5 and #4; Platform's phases are in #16. Invariants: no key appears in any GET response, log, error or settings file; GET never mutates; retries happen only before the first chunk; the client never parses tool arguments; the SDK never reads `OPENAI_*` environment variables. Stop and report at the end of each phase. Before `client`, check that #16 `phase:test-harness` has merged; before `settings-ui`, that #17 `phase:core` has; before `project-override`, that #20 `phase:files` has. Stop before acting on Q1, Q2, Q3, Q4, Q9, Q11, Q13, Q14, Q15, Q16, Q18 and Q19. Do not edit issues. Make only this module's files and the additive edits in section 2. Use "agent run" in code.
