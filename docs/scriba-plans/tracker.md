# Scriba v1 tracker: rules and decisions

Source for the rules that GitHub tracker #26 applies. #26 keeps the spec table, the phase checklist and the closed-ticket audit (section 5). Change a rule here on `main` first, then update #26.

## Closure rule and gates (applied 2026-11-08)

A phase ticket closes only when all of these hold:
- Its tickets are closed.
- Every acceptance criterion of the phase in the spec passes, checked item by item.
- Every gating item for the phase (G1 to G5 below) is answered or done.

Provisional items do not block closure. A provisional item is built on the survey's recommended default, marked provisional in code, and listed below for the owner to confirm or amend. An amendment is new work, tracked in the owning ticket.

Gate classes:
- **G1** owner-only check: hardware, clean machine, real device or browser, publish secrets, releases, manual document check. An agent cannot run it.
- **G2** map conflict. The surveys say each one gates the phase it blocks.
- **G3** amendment of an accepted spec criterion, a published contract, another module's gate, or a spec definition.
- **G4** no recommended default.
- **G5** owner review of a spike or probe result.

### Reopened 2026-11-08
Each reopened ticket has a comment that says why. Reopening does not mean the work is wrong. It means the closure was not verified item by item.
- Phase tickets (scout decision q2): #28, #29, #30, #31, #32, #33, #34, #35, #37, #38, #39, #40, #41, #43, #44, #45, #46, #47, #48, #51, #52, #53, #54, #55, #56, #60, #61, #65.
- Specs (q2): #19 with its phases #33, #39, #44 and #52. #21 with its phases #41, #46, #54 and #60.
- Phase #63 phase:editor-ui (q3): reopened for spec 21 criteria 4 and 6, which are only partly met on main.
- Not reopened: #57. Its closing comment checks each criterion.

### Decisions recorded 2026-11-08 (scout session, approved by the owner)
- **q1, closure rule:** adopted as written above.
- **q2, batch closures:** reopened, as listed above. Each phase's acceptance is to be checked item by item.
- **q3, #63:** reopened for criteria 4 and 6.
- **q4, owner stops of #19 and #21:** classified only after the item-by-item check of their reopened phases. Not classified now.
- **q5, chapter count for #62:** `grounding-claims.md` counts as the third chapter. #62 waits for #72. Check first whether the three shipped chapters (`examples/nonfiction/drafts/ch01.md` to `ch03.md`) already meet the spec's count. If they do, this wait is not needed.
- **q6, item 11, pending-change timing:** adopt the first-propose model, and amend spec 23 to say so. The write tools must pass the first-read base. Open work: the spec amendment and the base-passing code change.
- **q7, item 12, provenance:** optional provenance on the pending change, with an in-process `latestProvenance({targetPath})` query. Open work: the spec amendment, the code that writes the field, and the query.
- **q8, item 20, entity IDs:** the Project store assigns entity IDs on accept, and prompts may not supply them. Open work: the spec amendment (#22 O7), the accept-time ID assignment in `commit()`, and routing entity outputs to `entities/`.
- **q9, #71 edges:** added as native edges (cross-module gate, owner decision).
- **q10, the proposal file:** kept uncommitted in the repo (`docs/scriba-plans/closure-blockers.md`).

### Owner-run checks (G1)
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
