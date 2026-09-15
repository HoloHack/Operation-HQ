# Operation HQ 2.8.1 — Stability Pass Review

## Resolved in 2.8.1

- **Gmail console failures:** the `Illegal return statement` was a real browser parse failure caused by a stray top-level return. It is now inside the Gmail error-diagnosis method, so the module defines normally and no longer triggers the dependent `Gmail is not defined` error.
- **Browser-runtime test gap:** a new suite parses every classic extension script with browser semantics, loads Gmail in a minimal browser-like context and exercises the reported provider/focus paths. This closes the blind spot created by Node's CommonJS wrapper.
- **Bookmark correctness:** the sorter no longer invents a catch-all destination. Only high-confidence, taxonomy-valid evidence moves a link; uncertain items remain exactly where they were and can receive an exact learned decision through the accuracy gate. Locks, result-aware writes and exact undo protect the tree.
- **Startup cost:** the declared core is 28 scripts and 365,510 source bytes, down 27.1% from the prior 43-script/501,347-byte core. Large editors, charts, integrations and local models stay demand-loaded, and a hidden tab releases the compositor's screen-sized drawing buffer.
- **Exact Maths workflow:** non-contiguous chapters such as 5, 7, 8 and 10 are preserved as four chapters. Focus can start even if no timetable profile or flexible block exists; schedule changes still require a separate reviewed Apply.
- **Wallpaper and Weather:** wallpaper decoding accepts true 4K-class ultrawides, retries several candidates/pages, keeps cache/last-good/gradient recovery and may use configured alternate providers only for suitable categories. Weather refreshes are shared, backed off after failure and reported as readable status instead of raw DOM exceptions.
- **Panel accessibility and layout:** focus is returned or blurred before a panel becomes hidden/inert. The rule now covers feature flyouts, Settings, the command palette, reports and credential dialogs; close controls remain inside the panel header.
- **Verification:** browser runtime, command intelligence, bookmark mutation, startup budget, static verification and integrity suites all pass. The verifier reports 71 JavaScript modules, 720 unique IDs and 26 named dialogs.

## Supplied audit reconciliation

| Finding | Resolution in this build |
|---|---|
| User folders removed | Cleanup is limited to an ownership registry and revalidates the empty live path before deletion. |
| Invalid learned bookmark path | Learned and executable destinations must match the fixed taxonomy; operational and arbitrary paths are rejected. |
| Overlapping bookmark actions | An in-page guard plus a service-worker lease serializes tree mutations across new tabs. |
| Unhandled bookmark failure | Chrome API failures are recorded as failures and never added to the undo stack. |
| Missing mutation tests | The executable mutable-tree suite covers ownership, invalid paths, overlap, failure and exact undo. |
| Shared context lost updates | The service worker is the serialized context authority with typed patches and revisions. |
| Calendar snapshot overwrite | Event-level repository transactions and exact inverses preserve unrelated later changes. |
| Night plan written to today | Tomorrow is prepared separately and promoted only after local date rollover. |
| Mobile Calendar clipping | Month view retains seven in-bounds columns and dense week content scrolls intentionally. |
| Persistent plaintext keys | Provider secrets migrate to session storage and legacy persistent copies are removed. |
| Every module eager at startup | Two HTML entry scripts bootstrap a 28-script core; optional modules and vendors load on first use. |

These fixes are verified in the packaged test harness. They are not a substitute for the real-Chrome gates below.

## Resolved in 2.8

- **Safe Mode:** the recording's blocked dashboard was a real false-positive caused by two new tabs sharing one incomplete-boot marker. Recovery detection is now tab-local, with visible exit and diagnostics controls.
- **Wallpaper reliability:** anime and every other channel now use multiple exact, alias, curated and broad result pools, multiple pages, up to six decoded candidates and last-known-good retention. A provider outage or empty third-party result can still occur, but it no longer destroys the current wallpaper or stops recovery attempts early.
- **Cinematic study schemes:** a named focus mission produces three new choices rather than selecting a hidden preset. Palette, surface, geometry, subject treatment and prism, iris, velocity or bloom transition choreography change together only after confirmation.
- **Command intelligence:** Nexus can collect missing details, search the person's own saved resources, preview multi-day focus plans, start a named focus session, route browser review and use an explicitly loaded on-device model for guided explanation, quiz or work checking.
- **Calendar and timetable:** the active Master Timetable is a live Calendar layer in Month, Week, Agenda, selected-day and next-event views; flexible blocks power review-first chapter planning.
- **Bookmarks:** rules now distinguish Mathematics, Science, interdisciplinary STEM and other topic branches; Deep Review can add page metadata and optional local-model evidence without letting a platform domain decide the subject.
- **Interaction quality:** widget geometry is cached, only the active card receives pointer depth, low sustained frame rate steps rendering down, controls remain above effects, close buttons stay inside their panels, and common fields have consistent breathing room.
- **Verification:** 71 packaged JavaScript modules parse; 720 static IDs are unique; 26 dialogs remain named and safely closed initially; browser-runtime, command-intelligence, bookmark, startup-budget, static and integrity suites pass.

