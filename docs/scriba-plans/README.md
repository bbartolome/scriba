# Scriba spec implementation surveys: status snapshot

Snapshot of the implementation surveys for the ten Scriba spec issues (#16–#25, tracker #26 in `bbartolome/scriba`), taken 2026-11-05 at about 05:24 UTC.

These are drafts for owner review, not approved plans. The GitHub spec issues remain the source of truth. Nothing in this folder changes GitHub.

Each survey has the same eight sections: Approach, Files and modules, Phase plan, Contracts, Test strategy, Dependencies, Open questions, Driver brief. Each survey's §8 lists the stop points the owner must answer before a phase can close.

Review loop: an Opus read-only reviewer checks each survey against its spec, the closed map decisions #1–#15, and the tracker. A survey is approved when the reviewer returns no must-fix items.

## Status

| Spec | Survey file | Review status | Notes |
|---|---|---|---|
| #16 Platform | `16-platform-survey.md` | Round 2 revised. Round-3 review not run. | Round-2 must-fix items 1–4 applied. Owner decisions include serial phases on one branch (#3), the e2e target (#7 vs the harness line), and sibling route prefixes (#21 `/api/tools`, #24 `/api/graphs`). |
| #17 Frontend shell | `17-frontend-shell-survey.md` | Round 3: REVISE. Revision not applied. | Open must-fix: the e2e must run through the dev server and the Shell's proxy, per #7. This overrides #16's harness line, which is a map conflict to flag. Also open: reconcile-tick tests, the nav-slot outlet for the project picker, and `ngsw-bypass` for `/events`. |
| #18 Setup & auth | `18-setup-auth-survey.md` | Round 2 revised. Round-3 review not run. | Round-2 must-fix items 1–3 applied. Owner decisions before token-guard: Q1–Q4 and Q11. Q12 is a stop before tailnet. |
| #19 Model providers | `19-model-providers-survey.md` | **Approved** (round 3, no must-fix). Small fixes applied. | Owner decisions: Q13 (client types in `phase:contract`, which deviates from `phase:client`), Q15, Q18, Q19 (mock capabilities, asked of #16). |
| #20 Project store | `20-project-store-survey.md` | Round 2: REVISE. Revision not confirmed. | The file changed at 05:23 UTC, but the agent stopped on a rate limit before reporting, so completion is unverified. Open must-fix: Work lists for files, search and pending-review; the overlay (OQ10); OQ20 (check the base before migrating); contract consumers in §6. |
| #21 Tool registry | `21-tool-registry-survey.md` | Round 3: REVISE. Not yet routed to the agent. | Open must-fix: §6 dependency directions. The #22 and #23 rows point the wrong way, which would make a cycle. Missing rows: #22 `core-propose-graph` contract gate, #24 contract gate, and #23 draft provenance. |
| #22 Genre packs | `22-genre-packs-survey.md` | Round 2 revised. Round-3 review not run. | Round-2 must-fix items 1–4 applied. Owner stops S0–S4 and O2, O9–O11 (see §8). Spec amendments to #22 and #20 are owner decisions. |
| #23 Agent loop | `23-agent-loop-survey.md` | Round 2 revised. Round-3 review not run. | Round-2 must-fix items 1–6 applied. Owner decisions are the stop list in §8, including the #20 provenance field and the #24 origin question. |
| #24 Graph runner | `24-graph-runner-survey.md` | Round 2 revised. Round-3 review not run. | Round-2 must-fix items 1–6 applied. Owner decisions: contract stops Q6–Q10, active project from the provider (Q12), and a sixth placeholder step "recipe run" requested of #16. |
| #25 Compile & export | `25-compile-export-survey.md` | Round 2 revised. Round-3 review not run. | Round-2 must-fix items 1–6 applied. Step 0 is an owner decision on membership (amend #25 or comment on #12). The Typst spike and DOCX probe are the first export tickets. |

## Map conflicts recorded so far

These are flagged in the surveys for owner confirmation. None is resolved here.

- #3 serial phases on one branch, against a second release branch (#16).
- #7 e2e on the dev server, against #16's built-bundle harness (#16, #17).
- #7 "No Zod for tool specs", against #3 and #21's Zod envelope (#21, #22).
- #12 and #14 membership, "every top-level file" against the `.md`-only rule (#25).
- #5 path safety, against Pandoc reading project paths directly (#25).
- #6 GET never mutates, against lazy migration and the queue GET (#20, #21).
- #2 phone scope, against #20's editor gating (#17).

## Not yet done

- Round-3 reviews for #16, #18, #22, #23, #24 and #25 are not run. Those agents stopped on a rate limit before reporting.
- #21's round-3 must-fix item has not been sent to its survey agent.
- #17's round-3 revision and #20's round-2 revision did not complete. The files on disk may be partly updated.
- Once reviews are approved, each spec's phases will be run with `/navigator:pair`. That is a later step.
