# Survey: #23 Agent loop

Sources: spec #23; decisions #1–#26 as cited. Decisions override the spec where they conflict (section 7, items 1–10).

## 1. Approach

- **One Nest module around a pure step loop.** Model calls go only through the #19 client. Files, propose, search, executor and Compile go through in-process services (#20, #21, #25). (Shape of the module)
- **One seq-ordered event log per agent run.** SSE tails it; current-run-state projects it with `lastSeq`. (Streaming and run state)
- **No loop-side writes.** `write_file` and `edit_file` call #20's propose; `read_file` uses its per-agent-run read overlay. (Writes and output routing)
- **Transcripts are the only conversation store,** read per GET, with no index (map #5). Grounding rules are code, so scripted judge turns test them.
- **Wave 1 does not wait on this module.** Only #25 waits on this `phase:contract` (#25, #26).

## 2. Files and modules

Relative to the repo root; `M/` is `apps/api/src/modules/agent-loop/`.

- `packages/contracts/src/agent-loop/` and `packages/contracts/test/`: schemas, constants, contract tests.
- `M/`: `@Module`, controller, `run/`, `context/`, `tools/`, `grounding/`, `research/` (P6), `transcript/`, `agent-settings.ts`.
- `apps/api/test/agent-loop/`, `apps/web/test/agent-loop/`, `e2e/tests/agent-loop.e2e.ts`.
- `apps/web/src/app/features/agent-loop/`: routes, `chat/`, `cards/`, `grounding/`, `chat-state.ts`.
- `e2e/fixtures/mock-openai/` scenarios; `examples/nonfiction/drafts/grounding-claims.md` (P5).

## 3. Phase plan

Each phase is done when every Acceptance box passes on real neighbours at its §6 gate.

1. **`phase:contract` (M1).** Work: Zod schemas and constants for every Contracts item; claims path `logs/claims/<draft path>.json`; claims `schemaVersion`. Acceptance: A1 each event parses one valid and rejects one invalid example; A2 Compile & export imports the slice (item 4); A3 claims contract rejects a missing `schemaVersion`; A4 exports Zod schemas and inferred types, no runtime logic beyond schemas and constants. First test: `run-ended` rejects `cancelled`.
2. **`phase:file-tools-chat` (M1).** Work: start; steps; text-only reply ends the agent run; cap (12, setting); Continue; stop; one agent run per project; `AGENT_NO_PROVIDER`, `AGENT_NO_ACTIVE_PROJECT`; project-switch stop; list and read; SSE; run-state; transcripts and history (project-relative paths, no keys or auth headers, long results truncated with a marker and original length); built-in retries. Per-step messages (system prompt, project summary (story 2; counts from `list`), conversation, tool schemas) with `contextSize` trimming, oldest tool results first. UI: chat, settings sheet, step counter, stop shown only while active, phone layout (one column, collapsed cards, 44 px targets, stop and intent box usable with the keyboard open; story 47), reconnect on the Shell's reconcile tick (#17). Mock scenarios. Acceptance: A1 "summarize my outline" answered correctly with list and read cards; A2 endless loop ends at step 12 with `step-cap-reached` and `capped`; A3 stop within 1 s with `stopped`; A4 out-of-project path refused as a card error; A5 malformed turn gives two readable errors, then withdrawal (three-invalid scenario, §5); A6 reload restores text and cards from run-state; A7 transcript matches the entry schema. First test: a text-only turn returns `{runId, conversationId}`, then `run-ended: completed`.
3. **`phase:narrative-tools` (M2).** Work: enabled tools as functions; reserved-name clash; entity resolution; `sourcesUsed` as paths; provenance; Ajv retries; `search_notes` (`scope: ['sources','entities']`). Acceptance: A1 each workhorse yields a cited draft; A2 disabled tool absent from the request; A3 unknown entity ID gives a readable error and counts as a retry; A4 provenance on card and transcript. First test: A2.
4. **`phase:pending-writes` (M3).** Work: write and edit propose, with first-read content as caller-supplied base; read overlay; five output routes with `target`; graph output checked with `/graph-runner`'s Zod schema (item 7); diff cards; review link from `pending.*` events; e2e accept step. Acceptance: A1 no disk change before accept; A2 two edits in one agent run give one pending change against the first base; A3 stopped agent run keeps its changes; A4 propose-graph writes a `graphs/` change; an invalid graph gets a readable error and counts as a retry; A5 e2e accepts an agent change. First test: `write_file` leaves disk bytes unchanged; one pending change listed.
5. **`phase:grounding` (M3).** Work: extract, retrieve (`scope: ['sources']`), judge; runs after drafts and on demand; grounding calls skip the step cap, but stop cancels them; claims artefact; `grounding-result`; grounding summary (item 12); sample draft and scenario; badges. Acceptance: A1 invented statistic unsupported; A2 sample check yields all three verdicts, supported and weak ones citing retrieved passages; A3 non-retrieved citation downgraded; A4 artefact matches contract with content hash; A5 badges show text labels at phone width. First test: a claim with no passage is `unsupported`, with no judge request.
6. **`phase:research` (M7).** Work: setting (off); search endpoint; `web_search`; `fetch_page` with refusals, redirect checks, resolved IP pinned against DNS rebinding, size and time caps, untrusted marking; save to `sources/` via propose. Acceptance: A1 setting off means no research tools in the request; A2 search and fetch work against a local server; A3 loopback, private, tailnet and `host.docker.internal` refused, including after redirect; A4 fetched text is no evidence until accepted. First test: A1.
7. **`phase:compile-tools` (M7).** Work: assemble, preflight and export through #25; result cards; no reorder or snapshot tools. Acceptance: A1 preflight returns five checks as a card; A2 agent export equals manuscript-view export; A3 no tool starts a recipe run or calls the runner. First test: scripted `run_preflight` renders five results.

## 4. Contracts

**Exposes** `@bbartolome/scriba-contracts/agent-loop`, names verbatim:
- Start `{intent, conversationId?}` returns `{runId, conversationId}`; stop; check-grounding as `POST {path}`, same response; route constants.
- Events `{module: 'agent-loop', type, data}`: `run-started`, `token-delta`, `tool-call-started`, `tool-call-args`, `tool-call-result`, `tool-call-error`, `grounding-started`, `grounding-result`, `step-cap-reached`, `run-ended` (reason `completed | stopped | capped | error | project-switched`; pending change IDs).
- Current-run-state with `lastSeq`; conversation history; agent settings.
- Grounding result and claims artefact `{schemaVersion, targetPath, contentHash, checkedAt, runId, claims}`; draft provenance `{runId, toolCallId, tool, entityIds, sourcesUsed, model, at}`; transcript entry `{schemaVersion, at, runId, conversationId, seq, kind, data}`.
- Error codes `AGENT_RUN_ACTIVE`, `AGENT_NO_PROVIDER`, `AGENT_NO_ACTIVE_PROJECT`, `AGENT_RUN_NOT_FOUND`; reserved built-in names.

**Consumes** (each at its §6 gate; no stubs):
- Platform: envelope, error shape, mock scenarios, Playwright. Setup & auth: guard.
- Model providers (#19): streamed chat, abort signal, raw tool-call arguments, `contextSize`; `PROVIDER_NOT_CONFIGURED` maps to `AGENT_NO_PROVIDER`; write-only key request for a keyed search API (research only).
- Project store (#20): project summary and active project; `project.switched`; list and read; `propose({path, write|edit, origin, base?})` with origin `{kind:'agent-run', runId, toolCallId?}`; read overlay; search `{query, limit?, scope}`; entity resolution; `pending.*` events.
- Tool registry (#21): catalogue, function schemas, executor `{output, sourcesUsed}` with abort signal.
- Graph runner (#24): the `/graph-runner` graph schema, as an import only.
- Compile & export (#25): view model, preflight, export.
- Shell (#17), UI APIs and not contracts: tool-call card, read-only diff view, breakpoint gate, API and SSE clients with the reconcile tick, lazy route registration. The Shell does not consume `/agent-loop` (item 4).

## 5. Test strategy

- **Contract:** Vitest in `packages/contracts/test`.
- **Integration (primary):** Vitest with unplugin-swc. The module with real neighbours at each gate, a temp library and the mock OpenAI server. Scenarios are chosen by `…/scenario/<name>/v1` (#16). Assert SSE order, recorded requests, disk bytes, pending changes, `logs/` shapes, claims artefacts, mid-run run-state and `AGENT_RUN_ACTIVE`.
- **Scripted turns (P2 on):** the spec's eight (normal list-read-text; malformed arguments; endless loop; slow stream; narrative tool with entity IDs; write and edit; propose-graph valid and invalid; grounding extract and judge), plus a three-invalid-calls scenario for P2 A5. Sample paths are a contract with `examples/`.
- **Research:** a local HTTP server and a SearXNG-shaped stub, with a redirect into a refused range.
- **UI seam:** Angular Vitest; lazy route; fake API and SSE from contract types. The spec's six cases: tokens append; cards move from started to result or error; stop appears only while active; reconnect replaces the view from run-state and ignores `seq <= lastSeq`; grounding badges show text labels; phone shows one column with collapsed cards.
- **E2E:** Platform Playwright; agent-run step at P2, accept step at P4; export excluded.
- **Manual:** the small and large model eval script, run by hand after P2. Not a gate.

## 6. Dependencies (gates)

Stop when a phase's gate is open. Gates come from #26 and the spec.

- P1: #16 `phase:scaffold`.
- P2: #16 `phase:scaffold` and `phase:test-harness`; #17 `phase:core` and `phase:shared-components`; #18 `phase:token-guard`; #19 `phase:client`; #20 `phase:files`.
- P3: #21 `phase:executor`; #22 `phase:nonfiction-workhorses`; #20 `phase:search`.
- P4: #20 `phase:pending-review`; #17 `phase:shared-components` (read-only diff); #24 `phase:contract`.
- P5: #20 `phase:search`; P4 closed.
- P6: P5 closed.
- P7: #25 `phase:assembly-preflight` and `phase:export`.

## 7. Open questions

**Decided (apply):**
1. **Compile order.** Replace spec line 156 with: "Compile & export reads the story graph only for its order edges, then `project.yaml` order, then alphabetical top-level `drafts/` (#12, #14); it never runs a graph."
2. **Claims artefact.** Add `schemaVersion` (map #3) and the path `logs/claims/<draft path>.json` (P1).
3. **`search_notes` scope.** `scope: ['sources','entities']`, stated in the tool description (#5, #20).
4. **Shell.** The Shell does not consume `/agent-loop` (#17, #26). Drop that consumer and the spec's Shell import clause.
5. **`sourcesUsed`.** Resolved entity references (#21), shown as paths on cards (#17). This overrides the spec's "sourcesUsed paths".
6. **`settings.yaml`.** Platform owns the envelope and migration hook; this module registers `agent` (#26).
7. **Graph validity.** At M3 the loop uses `/graph-runner`'s Zod schema (import only) and returns issues as readable errors. Each invalid graph counts as a consecutive invalid call under the two-retry rule (spec line 133). From M4, #20's registered validator (#24 `phase:engine`) is a second check. Missing paths are never rejected (#11).
8. **Reserved paths.** #20 refuses `.scriba/` and `drafts/.versions/`. `check_grounding` accepts only top-level `drafts/` (#14). Other loop refusals: item 17.
9. **Vocabulary.** Prose says "agent run"; wire names stay. #26 asks for the glossary entry via `/domain-modeling`.
10. **CI on `examples/`.** Platform's `phase:examples-check` covers the samples (#16). Agent-loop examples stay inline in tests.

**Open (stop and ask the owner):**
11. **Pending-change timing.** The spec creates pending changes at agent-run end, after grounding, and lists their IDs in `run-ended`. #20 creates one on first propose. Recommend #20's model and amend the spec. Ask before P4.
12. **Provenance location.** Spec line 123 names the pending change, the accepted version's record and the transcript as trace points. #20's pending change has no provenance fields, and its file API cannot read `.scriba/`, so #25 cannot read it as a file. Options: (a) optional provenance on the pending change (expand–contract, as #24 asks for recipes) plus an in-process `latestProvenance({targetPath})` query; (b) a `logs/provenance/<draft path>.json` record at propose time, which #24 rules out for recipes. Recommend (a). Ask before P4.
13. **Claims read path.** #25 reads grounding "through the transcript entry format". This spec keeps a claims artefact in `logs/` so Compile can read it as a file (spec line 430). Recommend #25 reads `logs/claims/<draft path>.json`. Ask before P5.
14. **Outline path.** #20 uses `sources/outline.md`; the spec reads `drafts/` and `project.yaml`. Recommend `sources/outline.md`, and amend the spec's Out of Scope line. Ask before P2.
15. **Interrupted agent runs.** The spec is silent. Recommend closing an agent run with no `run-end` line on startup as `error`, "interrupted"; its pending changes are already on disk (#20). Ask before P2.
16. **Research backend.** Recommend a SearXNG-compatible default with no key in v1. Ask before P6.
17. **Loop-side refusals.** Recommend refusing `logs/` and `snapshots/` for write, edit and `target`. For `project.yaml`, #20 validates proposals and #25 makes agent writes pending changes, so refuse only `order` and `export` (owned by #25, excluded by the spec's Out of Scope). Owner confirms title and model. Ask before P4.
18. **Transcript folder.** `logs/agent-runs/` is this survey's choice; the spec says `logs/`. Recommend keeping it: the history reader needs a filter, and #25 excludes `logs/` whole. Ask before P2.

## 8. Driver brief

Build the `agent-loop` module of Scriba: a chat agent that reads one active project, calls tools and shows every step. It never writes to disk; every write is a propose to #20, and the loop writes only `logs/`. It never calls or is called by the Graph runner at runtime. Paths are project-relative, and GET never mutates. Implement P1 to P7 in order. Before each phase, check its §6 gates and stop if one is open. Use real neighbours; never stub one to pass an acceptance box. Apply decisions 1–10 without asking. Ask the owner on items 14, 15 and 18 before P2; 11, 12 and 17 before P4; 13 before P5; 16 before P6. At each phase close, report its acceptance boxes, then stop until the owner says go. Test only at the HTTP, SSE, disk and mock-request seams.