## Manual release gates still open

- Load the unpacked extension in the target Chrome profile and test 1920×1080, 200% zoom, keyboard-only, Reduced Motion and several simultaneous new tabs.
- Exercise real Wallhaven responses across each channel; provider availability and catalogue relevance cannot be proven by an offline or simulated test.
- Exercise Gmail reconnect/revoke and the optional local WebGPU models on the actual device. The extension does not inherit ChatGPT plugins or cloud accounts.
- Judge generated palettes and transition pacing on the intended monitor. Automated checks can prove containment, fallbacks and reduced-motion parity, but not subjective visual taste.

## Release outcome

This build adds a native adaptive visual compositor and provenance-grounded local intelligence without weakening the reliability work delivered in 2.6. The procedural field responds to factual UI state, uses measured runtime performance to govern its own cost, pauses in hidden tabs, clears every rendered frame, fails back to CSS, and never intercepts input. Native Intelligence reads only the local sources the user checks and only after an explicit assembly click; evidence is labelled and output remains advisory. It adds no permission, OAuth scope, account, passive monitoring, Gmail write access, scraping, remote AI call, or cloud data flow. The standard, concurrency/integrity, and bookmark-tree suites pass; a real Chrome/device visual gate remains open because this runner has no browser executable.

## Resolved in 2.7

- **Procedural depth:** one pointer-transparent WebGL2 canvas composes local noise, ribbons, horizon light, a focus grid, widget-node topology, and bounded interaction pulses behind the readability scrim.
- **Factual adaptation:** time energy, focus/deep-work state, visible attention states, and sampled wallpaper colours affect the field. No emotion, intent, personality, or fabricated activity is inferred.
- **Runtime governance:** Auto selects from device capability and data-saving state; three-second measured FPS windows lower or cautiously restore internal resolution. Ultra, Balanced, Efficient, and Off remain manual choices.
- **Lifecycle safety:** the compositor pauses when the page is hidden, clears its frame buffer before every draw, recovers from Off or a later reduced-motion change, reports context loss, and leaves the CSS motion layer usable when WebGL2 fails.
- **Widget physicality:** drift uses independent CSS variables and is suppressed during arrangement or reduced motion. Buttons, links, inputs, and selects remain above all decorative layers with explicit pointer authority.
- **Launch composition:** volumetric beams, segmented aperture geometry, and subsystem labels extend the existing launch sequence without changing its real progress, skip, compact, off, failsafe, or accessibility contracts.
- **Private intelligence:** source checkboxes default to operational data only; Notes, Captures, and Gmail metadata are opt-in. Evidence lines carry stable collection labels and context size is bounded before local generation.
- **Useful operations:** executive brief, priority ordering, schedule draft, risk scan, study sprint, and cross-source connection prompts distinguish evidence from inference and never claim to apply changes.
- **Review evidence:** 69 JavaScript modules parse; 693 IDs are unique; all 26 panels retain accessible dialog contracts; the document tag stack is balanced; standard, integrity, and bookmark suites pass.
- **No authority expansion:** schema v10 stores only compositor quality/adaptation choices. There is no new permission, OAuth scope, email write path, network service, passive listener, or persisted interaction history.

## Retained and reverified from 2.6

### Resolved in 2.6

- **Bookmark accuracy:** expanded curated evidence routes coding, study, design, business, reading, entertainment, social, finance, gaming, productivity, travel, and tool content without creating one folder per site. Unknown or conflicting content remains explicit.
- **Correction loop:** Preview exposes the destination distribution and Review Board; Deep Review reads permitted page metadata in bounded batches; File + learn records a content-specific correction.
- **Fingerprint integrity:** YouTube video IDs and Google document IDs are part of learned fingerprints. One video/document correction cannot become a platform-wide rule.
- **Taxonomy safety:** learned and executable paths must match the fixed one- or two-level vocabulary. Inbox, Review Queue, arbitrary user folders, and deeper paths cannot become learned rules.
- **Folder ownership:** only newly created folders enter the managed registry. Cleanup revalidates the live path and emptiness before removing a registered folder; unregistered folders are never touched.
- **Transaction safety:** one local guard plus a service-worker lease blocks overlapping actions across different new-tab pages. Buttons reflect the busy state, failures are not logged as undoable, and each operation keeps a separate bounded inverse transaction.
- **Exact undo:** only bookmarks still at the transaction destination are restored. A later manual re-file wins, missing personal hierarchies are not invented, and managed/Inbox sources are recreated only through validated paths.
- **Chrome-root safety:** Full Sort is scoped to the Bookmark Bar and cannot pull items from Other Bookmarks or mobile roots.
- **Visible launch:** the boot layer follows actual bootstrap milestones, stays visible for the selected minimum choreography, has an explicit skip, and cannot permanently cover the page if startup stalls.
- **Widget ergonomics:** shared spatial tokens, per-instrument gutters, stable header/footer rhythm, topmost interactive children, larger launch controls, focus-within response, contact waves, and three density modes improve both appearance and hit reliability.
- **Review evidence:** all 67 JavaScript modules parse; 686 IDs remain unique; 26 dialogs remain named/inert; the standard verifier, concurrency/integrity suite, and in-memory bookmark mutation suite pass.

