# Scriba v1 tracker: rules and decisions

Source for the rules that GitHub tracker #26 applies. #26 keeps the spec table, the phase checklist and the closed-ticket audit (section 5). Change a rule here on `main` first, then update #26.

## Closure rule and gates (replaced 2026-11-08, scout q1 to q4)

A phase ticket closes only when all of these hold:
- Its tickets are closed.
- Every acceptance criterion of the phase in the spec passes, checked item by item.
- Every gating item for the phase (G2 to G5 below) is answered or done.

Human-only checks (G1) do not gate phase closure. They go on the end-of-build validation list below, which runs once the app runs end to end.

Provisional items do not block closure. For each owner stop with a recommended default, the default is accepted, implemented, and marked provisional in code and on #26. Where no default is stated, pick the option that changes no accepted spec criterion and no published contract. Any change to an accepted criterion or published contract returns to the owner, and that stop gates its phase until the owner answers. An amendment is new work, tracked in the owning ticket.

Gate classes:
- **G1** owner-only check. Moved to the end-of-build list below. Does not gate closure.
- **G2** map conflict. The surveys say each one gates the phase it blocks.
- **G3** amendment of an accepted spec criterion, a published contract, another module's gate, or a spec definition. Gates until the owner answers.
- **G4** no recommended default.
- **G5** owner review of a spike or probe result.

### Withdrawn from this record (2026-11-08)
The scout decisions q1 to q10 that were recorded here before the replacement are withdrawn. That covers the batch reopen of the phase tickets and specs #19 and #21, the reopen of #63, the chapter count for #62, the pending-change timing, the provenance location, the entity-ID rule, and the #71 edges as decisions. The replacement does not change GitHub. The tickets stay open, the reopen comments already on them stay, and the #71 native edges stay. The spec and code work named under the withdrawn decisions is neither started nor cancelled by this record.

### Decisions recorded 2026-11-08 (scout q1 to q4, approved by the owner)
- **q1, human-only checks:** G1 checks wait until the app runs end to end. They are collected on the end-of-build list and gate no phase before then.
- **q2, owner stops with a default:** accept the survey default, implement it, and mark it provisional in code and on #26. Where none is stated, pick the option that changes no accepted criterion or published contract. Criterion or contract changes return to the owner.
- **q3, #26 closure rule:** amended as in the closure rule above. The amendment and its reason are recorded on #26.
- **q4, closure-blockers.md:** kept as a reference file with a superseded note. Its governance proposals no longer apply.

### End-of-build validation list (G1 human-only checks, scout q1)
Run once the app runs end to end. These checks do not gate phase closure.
- #30 arm64 and amd64 checks, and the Tailscale sidecar run.
- #36 ST-1 to ST-3 on real hardware.
- #38 Secure matrix on real browsers.
- #39 box 8, the real-stack check.
- #42 clean-machine installer run.
- #44 criterion 7, the phone layout in a real browser.
- #47 browser checks (A6 and the phone layout).
- #49 Docker Hub secrets, pushes to main, releases.
- #50 real-browser PWA checks.
- #55 image write check (needs #49).
- #58 tailnet section 5 manual checks.
- #61 and #65 real-model eval and owner demo.
- #70 iPad Safari touch check.
- #71 Word and EPUB open check.

### Gating map conflicts and amendments (G2, G3, G5)
References to decisions q5 to q9 in the rows below are withdrawn. The G3 rows they touched are open again until the owner answers.
- #36: G2, survey 16 item 3.
- #42: G3, survey 16 items 11, 17, 20.
- #49: G2, survey 16 item 3. G3, survey 16 item 23(a).
- #50: G2, survey 17 O2.
- #58: G2 or G3, survey 18 Q5.
- #59: G2, survey 20 OQ 1, 2, 3, 4, 22.
- #62: G2, survey 25 OQ 1, 17, 20. G3, survey 25 OQ 8 (decision q5; waits for #72), 11, 13, 14, 22, 23.
- #64: G3, survey 22 O3, O4, O5.
- #66: G2, survey 24 Q1, Q4, Q13, Q15. G3, Q5.
- #67: G2, survey 25 OQ 17. G3, survey 25 OQ 7, 15. G5, survey 25 OQ 5, 6.
- #68: G3, survey 22 O9, O13.
- #69: G3, survey 23 items 11, 12, 20 (decided, see q6 to q8; the spec amendments and code work are open).
- #70: G2, survey 24 Q15.
- #71: G2, survey 25 OQ 4. G3, survey 25 OQ 15, 16, 18.
- #72: G3, survey 23 item 13.
- #73: G3, survey 23 item 16.

