# Operation HQ — source audit and repair, 30 September 2026

## Release status

This is a tested repair of the newest source recoverable from GitHub, **2.8.1**
in `Operation-HQ 2`. It is not the missing 3.0 Browser Power Layer source, and
is not a complete-product release. No user's live bookmarks, email, tabs,
calendar, database or installed extension were changed by these tests.

The source repository had three similarly named directories containing versions
2.4.0, 2.8.1 and 2.7.0. The higher numbered directory was not the newest build.
The separate 3.0 ZIP transfer returned HTTP 502. Deploying a 2.8 repair as if
it were a 3.0 upgrade would risk removing the newer extension/dashboard bridge.
That is a release blocker, not a test to bypass.

## Verified repairs

| Problem | Repair | Evidence |
| --- | --- | --- |
| Tabs could sort concurrently when worker messaging failed or its two-minute lease expired | Pages and background operations use one browser-managed Web Lock; missing coordination stops mutations | Independent VM page instances sharing actual Node Web Locks; unavailable-lock and missing-API cases |
| Empty user folders named Review Queue or Uncategorized could be deleted | Matching names no longer establish ownership; registry-only cleanup | Tests preserve both unregistered names |
| Sort silently renamed or merged emoji-named user roots | Removed the automatic migration call from sorting | Source review; no automatic rename call on the sort path |
| A closed tab or later error could lose undo for earlier moves | Persist each inverse before Chrome receives the move; interrupted work blocks new sorting until recovery | Interrupted operation recovered from a fresh page instance |
| Undo restored folder membership but lost bookmark ordering | Record original sibling index and undo in reverse | Stateful, ordered bookmark-tree tests |
| Failed undo actions were discarded | Keep failed inverse steps for retry | Injected Chrome failure then successful retry |
| Cleanup removed source folders needed by undo | Protect source folder IDs referenced by recovery history | Empty registered source survives cleanup and restores its exact children |
| User moved a bookmark after planning, but sorting still moved it | Re-read bookmark identity and source parent before applying | Stale preview test; later user moves survive undo |
| Model confidence was treated as proof of bookmark topic | A model-only destination stays a suggestion; it must also match independent classifier evidence to auto-move | Source review; model suggestions do not independently authorize a move |
| Background auto-sort had no undo record | Journal and commit automatic moves using the same recovery format | Source review; real Chrome event ordering still needs acceptance |
| Two quick load requests could allocate two local AI engines | Mark loading before any asynchronous work | Simultaneous load regression test |
| Every HQ tab could load a separate large AI model | Hold one browser-wide model lock for the engine lifetime | Two-instance lock and unload tests |
| No way to release model memory without closing the tab | Add Unload Local AI; wait for cancelled generation to settle; unload engine and release lock | Six lifecycle tests; actual WebGPU memory release remains a device test |
| Cancel allowed another generation before the first finished | Keep an in-flight guard separate from the cancellation state | Delayed completion/cancellation test |
| Invalid or mixed chapter ranges could silently drop requested work | Parse complete lists plus ranges; reject oversized/reversed/decimal requests | Exact 5,7,8,10 and mixed-range assertions |
| Invalid ISO dates could roll into a different month | Round-trip validate dates, including leap years | Impossible-date and valid leap-day assertions |
| Commands claimed panels opened before lazy loading completed | Await the central panel router and surface failures; remove timer-based Study OS opening | Delayed loader and failed-panel tests |
| A valid math preview fell through into another command because its handler returned no success value | Return an explicit handled result and serialize routing/confirmation | Full focus-preview result and duplicate confirmation assertions |
| A test expired with the passage of time | Freeze the provenance test's clock | Full verification suite now runs independently of today's date |

Web Locks is designed to coordinate pages and workers sharing an origin:
https://www.w3.org/TR/web-locks/ . The tests use the real Node 24 lock manager
and mutable Chrome API doubles, not inert no-op bookmark mutations. Browser
integration must still be verified in Chrome with the recovered 3.0 source.

## Feature inventory and practical limits

The table describes the 2.8.1 source. The hosted dashboard has a smaller feature
set and must not be mistaken for the extension's full feature inventory.