## Retained and reverified from 2.5

- **Context integrity:** extension pages send typed context operations to the service worker. The authority re-reads the latest state, serializes commits, increments a revision, and notifies subscribers after persistence.
- **Calendar integrity:** every writer uses one repository. Structured occurrences and plain entries receive stable IDs, concurrent operations are serialized, and undo applies an exact inverse rather than restoring a stale object.
- **Responsive Calendar:** the narrow month view keeps seven fluid columns inside the flyout; compact cells expose useful counts, controls reflow, and the dense week view uses deliberate contained scrolling.
- **Correct planning date:** the nightly alarm constructs tomorrow explicitly. Tomorrow's schedule weekday and calendar date are used, the result is stored separately, and promotion occurs only after local rollover.
- **Credential boundary:** Claude, ElevenLabs, Wallhaven, Unsplash, Pexels, and Spotify credentials use `chrome.storage.session`; prior local copies are migrated once and removed. Session-only behavior is stated beside the controls.
- **Startup isolation:** the HTML now declares only early diagnostics and one bootstrap instead of more than 50 feature scripts. A recoverable core manifest attempts every definition independently; panel-only systems load on first use, and failed optional loads are removable and retryable.
- **Polling discipline:** one visibility-aware scheduler drives the clock and passive time refreshes. Storage-backed views subscribe to storage changes; focus timing remains the only active user timer.
- **Cinematic response:** widget state transitions emit source-positioned waves and a short system recomposition pulse. The ambient field follows time/weather/focus context while the sampled wallpaper palette remains primary.
- **Migration safety:** schema v9 initializes revision/sidecar metadata and retires historical whole-snapshot undo records while preserving user calendar, task, note, schedule, and integration data.
- **Review evidence:** the standard verifier passes 30 product sections and all 67 packaged JavaScript modules. The separate integrity suite executes race, exact undo, secret migration, tomorrow promotion, two-script bootstrap/lazy-start, mobile containment, and reduced-motion checks.

## Retained and reverified from 2.4

### Resolved in 2.4

- **Main interaction root cause:** a later cinematic CSS block overrode `#app` from stack level 3 to 1 while the full-screen scrim remained at 2. The app is restored to 3, and all ambient layers are explicitly pointer-transparent.
- **Reliable routes:** widget launches no longer click hidden dock proxies. One guarded asynchronous panel router validates the target, lazy-starts it, opens it, restores focus, and records a precise missing-route diagnostic.
- **Wallpaper recovery:** long exact scene searches now widen through selected, curated, broad toplist, and broad relevance tiers. Empty results no longer terminate the chain.
- **Network failure discipline:** the provider gets a usable 12-second boundary; network, timeout, authorization, rate-limit, and server failures stop redundant retries and preserve the last working image.
- **Quality preserved:** the API admits 3840×1440 to include 5120×1440 ultrawides, but metadata and decoded-image checks still require 3840×2160 or 5120×1440. SFW exclusions, landscape ratios, history, cache, and blocklist remain active.
- **Collision-safe personalization:** persisted drag/arrow arrangement is limited to compatible size zones. The Foresight hero stays stable, Weather/Focus may exchange their top slots, lower widgets share equal slots, and DOM order follows visual order.
- **Layout repairs:** explicit slot maps remove the existing Schedule/Assessment and Focus-layout overlaps at desktop/tablet widths; visibility settings retain precedence.
- **Input and motion polish:** module fields use comfortable padding and placeholders; time, actual weather, and active focus tune the cinematic attitude; duplicate motion initialization is guarded; reduced motion remains authoritative.
- **Stale-build diagnosis:** System Health displays the manifest version and copied diagnostics include it, making it possible to distinguish the current package from an old unpacked folder.
- **Supplied-console triage:** the listed preload warnings identify unrelated website origins and are not emitted by this extension. No packaged file contains an illegal top-level `return`; all current scripts parse. If an old `newtab.html:0` record remains, confirm System Health says `2.6.0 · Cinematic Intelligence`, clear saved diagnostics, then reproduce once to capture the current source and line.
- **Review evidence:** 67 JavaScript modules parse, 674 IDs are unique, 26 dialogs are named/inert, and wallpaper fallback, staged recovery, routing, arrangement normalization, CSS balance, responsive behavior, storage migrations, security boundaries, and accessibility contracts pass.

## Retained and reverified from 2.3

## Resolved in 2.3

