# Scriba spec implementation surveys: status snapshot

Snapshot of the implementation surveys for the ten Scriba spec issues (#16–#25, tracker #26 in `bbartolome/scriba`), taken 2026-11-05 at 11:57 UTC.

These are drafts for owner review, not approved plans. The GitHub spec issues remain the source of truth. Nothing in this folder changes GitHub.

Each survey has the same eight sections: Approach, Files and modules, Phase plan, Contracts, Test strategy, Dependencies, Open questions, Driver brief. Each survey's §8 lists the stop points the owner must answer before a phase can close.

Review loop: an Opus read-only reviewer checks each survey against its spec, the closed map decisions #1–#15, and the tracker. A survey is approved when the reviewer returns no must-fix items.

## Status

| Spec | Survey file | Review status | Outstanding |
|---|---|---|---|
| #16 Platform | `16-platform-survey.md` | Round-3 must-fix and should-consider addressed (survey agent report). Not re-reviewed. | Re-review needed. Owner decisions include serial phases on one branch (#3), the e2e target (#7), and route prefixes pending §7 item 18. |
| #17 Frontend shell | `17-frontend-shell-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. The e2e runs through the dev server and the Shell's proxy, per #7 (a map conflict with #16's harness line). |
| #18 Setup & auth | `18-setup-auth-survey.md` | Round-3 must-fix and should-consider addressed (survey agent report). Not re-reviewed. | Re-review needed. Owner decisions before token-guard: Q1–Q4 and Q11. The `SCRIBA_PORT` gate move is an owner confirmation (Q2). |
| #19 Model providers | `19-model-providers-survey.md` | **Approved** (round 3, no must-fix). Small fixes applied. | Owner decisions: Q13 (client types in `phase:contract`, which deviates from `phase:client`), Q15, Q18, Q19 (mock capabilities, asked of #16). |
| #20 Project store | `20-project-store-survey.md` | Round-2 must-fix and should-consider addressed (survey agent report). Not re-reviewed. | Re-review needed. |
| #21 Tool registry | `21-tool-registry-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. Covers the §6 dependency directions and the missing contract rows. |
| #22 Genre packs | `22-genre-packs-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. The image check now sits in #16 `phase:ci-publish`. |
| #23 Agent loop | `23-agent-loop-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. |
| #24 Graph runner | `24-graph-runner-survey.md` | Round 3: **APPROVED**, no must-fix. Should-consider notes not sent. | Should-consider: label Q2 as a map question; move Q14 to the contract stop points; add input and output nodes and the 7-step demo to the canvas phase; add #16 `phase:test-harness` to the engine gates; say how the "too new" refusal learns the supported version, how restart recovery finds the latest run log, and what the lazy-migration hook is in v1. |
| #25 Compile & export | `25-compile-export-survey.md` | Round-3 must-fix and should-consider addressed (survey agent report). Not re-reviewed. | Re-review needed. The lazy-migration conflict is now an open question (OQ20). The Lua filter now uses staged copies and `markdown-yaml_metadata_block`. |

## Map conflicts recorded so far

These are flagged in the surveys for owner confirmation. None is resolved here.

- #3 serial phases on one branch, against a second release branch (#16).
- #7 e2e on the dev server, against #16's built-bundle harness (#16, #17).
- #7 "No Zod for tool specs", against #3 and #21's Zod envelope (#21, #22).
- #12 and #14 membership, "every top-level file" against the `.md`-only rule (#25).
- #5 path safety, against Pandoc reading project paths directly (#25).
- #6 GET never mutates, against lazy migration and the queue GET (#20, #21).
- #2 phone scope, against #20's editor gating (#17).
- #12/#7 lazy migration, against narrowing `order` and `export` at `schemaVersion` 1 (#25, OQ20).

## Not yet done

- Re-reviews for #16, #17, #18, #20, #21, #22, #23 and #25 have not been run.
- Should-consider notes for #24 have not been sent to its survey agent.
- Once reviews are approved, each spec's phases will be run with `/navigator:pair`. That is a later step.
