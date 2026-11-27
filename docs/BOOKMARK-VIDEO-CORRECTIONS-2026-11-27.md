# Plain-video owner corrections — 27 November 2026 (Sydney)

## Source and reviewed evidence

Starting source PR 17 `8d901c9f66dbdffb52908ab9195e6888fb21b4ec`, main `bf340372`. Extension CI 45904246048/job 140197061770 and dashboard CI 45904252652 passed. An independent evaluator checked actual CI logs: Settings-first resource-disjoint cohort selection/validation and the unloaded-model journey at 320px passed with no model request or invented report. The bounded evaluator stage has source, native contracts and unloaded-browser acceptance; real-model and owner-collection accuracy remain open. CodeRabbit comments were inspected; no fresh current-head approval is inferred.

Supported Sites recovery succeeded at unchanged published version 13/source `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`. Website and installed Mac state are unchanged. Historical audit/evolution records and the canonical roadmap remain reference context, not current completion claims.

## Reproduced bookmark defect and bounded repair

An owner correction for a normal `youtube.com/watch?v=resource_ABC` link was not reused for a plain `youtu.be/resource_ABC` or `youtube.com/shorts/resource_ABC` link. Those URL forms have different historical fingerprints. Existing synthetic passing tests did not cover this correction handoff.

The repair keeps valid historical exact fingerprints/corrections authoritative. If no exact correction exists, it checks a small finite set of known plain-video aliases for the same opaque video ID. It does not scan the entire learned map, fetch a page, rewrite saved URLs, migrate records or call a model/provider. Only existing taxonomy-valid owner corrections can authorize the borrowed destination.

If historical alias corrections disagree, classification stops with an explicit conflict instead of selecting a winner or falling through to keyword guessing. Different video IDs stay separate. New alias borrowing is excluded for playlist/index/time/start/end/clip/unknown-query or fragment intent. Existing exact-key behavior remains intact, including the historical watch key's treatment of playback parameters; this is not a claim of complete segment-level identity isolation.

The old watch fingerprint branch also now requires an allowlisted YouTube host, the actual `/watch` route, one bounded opaque ID and one `v` parameter. An unrelated page merely containing `v=` must not inherit a video correction. Independent review additionally reproduced FTP/credential/nondefault-port and short-link extra-path bypasses; the narrowed watch/short identity guards and alias helper reject those boundaries. Valid existing watch/short keys do not change.

No AI-only automatic moves, taxonomy expansion, domain-wide learning or public page collection was introduced. User folders, managed-folder registry, durable queue, mutation lock and phase-aware Undo remain unchanged. This repair targets a concrete correction-reuse failure, not complete owner-collection semantic accuracy.

## Research decisions — retrieved 27 November

- https://developer.chrome.com/docs/extensions/reference/api/bookmarks — native node ID persists across restarts, while URL/title are separate mutable fields. Keep journals/queue tied to native ID plus reviewed identity, not just a platform host. Chrome still has no documented compare-and-move argument.
- https://developers.google.com/youtube/player_parameters — video/playlist/playback parameters have distinct meanings. Alias reuse is deliberately limited; do not drop meaningful parameters to claim everything is one resource.
- https://github.com/sissbruecker/linkding — MIT, not archived, pushed 13 November 2026 according to fresh repository metadata. Useful reference for clear tags, bulk review and metadata UX. Rejected as a runtime dependency: Django/server/database deployment adds weight and maintenance without supplying Chrome transaction safety. Free source is not free hosting; private bookmark metadata/archive transfer must not be enabled silently. No code copied, service connected or script executed.

## Acceptance and continuation

Required bounded gates: (1) alias/exact/conflict/unsafe-route synthetic regressions, (2) full companion regression runner and independent review, (3) fresh CI/browser/package evidence. Gates 1 and 2 passed: eight new regressions include the actual automatic-worker classification function with synthetic Chrome/move stubs; all 29 native suites pass and independent re-review found no remaining blocker. The new real-browser classifier journey is prepared but awaits current CI. The development benchmark is unchanged at 13 correct accepted / 31 unique resources, 18 holds, eight known topics unresolved; no inference was run and no semantic-quality gain is asserted. Prepared code is not installed or published. Overall roadmap percentage is not asserted. Actual model/owner sample, live OAuth and Mac 300 MB acceptance remain unavailable/unverified; no production records are used for tests.

Maths inspection additionally reproduced and recorded the next independent stage: focused planning allocates only one chapter per flexible block, silently truncates an oversized requested session, accepts rolled-over invalid dates, and ignores structured calendar conflicts. For chapters 5/7/8/10 ×25 minutes, one two-hour block should fit all four, not only chapter 5. No partial Maths fix is included here. Implement capacity/deadline/conflict/Apply recheck tests in a separate bounded stage after this fix is checkpointed.

Next commitments: inspect new CI and address findings; obtain real opted-in bookmark model/owner evidence while preserving ambiguous links; repair the reproduced Maths allocation defects with full previews and non-destructive Apply/Undo. Sustained memory acceptance remains follow-up; do not repeat short Notes controls indefinitely or delete editor history. Existing denied security upgrade remains a stop condition before dashboard promotion.

Rollback this alias lookup and route guard as a code change only; no storage migration or owner records exist to reverse. Preserve the existing safe journal reader/automatic-off recovery protections. No merge, deployment, model/dependency/permission or automation changes are included.