- **One study command surface:** Command, Assignments, Research, and Revision views share the existing assignment, task, exam, calendar, timetable, and recall stores rather than duplicating truth.
- **Defensible next action:** the recommendation ranks unfinished assignment steps using explicit due-date, priority, and completion evidence; the launch preview states exactly what will change.
- **Focus integrity:** a mission reuses or creates one linked Task and sets current focus. A running timer is preserved, and Deep Work is never changed without a separate user action.
- **Assignment depth:** manual work supports type, weight, requirements, editable details, phase-based steps, progress, Task promotion, next-step launch, timetable-capacity planning, and delete undo. Imported assessment identity stays locked after review.
- **Research provenance:** explicit page/selection capture retains only safe URL/title and deliberate notes. The pipeline adds source type, author/date, subject, assignment link, stages, search, filters, export, notes and editable citation drafts without scraping or pretending metadata is verified.
- **Recall integrity:** Recall Lab starts empty, applies SM-2 with lapse history, supports suspension, deck/session limits, tags, search, edit, import/export and delete undo, and prevents same-session retries from inflating scheduled-review evidence.
- **Exam clarity:** reverse plans expose learned versus fallback capacity, day-level allocations, load warnings, and the user-set hour target. “Add today” creates one deduplicated Task and does not alter the timer.
- **Recovery:** assignment, research-source, recall-card, and exam-plan deletion all retain one local undo record. Context menus are rebuilt atomically during install/update.
- **Review evidence:** 64 JavaScript modules parse; 670 IDs are unique; 26 dialogs remain named and inert when closed; responsive and reduced-motion contracts remain intact.

## Retained and reverified from 2.2

## Resolved in 2.2

- **Notes root cause removed:** the rich editor and capture surfaces no longer write competing keys and merge storage events. One canonical document is serialized to storage and the old HTML/plain keys are derived mirrors only.
- **Recovery without data gambling:** exact whole-document triplication is repaired once, the original is retained locally, and a visible restore control remains until used. Non-exact repetition is untouched.
- **Notes product depth:** save state, word count, search, local export, captured-item disclosure, bespoke writing surface, formatting states and fallback editor are integrated into the same document.
- **Calendar product depth:** month, week and agenda routes share one model; quick text creates deterministic events; structured editing covers time, category, priority, location, notes and bounded recurrence.
- **Calendar clarity:** selected-day context, today/next/conflict signals, coloured event rails, responsive reflow and an explicit local reminder boundary reduce the time needed to understand the schedule.
- **Continuity:** rich events are materialized into the established date/string map, so Today, Assignments, Gmail and Schedule keep working. Existing plain calendar strings remain editable rather than being deleted or guessed into metadata.
- **Reversibility:** quick-add, edit and delete write a complete single-step local rollback snapshot. No browser prompt or silent destructive path remains.
- **Universal depth:** standard flyouts receive one accessible runtime expand control. Full view uses the existing module and store, Escape first returns to mini, and reduced-motion removes the expansion choreography.
- **Core capture quality:** Task creation now exposes action, venture, priority, due date and estimate together; Schedule profile add/rename uses one inline editor. Both replace context-poor native prompts.
- **Review fixes:** reminders are independent of search filters, long-event overlap detection checks every collision pair, repeat materialization is capped, and responsive Calendar/editor layouts avoid desktop assumptions.

## Retained and reverified from 2.1

## Resolved in 2.1

- **Complete operating loop:** Learn explains one observable communication move; Simulate tests it in branching situations; Missions transfer it to real life; Evidence records what was actually practised.
- **Curriculum depth:** six tracks contain 18 original lessons and 18 field missions. Repair, feedback, fair negotiation, uncertainty, boundaries, presentations, listening, conversation flow, and group coordination are explicitly covered.
- **Honest measurement:** lesson and simulation records are practice sessions. Only a completed field mission with a factual reflection counts as a real rep. Cue scores do not diagnose confidence, rank worth, or predict reactions.
- **Adaptive without pretending:** the daily field mission favours the least-practised selected track, respects the chosen pressure level, avoids the last three completed missions when alternatives exist, and discloses exactly why it was selected.
- **Practice safety:** all built-in scenarios are age-appropriate school, work, sport, presentation, and everyday-conversation situations. The optional local coach is instructed not to teach manipulation, coercion, deception, status games, romantic tactics, or scripted domination.
- **Privacy architecture:** Gleam makes no network request, asks for no account or capability, and reads no microphone, camera, contact, email, tab, or browsing data. Only deliberately entered module data is stored locally.
- **Loss and corruption resistance:** active reflections persist locally while typed, replacing an active mission requires confirmation, histories are bounded, malformed records are filtered, stored rehearsal maps are rebuilt from clean fields, and failed lazy initialization remains retryable.
- **Accessible cinematic interface:** a distinct full-screen shell includes seven keyboard-navigable views, named controls, visible status regions, mobile reflow, non-generic inputs, and a reduced-motion path that removes continuous movement without removing state.
- **Functional verification:** automated tests now execute the branching state machine and reflected field-mission completion path in addition to checking curriculum structure, adaptive selection, schema repair, privacy boundaries, DOM contracts, and CSS structure.

