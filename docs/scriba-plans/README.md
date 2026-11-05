# Scriba spec implementation surveys: status snapshot

Snapshot of the implementation surveys for the ten Scriba spec issues (#16–#25, tracker #26 in `bbartolome/scriba`), taken 2026-11-05 at 11:51 UTC.

These are drafts for owner review, not approved plans. The GitHub spec issues remain the source of truth. Nothing in this folder changes GitHub.

Each survey has the same eight sections: Approach, Files and modules, Phase plan, Contracts, Test strategy, Dependencies, Open questions, Driver brief. Each survey's §8 lists the stop points the owner must answer before a phase can close.

Review loop: an Opus read-only reviewer checks each survey against its spec, the closed map decisions #1–#15, and the tracker. A survey is approved when the reviewer returns no must-fix items.

## Status

| Spec | Survey file | Review status | Outstanding |
|---|---|---|---|
| #16 Platform | `16-platform-survey.md` | Round 3: REVISE. Must-fix not yet sent. | Must-fix: the "unit tests never read `examples/`" rule has no acceptance criterion. Add a phase 7 lint rule, a matching `RuleTester` case, and a done-when line. Should-consider: mark the route-prefix question as pending §7 item 18; reword the installer `docker` stub as "never the real docker"; make the integration-branch merge pattern an owner confirmation. |
| #17 Frontend shell | `17-frontend-shell-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. The e2e runs through the dev server and the Shell's proxy, per #7 (a map conflict with #16's harness line). |
| #18 Setup & auth | `18-setup-auth-survey.md` | Round 3: REVISE. Must-fix not yet sent. | Must-fix: §3 `phase:tailnet` says the socket smoke test is "(a request)", but §8 makes it the one Platform-file exception. Should-consider: state that the `SCRIBA_PORT` gate on token-guard was dropped, and add it to Q2's owner confirmation. Add steps for the stdout print, invalid-token page, `Referrer-Policy`, token-free `Location`, and the port-suffixed cookie. Give `SETUP_TOKEN_INVALID` a status. Add a `MagicDNSEnabled: false` fixture. State that the GET/HEAD sweep reads only headers of streaming GETs and then aborts. |
| #19 Model providers | `19-model-providers-survey.md` | **Approved** (round 3, no must-fix). Small fixes applied. | Owner decisions: Q13 (client types in `phase:contract`, which deviates from `phase:client`), Q15, Q18, Q19 (mock capabilities, asked of #16). |
| #20 Project store | `20-project-store-survey.md` | Round-2 must-fix and should-consider addressed (survey agent report). Not re-reviewed. | Re-review needed. |
| #21 Tool registry | `21-tool-registry-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. Covers the §6 dependency directions and the missing contract rows. |
| #22 Genre packs | `22-genre-packs-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. The image check now sits in #16 `phase:ci-publish`. |
| #23 Agent loop | `23-agent-loop-survey.md` | Round-3 must-fix addressed (survey agent report). Not re-reviewed. | Re-review needed. |
| #24 Graph runner | `24-graph-runner-survey.md` | Round 3: **APPROVED**, no must-fix. Should-consider notes not sent. | Should-consider: label Q2 as a map question; move Q14 to the contract stop points; add input and output nodes and the 7-step demo to the canvas phase; add #16 `phase:test-harness` to the engine gates; say how the "too new" refusal learns the supported version, how restart recovery finds the latest run log, and what the lazy-migration hook is in v1. |
| #25 Compile & export | `25-compile-export-survey.md` | Round 3: REVISE. Must-fix not yet sent. | Must-fix: (1) §8 wording should read "the DOCX header and title-page probe", and each phase's done-when gets its own line. (2) The Lua filter misses raw HTML media and mid-draft YAML metadata. Fix by running Pandoc with `--from=markdown-yaml_metadata_block`, feeding metadata through `--metadata-file`, rewriting or dropping media in raw HTML blocks, and dropping raw Typst blocks. (3) Add an open question on the lazy-migration conflict (#12/#7 against narrowing `order` and `export` at `schemaVersion` 1). |

## Map conflicts recorded so far

These are flagged in the surveys for owner confirmation. None is resolved here.

- #3 serial phases on one branch, against a second release branch (#16).
- #7 e2e on the dev server, against #16's built-bundle harness (#16, #17).
- #7 "No Zod for tool specs", against #3 and #21's Zod envelope (#21, #22).
- #12 and #14 membership, "every top-level file" against the `.md`-only rule (#25).
- #5 path safety, against Pandoc reading project paths directly (#25).
- #6 GET never mutates, against lazy migration and the queue GET (#20, #21).
- #2 phone scope, against #20's editor gating (#17).
- #12/#7 lazy migration, against narrowing `order` and `export` at `schemaVersion` 1 (#25; open).

## Not yet done

- Re-reviews for #17, #20, #21, #22 and #23 have not been run.
- The round-3 review for #18 returned REVISE. Its must-fix has not been sent to the survey agent.
- Must-fix items for #16 and #25, and the should-consider notes for #24, have not been sent to their survey agents.
- Once reviews are approved, each spec's phases will be run with `/navigator:pair`. That is a later step.
