# Bookmark evaluation and memory checkpoint — 27 November 2026

## Current source and actual checks

Main remains `bf340372`; this stage starts at PR 17 `5e15ee5b1c390217aaed9ca01a96349a434814e4`. PRs 18 (security) and 19 (executive architecture) remain independent. CodeRabbit's last submitted review remains on older `455f8d3`, not current approval. No protected workflow, permission, service or release gate is bypassed.

Supported Sites recovery succeeded at published version 13 source `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`. Dashboard source/publication is unchanged. The canonical roadmap still reports version 15; the historical audit and release/evolution contract remain reference documents, not fresh proof of completion. Dashboard workflows do not establish installed companion behavior.

Prior source `5e15ee5` extension CI 45827612942 and dashboard CI 45827620455 passed. Actual extension evidence artifact 15122496007 was downloaded and independently reviewed. All three counterbalanced comparisons, nine disposable profiles, passed exact text/HTML/mirror reload checks. All edited arms retained 20 Undo events and exact Undo/Redo across panel close/reopen. All warmed arms retained zero history and revision 1; no page errors, HTTP requests, model loads or pending saves occurred.

| Arm | Idle aggregate renderer PSS MiB | Idle whole-profile PSS MiB |
|---|---:|---:|
| Never-open | 131.78–133.01 | 400.82–402.59 |
| Edited | 157.27–167.04 | 428.93–442.45 |
| Warmed read-only | 149.79–162.77 | 416.47–433.84 |

Edited memory fell 58.03–59.88 MiB after 30 seconds idle while keeping history. Warmed fell 20.51–22.33 MiB. Baselines vary, and edited-minus-warmed even reverses in one run. **Do not destroy history or claim isolated history cost/leak absence.** The short experiment's 3/3 gates (reviewed configuration, actual comparisons, independent evidence review) are complete; overall performance/Mac 300 MB acceptance remains open. Future performance work needs sustained representative workload/longer idle traces, not another identical short run.

## Implemented bookmark stage

- Added independently authored, fixed 24-case synthetic resource-disjoint cohort: 15 labelled topics and nine required abstentions. Mixed-platform content, semantics, queries/deep paths, supplied metadata, private/unavailable/redirect cases and instruction-like content are represented. No owner records or page bodies are used.
- Settings exposes development/new-cohort choice with two fixed packaged paths. Selection locks during evaluation and recovers on failure/cancel. An already-loaded model is required; this never downloads/loads a model, reads personal bookmarks, calls an external provider or files links.
- Before inference, validate bounded fields, HTTP(S) credential-free URLs, unique normalized IDs, exact fixed-taxonomy labels, conflicting duplicate labels and cross-cohort resource overlap. Evaluation-only YouTube alias matching catches watch/shorts/embed/youtu.be identities without changing production classification.
- Reports retain cohort name/scope/version/hash and prompt/input traces. Gold labels/access notes are not sent to inference. Original title/URL baseline is explicitly scoped; a separate metadata-aware deterministic replay avoids attributing extra evidence to semantic superiority. Both remain diagnostic, not filing authority.
- Native tests cover invalid fixtures/overlap with zero inference, alias conflicts, label-free prompts, selector locking/recovery, unknown selection and cancellation. Settings-first Chromium journey now checks the actual cohort choice/packaged validation without loading a model.

This cohort is not blinded, representative owner data or calibrated confidence. If results are used to tune rules/prompts/thresholds, retire it into development and create a new independent cohort. No real model inference was available this run; scripted test doubles prove contracts, not semantic accuracy. Automatic sorter and owner corrections are unchanged.

## Research decisions — retrieved 27 November

- https://scikit-learn.org/stable/common_pitfalls.html — test information must not tune the system being evaluated. Freeze/hash labels and keep them outside inference; do not market a visible synthetic set as a blinded benchmark.
- https://github.com/promptfoo/promptfoo and https://raw.githubusercontent.com/promptfoo/promptfoo/main/LICENSE — MIT evaluation tooling, maintained/available but exact latest timestamp not verified. Deferred: existing instrumented boundary is sufficient for one model; added CLI footprint/adapter work does not create real model access. No package/code copied.
- https://www.promptfoo.dev/docs/configuration/telemetry/ — telemetry defaults on; disable if later adopted. Provider calls may still incur fees/send input, so free CLI is not free/private inference. No installation or provider use now.
- https://github.com/mlc-ai/web-llm/releases — v0.2.89 dated 17 November lists tokenization APIs, long-prompt and example context-delivery fixes. Bundled build provenance is not established here; no upgrade or claim HQ has the example defect. Require version identification, compatibility/accuracy/memory/unload tests and rollback first.

## Acceptance, release and continuation

Bounded bookmark stage gates: source validation/independent review; native contract regressions; actual new browser journey; explicitly opted-in real model evaluation. First two can pass locally; last two require actual evidence, not queued CI or fake predictions. No overall roadmap percentage is asserted. The real owner collection, live provider OAuth and Mac RAM remain unverified. Missing real model/device evidence blocks semantic promotion, not independent development.

Next commitments:
1. Inspect new CI browser artifacts and the prepared install package. Then obtain explicitly loaded-model comparison on both cohorts; keep unknown links untouched and do not automatically promote model-only suggestions.
2. Complete sustained memory/device acceptance when available, preserving exact saves/history. Do not rerun short controls indefinitely.
3. Resolve denied security upgrade authority before any dashboard promotion; continue the accepted calendar/timetable/Maths stage without production-record tests.

Rollback this evaluation UI/cohort/validation as one bounded code change if required, retaining older functioning sorter/journal protections. No dependency, permission, model, schema or personal-data migration is included. PR-only candidate; no publication, merge, installation or schedule change.