## Retained and reverified from 2.0

## Resolved in 2.0

- **Honest download boundary:** download history is disconnected by default and requested only from Assessment Intake. The extension persists only download ID, basename, status, size and date; it never stores a download URL or referrer.
- **Explicit content access:** file bodies are read only after direct import or a separately granted folder handle. Derived fields persist locally, while source text is capped and held only in the active tab session.
- **Actionable assessment decoding:** PDF, DOCX, TXT, Markdown, HTML and RTF readers feed deterministic deadline evidence, subject/type classification, requirements, a description and a bounded multi-step plan. Unsupported PDF encodings fail visibly instead of producing false text.
- **Reviewed consequences:** nothing enters Assignments or Calendar until Accept. Accepted fields lock against drift; Undo Intake removes the exact Assignment/deadline while preserving already-created or completed action tasks.
- **Capacity intelligence:** each brief reports nearby deadline collisions and compares estimated work with genuine flexible timetable capacity. Planning still requires review and Apply.
- **Fast execution:** Add all steps deduplicates action tasks. Start next step selects the first unfinished step, sets the current focus task and launches the existing Pomodoro through an explicit click.
- **Native Intelligence Lab:** the lazy WebGPU model now supports action extraction, summary, explanation, self-test, plan critique, clarity rewriting, cancellation and source-grounded assessment refinement. It cannot alter a deterministic deadline.
- **Stage review fixes:** reconciled download metadata with later real-file access, prevented accepted Calendar/Assignment drift, and captured Assessment Radar click context before asynchronous lazy initialization.

## Retained and reverified from 1.9

## Resolved in 1.9

- **Cinematic without runaway load:** decorative field layers, widget depth, scanners, orbit systems, boot choreography, and state transitions share one tokenized motion system. Auto mode degrades for reduced motion, data saving, low memory, or fewer CPU cores; hidden tabs pause the field.
- **Accessible motion control:** Cinematic, Balanced, Calm, and Auto profiles are explicit. Reduced motion keeps meaningful state changes while eliminating continuous movement and pointer depth.
- **Explainable Nexus:** live context telemetry reports mode, workload, timeline, and authority; command matching shows the selected capability, scope, and confirmation contract; suggestions are keyboard navigable and safely rendered.
- **No fictional agent powers:** commands remain deterministic local capabilities or official-app handoffs. Microphone access remains push-to-talk only where already supported; no passive listening, message scraping, or fake autonomous action was added.
- **Assignment operating loop:** genuine deadlines, estimates, priorities, completion, and task promotion are stored locally. Session proposals use only flexible Master Timetable blocks, avoid known calendar conflicts, require review, and retain whole-plan undo.
- **Unified workload:** the same assignment records feed Today, tomorrow, remaining counts, and HQ Foresight instead of becoming another disconnected dashboard silo.
- **Workspace hygiene:** health checks identify stale, invalid, and duplicate saved references; metadata refresh re-reads live bookmarks; deduplication changes only the saved snapshot and discloses that boundary before confirmation.
- **Stage review fixes:** repaired assignment date rendering, gave the dynamic assignment signal an accessible name, and prevented the ambient stacking layer from changing the dock or quote positioning model.

## Retained and reverified from 1.8

## Resolved in 1.8

- **Gmail organiser:** deterministic local lanes for Urgent, School, Work, Venture, Social, Finance, Updates, and Personal; a visible priority reason; per-thread corrections; metadata-only caching; task, calendar, follow-up, and official-platform handoffs.
- **No fake folders:** Gmail categories are virtual local views. The extension does not claim to create or move Gmail labels because it intentionally lacks write access.
- **Timetable integration:** the supplied v8 phases and weekly rhythm are represented in a dedicated profile. Existing profiles remain intact; manually refreshing the managed profile warns before replacing edits.
- **Reviewed planning:** open tasks are scored from explicit priority, deadline, age, and current timetable phase, then fitted into flexible schedule blocks. Nothing reaches the calendar until Apply; the whole application can be undone.
- **Bookmark certainty:** every link receives topic evidence before platform defaults. Exact URL fingerprints retain manual corrections; variable-platform domains cannot poison future links; low-confidence items remain in place for an explicit accuracy-gate decision.
- **Workspace continuity:** saved-only tabs survive Safe Sync, duplicates normalize tracking fragments, pinned/group state restores in a separate window, bookmark creation re-checks the live tree, and group changes require preview and confirmation.
- **Wallpaper specificity:** anime and every general category now expose named, SFW, landscape, ranked 4K channels while retaining decode validation, cached recovery, adaptive contrast, and the blocklist.
- **Permission diff:** `tabGroups` was added for explicit group capture/restore. `history` remains absent and Gmail remains `gmail.readonly`.

## Retained and reverified from 1.7

## Resolved in 1.7

