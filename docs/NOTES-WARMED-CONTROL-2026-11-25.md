# Warmed Notes control — 25 November 2026

## Review and decision

PR 17 baseline is `84e3b89548457d07003481ce9ce5873dd00777a2`; main remains `bf340372`. The prior report incorrectly left the pre-journal parent-read repair as a next implementation commitment: remote code already traverses ancestry before its fresh read, captures that read's parent/index, journals prepared intent and checks identity/index again before moving. Two independent reviews and 17 targeted tests confirm the bounded safeguard. No redundant runtime rewrite is justified. Chrome does not offer compare-and-move; simultaneous owner actions after the final read remain a disclosed limit.

Fresh native Node regression runner passes all 28 suites. The development benchmark remains synthetic and has no real model inference; owner collection accuracy remains unverified. Historical passing CI is not current-head review approval.

## Implemented stage

Added opt-in `HQ_NOTES_WARMED=1` to the existing disposable-profile experiment and enabled it in existing extension CI. Default standalone invocation retains two arms. The third arm warms the same synthetic 100 KB document, opens/closes twenty times without edits and asserts exact saves/mirrors, zero edit history, no Undo/Redo and stable pre-reload revision. Edited-arm exact Undo/Redo checks remain. Distinct output filename preserves old two-arm evidence. The third arm always runs last: order effects remain and this is not a causal history-cost estimate.

Independent source/syntax evaluation found no blocker. Local native launch failed before the first sample (Chromium process exit 127); no fresh RAM or browser acceptance result is claimed. CI must execute the new arm and its evidence must be independently inspected before this measurement stage is complete. No production runtime, dependency, model, permission or user data changes. No Mac 300 MB result.

The supported Sites source helper succeeded this run at published version 13 source `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`; no Site edit/deployment. Original audit/evolution records remain historical, not current defect claims.

## Research, retrieved 25 November 2026

- https://developer.chrome.com/docs/extensions/reference/api/bookmarks — move accepts ID and destination parent/index, not expected revision. Retain checks/journals; reject broader JS locking as a solution to native UI concurrency.
- https://github.com/GoogleChrome/chrome-extensions-samples — official Apache-2.0 examples reference API use, not transactional sorting. No copying/dependency is needed; no fee/provider/data transfer or runtime weight introduced. Exact latest maintenance timestamp not verified.
- https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7 — primary advisory remains relevant to explicitly network-exposed vulnerable dev servers. Prior denied upgrade remains a stop condition; no alternative install or exposed dev server was attempted. No clean security/deployment claim.

## Continuity and rollback

1. Inspect new CI's native three-arm JSON, compare warmed/edited samples and exact-content assertions; then collect alternating repetitions before runtime optimization.
2. Freeze resource-disjoint bookmark holdout and obtain actual opted-in model evidence; keep ambiguous owner links in place meanwhile.
3. Resolve security upgrade authority, then complete compatibility gates before any dashboard promotion; continue calendar/Maths only after this bounded memory stage is checkpointed.

Rollback only the experiment and CI environment flag if it fails. Do not destroy editor history, alter owner records or roll back to unsafe old bookmark journal readers. Code is PR-only, not installed on the owner's Mac. Completion percentage is not asserted without an acceptance denominator.
