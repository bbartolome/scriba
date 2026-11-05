# Scriba spec implementation surveys: status snapshot

Snapshot of the implementation surveys for the ten Scriba spec issues (#16–#25, tracker #26 in `bbartolome/scriba`), updated 2026-11-05 after round 4.

These are plans for owner review. Eight surveys (#16, #17, #18, #20, #21, #22, #23, #25) passed navigator review in round 4 with no must-fix items. #19 and #24 were approved in earlier rounds. The navigator is a local model, so its approvals are not owner approvals. Each survey's §7 owner stop points stay open and block the phases they name. The GitHub spec issues remain the source of truth. Nothing in this folder changes GitHub.

Each survey has the same eight sections: Approach, Files and modules, Phase plan, Contracts, Test strategy, Dependencies, Open questions, Driver brief. Each survey's §8 lists the stop points the owner must answer before a phase can close.

Review history: rounds 1 to 3 used an Opus read-only reviewer. Round 4 used the navigator in pair mode, with the same standard: a survey is approved when the review returns no must-fix items.

## Status

| Spec | Survey file | Review status | Outstanding |
|---|---|---|---|
| #16 Platform | `16-platform-survey.md` | Approved, round 4 (no must-fix). Three should-consider polish edits applied. | §7 items 1–25 open. Map conflicts: #3 serial phases (item 1), #7 e2e target (item 4; dev stack recommended, provisional), route prefixes (item 18). Image check in `phase:ci-publish` (item 23a). |
| #17 Frontend shell | `17-frontend-shell-survey.md` | Approved, round 4 (no must-fix). | Owner O1–O6: phone editing (map #2 against #20), e2e and PWA target, `/settings` route, theme precedence, reconcile coalescing, editor host for #21. Cross-spec C1–C7, including C1 (dev Host and Origin) before #18 `token-guard` closes. |
| #18 Setup & auth | `18-setup-auth-survey.md` | Approved, round 4 (no must-fix). | Owner stops before `token-guard`: items 1–4, 8, 11 (Q1–Q4, Q8, Q11). Before `setup-flow`: 9, 10, 14. Before `tailnet`: 5, 12. Item 6 (Secure matrix) is a recorded check. Item 2 is an owner confirmation. |
| #19 Model providers | `19-model-providers-survey.md` | Approved (round 3, no must-fix). Unchanged this round. | Owner decisions: Q13 (client types in `phase:contract`, which deviates from `phase:client`), Q15, Q18, Q19 (mock capabilities, asked of #16). |
| #20 Project store | `20-project-store-survey.md` | Approved, round 4 (no must-fix). | 28 open questions. Answer before the contract merges: 1, 4, 6, 9–13, 16, 19–21, 24. |
| #21 Tool registry | `21-tool-registry-survey.md` | Approved, round 4 (no must-fix). | Stops before `phase:contract`: 1, 2, 3, 10, 12, 13, 14, 16. Before `loader-validation`: 4, 6, 15. Before `executor`: 11. Before `editor-ui`: 9. Items 5, 7, 8, 17, 18 go to the phase tickets. |
| #22 Genre packs | `22-genre-packs-survey.md` | Approved, round 4 (no must-fix). | Owner stops O1–O16. Before P1: O1, O6, O10, O11, O16. Before P2: O2, O8, O14. Before P3: O3–O5, O12, O15. Before P4: O9, O13. Closing ticket: O7. |
| #23 Agent loop | `23-agent-loop-survey.md` | Approved, round 4 (no must-fix). | Owner items 11–23. Before P1 closes: 19, 21, 23. Before P2: 14, 15, 18. Before P3: 22. Before P4: 11, 12, 17, 20. Before P5: 13. Before P6: 16. Decision 5 waits on #21 OQ12. |
| #24 Graph runner | `24-graph-runner-survey.md` | Round 3: **APPROVED**, no must-fix. Unchanged this round. | Should-consider notes not sent: label Q2 as a map question; move Q14 to the contract stop points; add input and output nodes and the 7-step demo to the canvas phase; add #16 `phase:test-harness` to the engine gates; say how the "too new" refusal learns the supported version, how restart recovery finds the latest run log, and what the lazy-migration hook is in v1. |
| #25 Compile & export | `25-compile-export-survey.md` | Approved, round 4 (no must-fix). | STOP items 1, 5–8, 11, 13–17, 20. Other owner confirmations in §7 (items 18, 21–24). |

## Map conflicts recorded so far

These are flagged in the surveys for owner confirmation. None is resolved here.

- #3 serial phases on one branch, against a second release branch (#16). Open: #16 §7 item 1.
- #7 e2e on the dev server, against #16's built-bundle harness (#16, #17). Open: #16 §7 item 4; #17 O2.
- #7 "No Zod for tool specs", against #3 and #21's Zod envelope (#21, #22). Open: #21 OQ1; #22 O11. Both recommend Zod for the envelope only.
- #12 and #14 membership, "every top-level file" against the `.md`-only rule (#25). Open: #25 OQ1.
- #5 path safety, against Pandoc reading project paths directly (#25). Open: #25 OQ17.
- #6 GET never mutates, against lazy migration and the queue GET (#20, #21). Open: #20 OQ1 and OQ4; #21 OQ2 and OQ4.
- #6 GET and HEAD never change state, against lazy migration (#18 sweep). Open: #18 §1.
- #2 phone scope, against #20's editor gating (#17). Open: #17 O1; #20 OQ22.
- #12/#7 lazy migration, against narrowing `order` and `export` at `schemaVersion` 1 (#25). Open: #25 OQ20 (STOP).
- #13 against #22 on skeleton source front matter. Open: #22 O2.

## Not yet done

- Owner decisions in each survey's §7 are open. They stop the phases they block.
- Should-consider items for the owner from the round 4 batch: the #23 and #22 disagreement on the narrative-tools edge (#23 §6 P3 keeps it, #22 §6 leaves it to #23, #26 omits it); the #20 OQ14(b) and #22 O2 wording on sample source citations; the #21 mock-server gate (OQ17); #17's e2e target, provisional until #16 §7 item 4 is confirmed.
- Gate rows that surveys name but the #26 table omits: #21 §6 (eleven rows), #22 §6, #23 §7 item 23, #25 §6.
- #24's should-consider notes have not been sent to its survey agent.
- GLOSSARY.md has no "Agent run" entry. #20 and #23 both flag it.
- Next: plan for directing subagents to implement the specs, one `/navigator:pair` session per phase, each gated by tracker #26.