### Provisional defaults (not gates)
- #42: survey 16 items 12, 14.
- #49: survey 16 items 9 (already satisfied), 19.
- #58: survey 18 Q12.
- #64: survey 22 O12.
- #66: survey 24 Q2, Q3, Q6, Q7, Q8, Q10, Q11, Q12, Q14. Q9 is already implemented.
- #69: survey 23 item 17.
- #71: survey 25 OQ 9, 10.
- #73: search backend default (SearXNG-compatible, no key in v1).

### Native edges (blocked-by), added 2026-11-08
These edges exist on GitHub and are unchanged by this record. The decision references on them are withdrawn.
- #58 needs #36 (spec 18: ST-1 outcome).
- #64 needs #62 and #70 (spec 22 line 222).
- #67 needs #49 (spec 25 line 308: CI phase).
- #71 needs #69 and #72 (survey 25 section 6; cross-module, decision q9).
- #62 needs #72 (decision q5, conditional on the chapter-count check above).

### Not done by this update
- Spec amendments: spec 23 (items 11, 12, 20) and #22 O7 (item 20). Spec bodies were not edited.
- Code work for q6 to q8: the write tools' base, the provenance field and query, the accept-time ID assignment, and entity-output routing.
- The item-by-item acceptance check of each reopened phase. This is the next step for each reopened ticket.
- Owner confirmation of the provisional defaults above.

## Gates: what blocks what

A consumer waits for the producer's **contract** phase, not its implementation, unless the row says otherwise. When `to-tickets` creates the tickets, turn these rows into native blocked-by edges between them.

| Consumer (phase) | Blocked by |
|---|---|
| Every module's first phase | #16 `phase:scaffold` |
| Every feature UI phase | #17 `phase:core` |
| Public routes in every module | #18 `phase:token-guard` |
| #17 `phase:editor` | #20 `phase:contract` |
| #18 `phase:setup-flow` | #19 `phase:settings-ui` (embedded providers panel), #20 `phase:contract` |
| #19 `phase:project-override` | #20 `phase:contract` + `phase:files` |
| #20 (none from other contracts) | the model override shape is defined locally; #19 checks that it stays compatible |
| #21 `phase:executor` | #19 `phase:client` (implementation) |
| #21 UI phases | #20 `phase:files` (implementation), #17 `phase:editor` |
| #22 `phase:core-propose-graph` | #21 `phase:contract`, #24 `phase:contract` |
| #22 `phase:nonfiction-workhorses` | #21 `phase:contract`, #20 `phase:files` (sample skeleton) |
| #23 `phase:file-tools-chat` | #19 `phase:client`, #20 `phase:files` (both implementation), #17 `phase:shared-components` (tool-call card) |
| #23 `phase:narrative-tools` | #21 `phase:executor` |
| #23 `phase:pending-writes` / `phase:grounding` | #20 `phase:pending-review` / `phase:search` |
| #23 `phase:compile-tools` | #25 (implementation) |
| #24 `phase:engine` | #21 `phase:loader-validation` + `phase:executor`, #20 `phase:files` + `phase:pending-review` |
| #24 `phase:canvas` | #21 `phase:form-renderer`, #22 `phase:nonfiction-workhorses` (sample recipe) |
| #25 `phase:assembly-preflight` | #20 `phase:contract` + `phase:files`, #24 `phase:contract`, #23 `phase:contract` |
| #16 `phase:examples-check` | #20, #24 contracts; #21 `phase:loader-validation` |

## Milestones

Each milestone is done when the phases listed here are ticked and its demo script, kept in the spec that owns the demo, runs in under five minutes.