| Feature family | Existing implementation | Limitation / remaining acceptance |
| --- | --- | --- |
| Bookmarks | Topic taxonomy, title/URL evidence, optional page metadata, exact-page corrections, guarded sorting, undo | Ambiguous content cannot be sorted with guaranteed semantic accuracy; preserve it rather than invent a destination. Chrome UI changes are not transactional with extension calls. |
| Browser workspaces | Save/restore tabs and groups, duplicate/topic suggestions, bookmark cross-references | Must test against real Chrome groups and browser-managed saved groups; do not close the user's tabs to test. |
| Calendar and timetable | Local calendar, recurring/structured entries, repository-level writes and undo, timetable profiles, reviewed plans | Not Google Calendar feature parity or calendar-provider sync. Cross-module integration is not fully browser-tested. |
| Tasks and Today | Local tasks, priorities, context, follow-ups, daily views, planner | Human priority and capacity assumptions remain necessary; not autonomous perfect scheduling. |
| Study and assessments | Assignment steps, explicit document intake, chapter planning, exam countdown, recall cards, research sources | Private files and textbooks require user-granted access; cannot infer a correct Cambridge chapter URL without a saved match. |
| Commands | Deterministic intents, clarification, action previews, optional local-model interpretation | Unknown requests receive a no-match response. This is not an unrestricted assistant; no arbitrary OS execution. |
| Local AI | Explicit model download, selected-source context, summary/explanation/quiz/planning prompts | Existing model profiles are unchanged and not newly benchmarked. Model memory alone can exceed 300 MB. One-model guard prevents duplication; it does not make model weights smaller. |
| Gmail | Read-only OAuth, local priority/category lanes and handoff actions | Real Google sign-in and current account configuration were not tested here. Classification is not a guarantee of urgency or a Gmail-label mutation. |
| Notes and capture | Serialized local note saving, capture and recovery mechanisms | Full multi-tab editing and migration acceptance remains necessary. |
| Appearance | Wallpaper providers, adaptive palettes, cinematic launch/modes, movable living widgets, Cinema, reduced motion | No new video rendering or frame-by-frame browser visual QA in this run. Provider availability and image rights still constrain wallpapers. |
| Weather | Permission-based location and manual fallback, forecast cache/backoff | Depends on browser/OS permission and provider availability. |
| Gleam | Lessons, rehearsals, reflections and real-world practice tracking | Coaching simulations cannot predict real people or guarantee social outcomes. |
| Additional tools | Spotify, timers, sound, ventures, vault, stats, research nudges, mods | Packaged modules exist; presence and static checks are not proof every provider flow works. |
| Dashboard companion | Separately hosted sign-in dashboard with task/notes/calendar/focus and reviewed import | Full schema parity, durable offline editing, conflict-safe deletion and 3.0 bridge acceptance remain open. |

## Testing record

`node scripts/check-extension.mjs` runs eight suites with no package installation:

1. Existing bookmark classification and mutation suite.
2. Twelve added bookmark safety scenarios using an ordered mutable tree.
3. Six added AI model lifecycle scenarios.
4. Command intelligence, exact chapter parsing and delayed panel routing.
5. Context/calendar authority, credentials, planner and lifecycle integrity.
6. Startup source budget and demand-loaded vendor checks.
7. Browser-classic JavaScript parsing and module behavior simulations.
8. Packaged references, DOM contracts, accessibility labels and feature checks.

Some existing tests inspect source strings. Their success is not equivalent to
rendering every screen or completing every user journey. No Chrome binary or
real Mac/GPU browser session was available in this environment. No claim of
zero visual bugs, successful OAuth, 300 MB per tab, or 100% roadmap completion
is supported by these results.

## Remaining release gates, in order

1. Recover the actual 3.0 source and reconcile these repairs. Preserve the
   dashboard bridge, manifest identity, current storage and existing features.
2. In a disposable Chrome profile, test bookmark sort/undo, simultaneous tabs,
   interrupted operations, real background events, migration and round-trip
   dashboard imports. Import a copy of user data; do not mutate the original.
3. Measure process and GPU memory on the user's Mac: one/five/ten idle tabs,
   active animations, hidden tabs, AI load/unload and warm/cold starts. Track
   renderer/private memory separately from disk cache and download size.
4. Run visual/keyboard acceptance at narrow, normal and wide viewport sizes,
   including Safe Mode exit, close controls, settings, blocked providers and
   reduced motion. Test sign-in with the user's existing configuration.
5. Reconcile the roadmap feature-by-feature against implemented and accepted
   behavior. No honest completion percentage exists until that denominator
   and acceptance record are established.

## GitHub and Supabase decision

The existing GitHub repository is the correct place to preserve these repairs.
The added workflow checks code; it does not deploy, move user data, request
secrets, install AI models, or commit new code. Actions are pinned to retrieved
commit SHAs and have read-only repository permission. Weekly scheduled execution
requires the workflow to be merged into the default branch.

No Operation HQ Supabase project existed in the connected account. The dashboard
already uses D1. Creating another database now would add a second source of truth
without fixing bookmark or RAM bugs, so no Supabase project, schema, billable
resource or migration was created. Revisit only with a concrete cross-device data
contract, row-level access tests and a migration/rollback plan.

## Safe evolution policy

Regular checks should report regressions and propose reviewed changes. Dependency
and model upgrades need pinned versions, task-specific evaluation, memory
measurements and rollback. The application must not silently rewrite itself,
broaden permissions or install a larger model because a newer one exists.
The existing weekly Operation HQ review remains the ongoing review mechanism.
