# Operation HQ acceptance ledger — 18 October 2026

This is a reliability release, not certification that the full product roadmap is finished. A passing test proves its stated scenario, not every possible user collection, provider or device. There is no defensible overall completion percentage while broad roadmap wishes lack countable acceptance criteria. The older 75% estimate is not a measurement and has not been increased.

## What changed

**Bookmarks.** Newly saved links are persisted before attempting a shared mutation lock. Busy background work retries from a durable, bounded queue, with visible On/Off/pending/evidence status. Links saved while Off are not enrolled later. Three inconclusive attempts stop polling quietly; a changed title or explicit retry can supply new evidence. Manual moves cancel pending work. A failed journal pauses automation for recovery. Owner operations wait behind a bounded background batch, while overlapping owner operations are rejected. Undo restores recorded parent/index positions and cleanup only removes registered managed folders.

**Classification.** Exact corrections now use the full relevant page identity instead of a truncated common path. Different queries and deep pages no longer inherit each other's correction. Concrete video/document IDs remain supported. Old broad host/path corrections and existing taxonomy placement are weaker suggestions: stale automated placement is not treated as an owner's confirmed decision. No correction records are deleted by this migration. Strong page/title evidence can supersede weak old placement. Ambiguous pages stay in place. Nobody can guarantee the intended subject of an arbitrary untitled link without evidence; moving it randomly would violate the requirement for correct organisation.

**One design.** Normal companion entry uses the website's Study desk layout, exact Paper/Night tokens, header/rail proportions, consistent drawers and contained close controls. The popup reports the installed version. Closed native tool trees are removed from layout and paint instead of merely made transparent, preventing their render layers from accumulating behind the desk. The legacy experimental scene remains an explicit alternative route; it is not the normal dashboard. Website-only and Chrome-only capabilities are labelled rather than disguised as interchangeable.

**Focus.** The device clock restores an exact running deadline or paused remainder after reload. Explicit actions are shared across same-account tabs using a Web Lock. Completion cannot replace a newer recorded start. Corrupt saved bytes are preserved with visible feedback. No per-second disk or network write was introduced; this is not a cloud timer sync service.

## Capability ledger

| Area | Implemented now | Remaining acceptance or development |
|---|---|---|
| Core data safety | Account D1 revisions, account/tab device journals, recoverable drafts, explicit note conflicts, secret-free export policy | Cloud history, validated restore UX, encrypted export and crash/private-storage device cases |
| Dashboard/companion split | On-demand browser workspace; ordinary new tabs do not load HQ; shared desk design | Exact owner's upgraded-install/profile acceptance; no automatic update for unpacked folders |
| Bookmarks | Topic evidence, bounded taxonomy, exact corrections, page-reading permission, durable new-link queue, preview/apply/Undo, managed-folder cleanup | Owner's full collection and edge cases; ambiguous links require evidence or exact choice; not a zero-review guarantee |
| Workspaces | Duplicate review, bookmark cross-references, save/restore Chrome groups preserving originals | Wider multi-window collections and owner saved-group behaviour |
| Planning sync | Explicit protocol-2 account/profile pairing, whitelisted planning, delayed-response protection, retry/disconnect | Finer collection selection, richer field parity, broader owner-device conflict acceptance |
| Calendar/timetable | Local calendar views/edits, recurring timetable projection, fixed/flexible blocks and reviewed planning | Full Google Calendar feature/provider parity, complete exceptions/timezone/import round trips |
| Tasks and maths | Exact chapters 5/7/8/10, missing-deadline clarification, reviewed schedule/resource choices and native handoff | Owner Cambridge session/chapter deep links and richer capacity-aware rescheduling; no fabricated chapter URL |
| Notes | Serialized document writes, reload persistence, compatibility mirrors, explicit sync conflict handling | Broader browser crash and long-history recovery |
| Focus/themes/motion | Device-persistent focus; generated options requiring approval; Paper/Night and bounded/reduced motion; legacy layered scene | Target monitor frame pacing and Mac long-run RAM traces; not every requested cinematic asset is produced |
| Gmail | Read-only OAuth, honest cancellation/error state, lanes, corrections, pagination and thread links | Owner connect/revoke/reconnect and live inbox/provider testing; not server Gmail labels or sent replies |
| Local commands/model | Typed deterministic commands, unknown-command response, chapter extraction, reviewed tools; optional bounded model load/unload | General-purpose assistant, broad retrieval/planning and model/device evaluation; no claim of Jarvis autonomy |
| Study/assessments/Gleam | Native assessment intake/review, assignment and recall tools, social practice curriculum and reflection | Wider real document formats, full dashboard parity and longitudinal usability acceptance |
| Wallpaper/weather | Local durable image, retained previous image on failure, native provider fallbacks, location/weather state | Named-character quality/availability, live provider quotas, target-resolution inspection and device location |
| Manga/anime tracking | Existing search/tracking surface, source/status visibility | Every listed title must be disambiguated against an authoritative source; hiatus/unknown dates cannot be a fabricated countdown |
| Maintenance | Versioned GitHub source, regression/Chromium workflows, CodeRabbit review request, rollback plan | Reviewed future upgrades and periodic device/provider checks; no automatic paid connection or unreviewed deploy |

