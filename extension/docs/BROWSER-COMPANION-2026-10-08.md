# Browser companion reconstruction — 2026-10-08

## What this build is

Version 3.1.0 is a reconstruction from the recoverable `repair/bookmarks-memory-2026-09-30` branch, whose manifest was 2.8.1. The exact 3.0.0 Browser Power Layer ZIP was found in the account, but its authorized download returned HTTP 403. This release does **not** claim to reproduce unseen 3.0 additions. Older repository folders remain intact. The canonical reconstructed source is `extension/`.

The hosted dashboard remains at https://operation-hq-command-center.shour-ya11.chatgpt.site. It retains its existing database; no Supabase project or new billable service is required for this extension.

## What changed in plain language

- Opening an ordinary new tab no longer starts Operation HQ's full interface, canvases, editor, charts or AI. The extension is a toolbar companion. Browser alarms and permitted background tools still exist.
- The popup opens the dashboard or one reusable browser-tools workspace. Repeated or concurrent tool clicks reuse it.
- A slower tool load cannot replace a later selection. Closing a panel cancels pending panel openings. Programmatic tool launches are idempotent.
- If saved data belongs to a newer unsupported schema, startup stops before feature writers run. Original data is left intact.
- Calendar transactions no longer silently cut off actions, text or recurrence. Invalid or oversized input stops atomically; existing events and event-specific undo remain preserved.
- Saved browser workspaces no longer quietly omit everything beyond 100 live or 120 merged tabs, or evict older saves during persistence. Capture and merge support up to 1,000 tabs; larger operations stop visibly. Thirty occupied workspace slots block a new save until the owner deliberately frees a slot. Existing larger collections are preserved.
- The optional dashboard bridge is restricted to the exact hosted dashboard origin and disabled by default. It offers status, a planning preview, and allowlisted tool opening. It cannot mutate browser tasks, notes, bookmarks, calendar or emails. Credentials and email content are excluded. Privacy/Lockdown pauses preview reads. Unsupported/oversized tasks stop rather than truncate.

## Where features live

| Feature | Browser companion | Hosted dashboard | Important limit |
|---|---|---|---|
| Bookmarks | Topic classifier, preview, evidence refinement, exact-page corrections, managed-folder cleanup, mutation lock, recovery journal, exact undo | No direct Chrome bookmark access | Ambiguous titles stay put; no classifier can guarantee the owner's intent for every link |
| Tab groups | Save, separate-window restore, topic preview, bookmark cross-reference, metadata refresh, explicit saved-copy deduplication | No direct Chrome groups access | Restoration opens tabs; it does not close original tabs |
| Gmail | Google identity, read-only inbox/search/pagination, priority/category lanes, local corrections, task/calendar handoffs | No authenticated inbox in this release | Google consent/test-user/client-ID configuration and live API access remain required |
| Planning | Tasks, recurring daily tasks, Today, Calendar month/week/day/agenda, recurrence, timetable profiles, assessment planning, exam reverse planning | Separate task/calendar/timetable/assignment/exam state | Browser and website stores are not bidirectionally synchronized |
| Notes | Rich text, plain fallback, search, autosave, legacy mirrors, exact-triplication recovery copy, capture and restore | Website notes and conflict-aware dashboard sync | Browser notes still use a per-page writer; one reusable workspace reduces but does not prove all manual multi-window edit conflicts are solved |
| Study | Exact maths chapter lists, deadline follow-ups, reviewed focus/reschedule plans, matching saved resources, assignment breakdowns, research provenance, recall/SRS | Maths plans, assignments, exams, timetable | Cannot bypass Cambridge login or invent deep links to chapters without a saved URL |
| Commands and AI | Local deterministic routes; optional on-device model interpretation and study/social coaching | Dashboard command layer | Deterministic commands work without a model; actual inference requires explicit load, model download and compatible device/WebGPU |
| Social confidence | Hidden Gleam workspace, practice curriculum, roleplays/reflection/progress; optional local coaching | No claim of full Gleam parity | Coaching output is not clinical advice or a guarantee of real-world outcomes |
| Visual experience | Reactive widgets, ordering/visibility, mini/full panels, weather state, generated subject palettes with approval, boot/mode choreography, compositor, Cinema clearing, reduced motion | Dashboard visuals and focus transitions | GPU performance and monitor appearance depend on hardware; tests are not a Mac memory certification |
| Downloads/assessments | Optional download history, owner-selected file/folder access, supported document intake and review | Assessment planning from user data | An extension cannot silently read every filesystem download without appropriate owner-granted access |
| Other workspaces | Focus timer/scenes, Deep Work rules, ventures/stats, idea vault/radar, Spotify, integration health, mods, backups and recovery | Dashboard-specific counterparts | Spotify/provider-backed generation requires configured provider access; keys are never included in ordinary backups |

