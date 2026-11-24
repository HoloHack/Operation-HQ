# Notes retention experiment — 25 November 2026 (Sydney)

## Source and priority checkpoint

GitHub main is still `bf340372`; bookmark PR 17 starts this iteration at `7ecd624`. Its last actual CodeRabbit review is `5976069416` on `455f8d3`, not approval of the current head. All four findings were implemented and independently regressed in the prior checkpoint. Old passing tests do not establish owner collection accuracy. The unchanged synthetic bookmark development set accepts 13/31 resources correctly, holds 18 and leaves eight labelled known topics unresolved. Actual loaded-model/held-out and owner-collection acceptance remain open; do not add more phrases merely to fit those cases.

The Site still reports published version 13/source `f8f47b6`. A fresh supported source-open attempt failed with “Unable to prepare the Site.” The retained checkout matches the saved version's source SHA and all 168 tracked files match the dashboard mirror. This is provenance-verified retained source, not a claim that the failed fresh open succeeded. No website source or production publication is changed.

The canonical roadmap remains version 15. Historical audit/evolution and current acceptance ledgers were checked. The existing Vite upgrade permission denial is an explicit stop: no alternate install or dependency/model change was attempted. Provider, installed Mac and real-model access remain unavailable; continue independent safe work rather than repeating the same audit.

## Implemented bounded stage

Added `extension/tests/notes-memory.mjs` and an existing-CI step. No production runtime optimization, editor destruction, schema, model, dependency, permission or personal-data change is included.

The experiment compares two cold disposable Linux Chrome profiles on the **same candidate build**:

- Never open Notes, but store the identical synthetic 100,000-byte document and run matched nominal waiting cycles.
- Open Notes, make twenty small real keyboard marker edits, wait for exact canonical/mirror saves, close and reopen. Sample before/after first editor load and at cycles 1/5/10/20, then after idle.

The first-open difference includes lazy code, view and history cost, not just retained edits. Later-cycle slope must be inspected separately. The document uses unique numbered ASCII content, not repeating three identical blocks that could trigger the legitimate triplication repair. Samples record process renderer/GPU/whole-profile PSS, DOM/editor/history diagnostics and actual saved bytes. No forced GC is used. External HTTP is blocked; no owner notes, model or provider is used.

Exact content, HTML/plain compatibility mirrors, pending/debounced writes and absence of recovery/conflict corruption are checked. Memory samples occur **before reload**. After samples, Undo/Redo across close/reopen is verified, followed by exact content after reload. Reload is not claimed to preserve editor history. Failures stop acceptance and retain JSON diagnostics; a low memory number cannot excuse data loss.

Default invocation is one baseline-first pair and 30 seconds idle, not a sustained five-minute/three-pair study. `HQ_NOTES_SAMPLE` selects 0–20; default order alternates by parity, with explicit `HQ_NOTES_ORDER` override. `HQ_NOTES_IDLE_MS` accepts 0–300000; waits are chunked. CI initially runs one pair within the existing 15-minute job. Three alternating pairs and a warmed read-only arm are follow-up gates, not results fabricated by averaging two unlike arms. No threshold declares a leak, improvement or 300 MB Mac pass.

## Independent challenge and decision

Retaining an editor can intentionally preserve Undo. If first-load cost dominates or later samples flatten, do not destroy history to lower PSS. A next warmed read-only arm should open/close the same document without edits, separating view/bundle cost from editing/history. Any future suspension must prove exact saves, history, external updates, remount and conflicts against the actual vendored bundle before a reviewed runtime change. Rollback of this test-only checkpoint removes its CI step/script; no user records or historical snapshots are restored.

## Fresh research and rejected alternatives

Retrieved 25 November 2026; no third-party code copied or dependency adopted.

| Primary source | Evaluation and decision |
|---|---|
| [Tiptap Editor API](https://tiptap.dev/docs/editor/api/editor#unmount), [official Editor source](https://github.com/ueberdosis/tiptap/blob/main/packages/core/src/Editor.ts) | MIT active repository, last pushed 24 November at retrieval. Current unmount/remount API is a possible state-preserving alternative to terminal destroy; HQ's exact vendored version remains unproven. Record available methods only, do not invoke them or assume equivalence. Core OSS adds no service/free-tier/credential dependency; reject paid cloud/AI/review features. |
| [ProseMirror view](https://github.com/ProseMirror/prosemirror-view), [history](https://github.com/ProseMirror/prosemirror-history) | MIT GitHub mirrors are archived following migration to `code.haverbeke.berlin`, not evidence of abandoned upstream. New forge/reference access failed here. Historical cleanup/history patterns are inspiration, not verified current behavior. Reject speculative history trimming and copied stale code. |
| [WebLLM releases](https://github.com/mlc-ai/web-llm/releases) | Latest checked 0.2.89 (17 November), Apache-2.0 engine; model licences separate. Tokenization/long-prompt/example fixes warrant a later isolated compatibility trial, not automatic adoption or a claim of better sorting/RAM. No heavy startup download or private upload. |
| [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7) | 8.0.16 remains affected for network-exposed dev servers; branch patch 8.1.7/Rolldown 1.1.7. Prior upgrade execution denial remains unbypassed. Keep the server unexposed and PR 18 release held; compiled Worker compromise is not inferred from this advisory. |

## Acceptance and next commitments

Source and syntax/full regression checks are separate from actual native experiment execution. Final-head CI, observed measurements/failures and installable artifact hashes are recorded in the PR ledger; prior CI cannot certify this new script. No whole-roadmap percentage is assigned.

1. Complete the native Notes experiment and independently evaluate its actual data; fix experiment/data failures before any optimization. Repeat warmed/read-only and alternating samples before attribution.
2. Freeze a resource-disjoint semantic holdout and obtain actual explicitly opted-in loaded-model evidence, then an authorized owner sample; preserve safe holds meanwhile.
3. Resolve the denied security-upgrade authority and rerun its full compatibility/security gates; continue memory, then Calendar/timetable/Maths without pretending unavailable device/provider checks passed.

No promotion or installation is automatic. Preserve the current Study Desk, account isolation, OAuth identity, owner data and existing automation.
