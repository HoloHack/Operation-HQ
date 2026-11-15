# Operation HQ status — 15 November 2026

Dashboard version **13** is published at https://operation-hq-command-center.shour-ya11.chatgpt.site/. PR [15](https://github.com/HoloHack/Operation-HQ/pull/15) is merged. Companion **3.2.5** is packaged and available below; installation on the owner’s device remains an owner action. The approved Study desk design, existing audience, account/profile data and extension manifest key are preserved. This is a verified release, not completion of the whole roadmap.

## Verified release

Final implementation candidate: `7c4a709214898d90aac3f0fa95494b998d15874b`; merge commit: `1506a56332978447f852b51baaafec143f2fb190`.

- Dashboard: 126 tests, TypeScript, production build and high/critical production dependency audit pass. One fresh complete sweep of 39 Chromium journeys passes. [Final dashboard CI](https://github.com/HoloHack/Operation-HQ/actions/runs/43707060772).
- Companion: 17 native suites and 22 Chromium journeys pass. [Final companion CI](https://github.com/HoloHack/Operation-HQ/actions/runs/43707060752).
- The final installer matches all 96 committed source files byte for byte and passes ZIP integrity verification. Its bytes also match the CI-built installer. [Download artifact](https://github.com/HoloHack/Operation-HQ/actions/runs/43707060752/artifacts/14159001554) (a wrapper ZIP containing the installer; expires 15 December 2026; rebuild using the tracked packaging script after expiry).
- Installer: `Operation-HQ-Browser-Companion-3.2.5.zip`, 2,913,368 bytes, SHA-256 `d1470e53b2e8e5fe962ec4be9b8a297f51e74ee75d7a3e9b2a153ef83d1d5644`.
- Next.js / matching lint tooling are pinned to 16.4.1; Zod to 4.6.6. The production high-severity gate passes, but two moderate and two low advisories remain.
- CodeRabbit PR 14: no submitted review or inline findings; the full-review request reported a changed base/head. PR 15: automatic review skipped for a repository below ten stars. Neither is approval.

Provider/cloud identities in automated journeys are controlled fixtures. These checks do not certify the owner’s live OAuth accounts, bookmark collection or Mac performance. The live public entry page was checked after publication; it correctly requires sign-in to reach private workspaces.

## Owner-visible changes

Bookmark batches protect interrupted journals, bound repeated failures and await coalesced follow-up work before reporting completion. Alternate/job weeks agree across surfaces. Explicit source-based Master v8 refresh has a recovery copy; existing profiles are not overwritten automatically. Calendar ICS intake is previewed, duplicate-safe and recoverable. Flexible-block planning counts retained sessions and preserves breaks. Local study brief, literal note retrieval and confirmation-gated focus commands are integrated. The narrow calendar import control fits a 320px viewport.

Commands include “Brief me for today”, “Find my maths notes”, “Start 50-minute focus on maths” and “Plan my week”. See `dashboard/docs/RELEASE-2026-11-15.md` and `extension/docs/RELEASE-3.2.5.md` for supported inputs and limitations. That dashboard release document records earlier candidates; this status file is the final publication and verification record. Historical acceptance remains in `dashboard/docs/ACCEPTANCE-2026-10-18.md`.

Calendar import supports a finite 1–90-day preview, daily/weekly COUNT/UNTIL recurrence, matching EXDATE/RDATE, IANA/UTC times and multi-day all-day events. Monthly rules, edited recurrence instances, overnight timed events, subminute precision and ambiguous/skipped DST local times are rejected explicitly. Live Google/Microsoft Calendar sync is still open.

## Memory evidence

Three alternating-order pairs of cold Linux profiles exercised both viewport sizes and all panels, then idled for ten seconds. Median aggregate renderer private memory was 200,162,304 → 195,532,800 bytes (2.31% lower); GPU 40,160,256 → 39,878,656; whole profile 486,721,536 → 482,003,968. No model/provider responses were loaded. These small, short-run differences are noisy and do not establish meaningful sustained reduction, a per-tab budget, leak freedom or target-Mac acceptance.

## Still open

The whole roadmap is not complete. Highest remaining packages are meaningful memory reduction/target-Mac acceptance, real collection/OAuth/profile acceptance, live Calendar provider sync and broader recurrence, dependencies/rollover planning, evaluated model-backed bookmark/retrieval quality, broader Study OS/assessment parity, and remaining integration/venture/personalisation/security/a11y work. The original roadmap and source timetable remain authoritative; provisional competition/job timing is labelled.

Only owner-device/account steps require the owner: update the unpacked companion in place and inspect actual bookmarks/pairing; real Gmail/location/platform consent; a long-run Mac process/frame trace. No new keys, Supabase project, uninstall or storage reset is required for this release. To update: extract the installer, replace the contents of the existing permanent unpacked-extension folder, Reload that extension at `chrome://extensions`, verify version 3.2.5, then refresh HQ. Keep the same folder and storage.

## Publication and recovery

- Existing Site project: `appgprj_6aadff7e3da0819187238acbe434e132`; existing audience: public, with private workspace isolation unchanged.
- Published version: 13, saved version `appgprj_6aadff7e3da0819187238acbe434e132~appgver_6b5213ff11e88191a9b9a1e3d50de290`.
- Sites source commit: `f8f47b6be01b58983401f4b9d6ddc4f7fb2066b7`; all 168 tracked dashboard files matched the packaged checkout.
- Deployment: `appgdep_6af9927f14bc81919ee41a4d799abc88`, succeeded at `2026-11-15T11:07:57.442617+00:00`.
- Saved source archive hash: `sha256:7c2188409126fd939925ad094a87745fc117ed718aa7d331a8eb9c170a07e2f6`.

Code rollback is Site version 12 plus companion 3.2.4 installed in place. Keep newer planning data and paired-profile storage. Never restore a historical whole-data snapshot merely to roll back code. Scratch maintenance can remove local checkouts; resume from GitHub main and current Sites source rather than stale ZIPs.