- **M1, walking skeleton:** #16 scaffold + test-harness, #17 core + tool-call card, #18 contract + token-guard, #19 contract + client, #20 contract + files, #23 contract + file-tools-chat.
- **M2, tool registry and workhorses:** all of #21, #22 core-propose-graph + nonfiction-workhorses, #23 narrative-tools, #19 settings-ui + project-override, #20 search, #18 setup-flow.
- **M3, review and grounding:** #20 pending-review, #17 read-only diff + editor, #23 pending-writes + grounding, #18 tailnet.
- **M4, canvas:** all of #24.
- **M5, compile and export:** all of #25.
- **M6, fiction:** #22 fiction.
- **M7, polish:** #17 polish, #20 migrations, #22 remaining-shapes, #23 research + compile-tools.

## Cross-spec decisions made while drafting

These go beyond the map. Revisit them in the owning spec if any of them is wrong.
- **`settings.yaml`:** Platform owns the file envelope and the startup migration hook. Each module owns its own section: `providers`, `projects`, `tools`, `agent`, `preferences`, and so on.
- **Model override:** `project.yaml`'s model override `{providerId, model}` is defined by the Project store. Model providers asserts that it stays compatible with `ModelChoice`. This keeps the wave-1 contracts free of a cycle.
- **Port keys:** a tool node's output port key is `output`, taken from the Tool registry. Input nodes use `out` and output nodes use `in`.
- **SSE module names:** the `module` value in the event envelope is the module's slug (`agent-loop`, `graph-runner`, `compile-export`, …).
- **Tailnet identity header:** it is trusted only from a loopback peer with the tailnet Host. ST-1 checks the real peer addresses.
- **Glossary gap:** "agent run", an agent-loop execution as distinct from a recipe **run**, is used in the specs and should be added to `GLOSSARY.md` through `/domain-modeling`.

## Phase record: #28 phase:scaffold (2026-11-09)

- Verification on main at 4e8a37d: `npm run build`, `npm test` and `npm run lint` all pass from the root. Test suites: 601, 506, 307, 15 and 14 tests; no type errors; examples-check reports 0 errors.
- Acceptance criteria (survey 16 lines 28 to 38): the 11 criteria are covered by named tests in apps/api/test (boot, healthz-version, events, headers, tailnet, settings, errors-validation, shutdown, boundaries.rule, config, static, dev-origin, dev-origin-guard). Criterion 38 (ci.yml green on the scaffold PR) is open: the decision on whether the green run on PR #109 counts is pending.
- Owner stops taking the stated default, recorded as provisional on this tracker: survey 16 section 7 items 1, 2, 3, 4, 5, 10, 16 and 24. Item 10's default is already in code (apps/api/src/main.ts binds 127.0.0.1 unless --listen-all; apps/api/src/modules/setup-auth/guard.ts reads SCRIBA_DEV_ORIGINS).
- Owner-pending: item 11 (installer fallback and pre-listen setup-url). It is a criterion change (G3). It gates phase:setup-auth, not phase:scaffold.
- Next unblocked phase: #29 phase:test-harness, which is blocked only by #28.
- G1 checks are not gates. They go to the end-of-build validation list.

## Phase record: #29 phase:test-harness (2026-11-09)

- Acceptance criteria 42 to 47 (survey 16 lines 41 to 47), each mapped to its named test on main at 4e8a37d:
  - 42, streamed tool call with split arguments, then a text answer: e2e/fixtures/mock-openai/mock-openai.test.ts, first test.
  - 43, malformed-tool-call retry: the same file, the malformed-tool-call test.
  - 44, status with headers (429 with Retry-After), delay, drop mid-stream, recorded requests readable and resettable: the same file, the status, delay, drop, and reset tests.
  - 45, parallel scenarios do not interfere: the same file, the parallel test.
  - 46, npm run e2e boots the app, app-loads check, five journey steps reported pending: e2e/tests/journey.spec.ts, exercised by the CI E2E job. A local run of npm run e2e was not done in this session, so the evidence is the CI run on main.
  - 47, CI runs the e2e and uploads traces on failure: .github/workflows/ci.yml, the E2E job and the trace upload step (lines 55 to 66).
- Owner stops 21 and 22 take their stated defaults, recorded as provisional on this tracker. Item 21: disconnect recording and the empty model list are data-file steps (mock tests at lines 292 and 315). Item 22: one journey spec with five placeholder steps and no sixth step, so no owner approval is owed.
- Phase #29 closed on tracker #26. The next phase is recorded from survey 16 and survey 17 in a later update.
