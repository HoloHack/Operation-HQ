# Operation HQ status — 15 November 2026

Current work: PR 15, branch `build/planning-memory-bookmarks-2026-10-18`. Production baseline remains dashboard version 12 / companion 3.2.4 until the publication record below confirms an update. Preserve the Study desk design, account/profile data, extension manifest key and existing audience.

## Verification

- Local: 126 dashboard tests and TypeScript pass; 17 native extension suites pass.
- Candidate `593f40e`: one complete 39-journey dashboard Chromium sweep and 22 native Chromium journeys pass. The production build passed, but the high/critical dependency audit failed. That candidate was not published.
- Next.js / matching lint tooling are now pinned to 16.4.1; Zod to 4.6.6. Local production audit passes the high-severity gate, with two moderate and two low advisories remaining. The complete patched-candidate CI and deployment are pending.
- Latest accepted source definitions, precise limits and memory evidence: `dashboard/docs/RELEASE-2026-11-15.md`. Historical acceptance: `dashboard/docs/ACCEPTANCE-2026-10-18.md`.
- CodeRabbit PR 14: no submitted review or inline findings; full-review request reported a changed base/head. PR 15: automatic review skipped for a repository below ten stars. Neither is approval.

## Owner-visible changes in this candidate

Bookmark batches protect interrupted journals and bound repeat failures; alternate/job weeks agree across surfaces; source-based Master v8 refresh has a recovery copy; calendar ICS intake is previewed and recoverable; flexible-block planning counts retained sessions and preserves breaks; local study brief/search/focus commands are integrated. See release notes for supported input and recurrence limits.

## Still open

The whole roadmap is not complete. Highest remaining packages are meaningful memory reduction/target-Mac acceptance, real collection/OAuth/profile acceptance, live Calendar provider sync and broader recurrence, dependencies/rollover planning, evaluated model-backed bookmark/retrieval quality, broader Study OS/assessment parity, and remaining integration/venture/personalisation/security/a11y work. The original roadmap and source timetable remain authoritative; provisional competition/job timing is labelled.

Only owner-device/account steps require the owner: update the unpacked companion in place and inspect actual bookmarks/pairing; real Gmail/location/platform consent; a long-run Mac process/frame trace. No new keys, Supabase project, uninstall or storage reset is required for this candidate.

## Recovery

Before publication, production remains version 12. After publication, code rollback is version 12 plus companion 3.2.4 in place. Keep newer planning data and paired-profile storage. Never restore a historical whole-data snapshot merely to roll back code. Scratch maintenance can remove local checkouts; resume from this branch and current Sites source rather than rebuilding from stale ZIPs.
