# Survey: #23 Agent loop

Sources: spec #23; map #1 decisions #2–#15 as cited; tracker #26; sibling surveys #16–#22, #24, #25 for cross-spec checks only. Map decisions win over the spec. Decided items 1–10 in §7 apply. Open items 11–23 are owner stop points with a recommendation. Status: revised for re-review, not approved.

## 1. Approach

- **One Nest module around a pure step loop.** Model calls go only through the #19 client. Files, search, pending changes and the registry go through in-process services (#20, #21, #25).
- **One seq-ordered event log per agent run.** SSE tails it; current-run-state projects it with `lastSeq`. One multiplexed stream per tab (map #4).
- **Writes stay in the run overlay until run end.** `write_file` and `edit_file` never touch disk; `read_file` sees the overlay. Pending changes are created when the agent run ends, for any reason (spec). Item 11 may move this into #20.
- **Transcripts are the only conversation store,** read per GET, with no index (map #5). Grounding rules are code, so scripted judge turns test them.
- **Terms.** Prose says **agent run** for one pass of the loop. Bare "run" means a recipe **run**. Wire names (`run-started`, `runId`) stay. GLOSSARY.md has no "Agent run" entry yet (item 9).
- **Gate reach.** #26 lists only #25 as waiting on this `phase:contract`. #22's survey also waits on it, which conflicts with #26's wave order (item 23).

## 2. Files and modules

Relative to the repo root. **Every path is [proposed].** `git ls-files` shows no app code (docs, GLOSSARY, configuration and skills only).

- `packages/contracts/src/agent-loop.ts` (subpath `./agent-loop`, the file #16 scaffolds) and `packages/contracts/test/agent-loop/`. Item 21 covers the folder form used by #20, #21 and #24.
- `apps/api/src/modules/agent-loop/`: `agent-loop.module.ts` (`@Module`, imported into Platform's root), controller, `run/`, `context/`, `tools/`, `grounding/`, `research/` (P6), `transcript/`, `agent-settings.ts`.
- `apps/api/test/agent-loop/`, `apps/web/test/agent-loop/`.
- `apps/web/src/app/features/agent-loop/`: `agent-loop.routes.ts` (lazy), `chat/`, `cards/`, `grounding/`, `chat-state.ts`.
- `e2e/tests/journey.spec.ts` (Platform's one spec, extended by two steps; no new e2e file) and `e2e/fixtures/mock-openai/` scenarios.
- `examples/nonfiction/drafts/grounding-claims.md` (P5; Project store owns `examples/`, map #13).
- Written by the loop: transcripts in `logs/agent-runs/` (item 18) and claims artefacts in `logs/claims/<draft path>.json` (decision 2).

## 3. Phase plan

Each phase is done when every Acceptance box passes on real neighbours at its §6 gate. Demo scripts stay in the spec. Phase names are the spec's; `P1`–`P7` are short labels. Acceptance follows the spec; survey additions are marked.

1. **`phase:contract` (M1).** Work: Zod schemas and constants for every §4 item; claims path and `schemaVersion` (decision 2). Acceptance:
   - A1 every shape exports Zod schemas and inferred types, with no runtime logic beyond schemas and constants;
   - A2 each event schema parses one valid and rejects one invalid example;
   - A3 Project store and Compile & export import the slice from its subpath (Shell dropped, decision 4);
   - A4 [survey addition, decision 2] the claims contract rejects a missing `schemaVersion`.
   First test: `run-ended` rejects `cancelled`.

2. **`phase:file-tools-chat` (M1).** Work: start; steps; text-only reply ends the agent run; cap (12, setting); Continue; stop; one agent run per project; `AGENT_NO_PROVIDER`, `AGENT_NO_ACTIVE_PROJECT`; project-switch stop; `list_files`, `read_file`; SSE; current-run-state; transcripts and history (project-relative paths, no keys, truncation marker); two retries for built-in tool errors, Ajv over JSON Schema (the loop adds no transport retries, map #6); per-step messages with `contextSize` trimming, oldest tool results first. UI: chat, settings sheet, step counter, stop shown only while active, phone layout (story 47). Reconnect runs on the Shell's reconcile tick (#17), which covers the spec's `visibilitychange` and EventSource re-open triggers. Mock scenarios; the "agent run" e2e step. Acceptance:
   - A1 "summarize my outline" answered correctly, with `list_files` and `read_file` cards (item 14 sets the outline path);
   - A2 endless loop ends at step 12 with `step-cap-reached` and `run-ended: capped`;
   - A3 stop ends within one second of the POST, with `stopped`;
   - A4 out-of-project path refused as a card error;
   - A5 malformed turn gives two readable errors, then withdrawal (three-invalid scenario, §5);
   - A6 reload restores text and cards from current-run-state;
   - A7 transcript matches the entry schema.
   First test: a text-only turn returns `{runId, conversationId}`, then `run-ended: completed`.

3. **`phase:narrative-tools` (M2).** Work: registry's enabled and offered tools as functions (item 22); reserved-name clash (left out, reported once in the transcript); entity and style resolution from `x-scriba-type`; `sourcesUsed` as resolved entity references, shown as paths (decision 5); provenance on card and transcript; Ajv retries, with unknown entity IDs counting as retries; `search_notes` (decision 3); cards show sources used. Draft outputs appear in chat until P4 routes them to pending changes. Acceptance:
   - A1 each workhorse (cold open, mystery question, myth-buster, numbers-to-people), called from an intent, yields a draft that cites its source files;
   - A2 a disabled tool is absent from the request (asserted on the mock's received request);
   - A3 an unknown entity ID returns a readable error and counts as a retry;
   - A4 every draft's card and transcript entry carry provenance.
   First test: A2.

4. **`phase:pending-writes` (M3).** Work: `write_file` and `edit_file` with the run overlay and captured base (first-read content as caller-supplied base, item 11); `read_file` sees the overlay; pending changes at run end, for any reason; output routing for `draft`, `entity`, `graph`, `claims`, `check`, with optional `target`; graph validation against `/graph-runner`'s schema (decision 7); diff previews on cards; review-queue link from `pending.*` events; e2e accept step. Acceptance:
   - A1 no disk change before accept (asserted on disk);
   - A2 two edits to one file in one agent run give one pending change against the first captured base;
   - A3 a stopped agent run keeps its pending changes;
   - A4 propose-graph output becomes a pending change aimed at `graphs/` that parses with the Graph runner schema; an invalid graph returns a readable error and counts as a retry;
   - A5 the e2e accepts an agent-made change and sees it in the draft.
   First test: `write_file` leaves disk bytes unchanged; one pending change is listed.

5. **`phase:grounding` (M3).** Work: extract, retrieve (`scope: ['sources']`), judge; runs after any draft and on demand (`check_grounding`, UI action); grounding calls skip the step cap, but stop cancels them; claims artefact; `grounding-result`; grounding summary on the pending change (item 12); sample draft, mock scenario, badges. Acceptance:
   - A1 an invented statistic is flagged unsupported;
   - A2 a check of the sample draft yields all three verdicts; every supported or weak verdict cites a retrieved `sources/` passage;
   - A3 a verdict citing a passage that was not retrieved is downgraded to `unsupported`;
   - A4 the claims artefact matches the contract and carries the draft's content hash;
   - A5 badges show text labels at phone width.
   First test: a claim with no passage is `unsupported`, with no judge request.

6. **`phase:research` (M7).** Gate: P5 closed. Work: `agent.research.enabled` (default off) and search endpoint settings (item 16); `web_search`; `fetch_page` (http(s) only; refusals for loopback, link-local, private, tailnet CGNAT, `host.docker.internal` and names resolving to them, checked after each redirect; size and time caps; fetched text marked untrusted; resolved IP pinned against DNS rebinding [proposed]); saving into `sources/` through `write_file`. Acceptance:
   - A1 setting off means no research tools in the request;
   - A2 search and fetch work against a local server;
   - A3 loopback, private, tailnet and `host.docker.internal` addresses are refused, including after a redirect;
   - A4 fetched text is no grounding evidence until accepted into `sources/`.
   First test: A1.

7. **`phase:compile-tools` (M7).** Gate: #25 `phase:assembly-preflight` and `phase:export` (implementation). Work: `assemble_manuscript`, `run_preflight`, `export_manuscript` through #25, with result cards; no reorder or snapshot tools; order follows decision 1. Acceptance:
   - A1 preflight returns the five checks as a card;
   - A2 an agent export equals the manuscript-view export;
   - A3 no tool starts a recipe run or calls the Graph runner.
   First test: scripted `run_preflight` renders five results.

## 4. Contracts

Spec names verbatim; `[proposed]` marks invented names. Contracts are Zod (map #3). Built-in tool arguments are JSON Schema with Ajv (map #7).

**Produces `@bbartolome/scriba-contracts/agent-loop`** (P1):
- Start `{intent, conversationId?}` returns `{runId, conversationId}`; stop request; route constants. The grounding check is the `check_grounding` tool and a UI action; any HTTP route is `[proposed]`, takes `{path}`, and returns the start response. Routes name `projectId` only if item 19 is accepted.
- Events `{module: 'agent-loop', type, data}` with `runId` and `seq`: `run-started`, `token-delta`, `tool-call-started`, `tool-call-args`, `tool-call-result`, `tool-call-error`, `grounding-started`, `grounding-result`, `step-cap-reached`, `run-ended` (reason `completed | stopped | capped | error | project-switched`; pending change IDs).
- Current-run-state with `lastSeq`; conversation history; agent settings under `agent` (step cap, research on/off, search endpoint).
- Grounding result and claims artefact `{schemaVersion, targetPath, contentHash, checkedAt, runId, claims}`. `targetPath` and `contentHash` are `[proposed]` from the spec's "target path" and "content hash". A claim is `{text, span, verdict, passage?, reason}`; `verdict` is `supported | weak | unsupported`; `passage` is `{path, offset, snippet}`.
- Draft provenance `{runId, toolCallId, tool, entityIds, sourcesUsed, model, at}`; `sourcesUsed` items are `{id, type, path}` (decision 5).
- Transcript entry `{schemaVersion, at, runId, conversationId, seq, kind, data}`; `kind` is `intent | step | assistant-text | tool-call | tool-result | tool-error | grounding | pending-change | run-end`.
- Error codes `AGENT_RUN_ACTIVE`, `AGENT_NO_PROVIDER`, `AGENT_NO_ACTIVE_PROJECT`, `AGENT_RUN_NOT_FOUND`; the 11 reserved built-in tool names.

**Consumes** (each at its §6 gate; no stubs):
- Platform: envelope, error shape, mock scenarios, Playwright. Setup & auth: the guard.
- Model providers (#19): resolved model (project override or app default); streamed chat with abort signal; raw tool-call arguments; `contextSize`. The no-provider error maps to `AGENT_NO_PROVIDER`; #19's survey lists no such code, so confirm the name. Write-only key route for a keyed search API: owner per item 16.
- Project store (#20): project summary and active project; `project.switched`; file list and read; `propose({path, write|edit, origin, base?})` with origin `{kind: 'agent-run', runId, toolCallId?}`; read overlay (item 11); search `{query, limit?, scope}` returning `{path, offset, snippet, score}`; entity resolution; `pending.*` events.
- Tool registry (#21): tool list and get for enabled and offered tools (item 22); function schemas with `x-scriba-*` keys stripped; executor `{output, sourcesUsed}` with abort signal; Ajv error details.
- Graph runner (#24): the `/graph-runner` graph schema, as an import only.
- Compile & export (#25): view model, preflight, export; reads the claims artefact in `logs/claims/` (item 13).
- Shell (#17): tool-call card, read-only diff view, breakpoint gate, API and SSE clients with reconcile ticks, lazy route registration. UI APIs, not contracts. The Shell does not consume `/agent-loop` (decision 4).

## 5. Test strategy

- **Contract:** Vitest in `packages/contracts/test`.
- **Integration (primary):** Vitest with unplugin-swc. The module with real neighbours at each gate, a temp library and the mock OpenAI server. Scenarios are chosen by `…/scenario/<name>/v1` (#16). Assert SSE order, recorded requests, disk bytes, pending changes, `logs/` shapes, claims artefacts, mid-run run-state and `AGENT_RUN_ACTIVE`.
- **Scripted turns (P2 on):** the spec's eight (normal list-read-text; malformed arguments; endless loop; slow stream; narrative tool with entity IDs; write and edit; propose-graph valid and invalid; grounding extract and judge), plus a three-invalid-calls scenario for P2 A5. The stop test needs the mock to record a client disconnect (#19 Q19). Sample paths are a contract with `examples/`.
- **Research:** a local HTTP server and a SearXNG-shaped stub, with a redirect into a refused range.
- **UI seam:** Angular Vitest; lazy route; fake API and SSE from contract types; the spec's six cases.
- **E2E:** Platform's one Playwright run. Map #7 orders it as setup → project from sample → agent run → accept change → manuscript, with export left out. Agent-run step at P2, accept step at P4. Step names must match #16's five placeholder steps (item 23).
- **Manual:** the small and large model eval script, run by hand after P2. Not a gate.

## 6. Dependencies (gates)

Stop when a phase's gate is open. Gates come from #26 and the spec. † marks an edge not in #26's table (item 23).

- P1: #16 `phase:scaffold`.
- P2: #16 `phase:scaffold` and `phase:test-harness`; #17 `phase:core` and `phase:shared-components` (tool-call card; #17 asks #23 to confirm attempt numbers, per-family bodies and the write-preview diff before this gate); #18 `phase:token-guard` (public routes); #19 `phase:client` and #20 `phase:files` (implementation). #19 Q13 may move client types into its contract phase, which leaves this gate unchanged.
- P3: #21 `phase:executor` (contract, registry API, execution); #22 `phase:nonfiction-workhorses`; #20 `phase:search`.
- P4: #20 `phase:pending-review`; #17 `phase:shared-components` (read-only diff); #24 `phase:contract`†.
- P5: #20 `phase:search`; P4 closed.
- P6: P5 closed.
- P7: #25 `phase:assembly-preflight` and `phase:export` (implementation).

Edges where other modules wait on this module:
- #25 `phase:assembly-preflight` waits on this P1 (#26). #25 `phase:contract`† also waits on it (#25 survey).
- #22 `phase:core-propose-graph` and `phase:nonfiction-workhorses`† wait on this P1 (#22 survey; item 23).
- #25 `phase:manuscript-snapshots`† waits on this module's P4 and P5 (#25 survey).
- Reverse: this P1 publishes provenance, so it waits on the `sourcesUsed` shape in #21 (#21 OQ12, an owner stop there).

## 7. Open questions

**Decided (apply):**
1. **Compile order.** In the Compile tools paragraph, replace "Compile & export reads only the story graph's `order` edges and never runs a graph (#12)" with: "Compile & export reads the story graph only for its order edges, then `project.yaml` order, then alphabetical top-level `drafts/` (#12, #14); it never runs a graph."
2. **Claims artefact.** Add `schemaVersion` (map #3: persisted formats carry a per-file `schemaVersion`) and the path `logs/claims/<draft path>.json` (P1).
3. **`search_notes` scope.** `scope: ['sources','entities']`, stated in the tool description (#5, #20).
4. **Shell.** The Shell does not consume `/agent-loop` (#17; no #26 gate row). Drop that consumer and the spec's Shell import clause.
5. **`sourcesUsed`.** Resolved entity references (#21), shown as paths on cards (#17). This overrides the spec's "sourcesUsed paths". #21 OQ12 still asks the owner to confirm the item shape; P1 cannot close until it is answered.
6. **`settings.yaml`.** Platform owns the envelope and migration hook; this module registers `agent` (#26 cross-spec decision).
7. **Graph validity and routing.** At P4 the loop validates `graph` outputs with `/graph-runner`'s Zod schema (import only) and returns issues as readable errors; each invalid graph counts as a consecutive invalid call. Graph outputs are pending changes aimed at `graphs/` (map #10 q6, which supersedes map #7's "written to graphs/ by the agent loop"; #24 Q4 notes the same). From M4, #20's registered validator (#24 `phase:engine`) is a second check. Missing paths are never rejected (#11).
8. **Reserved paths.** #20 refuses `.scriba/` and `drafts/.versions/`. `check_grounding` accepts only top-level `drafts/` (#14). Other loop refusals: item 17.
9. **Vocabulary.** Prose says "agent run"; bare "run" means a recipe run (GLOSSARY **Run**); wire names stay. GLOSSARY.md has no "Agent run" entry, so the gap is open. #26 asks for it via `/domain-modeling`; #19 Q6 and #20 OQ18 raise it too. This survey does not edit GLOSSARY.md.
10. **CI on `examples/`.** Platform's `phase:examples-check` covers the samples (#16). Agent-loop examples stay inline in tests.

**Open (owner stop points):**
11. **Pending-change timing.** The spec creates pending changes at agent-run end, after grounding, and lists their IDs in `run-ended`. #20 creates one on first propose, and its OQ10 says agent writes must supply the first-read base. Recommend #20's model and amend the spec. If so, #20 holds the run overlay (`read` with `origin`), and the loop keeps none. Ask before P4.
12. **Provenance location.** The spec names the pending change, the accepted version's record and the transcript as trace points. #20's pending change has no provenance fields, and its file API cannot read `.scriba/`, so #25 cannot read it as a file. #20 OQ11 and #24 Q5 both ask for optional origin fields. Options: (a) optional provenance on the pending change, plus an in-process `latestProvenance({targetPath})` query; (b) a `logs/provenance/<draft path>.json` record at propose time, which #24 rules out for recipes. Recommend (a); it keeps the transcript entries the spec requires, which #25 §6 also expects. Decide whether the provenance shape lives in this slice (spec) or in #20's pending-change type. Ask before P4.
13. **Claims read path.** The spec has #25 read grounding "through the transcript entry format". #25's survey reads grounding from `logs/` as an artefact (its §4), not from transcripts. Recommend the claims artefact at `logs/claims/<draft path>.json`, with owner sign-off on the departure from the spec's transcript fixture (#25 §6). Ask before P5.
14. **Outline path.** The spec's Out of Scope has "summarize my outline" read `drafts/` and `project.yaml`. #20 OQ3 says the outline lives in `sources/`. Recommend `sources/outline.md`, and amend the spec's Out of Scope line. Ask before P2.
15. **Interrupted agent runs.** The spec is silent. Under the spec's run-end model, a crash loses the overlay and its writes; under item 11's model they are already pending. Recommend closing an agent run with no `run-end` line on startup as `error`, "interrupted". Ask before P2.
16. **Research backend and key.** Recommend a SearXNG-compatible default with no key in v1. Also #19 Q3: who owns the write-only search key route (recommend this module, using #19's secrets helper in-process). Ask before P6.
17. **Loop-side refusals.** Recommend refusing `logs/` and `snapshots/` for `write_file`, `edit_file` and `target`. For `project.yaml`, #20 validates proposals and #25 owns `export`; reorder (`order`) is excluded by the spec; so refuse those two keys. Owner confirms that the other keys (`title`, `genrePack`, `styleProfile`, `model`) stay writable through pending changes. Ask before P4.
18. **Transcript folder.** `logs/agent-runs/` is this survey's choice; the spec says `logs/`. Recommend keeping it: the history reader needs a filter, and the examples check excludes `logs/` whole (#22 survey). Ask before P2.
19. **Project identity on routes.** #17 and #20 require every request to name `projectId`; #20 rejects requests for a non-active project. The spec's agent routes name none and bind a run to the project active at start. Recommend naming `projectId` on start, stop, run-state, history and transcript routes, and keeping the active-project checks (`AGENT_NO_ACTIVE_PROJECT`, `project.switched`). Ask before P1 closes.
20. **Entity IDs for `entity` outputs.** The spec routes `entity` outputs to `entities/` with no ID rule (#22 O7). Recommend that Project store assigns IDs, and prompts never invent them. Ask #20 and the owner before P4.
21. **Contract entry layout.** #16 scaffolds `packages/contracts/src/<slug>.ts`; #20, #21 and #24 use folders. Recommend #16 allow a folder for slices with several files. Ask #16 before P1 closes.
22. **Narrative tool list.** The spec says "enabled" tools. #21 OQ11 narrowed this to enabled and offered for the active project. Recommend accepting #21's narrowing. Ask before P3.
23. **Tracker rows missing for #23.** #26's table omits: #24 `phase:contract` before #23 `phase:pending-writes` (spec); #23 `phase:contract` before #25 `phase:contract` and `phase:manuscript-snapshots` (#25 survey); #23 `phase:contract` before #22's two wave-1 phases (#22 survey). The #22 edge conflicts with #26's rule that wave 1 does not wait on wave 2. Owner adds the rows, or moves the provenance type out of #23's contract. #24's survey also notes the missing #24 `phase:contract` row. Ask before P1 closes.

## 8. Driver brief

Build the `agent-loop` module of Scriba: a chat agent that reads one active project, calls tools and shows every step. It never writes project files directly. Every project write is a pending change through #20, and the loop writes directly only to `logs/`. It never calls or is called by the Graph runner. Paths are project-relative, and GET never mutates. Prose says "agent run," never bare "run." Implement P1 to P7 in order. Before each phase, check its §6 gates and stop if one is open. Use real neighbours; never stub one to pass an acceptance box. Apply decisions 1–10 without asking. Do not resolve map conflicts or owner items silently. Stop points: before P1 closes, items 19, 21 and 23, and #21 OQ12 for decision 5; before P2, items 14, 15 and 18, and #17's card confirmation; before P3, item 22; before P4, items 11, 12, 17 and 20; before P5, item 13; before P6, item 16. At each phase close, report its acceptance boxes, then stop until the owner says go. Test only at the HTTP, SSE, disk and mock-request seams.
