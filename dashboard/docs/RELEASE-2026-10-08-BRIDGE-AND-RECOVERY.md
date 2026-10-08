# Operation HQ — reviewed browser import and device recovery

8 October 2026. This is a tested reliability increment, not a claim that the entire product roadmap is finished.

## What changed for the user

- Repaired the existing browser-import screen and its actual extension connection. A panel offset caused its button to sit outside the viewport; individual CSS translation is now cleared. Close buttons retain a 44-pixel hit area inside the panel. Opening Import or Recovery from Settings closes Settings first.
- Import reads only tasks, calendar entries and notes. The extension must be enabled for this exact dashboard origin, and the user confirms that this is their browser profile before accepting. Previewing never saves. Failed refreshes clear an older preview; late responses cannot reopen a closed preview.
- Imported records have separate browser IDs, do not replace existing dashboard records or preferences, and do not duplicate on repeated import. Notes offer keep current, use browser, or keep both. Oversized or malformed imports stop without partial changes. This is an explicit import, not automatic synchronization of later browser edits.
- Unsaved dashboard work now has an account-specific and tab-specific IndexedDB recovery copy. Reloading the same tab restores its pending work; cloud writes wait for a successful authenticated load. Conflicting notes retain both versions for a deliberate choice.
- Settings → Recover device copies shows 20 small summaries at a time. Full documents load only for the selected recovery or export. Existing version-1 device copies migrate to the summary index without deleting their original records. Duplicate tabs use separate locks and cannot overwrite the same pending draft.
- Manual recovery waits for active saves and retains unrelated current tasks. Rapid typing keeps one active device write and only the latest pending copy. Unavailable or unreadable storage produces a visible warning; unreadable copies are not erased.
- Server responses and requests bind the dashboard to the authenticated account. A stale tab from another signed-in account is refused before database access. Changing accounts remounts the dashboard.
- Direct theme commands now show three generated colour options before any change; choosing one uses the existing layered transition. The choices are generated heuristics, not a model’s semantic colour recommendation.
- Browser tools opens the extension’s real Nexus workspace. The obsolete, unsupported system tool name was removed.

## Verification

38 executable dashboard regressions pass locally, including isolated SQLite tests against the real route code. Type checking passes. Native Chrome candidate acceptance and final production build are release gates; their final results and links will be recorded before publication.

The browser harness uses the actual Dashboard React component, actual extension, Chrome messaging, IndexedDB and Web Locks in a disposable profile. Account/cloud responses are isolated fixtures. The API route is separately covered by account and concurrent-write SQLite tests. Tests never read or modify production bookmarks, notes, tasks, email or calendar data. The test entry is not a deployed application route.

## Still unfinished or unverified

| Area | Current limit |
|---|---|
| Two-way sync | No automatic writeback, account pairing, tombstone/deletion propagation or complete field parity. Imported records already edited in the dashboard win on repeat import. |
| Offline use | Pending-edit reload recovery is implemented. A fresh offline visit without a previous draft cannot load the cloud account. Device copies can be unavailable in private/blocked storage; browser clearing/eviction can remove them. Local copies are not encrypted. |
| Recovery history | Successful cloud acknowledgements clear that tab’s pending copy. This is a recovery journal, not an unlimited version archive. No forced crash or Mac private-storage certification. |
| Product scope | Full Google Calendar parity, automatic capacity-aware rescheduling, Cambridge chapter navigation and general-purpose local-model commands remain roadmap work. |
| Providers | Real Gmail consent/reconnect, weather/wallpaper network calls, Spotify and local-model loading require separate authorized provider/device tests. |
| Source parity | Tested companion 3.1 is available in GitHub. The exact earlier 3.0 attachment returned HTTP 403, so unseen 3.0-only features cannot be compared. |
| Performance | The journal and recovery list bound retained work. No target-Mac renderer/GPU memory measurement or frame-pacing certification; the 300 MB target remains unverified. |
| Design | Automated real-browser interaction/geometry checks are evidence for their listed journeys, not a guarantee that every screen is aesthetically perfect. |

Whole-roadmap completion remains unmeasured. The historical 75% estimate is not a verified current percentage.

## Release and rollback

Keep the existing Sites dashboard and account-scoped D1 store. No Supabase project, paid service, new OAuth scope, production-data mutation or D1 schema migration is needed. GitHub runs tests, type checks, production build/audit and isolated native browser tests on dashboard changes. Retain the existing weekly review.

Previous published Site version: 3; source a465f41e53f60a3aa02f7f89aadaa3f9c1d05a25. On a regression, export pending copies first, then redeploy that saved version. Local version-2 journals remain on the device, so older UI may not display them; retain a recovery export before rollback.

Next commitments: implement shared operation-based sync and deletion semantics; extend the calendar/timetable planner with fixed-block-aware preview/undo; measure memory and motion on the target Mac.
