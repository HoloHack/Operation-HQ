# Study desk release — 14 October 2026 (Sydney)

**Live dashboard: version 6.** https://operation-hq-command-center.shour-ya11.chatgpt.site

This release replaces the glowing, repetitive dashboard shell with an editorial study desk and closes several task, planning and pairing defects. It is not completion of the entire original roadmap.

## What changed

- Paper and Night desks; readable labelled navigation; a prominent next action; independent Focus; rule-based timetable/task/release lists. System fonts, no external font requests, contained controls and purpose-specific input spacing.
- Generated accent choices remain review-first. Paper/Balanced runs no ambient animation loop and keeps its decorative canvas at 1x1. Layered scene transitions, short feedback, Cinema and reduced-motion paths remain.
- Task title, subject, deadline, priority and effort editing; active/done/all lists, search and deletion undo. Stale editors stop. Undo advances past deletion timestamps.
- Agenda now includes a 30-day projection of weekly/alternating timetable blocks. Local weekly blocks can be edited; new event forms reset all previous fields. Event/block deletion has undo.
- Study rescheduling preserves past, active and out-of-range sessions. Undo preserves unrelated work and refuses to undo an edited generated event.
- Commands have suggestions, Cmd/Ctrl-K and working handoffs to notes, calendar, study, releases, Gmail, bookmarks, tabs and Gleam. Maths chapter rescheduling asks for deadline/effort, then opens Calendar preview. Unknown unrelated input stays inert. This remains a deterministic router, not a general AI model.
- Companion 3.2.1 fixes Chrome object-key reordering being mistaken for an edit. Changed native fields alone update the richer planning document, preserving critical priority through an effort edit. Genuine conflicts still pause atomically.
- No runtime dependency/model upgrade, new permission, OAuth client change or database migration.

## Design references

Read and compared the complete skills in [Krirox/anti-ai-slop-skills](https://github.com/Krirox/anti-ai-slop-skills/blob/main/SKILL.md) and [Vanszs/Anti-AI-UI](https://github.com/Vanszs/Anti-AI-UI/blob/main/Anti-AI-SLop/SKILL.md). Krirox supplied the main hierarchy/restraint review; Vanszs supplied component checks. No third-party runtime code or fonts were copied. See DESIGN-2026-10-14.md for decisions and scope.

## Measured verification

| Check | Result |
|---|---|
| Dashboard regression/API/unit tests | 68 passing |
| TypeScript, production build, production dependency audit | Passed |
| Dashboard Chrome journeys | 20/20 passing |
| Companion suites | All 13 passed; includes 12 paired-sync cases |
| Companion native-Chrome journeys | 17/17 passing, including 21 flyout close controls |
| Responsive visual checks | 320, 640, 1440 and 1920px; Paper and Night screenshots reviewed |
| Colour checks | Muted text contrast 5.17:1 Paper / 8.32:1 Night; all 360 accents at least 5.8:1 / 6.76:1 against panel backgrounds |
| Native cloud browser after publication | New sign-in surface visibly present; personal dashboard requires login |

Exact tested GitHub head: 4a0415db6a945bd11e36b2864cf410f2408974f8. Merged through [PR #8](https://github.com/HoloHack/Operation-HQ/pull/8), merge ac6895290910cb421dd78f645c55579ed10805ac.
[Dashboard run 38483098757](https://github.com/HoloHack/Operation-HQ/actions/runs/38483098757).
[Companion run 38483098770](https://github.com/HoloHack/Operation-HQ/actions/runs/38483098770).

Tests used the actual app component, real Chrome APIs, IndexedDB and Web Locks in disposable profiles; account/provider replies were isolated fixtures. No real user bookmarks, mail, calendar, tasks or notes were used as test fixtures. Expected aborted external-provider resource errors were recorded; there were no uncaught browser errors in tested journeys. Real Gmail OAuth was not accepted: the native test covers cancelled authorization.

A controlled companion test measured **15,669,300 bytes JavaScript heap**. That is not total renderer RSS or GPU memory and does not certify a 300MB result on the target Mac.

## Source and publishing

All 141 dashboard files matched the tested GitHub source before packaging. Existing Site identity, audience and D1 DB binding retained.

Sites source: 5267027af0972db0c24bf905286ee9a42595d3a0.
Version ID: appgprj_6aadff7e3da0819187238acbe434e132~appgver_40579a68d6e881918d040e94f4c9e8f8.
Native deployment: appgdep_6acebcf4d2a881918a2e82ca7dc4b59b; returned **succeeded** at 2026-10-13T23:21:34.167912+00:00.
Archive: 1853440 bytes, 75 files, sha256:a9f1784fb148db7a3501448d7adec1e84106e73ed035d9c5886c01ab8a4cc322.

GitHub and Sites are separate source authorities. Do not substitute a GitHub commit SHA for a Sites source commit.

## Companion upgrade

Companion package: Operation-HQ-Browser-Companion-3.2.1.zip; 2,911,984 bytes, 92 files.
SHA256: 7e9eb82150fa927ed489f23dafa847562131176587fb4fc3d61fede1fd0e887f.

Download the package from the companion run's Operation-HQ-Browser-Companion artifact, or use the repository's extension folder. Replace files in the **existing unpacked extension folder**, then Reload at chrome://extensions. Do not uninstall. Its ID remains cbgepkbfmcahdpahipkdeahppfbggjok, so existing OAuth and browser data are retained.

Use 3.2.1 for paired planning; 3.2.0 can produce the false conflict repaired here. No new API keys or Supabase project are required.

## Still unfinished or unverified

- Full Google Calendar parity: recurrence exceptions, calendar provider adapters, timezone preferences and import round trips.
- Persistent deleted-record trash/history: current task/calendar deletion undo lasts while its workbench is open.
- Broader dashboard ports of Study OS/Recall/Gleam/Gmail; their existing companion tools remain handoffs.
- General-purpose model-backed dashboard reasoning and authenticated Cambridge chapter navigation.
- Closed-dashboard release notifications and publisher adapters for every requested manga.
- Live account/provider OAuth, screen-reader/200%-zoom acceptance, target-Mac total memory, GPU/frame pacing and complete historical-version upgrade coverage.
- Bookmark semantic classification on the user's entire tree: managed-folder safety and real mutation/undo tests passed, but ambiguous material still stays in place. Perfect classification is not claimed.

Current whole-roadmap percentage is unmeasured; the historical 75% estimate is not recalculated from this release's test count.

## Rollback and next commitments

Site version 5 is retained. Disconnect pairing and export planning before reverting either client. Keep canonical documents and deletion history; rolling back UI code is not permission to remove new records.

Next priorities: durable deletion/history with recovery tests; richer calendar/Study ports with metadata-preserving sync; live provider and target-device performance acceptance. Existing weekly review remains unchanged. Upgrades go through isolated branches, tests and review; no unsupervised production self-modification.
