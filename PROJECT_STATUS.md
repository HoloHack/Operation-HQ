# Operation HQ status — 15 November 2026

Dashboard version **13** is published at https://operation-hq-command-center.shour-ya11.chatgpt.site/. PR [15](https://github.com/HoloHack/Operation-HQ/pull/15) and resource-lifecycle follow-up [16](https://github.com/HoloHack/Operation-HQ/pull/16) are merged. Companion **3.2.6** is packaged and available below; installation on the owner’s device remains an owner action. The approved Study desk design, existing audience, account/profile data and extension manifest key are preserved. This is a verified release, not completion of the whole roadmap.

## Dashboard version 13 release evidence

Final implementation candidate: `7c4a709214898d90aac3f0fa95494b998d15874b`; merge commit: `1506a56332978447f852b51baaafec143f2fb190`.

- Dashboard: 126 tests, TypeScript, production build and high/critical production dependency audit pass. One fresh complete sweep of 39 Chromium journeys passes. [Final dashboard CI](https://github.com/HoloHack/Operation-HQ/actions/runs/43707060772).
- Companion: 17 native suites and 22 Chromium journeys pass. [Final companion CI](https://github.com/HoloHack/Operation-HQ/actions/runs/43707060752).
- The final installer matches all 96 committed source files byte for byte and passes ZIP integrity verification. Its bytes also match the CI-built installer. [Download artifact](https://github.com/HoloHack/Operation-HQ/actions/runs/43707060752/artifacts/14159001554) (a wrapper ZIP containing the installer; expires 15 December 2026; rebuild using the tracked packaging script after expiry).
- Installer: `Operation-HQ-Browser-Companion-3.2.5.zip`, 2,913,368 bytes, SHA-256 `d1470e53b2e8e5fe962ec4be9b8a297f51e74ee75d7a3e9b2a153ef83d1d5644`.
- Next.js / matching lint tooling are pinned to 16.4.1; Zod to 4.6.6. The production high-severity gate passes, but two moderate and two low advisories remain.
- CodeRabbit PR 14: no submitted review or inline findings; the full-review request reported a changed base/head. PR 15: automatic review skipped for a repository below ten stars. Neither is approval.

Provider/cloud identities in automated journeys are controlled fixtures. These checks do not certify the owner’s live OAuth accounts, bookmark collection or Mac performance. The live public entry page was checked after publication; it correctly requires sign-in to reach private workspaces.

## Companion 3.2.6 follow-up — verified

Implementation candidate `a291bfbb91670455f0d5bd4963c3e8aa483444e5`, merged as `dede8880060f3ab0aab74eb2c411077c88640ece` in PR 16. The dashboard source and published Site version 13 did not change.

- The browser-tool desk no longer sorts or renders a duplicate task list inside its hidden legacy home. All 2,000 fixture records remain available in memory/context; the explicit legacy route still renders its task list.
- Statistics and venture charts release instances and canvas buffers on close/background and recreate from current records on reopening. Late statistics reads cannot recreate a closed chart. No task/metric data is removed.
- All **18 native suites and 24 Chromium journeys pass** in [companion CI](https://github.com/HoloHack/Operation-HQ/actions/runs/43708624905). All **126 dashboard tests, 39 dashboard Chromium journeys, minimum Node 22.13, TypeScript, production build and high/critical production audit pass** again in [dashboard CI](https://github.com/HoloHack/Operation-HQ/actions/runs/43708624904).
- [Download Companion 3.2.6](https://github.com/HoloHack/Operation-HQ/actions/runs/43708624905/artifacts/14159896250): wrapper ZIP containing the installer, expires 15 December 2026. Rebuild with `extension/scripts/package-release.py` after expiry. [Raw browser and memory evidence](https://github.com/HoloHack/Operation-HQ/actions/runs/43708624905/artifacts/14159901299) expires 29 November 2026.
- Installer `Operation-HQ-Browser-Companion-3.2.6.zip`: **2,915,087 bytes**, SHA-256 `4c5221e6122c798c39af785cdbda4fd01581ea7f480724b92b2f12fe1776bf37`. Local and CI bytes match; all **97 files** match committed source, ZIP CRC passes.
- Apart from the version, the manifest is identical to 3.2.5: identity, permissions, OAuth scopes and external origins stay the same. No schema/dependency change. CodeRabbit skipped automatic PR 16 review; no submitted review or inline findings. This is not CodeRabbit approval.

### Matched memory comparison

Three alternating-order cold Linux profile pairs per fixture against shipped 3.2.5 (`a9bf15b`). Both candidates use 320/1440×960 all-panel screenshot cycles, reduced motion, no model/provider responses and ten seconds settling.

| Synthetic task fixture | Baseline renderer PSS | 3.2.6 renderer PSS | Change | Baseline / candidate DOM |
|---|---:|---:|---:|---:|
| Empty | 196,001,792 bytes | 193,523,712 bytes | 1.26% lower; noise-level | 3,809 / 3,808 |
| 2,000 tasks | 251,515,904 bytes | 191,620,096 bytes | 23.81% lower | 27,819 / 3,818 |

For the 2,000-task fixture, median whole-profile PSS was 539,071,488 → 479,047,680 bytes and GPU PSS 39,416,832 → 38,463,488. All three heavy-fixture candidate renderer readings (191.1–193.3 MB) were below all three baseline readings (251.2–252.8 MB). This verifies a material reduction for that fixture, not every workflow.

The separate **24-journey mixed-workflow run** settled at **401,862,656 bytes aggregate renderer PSS**, with the workspace renderer at **348,484,608 bytes**, GPU 49,248,256 and whole profile 712,104,960. It includes legacy launch/viewport/bridge/window journeys and is not paired with a baseline. It does **not meet a 300 MB renderer target**. Target-Mac RAM, long-run growth, frame pacing and representative owner data remain unverified. Do not substitute JS heap or the smaller benchmark for these limits.

## Owner-visible dashboard changes

Bookmark batches protect interrupted journals, bound repeated failures and await coalesced follow-up work before reporting completion. Alternate/job weeks agree across surfaces. Explicit source-based Master v8 refresh has a recovery copy; existing profiles are not overwritten automatically. Calendar ICS intake is previewed, duplicate-safe and recoverable. Flexible-block planning counts retained sessions and preserves breaks. Local study brief, literal note retrieval and confirmation-gated focus commands are integrated. The narrow calendar import control fits a 320px viewport.

Commands include “Brief me for today”, “Find my maths notes”, “Start 50-minute focus on maths” and “Plan my week”. See `dashboard/docs/RELEASE-2026-11-15.md` and `extension/docs/RELEASE-3.2.5.md` and `extension/docs/RELEASE-3.2.6.md` for supported inputs and limitations. That dashboard release document records earlier candidates; this status file is the final publication and verification record. Historical acceptance remains in `dashboard/docs/ACCEPTANCE-2026-10-18.md`.

Calendar import supports a finite 1–90-day preview, daily/weekly COUNT/UNTIL recurrence, matching EXDATE/RDATE, IANA/UTC times and multi-day all-day events. Monthly rules, edited recurrence instances, overnight timed events, subminute precision and ambiguous/skipped DST local times are rejected explicitly. Live Google/Microsoft Calendar sync is still open.

## Earlier 3.2.5 memory evidence

Three alternating-order pairs of cold Linux profiles exercised both viewport sizes and all panels, then idled for ten seconds. Median aggregate renderer private memory was 200,162,304 → 195,532,800 bytes (2.31% lower); GPU 40,160,256 → 39,878,656; whole profile 486,721,536 → 482,003,968. No model/provider responses were loaded. These small, short-run differences are noisy and do not establish meaningful sustained reduction, a per-tab budget, leak freedom or target-Mac acceptance.

## Still open

The whole roadmap is not complete. Highest remaining packages are sustained mixed-workflow memory reduction/target-Mac acceptance, real collection/OAuth/profile acceptance, live Calendar provider sync and broader recurrence, dependencies/rollover planning, evaluated model-backed bookmark/retrieval quality, broader Study OS/assessment parity, and remaining integration/venture/personalisation/security/a11y work. The original roadmap and source timetable remain authoritative; provisional competition/job timing is labelled.

Only owner-device/account steps require the owner: update the unpacked companion in place and inspect actual bookmarks/pairing; real Gmail/location/platform consent; a long-run Mac process/frame trace. No new keys, Supabase project, uninstall or storage reset is required for this release. To update: extract the installer, replace the contents of the existing permanent unpacked-extension folder, Reload that extension at `chrome://extensions`, verify version 3.2.6, then refresh HQ. Keep the same folder and storage.

## Publication and recovery

- Existing Site project: `appgprj_6aadff7e3da0819187238acbe434e132`; existing audience: public, with private workspace isolation unchanged.
- Published version: 13, saved version `appgprj_6aadff7e3da0819187238acbe434e132~appgver_6b5213ff11e88191a9b9a1e3d50de290`.
- Sites source commit: `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`; all 168 tracked dashboard files matched the packaged checkout.
- Deployment: `appgdep_6af9927f14bc81919ee41a4d799abc88`, succeeded at `2026-11-15T11:07:57.442617+00:00`.
- Saved source archive hash: `sha256:7c2188409126fd939925ad094a87745fc117ed718aa7d331a8eb9c170a07e2f6`.

For the resource-lifecycle follow-up, roll back only the companion to 3.2.5 in place; keep dashboard version 13. For the earlier dashboard release, code rollback is Site version 12 plus companion 3.2.4 in place. Keep newer planning data and paired-profile storage. Never restore a historical whole-data snapshot merely to roll back code. Scratch maintenance can remove local checkouts; resume from GitHub main and current Sites source rather than stale ZIPs.