## Verification and release gate

Local dashboard regression: **112 pass**; TypeScript: **pass**. Native companion: **16 suites pass**, including mutable bookmark-tree/undo/failure/concurrency tests, queue lifecycle and page-identity tests. CI checks the same source in real Chromium with isolated fixtures. Native Chromium CI [39081849970](https://github.com/HoloHack/Operation-HQ/actions/runs/39081849970) passed at `0cbc6f3310562c3fa8d068affa559fd3a6f2f4ae`: 21 journeys, including all 21 panels at two widths. A subsequent closed-panel rendering repair adds a settled-memory/layout journey; its final result is recorded in release provenance. Dashboard Node-minimum tests, regression, TypeScript, production build and high-severity dependency audit also passed in [39081849975](https://github.com/HoloHack/Operation-HQ/actions/runs/39081849975); the dashboard browser job also passed all 37 journeys, including focus reload/pause/two-tab behaviour. Pending work must never be presented as passed.

Native Chromium exercises all 21 packaged flyouts at 320px and 1440px, contained close controls, calendar widths, notes reload, bookmark transactions, queue contention/title updates, saved groups, unknown commands, chapter extraction, bridge boundaries, reduced motion and Gmail cancellation. Dashboard Chromium covers actual components, IndexedDB, Web Locks, offline/conflict recovery, real companion pairing and focus reload/two-tab actions. Provider API responses and account identities are test fixtures; no owner data is touched.

Linux process-memory files report proportional set size for an entire disposable Chromium profile, renderer processes and GPU separately at clean start and after tool journeys. They are **not** a Mac per-tab measure or a 30-minute leak test. Earlier, before the closed-panel rendering repair, native CI measured startup: renderer aggregate 147.4 MiB, GPU 41.0 MiB, whole profile 424.4 MiB. After all tool journeys: renderer aggregate 485.6 MiB, GPU 103.4 MiB, whole profile 842.5 MiB. The workspace renderer itself rose from 100.2 to 439.2 MiB during this screenshot-heavy run; JS heap at the final heap checkpoint was 21.8 MiB. This is a performance follow-up, not evidence that the 300 MB target is met. No 300 MB result is claimed without the corresponding measurement.

The hosted platform sign-in route previously returned 404 in the available environment. Product fixture tests cannot certify or repair platform-owned dispatch. No owner identity is fabricated to get around this limitation.

## Install, recovery and rollback

Update the existing unpacked companion folder to 3.2.4 and click Reload at `chrome://extensions`; then refresh open HQ pages. Check the popup version. Do not uninstall, clear storage or restore an old whole-state snapshot. The extension key, ID `cbgepkbfmcahdpahipkdeahppfbggjok`, OAuth client, scopes and permissions remain unchanged.

The website update cannot overwrite an unpacked folder on the owner's Mac. Native Gmail approval and system location remain user/browser actions. Existing pairing can be reused; new pairing still needs visible account/profile consent. No new Supabase project is required.

Rollback website to saved version 11 (source `90637152e620d158902e2940c2ebe0f1d0b658ec`) and companion to the prior 3.2.3 folder in place. Do not erase planning data or restore a historical snapshot just to roll back code. Newly queued work uses new keys; old code ignores them. Older broad learned bookmark keys were not deleted.

## Next commitments

1. Accept this release's real Chrome evidence and CodeRabbit findings before merge/publish; retain exact package and source provenance.
2. Verify the owner's upgraded profile, real bookmark examples and Gmail lifecycle; retain a target-Mac 30-minute memory/frame trace before making device claims.
3. Finish the defined calendar/provider, broader planning/local-command and title-source acceptance packages incrementally, with regression tests and rollback per stage.


## Final release provenance

Published dashboard **version 12** succeeded on 18 October 2026. Sites source: `be316e40893428aa3c7f964fdc691d960ff353b4`. All 99 tracked dashboard runtime files match the tested GitHub candidate. Saved version: `appgprj_6aadff7e3da0819187238acbe434e132~appgver_85a0e246ba0481918ceeb62202f6eb95`. Deployment: `appgdep_6ad410e679e0819187936d39de0cd0ff`. Existing public entry/account data isolation is preserved.

[PR 14](https://github.com/HoloHack/Operation-HQ/pull/14) merged at `6bddc9b2ea5f6c397156d69d24d3deb1682a2682`; tested candidate `218d505f175666687af569764a8981e6112bddbb`. [Final dashboard workflow](https://github.com/HoloHack/Operation-HQ/actions/runs/39082146184): all 112 tests, minimum-Node tests, TypeScript, build, production high-severity audit and **37 Chromium journeys pass**. [Final extension workflow](https://github.com/HoloHack/Operation-HQ/actions/runs/39082146161): **16 suites and 22 Chromium journeys pass**, including no uncaught page errors. HTTP provider calls were blocked or controlled fixtures; these are not live Gmail/provider acceptance.

Companion **3.2.4**, **95 packaged files**, **2,911,017 bytes**, SHA-256 `1026ed3795da3966da3ac24212ad9258c66f3bd04985cd83e6fa32f891ffd19c`. Local package bytes and all packaged file blobs match the final CI candidate. The CI install archive is available in [the companion artifact](https://github.com/HoloHack/Operation-HQ/actions/runs/39082146161/artifacts/12119545623); download artifacts require GitHub access and expire according to retention. Rebuild from versioned source with `python3 extension/scripts/package-release.py` when needed.

Final closed-panel run, Linux PSS (bytes, deliberately retaining exact scope):

| Checkpoint | All renderers | GPU process | Entire test profile | Workspace renderer |
|---|---:|---:|---:|---:|
| Clean workspace | 137440256 | 44068864 | 429972480 | 87877632 |
| After all tool/screenshot journeys | 441253888 | 108672000 | 820413440 | 392553472 |
| Panels closed, ten seconds idle | 410831872 | 82614272 | 759647232 | 362493952 |

The 300 MB target remains unmet/unverified for the all-tools case, and no Mac result exists. Closed panels have zero layout width/display none; memory still includes loaded modules and Chromium's own rendering caches. This is not a controlled before/after performance benchmark or a leak diagnosis. No model was loaded. Ordinary new tabs do not load the HQ workspace.

CodeRabbit full review was explicitly requested and acknowledged on PR 14. It was still processing with no submitted review or inline findings at publication. The code was manually reviewed and regression/Chromium-tested before release; **a completed CodeRabbit approval is not claimed**. Follow up on its eventual findings rather than interpreting an empty pending result as approval.

No production bookmark, task, note, calendar or email data was modified by these tests. No new permissions, OAuth scopes, provider model, dependency, paid service or Supabase migration was introduced. Full roadmap completion remains unclaimed; the capability ledger above lists the actual unfinished work.