- **Living shell:** Foresight, Weather, Focus, Schedule, Gmail, and Habits have separate layouts, motion signatures, state models, empty states, and direct routes to their full modules.
- **Context response:** time-of-day, weather code, timer/deep-work state, schedule progress, Gmail unread metadata, task priority, and habit progress alter widget copy, colour, motion, emphasis, or layout.
- **Fast clear:** Cinema mode hides the complete interface through one control or `Alt+Z`, retains a clear restore path, and respects reduced motion.
- **Personalisation:** Living, Focus, and Expanded layouts are available, with independent persistent visibility for every widget.
- **Field design:** flyout inputs share accessibility behaviour but inherit module colours and different silhouettes instead of one generic textbox skin.
- **Anime wallpaper direction:** named character/scene channels use SFW-only, top-ranked landscape queries, a decoded 4K-class minimum, blocklisting, and broadening fallback without bundling or redistributing wallpaper files.
- **Date correctness:** user-facing day keys now use local calendar dates instead of UTC, preventing early Australian hours from appearing under the previous day.
- **No new authority:** no permission, OAuth scope, write access, background account action, or dummy content was added.

## Retained and reverified from 1.6

- **Automatic location root cause:** `geolocation` was missing from the extension manifest. It is now declared; Weather tries on startup, periodically refreshes automatic coordinates, shows the real browser permission state, and provides Chrome/macOS recovery guidance.
- **Weather modularity:** automatic/manual location, Celsius/Fahrenheit, refresh cadence, city autocomplete, cached forecast recovery, and privacy messaging are controlled in one dedicated Weather panel.
- **Confirmed Gmail 403:** the supplied screen states the app is in Testing and only developer-approved testers can connect. Code cannot approve a Cloud account; the extension now recognizes this error and links to the project’s Audience page. The remaining owner action is adding `shourya.education2023@gmail.com` as a test user.
- **Content-aware bookmarks:** multi-topic platforms are evaluated from title and optional page metadata before domain defaults. Ambiguous YouTube/Docs/Notion links wait for review; they are not mislabeled as Entertainment or grouped into hostname folders.
- **Safe bookmark structure:** ten roots remain fixed, subfolders remain curated, arbitrary same-site clustering is disabled, preview/apply/deep-review/undo are preserved, deleted empty source paths are recreated during undo, and an audit log is capped at 30 entries.
- **Wallpaper quality and harmony:** Wallhaven admits candidates from 3840×1440 so genuine 5120×1440 ultrawides are not excluded; metadata and decoded images must still pass the 3840×2160-or-5120×1440 quality gate. Pixel sampling chooses an accent and readable scrim strength, with stored per-category palettes and an explicit manual override.
- **Quote repair:** icon and curly-glyph duplication was removed. Quote and attribution now use semantic elements and independent controlled typography.
- **Foresight:** Today scores genuine unfinished tasks from explicit signals, explains the choice, launches a 25-minute focus action, supports completion with undo, and shows unfinished, remaining, and tomorrow data without generated placeholders.
- **Cinematic states:** Deep Work, Privacy, Professional, Lockdown, Zen, and themes each have a distinct transition signature; all transitions are non-blocking and respect reduced motion.
- **Local-date correctness:** Today and tomorrow keys no longer rely on UTC dates, and alternate schedules now evaluate the date being displayed rather than always using the current day.

- **OAuth identity lock:** the supplied Google Client ID matches the manifest. Automated verification derives and locks the manifest’s Chrome extension ID as `cbgepkbfmcahdpahipkdeahppfbggjok`, the required Google Console Item ID.
- **Unified Today:** Now/Later/Waiting combine actual schedule, timer, tracked task, calendar, tasks, daily essentials, follow-ups, and interruptions without manufactured content.
- **Capture with undo:** text can be deliberately routed into Tasks, Notes, Follow-ups, or today’s Calendar. Every path retains a local rollback action.
- **Communication follow-ups:** real Gmail metadata can be marked locally for follow-up without expanding beyond the existing `gmail.readonly` scope.
- **Focus scenes:** Study, Build, and Reset previews coordinate wallpaper, accent, timer duration, and Deep Work behaviour. The previous state is persisted and can be restored after reload.
- **Focus continuity:** timer start, pause, reset, completion, scene events, and parked interruptions are held in a bounded local daily timeline.
- **Interaction fixes:** Gmail Follow-up keyboard activation no longer opens the thread accidentally; timestamps survive row refresh; async scene/capture failures surface without becoming unhandled rejections.

