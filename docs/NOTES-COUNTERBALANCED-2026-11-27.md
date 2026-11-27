# Notes controlled repetitions — 27 November 2026 (Sydney)

## Source and actual evidence

Starting source: PR 17 `08bb2f6292a4d11d8ae4216be8dec77e7e404f6d`, main `bf340372`. Current review submissions still stop at CodeRabbit `5976069416` on older `455f8d3`; no current approval is claimed. Prior extension CI run 45608766351 completed successfully. Its artifact 15018254508 contains the actual three-arm experiment, not merely a requested check. The native regression suites, browser journeys, benchmark, process-memory comparison and packaging steps passed on that source. The Site still reports version 13; supported source recovery succeeded this run at `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`. No Site changes/publication.

Independent artifact inspection confirms all three synthetic profiles preserved exact plain text/HTML/mirrors after reload with no recovery/conflict. The edited profile retains 20 Undo events and exact Undo/Redo across close/reopen. The warmed profile retains zero history, no Undo/Redo and revision 1. No HTTP requests, model loads or page errors were recorded.

| Arm | Idle aggregate renderer PSS MiB | GPU PSS MiB | Whole-profile PSS MiB |
|---|---:|---:|---:|
| Never-open | 133.29 | 36.40 | 397.71 |
| Edited, 20 cycles | 169.60 | 36.67 | 445.50 |
| Warmed read-only, 20 cycles | 150.49 | 35.87 | 417.99 |

Idle is 30 seconds. Edited renderer PSS released 55.40 MiB after cycle 20 while preserving history; read-only released 19.76 MiB. Edited idle exceeds warmed idle by 19.11 MiB, but their pre-intervention baselines differ substantially. This is not an isolated history cost, leak certification, optimization result, Mac measurement or 300 MB acceptance.

## Implemented and reviewed

The experiment now accepts validated `HQ_NOTES_WARM_POSITION=first|middle|last` (default last). Default standalone two-arm behavior is unchanged. Exact content/history guards remain unchanged; output records actual order/position and distinct filenames. Existing CI runs three comparisons sequentially:

| Sample | Pair order | Warm position | Actual sequence |
|---|---|---|---|
| 0 | baseline-first | last | Never-open, edited, warmed |
| 1 | edited-first | middle | Edited, warmed, never-open |
| 2 | baseline-first | first | Warmed, never-open, edited |

Each arm appears once at each position. Independent challenge/source review found no blocker; syntax and configuration checks cover all six combinations and invalid input. Previous one-comparison duration was 154.406 seconds. Increased existing job timeout from 15 to 20 minutes to leave bounded room for three comparisons and always-upload evidence. No extra profiler/dependency, runtime change, schema, permission, provider or owner-data mutation.

Stage acceptance denominator: (1) validated configuration/source review, (2) three actual native comparisons with exact saves/history, (3) independent review of their outputs. Only (1) is satisfied before new CI finishes. Do not advance runtime optimization on queued CI alone. Local Chromium executable remains missing; new runtime evidence must come from existing CI, not an invented local pass.

## Research decisions, retrieved 27 November

- https://playwright.dev/docs/browser-contexts — fresh context isolation prevents storage contamination, but does not promise distinct browser/GPU processes. Keep separate disposable browser profiles/launches for each arm.
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations — bounded explicit matrix/max-parallel is possible; selected sequential existing-job steps avoid repeated full-suite setup and concurrent profiler contention. Runner variability remains.
- https://github.com/meta/memlab — maintained MIT heap-retainer analysis candidate (repository pushed 25 November per fresh metadata). Deferred: extra Puppeteer/CLI footprint, compatibility work and private-string risk in heap snapshots; not a replacement for renderer/GPU PSS. No code copied, script executed or package installed. Reconsider only if controlled traces show retained JS objects worth investigating.

## Continuity, risks and rollback

1. Inspect all three new CI outputs and failures, not only aggregate success. Then decide whether longer idle/sustained traces or a reproducible retained-object investigation is justified; preserve Undo meanwhile.
2. Bookmark semantics remains the primary functional blocker requiring actual explicitly loaded model and resource-disjoint labelled holdout evidence. Synthetic development coverage is not owner acceptance; do not guess/move ambiguous personal links. Existing click/queue/recovery regressions remain necessary, not sufficient.
3. Resolve the existing denied security-upgrade authority before dashboard promotion, then continue accepted calendar/Maths work. Do not retry denied installs through another route.

Rollback only the test-position option/three CI steps if broken; no production data migration or runtime lifecycle change exists to undo. Published dashboard and installed Mac companion are unchanged. No overall roadmap percentage is asserted.
