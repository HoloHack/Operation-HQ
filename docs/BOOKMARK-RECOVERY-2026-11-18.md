# Bookmark recovery acceptance — 18 November 2026

## Current source and bounded outcome

Base candidate `5813751`, new runtime checkpoint `772d6d2` in [PR 17](https://github.com/HoloHack/Operation-HQ/pull/17). GitHub main remains `bf34037`. Current Site source was recovered again through Sites at `f8f47b6`; all 168 tracked dashboard mirror files match. Published dashboard is still version 13. Canonical roadmap v3 remains version 15 (604 lines); historical percentages are not current measurements. Neither the Site nor the owner's installed Chrome companion was changed.

The latest CodeRabbit review on `5813751` identified the same recovery blocker recorded in the previous checkpoint: a stored intent plus an owner move to the same target could be mistaken for HQ's completed move. This stage implements **prepared versus acknowledged recovery**, not semantic-classification completion.

## Changed behavior

Both foreground `moveAndRecord` and worker `moveSelf` persist `phase: prepared` before invoking Chrome. They validate Chrome's returned ID, URL, title and target before writing `phase: applied` durably. If acknowledgement persistence fails, the saved record remains uncertain and subsequent moves stop. Foreground commit cannot erase that uncertain intent merely because earlier successful moves exist.

Undo partitions pending journals: only applied records can be automatically reversed. Prepared records and phase-less **pending** legacy journals remain untouched; separately committed historical Undo records retain compatibility. Mixed journals retain unresolved records and applied failures rather than clearing the whole journal. Recovery ancestry remains protected by the existing folder ownership/Undo registry logic.

A visible recovery review lists uncertain records and offers **Keep current locations** with explicit confirmation. It changes recovery metadata only, archives the uncertain entries in the last eight local review records, preserves applied inverses and never moves/deletes bookmarks. A snapshot comparison under the mutation lock rejects stale confirmations. This is a deliberately bounded recovery action, not an unreviewed whole-tree restore. Only the first 20 records are displayed with the full count disclosed; large-collection presentation remains a usability limitation.

The review has a dedicated single-column layout, wrapping for opaque URLs, readable spacing and a 44px minimum confirmation target. Native acceptance now exercises 320px containment with a long query URL and keyboard expansion in both legacy/prepared cases; this changed test requires fresh CI rather than relying on the earlier wider-layout result.

Chrome provides no expected-parent compare-and-move API. An owner action after the final source read can still race Chrome's move. No claim of perfect atomicity, actor provenance under every crash, or universal storage-failure recovery is made.

## Acceptance gates

| Gate | Fresh evidence / status |
|---|---|
| Foreground before-move / after-move-before-ack uncertainty | 11 new phase tests pass, including literal owner-move-to-target plus failed cleanup followed by restart/Undo, and failed completion persistence |
| Automatic-worker acknowledgement/restart boundary | 6 new worker tests pass; prepared/ack/commit phases, false acknowledgement, owner drift, existing journal protection |
| Prior exact Undo / sibling order / journal failures | 6 move-race and 14 safety checks pass |
| Full local companion regression | All 25 registered suites pass; no dependencies or permissions changed |
| Independent evaluation | 36/36 targeted tests and read-only architecture/UI review pass; no blocking defect against this bounded contract |
| Real Chrome / UI | New isolated native journey committed: legacy/prepared holds, owner placement, mixed applied Undo, cancelled and accepted Keep-current confirmation; current-head CI result must be retained before accepting this gate |
| Owner collection, Mac, OAuth/provider | Unverified; no live personal data was used |

Current scope has seven explicit evidence gates above; source/unit/independent results do not count as owner-device acceptance. No whole-product completion percentage is claimed.

## Research and decisions, retrieved 18 November

- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks): move takes ID and destination parent/index, not expected old parent/URL/revision. The non-CAS limitation follows from that documented signature. [Web Locks](https://www.w3.org/TR/web-locks/) coordinate HQ's cooperating contexts, not Chrome UI or other extensions; termination releases locks without rolling back native moves. [MV3 lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) requires persistent recovery, not global flags.
- [Bookmark-Backup](https://github.com/Browser-bookmark-hub/Bookmark-Backup): MIT verified, non-archived, latest push 1 September 2026. Timestamp/fingerprint history, ID-based preview and a separate recovery copy are useful design comparisons. Whole-tree restore/deletion and optional credentialed WebDAV/GitHub exports were rejected for this task because they could overwrite unrelated changes or transmit private bookmarks. No code/dependency copied; repository size is not RAM or maintenance certification.
- PR 18 pins remain Next 16.4.5, React trio 19.2.9, plugin-RSC 0.5.38, Vinext 1.2.0, Vite 8.0.16, Wrangler 4.92.0. The [React](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3) and [plugin](https://github.com/vitejs/vite-plugin-react/security/advisories/GHSA-59pf-q495-3c99) candidate patch boundaries are met, but [Vite's critical development-server advisory](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7) remains applicable to the network-exposed dev configuration. The earlier denied upgrade was not retried or bypassed. No new development server or production deployment was launched in this stage.

## Remaining work, release and rollback

1. Retain final-head CI/native recovery evidence and inspect actual new CodeRabbit findings. A request or silence is not approval. Do not promote a changed candidate using older green runs.
2. Improve semantic classification against the saved labelled baseline: 31 unique synthetic resources, 14 accepted / 13 correct / 1 wrong, 8 known topics unresolved. Actual AI-assisted inference/calibration and owner collection acceptance remain unverified. No heavy model startup, hidden private uploads or new keyword-only claim.
3. Continue paired sustained mixed-workflow memory work, then Calendar/timetable and Maths workflows. The previously recorded Linux workspace renderer 370,417,664 bytes is above the 300 MB target and is not a Mac measurement. This patch claims no RAM reduction.

Security candidate promotion remains blocked by the denied Vite upgrade authority and required follow-up tests. No keys, Supabase project or new paid services are needed for this recovery patch. Rollback remains code-only to companion 3.2.6 in place, preserving user records and pairing. Warning: old code does not understand the new prepared/applied distinction; do not run old Undo against a pending new-format recovery journal. Resolve recovery with this candidate first or preserve it untouched for review—never reset storage to make rollback appear successful.