- **Gmail communication view:** server-side query search, four useful Gmail filters, forward/back pagination, and a bounded six-hour metadata cache. Only sender, subject, timestamp, labels, and thread ID are requested or cached; disconnect clears the cache.
- **Named workspaces:** current-window web tabs can be saved locally, updated, deleted with confirmation, and restored into a separate window with pinned state. Internal Chrome pages are excluded because they cannot be reliably restored by extensions.
- **Tab intelligence:** normalized-URL duplicate detection joins the existing inactive-tab review. No tab is closed, and suspension still requires explicit checkbox selection.
- **Integration truth:** the health view reads only local configuration and clearly labels saved OAuth state as needing live verification. The permission ledger displays Chrome’s current API and origin grants.
- **Nexus discoverability:** recognized commands are kept in a five-item local recent list that can be cleared immediately; workspace requests route to Browser Tools.
- **Performance:** Chrome tab enumeration and workspace initialization now run only when Browser Tools is opened.
- **Migration:** schema v3 creates honest empty workspace/history collections and rejects malformed Gmail cache structures without replacing valid prior data.

- **Anonymous page-level error:** the large WebLLM ES module no longer executes on every new tab. It is dynamically loaded only after an explicit Local AI action, isolating its module/WebGPU path from the primary dashboard.
- **Crash evidence and recovery:** an early script captures window errors and unhandled promise rejections before feature code runs. Three repeated incomplete boots activate Safe Mode; saved reports are redacted, capped, copyable, and clearable.
- **Storage compatibility:** schema v2 migrations preserve valid saved data and repair only missing or malformed structures and bounded settings.
- **Startup budget:** Gmail, Spotify, Notes, Weekly Stats, Venture Dashboard, and Idea Radar initialize on first use. Failures are contained and retryable.
- **Background resilience:** every asynchronous Chrome service-worker event is wrapped so rejected API operations are logged without leaking unhandled rejections.
- **Network resilience:** key external requests now have finite timeout boundaries, including Gmail, Spotify, weather, holidays, webhooks, wallpapers, bookmarks, Claude, and ElevenLabs.
- **Shell hierarchy:** the main dock exposes Nexus, Focus, Gmail, Notes, and Calendar; secondary tools live in an animated, keyboard-dismissible launchpad and remain command-palette searchable.
- **Nexus execution safety:** capabilities are registered centrally. Focus-duration and Deep Work changes show a dry-run plan and require confirmation; unsupported messaging services open their official destination instead of pretending to read or reply.
- **Honest onboarding:** schedules no longer silently load a prepared personal profile. A new user explicitly chooses a blank schedule or imports the prepared one.

- **Wallpaper root cause:** the old image layer used a negative stack level behind an opaque `body`, so provider requests and thumbnails could succeed while the main image stayed invisible. The release places the wallpaper, visual overlays, and application in one explicit stacking context.
- **Wallpaper render contract:** a candidate is preloaded and decoded before becoming visible. Stale requests cannot replace a newer selection, failed hosts preserve the last working background, and forced refresh paints cached/offline/gradient content immediately.
- **Wallpaper controls:** custom HTTPS lists can now be entered and saved; the editor appears only for the custom category. Rotation alarms update as soon as interval settings change. A live status explains loading, cached, success, and recovery states.
- **Wallpaper content controls:** every Wallhaven-backed query and fallback carries the same exclusion terms. A persistent, capped local blocklist prevents a hidden result from being selected again, including cached and custom images.
- **Hero hierarchy:** the greeting is back in normal flex flow and can no longer collide with the clock. Date/weather spacing, dock overflow, quote position, and wallpaper controls were rebalanced for desktop and narrow windows.
- **Failure isolation:** each dashboard module boots independently. One broken integration no longer prevents wallpaper, clock, tasks, or later modules from starting; Settings exposes a copyable system-health summary.
- **Control discoverability:** icon-only top-bar controls now expose fast visual labels, toolbar semantics, accessible names, and clear toggle state. Settings tabs support Arrow, Home, and End keys.
- **Motion quality:** clock, greeting, core panels, flyouts, settings, dialogs, dock controls, and progress indicators use restrained entrance and state transitions. Reduced-motion preferences disable them.
- **Keyboard and assistive technology:** flyouts, Settings, the command palette, and sensitive dialogs use dialog semantics, inert hidden states, focus trapping, Escape handling, focus restoration, accessible icon names, toggle state, and progress state.
- **Mobile behavior:** panels and controls reflow below 900px and 640px; the dock scrolls horizontally instead of overflowing.
- **Permission timing:** notification permission is requested only after starting the focus timer.
- **Rendering safety:** user and service data is escaped before HTML/attribute insertion in the audited task, venture, schedule, bookmark, Gmail, SRS, calendar, Spotify, exam, and idea-vault paths. Bookmark status messages now use text nodes.
- **Zen behavior:** Zen mode now also suppresses the quote, wallpaper suggestions, and wallpaper safety control so it delivers a true wallpaper-only state.
- **OAuth restraint:** Gmail remains `gmail.readonly`; Drive, profile, contacts, and full-account scopes were not added.

## Automated verification

`node tests/verify.mjs` validates:

- manifest parsing, Manifest V3, the new-tab override, and Gmail scope boundaries;
- unique element IDs, packaged asset references, and absence of inline event handlers;
- dialog names and safe initial focus state;
- syntax for all 69 JavaScript and module files;
- 693 unique IDs, accessible form controls, and 26 named inert dialogs;
- deterministic OAuth extension-ID and exact Client-ID contracts;
- literal DOM-reference resolution with seven explicitly runtime-created controls;
- early diagnostics order, lazy WebLLM loading, background rejection guards, and network timeout contracts;
- schema migration behavior against preserved and malformed test data;
- canonical Notes append, exact-triplication recovery, compatibility mirrors and centralized writer behavior;
- Calendar quick-entry parsing, recurrence materialization, structured editor/reminder/undo surfaces and removal of browser prompts;
- universal mini/full module-depth controls, Escape demotion and reduced-motion coverage;
- progressive dock, Nexus dry-run, safe handoff, and schedule first-run contracts;
- balanced CSS plus focus, responsive, and reduced-motion coverage;
- 4K/5K-ultrawide wallpaper gating, adaptive-palette contract, staged query recovery, image rendering, request-race protection, cached recovery during provider failure, exclusions, blocklist filtering, and persistence;
- content-variable bookmark simulations proving AI YouTube content routes to AI Tools and ambiguous YouTube content waits for review;
- distinct transition signatures plus reduced-motion behavior, Today foresight, tomorrow data, and declared geolocation permission;
- explainable Gmail topic/priority classification, category correction, and reviewed local actions;
- Master Timetable v8 phase mapping, task-plan preview/apply/undo, topic-first bookmark rules, workspace group continuity, and named non-anime wallpaper scenes;
- adaptive motion performance gates, Nexus command traces/suggestions, local assignment planning, Today/Foresight assignment projection, and non-destructive workspace hygiene;
- optional assessment metadata/content permission boundaries, deterministic brief extraction, task/calendar undo, workload signals, Assessment Radar and cancellable local-AI operations;
- Gleam curriculum breadth, adaptive mission selection, cue analysis, corrupted-state recovery, branching completion, reflected field-rep completion, privacy, lazy loading, responsive UI and reduced-motion contracts;
- key output-escaping and permission-timing regressions.

The suite also verifies centralized widget/dock panel routing, foreground/ambient stacking safety, size-zone order normalization, duplicate motion-init protection, loaded-build diagnostics, and wallpaper network failure short-circuiting.

## Manual release checks that require real services

These are not safely reproducible in a static or mocked runner and should be checked once after loading the unpacked extension in Chrome:

1. **Gmail OAuth:** confirm the Google OAuth client ID is registered to the exact installed extension ID, then connect and load inbox metadata.
   The owner reports the supplied 403 was resolved by completing the Google Auth Platform audience/test-user setup.
2. **Spotify:** provide a Spotify client ID, complete OAuth, and verify Web Playback SDK playback with a Spotify Premium account.
3. **Local AI:** on a WebGPU-capable Chrome device, load the selected model and complete one summary or planning request.
4. **Live wallpaper providers:** shuffle each category on the target network and confirm Wallhaven plus any configured Unsplash/Pexels credentials.
5. **Browser visual smoke test:** inspect desktop and narrow-window layouts, keyboard through each dialog, and confirm reduced-motion behavior at the operating-system level. The automated runner cannot substitute for Chrome's extension page, service worker, and device compositor.
6. **Device location:** reload the unpacked extension to accept the new geolocation permission, then confirm macOS Location Services allows Google Chrome and that Weather reports Automatic.
7. **Assessment Intake:** click Connect download history and confirm Chrome asks contextually; import one real TXT/DOCX brief, verify the extracted deadline against the source, Accept it, confirm the Assignment and Calendar entry, then test Undo Intake. Grant/forget folder access separately if automatic content reading is wanted.
8. **Gleam visual and input smoke test:** open More → Gleam, complete onboarding, run one lesson and one simulation, start a field mission, type part of a reflection, switch sections and return, then confirm the draft survived. Check desktop, narrow window, 200% zoom, keyboard-only navigation, and operating-system reduced motion.
9. **Build identity, widgets and compositor:** confirm Settings → General → System Health reads `2.8.1 · Stability Pass`; click every visible widget launcher, reorder compatible widgets, reload, and confirm order/visibility persist. Test Auto, Ultra, Balanced, Efficient and Off; confirm measured status appears, Off stops motion, and returning to Auto restarts without a page reload.
10. **Atomic multi-tab continuity:** keep two HQ tabs open, add different calendar items and change different dashboard states, then confirm both changes survive in both tabs; undo one calendar action and verify the other tab's later item remains.
11. **Session credentials:** connect one key-based provider, confirm it works during the session, fully quit Chrome, reopen it, and confirm Operation HQ asks for the key again without exposing a stale credential.

12. **Visual performance matrix:** run 1920×1080, a narrow window, 200% zoom, keyboard-only, operating-system reduced motion, background/foreground, and a forced WebGL context loss. This runner includes the Playwright package but no browser executable; its attempted browser download timed out, so this gate is not represented as passed.

The build deliberately describes these as manual integration checks rather than claiming they passed without the required browser profile, credentials, hardware, and external service state.
