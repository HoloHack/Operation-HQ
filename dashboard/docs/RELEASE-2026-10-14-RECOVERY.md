# Operation HQ — recovery and calendar export, 14 October 2026

## Delivered behavior

Tasks and Calendar now have **Recent changes · recovery on this browser**. Deleted tasks, personal events, local weekly blocks and reviewed study-plan replacements can be recovered after closing a panel or refreshing. The immediate Undo button remains available.

Recovery writes the exact inverse to account-scoped IndexedDB before applying a destructive change. If storage fails or the history is full, the original work stays in place. Restores validate every affected item before changing anything, retain unrelated work, refuse edits to generated sessions, refuse a duplicate current item, and stop if an item was deleted again after the recorded operation. Restoration timestamps outrank the matching deletion marker. A restored inverse is removed only after its pending draft is persisted or its save acknowledged.

History contains at most 200 actions or 8,000,000 bytes of record payload per account, with a 2,000,000-byte individual action limit. Summaries load in pages of 20; full payloads load only when selected. Quota checks and appends share one IndexedDB transaction across tabs. Destructive actions use a per-account Web Lock where available and an in-page lock otherwise. Forgetting a recovery copy requires confirmation and never deletes current tasks or commitments. No timed or silent eviction occurs.

**Scope:** these recovery copies are local to this browser and origin. They are not cross-device trash, are not included in ordinary account exports, and clearing browser storage removes them. Ordinary cloud planning sync remains unchanged. A restored item is saved to the account through the existing save coordinator. Imported recurrence definitions remain owned by the companion.

## Calendar export

The existing export retains all saved standalone events. A separate **Export next 30 days + timetable** exports dated occurrences from the selected date, including weekly and alternating timetable blocks. This finite snapshot does not invent an infinite recurrence rule or alter stored events. Both exports include event locations and notes, UTC DTSTAMP metadata, CRLF-safe text escaping, and UTF-8 line folding without splitting characters, based on [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545).

Times remain floating local clock times. This is not a live Google Calendar connection or timezone conversion. Timetable titles over 300 characters are refused instead of silently shortened.

## Verification

Local: 79 regression tests, TypeScript and the production build passed. Existing server regression tests use isolated SQLite and test identities, not production records.

Native Chrome baseline at `6d7dd8f148fb56666e2e85fcb7f3f9cd03625635`: 25 journeys passed, with no uncaught browser errors. This includes real IndexedDB persistence, account separation, concurrent history-cap enforcement, task and weekly recovery after reload, reversible plans preserving newer appointments, offline deletion/reconnection, and actual calendar download content, alongside existing bridge/pairing and responsive-layout coverage. [Baseline run](https://github.com/HoloHack/Operation-HQ/actions/runs/38518246460).

Final implementation `2ec02cff714874815c8055bd4629da686fbeffbc`: **26 native Chrome journeys passed**, including full-history deletion refusal and narrow-panel confirmation controls. All 79 regressions, TypeScript, production build and production-dependency audit also passed in [the final native CI run](https://github.com/HoloHack/Operation-HQ/actions/runs/38518850513). Published as **Site version 8** at https://operation-hq-command-center.shour-ya11.chatgpt.site. Exact Site source: `bf3dbf242fa63990266f0b642a517219ca649973`; successful deployment `appgdep_6acf192e45f8819180ca1b919bede86e`. GitHub implementation merged in [PR #10](https://github.com/HoloHack/Operation-HQ/pull/10), merge `50b2f443714292ad162d242bd1342cf1057996cb`. All eleven changed implementation/test files matched their merged GitHub blob hashes before publication. The archive SHA256 is `2e0822f9586696962dc2dda08da3e5f79762054a3970cc7f1ef579afd4ace407` (1,873,920 bytes; 75 deployment files). The Site snapshot retains this document's pre-publication status; this GitHub document is the final release record. The companion code, permissions, OAuth scope, cloud schema and dependencies were not changed. Browser tests use disposable data and intercepted account/provider APIs.

## Review and rollback

Review covered inverse atomicity, later-delete protection, quota races, account scoping, async failure handling, capacity refusal, exact metadata preservation, responsive wrapping and export injection/Unicode handling. The final Chrome checks passed before publication.

Rollback target: existing Site version 7, source `f781b9307d639bc67f7c7b39fa0583a981f29f13`. Redeploy that saved version if acceptance fails. No database migration is needed. Rollback leaves IndexedDB history intact, though the older UI cannot show it. Reverting the code does not roll back user planning data.

## Remaining acceptance work

Cross-device deletion history; full recurrence exceptions/timezone-aware import and calendar-provider integration; richer Study overview/Recall/Gleam ports; general model-backed AI and authenticated textbook navigation; live OAuth/provider checks; closed-dashboard release reminders; screen-reader/device acceptance; and total renderer/GPU memory on the target Mac. The 300 MB target and whole-roadmap completion percentage remain unmeasured. These are not covered by the passing fixture tests.