The recovered detailed feature/request ledger is `Operation-HQ-v2.8-Feature-Map-and-Request-Ledger.md`. Its historical status statements are not a substitute for the current test evidence below.

## Test scope and release gates

Local automated suites cover browser-script grammar, DOM references, data integrity, bookmark mutation/undo/failure recovery, commands, weather and wallpaper failure paths, startup source budgets, model lifecycle concurrency, bridge restrictions, calendar rejection/atomicity, and workspace preservation.

Native Chromium tests use a new disposable profile. All mutations are test data. They load the real extension and exercise the service worker, ordinary new tabs, popup reuse, tool panels and close-button geometry, settings/recovery exit, unknown/maths commands, durable notes, real Chrome bookmark moves/undo, tab-group save/restore, Gmail cancellation UI, widget routing, narrow calendar bounds, and demand-loaded AI.

External HTTP is blocked in that suite. Gmail cancellation uses a token-provider stub; it does not prove successful Google authorization. Live wallpaper availability, real email/account behavior, real downloaded documents, microphone access, Spotify, AI model downloads/inference, fullscreen monitor experience and target Mac RAM remain separate gates. Browser screenshots and JSON evidence are retained as GitHub Actions artifacts. A green run proves the tested journeys, not all possible cases.

Memory must be reported precisely: `Performance.getMetrics` provides JS heap, not renderer RSS or GPU memory. No 300 MB per-tab Mac claim is made. Ordinary new tabs load no Operation HQ workspace scripts; the optional AI can still require substantial memory when explicitly loaded.

## Install, preserve data, and rollback

1. Keep the currently installed extension and its data. Export a non-secret backup from its working settings before replacing files; do not uninstall it.
2. Extract the tested release ZIP into a durable folder. In `chrome://extensions`, enable Developer mode and load that unpacked folder. If updating the same unpacked installation, replace its source files and use Reload. The manifest key is unchanged, preserving the extension identity; verify Chrome reports the same extension ID before proceeding with real data.
3. Pin **Operation HQ — Browser Companion**. Its popup opens the website or browser tools. It intentionally does not take over every new tab.
4. If Chrome reports newer incompatible data, keep the existing build and use the preserved backup/source. Do not force a schema downgrade or clear storage.
5. To roll back, restore the prior source into the same unpacked path and reload. Do not uninstall or clear Chrome storage. Keep the same extension key. A prior build may not support newer data; respect its compatibility check.

No new Google secret or Supabase project is needed. The original Chrome OAuth client remains in the manifest. Personal provider keys, if used, are configured locally and are not shipped in the repository.

## Dashboard bridge use

The current hosted dashboard is not changed by this extension-only release. The read-only protocol is ready for reviewed dashboard integration; it is **not** automatic or bidirectional sync. Enable access in the companion popup only in your own browser profile. Calls must originate on the exact dashboard URL and use `chrome.runtime.sendMessage(extensionId, {protocol:1,type:'hq:bridge:status'})`; `hq:bridge:pull` returns a preview; `hq:bridge:open-tool` requires an allowlisted tool name. The caller must show the preview and require an explicit import choice for the signed-in account. No browser-side destructive write endpoint exists.

## Remaining commitments

- Recover unseen 3.0 source if its download is restored; compare feature-by-feature rather than claiming this baseline contains it.
- Add reviewed website bridge UI and test actual extension-to-dashboard import with the signed-in account. Full two-way sync needs an account-bound protocol and event-level conflict/deletion rules.
- Move remaining task/note writers into a shared authority before claiming arbitrary manual multi-workspace edit safety.
- Test Google/Spotify/provider success and all document formats with actual configured accounts/files.
- Measure target Mac renderer/GPU/RAM with no model, with representative data, with multiple ordinary tabs and with the chosen AI model; tune to the measured result.
- Continue existing weekly review and GitHub test gates. Keep dependency/model upgrades reviewed, reversible and evidence-backed.

No honest roadmap completion percentage can be derived from inaccessible 3.0 source and unverified device/provider gates. Report measured test outcomes separately from implemented source and unfinished integration.
