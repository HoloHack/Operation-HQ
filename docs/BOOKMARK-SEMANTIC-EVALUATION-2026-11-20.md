# Bookmark semantic evaluation checkpoint — 20 November 2026 (Sydney)

## Current source and bounded decision

Work continues in [PR 17](https://github.com/HoloHack/Operation-HQ/pull/17), not production. Main remains `bf340372e462ce910a1d3eabd203b6c8b0083571`. The recovered Site is version 13, source `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`; all 168 tracked dashboard mirror files match. Canonical roadmap v3 remains version 15. The installed Mac extension and owner's collection are not accessible here. The website, companion candidate and installed device are separate acceptance surfaces.

The next reproducible failure was not a missing keyword: a title instructing the classifier to file it under Mathematics was accepted as content evidence. The shared page/worker classifier now holds explicit filing/control directives in titles or supplied metadata before automatic topic/domain/folder inference. Exact valid owner corrections remain authoritative. Broad legacy Google-domain learning is no longer accidentally promoted to a resource-specific correction. Ordinary imperative tutorial titles have regression coverage. This is a bounded defensive heuristic, not general prompt-injection immunity; legitimate quoted instructions can require owner review.

## Measured development benchmark

Labels and cases were not changed to improve the score. There are 32 synthetic rows, 31 canonical resources. The duplicate resource is scored once in the quality comparison.

| Unique-resource metric | Previous checkpoint | Current control-text hold |
|---|---:|---:|
| Accepted | 14 / 31 | 13 / 31 |
| Correct accepted | 13 | 13 |
| Incorrect accepted | 1 | 0 |
| Abstained | 17 | 18 |
| Coverage | 45.16% | 41.94% |
| Selective accuracy on this development set | 92.86% | 100% (13 / 13 only) |
| Labelled known topics still unresolved | 8 | 8 |

The improvement is **removing one wrong automatic acceptance by abstaining**, not solving semantic coverage. The small hand-labelled development set is neither held-out nor the owner's collection, and confidence is not calibrated. Do not turn its 13/13 into a promise of perfect sorting. Page fetching, redirects, permissions, queue/recovery and Undo have separate structural/native tests; this benchmark scores supplied evidence only.

## Explicit loaded-model evaluation, not an unmeasured AI claim

Settings → Local AI now includes **Evaluate loaded model · synthetic cases**. It refuses to load/download a model. It runs only after an explicit click, on an already-loaded local engine, and reads only the packaged synthetic fixture. It never reads or moves personal bookmarks, writes evaluation records to storage, fetches webpages or uses a remote provider.

The evaluator strips expected labels from requests, deduplicates resources, sends bounded batches through the actual `LocalAI.classifyBookmarks` adapter, and records per-request model/profile, input/prompt hashes, actual input, raw output (bounded), latency, response validation, coverage, wrong acceptances and abstentions. Model suggestions and an input-only replay of the unchanged automatic policy are reported separately. A model suggestion is **not permission to auto-file**. Hashing failure starts no inference. Cancellation, unload initiation and engine/profile changes stop the whole attempt rather than starting another batch. Malformed JSON, non-array responses, oversized output and rejected decoded items are counted separately, including failure paths.

Independent review passed the final 10 evaluator contracts and 7 control-evidence tests; local-AI adapter's 7 and lifecycle's 6 tests also pass. Those tests use controlled inference doubles and do **not** measure live-model classification accuracy, GPU memory or latency. Current-head full/native CI is a separate gate recorded in the PR. No actual loaded-model comparison is asserted here. The remaining semantic gate is a recorded real inference attempt on an eligible explicitly loaded engine, followed by a held-out calibration set and an opt-in anonymized owner sample if authorized. Do not enable broader auto-filing based on this harness alone.

## Time-boxed research and decisions

Retrieved 20 November 2026. No dependency/model upgrade, new permission, service, remote processing or copied repository code was added.

| Primary evidence | Relevance, trade-offs and decision |
|---|---|
| [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api), [built-in AI practices](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts) | On-device structured output is a possible future backend, but eligible hardware/disk, initial model download, browser availability and per-session lifecycle must be measured. 22 GB disk eligibility is not model size or RAM. Not available in service workers. Do not silently create a session/download or assume compatibility with a 300 MB process budget. No integration or permission change now. |
| [WebLLM releases](https://github.com/mlc-ai/web-llm/releases) | 0.2.89 (17 November) adds tokenization APIs and a long-prompt fix; 0.2.88 includes streaming fixes. Relevant to a future isolated compatibility trial, not evidence that an upgrade improves HQ sorting. Current adapter remains pinned; require accuracy/lifecycle/memory comparison and rollback before adoption. |
| [saranscript/tabby](https://github.com/saranscript/tabby) | MIT; last push 29 July at retrieval, tiny adoption signal. Its local MiniLM/hybrid retrieval and fixed query fixtures are useful design references. README's roughly 25 MB model is not runtime RAM. Offscreen/WASM and broader permissions add complexity; reject copying those permissions or bundling an unmeasured model. No code adopted, so no additional license payload or dependency weight. |
| [LucasDitchun/export-bookmarks-x-twitter](https://github.com/LucasDitchun/export-bookmarks-x-twitter) | MIT; last push 9 November at retrieval. Canonical IDs, snapshots and soft-delete history are useful persistence patterns, already addressed differently in HQ. Platform DOM scraping is unsuitable for HQ's no-scraping boundary. No adoption; no free-tier service or credential dependency added. |
| [Vite GHSA-p4f5-76q4-ffq7](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7), [React RSC advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) | Vite 8.0.16 remains affected for network-exposed dev servers; existing PR 18 and the previously denied upgrade experiment remain held. Do not retry the denied operation through another path, expose that dev server or deploy with this gate unresolved. RSC patched-version/provenance verification is separate and not blanket security approval. |

## Acceptance, safety and next steps

This checkpoint implements a single bounded bookmark safety/evaluation stage. Exact Undo, prepared/applied recovery, managed folders, shared mutation locking, privacy controls and resource-bound cache evidence from earlier PR 17 work remain required regressions. No owner data was used. New evaluation code is loaded with Settings, not core boot; no startup model, background inference or cinematic work was added. The Study Desk layout, pairing, OAuth identity and Chrome permissions are unchanged.

No new memory-reduction claim: the prior Linux mixed-workflow renderer snapshot was 318,786,560 bytes, above 300 MB decimal and not a Mac measurement. Installer size or JS heap is not renderer/GPU/process memory. Current-head native CI must retain its actual process measurements; do not infer a Mac result from them.

Next commitments:

1. Finish current-head native/browser/CI and actual review findings for this candidate, then obtain real loaded-model and held-out semantic evidence. Keep ambiguity in place meanwhile; owner's bookmark automation remains unverified.
2. Resolve the blocked Vite upgrade through the required execution authority, then rerun compatibility, full tests, compiled provenance, audit and browser gates on PR 18. No alternate upgrade attempt or production release until authorized and reviewed.
3. Continue paired sustained renderer/GPU/process profiling; close measured memory problems before calendar/timetable and Maths workflow expansion. Preserve those accepted roadmap items rather than claiming completion.

Rollback: revert this code checkpoint in the same companion identity while preserving storage/pairing; do not uninstall/reset or restore whole personal-data snapshots. The previous candidate remains a code reference, not a direction to downgrade owner data. No whole-roadmap completion percentage is assigned without an explicit accepted denominator. CodeRabbit request, old CI and independent contract review are distinct from current-head browser evidence and release approval.

## Visual acceptance follow-up

The first checkpoint `455f8d3` passed [extension CI 44533546735](https://github.com/HoloHack/Operation-HQ/actions/runs/44533546735): 28 registered native suites, 28 actual Chrome journeys, benchmark, paired memory diagnostic and installer. Matching [dashboard CI 44533546732](https://github.com/HoloHack/Operation-HQ/actions/runs/44533546732) passed regression, minimum-Node, type/build/audit-gate and browser jobs. These are not live Gmail/provider or loaded-model tests.

Manual inspection of the actual `bookmark-model-unloaded-320.png` then caught a visually poor selected Settings tab. The generic hover rule overrode only a selected button's background, retaining the selected foreground, which became almost invisible on the ink surface. A narrow follow-up preserves the selected foreground/background pair while hovered; it does not redesign the approved desk. Native acceptance now checks actual computed label contrast in selected-hover and keyboard-focus states on paper and ink, rather than only checking that a button is clickable. This follow-up requires its own final-head CI; the first green checkpoint is not substituted for it.

The existing `memory-after-tools` and `memory-settled` files are **mid-suite checkpoints**, before later identity/recovery/evaluation journeys. Preserve their historical comparability, but do not call them end-of-suite measurements. A separate final-cleanup snapshot is added after the later journeys, with closed tools and a defined settling interval. The first checkpoint's mid-suite aggregate renderer PSS was 371,954,688 bytes, GPU 49,335,296 and whole profile 681,451,520; it is not a Mac or per-tab result. Its paired 2,000-task result (252,554,240 → 193,191,936 aggregate renderer median, three cold alternating pairs against 3.2.5) reproduces the earlier hidden-task optimization, not a new reduction caused by today's bookmark patch.

Next memory hypothesis, **not a measured leak**: Notes retains its rich-editor view/history after close. A bounded next experiment should compare never-opened Notes with 20 edit/close/reopen cycles of a synthetic 100 KB document, sample renderer/GPU/profile PSS at cycles 0/1/5/10/20 and five minutes idle, and repeat three cold alternating pairs. Verify exact save content, conflicts, revisions and Undo/reopen before considering any idle view suspension. Reject an optimization that silently loses history or data; rollback code only. This experiment is not claimed as executed in this checkpoint.

## Actual CodeRabbit findings and correction checkpoint

Review `5976069416` on `455f8d3` arrived during the preceding checkpoint write; it is COMMENTED, not approval. It identified two runtime gaps and two outside-diff findings, all treated as untrusted review suggestions and verified against source:

- Automatic moves could adopt a new title/URL/parent as their baseline after classification. `moveSelf` now requires the classified snapshot as immutable authority, while retaining fresh index capture for Undo and the final pre-move check. Regressions cover edits before the first move read, unchanged owner corrections and durable queue/restart preservation. Chrome still has no atomic expected-parent move, so the final read/write API race remains disclosed.
- Opening Settings before any other module could leave `Classifier` undefined for the evaluator. Settings now loads its classifier dependency explicitly. A fresh-tab native journey opens Settings first and checks real dependency availability without loading the bookmark UI or a model. Unloaded refusal is not claimed as actual inference.
- The hash-route negative cache fixture was invalid even for its own base URL, masking a potential lookup regression. It now has valid schema/resource identity, a positive own-resource assertion, both original route assertions and an in-memory hash-stripping mutation probe.
- Historical rollback guidance incorrectly presented 3.2.6 as safe for automatic filing. `RUN-2026-11-18.md` now requires turning automatic sorting off and verifying it stays off before code rollback. Use phase-aware `1d600ad` to revert this run while retaining provenance/recovery safeguards; do not downgrade prepared journals to an old unphased implementation or accept automatic-filing risk.

The preceding `f7d371b` CI passed 28 native suites, 29 Chrome journeys and the dashboard checks, but does not certify these later corrections. Its final-all-journeys Linux sample was aggregate renderers 204,987,392 bytes, GPU 49,064,960, whole profile 515,940,352 after ten seconds idle. This remains neither a Mac result nor evidence that the memory target is solved. Final corrected-head independent/full/native CI and installer hashes belong in the PR ledger. Do not use an earlier green run as approval. No further CodeRabbit request should consume paid overage if the included hourly allowance is exhausted; inspection of actual findings and independent review continue without buying service capacity.
