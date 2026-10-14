# Operation HQ — browser tools and review, 15 October 2026

## What changed

- Bookmarks and Mail now display connection problems immediately in their own drawer, with installation/reload instructions and retry. The previous distant status message could make a click appear to do nothing.
- A Gmail command and its follow-up button keep Gmail as their destination; the old generic button always opened bookmarks. Tool icons match their destinations.
- Companion 3.2.2 adds a per-request hash identity, so reopening the same tool after closing it triggers its route again. All launches reuse one workspace. No new-tab override was added.
- Gmail has a real HTTPS website fallback. Chrome's bookmark manager is offered as a copyable internal address because websites cannot directly launch that privileged page.
- Chrome message timeouts are cleared on all outcomes, including synchronous errors; late callbacks settle at most once. Cancelled handoffs cannot overwrite the latest tool result or leave a permanent Checking state.
- The dashboard greeting capitalizes the signed-in account's first name, so `shourya` displays as **Shourya**. It does not rename the Google account or hardcode a name for other visitors.
- **Open local AI** hands off to Advanced settings in the companion. The help text remains explicit: Commands is a deterministic command router; a local model must be loaded separately and consumes additional memory.

## Verification and scope

83 regression tests, TypeScript, production build and the existing production dependency audit passed. The same tests also pass on the declared minimum Node 22.13.0, with a dedicated CI job. **31 native dashboard Chrome journeys passed**, covering real extension messaging, actual Bookmarks/Gmail flyouts, repeated closed-tool opening, correct Gmail command routing, disabled access, an actual separate browser without extensions, 320px setup controls, and a delayed native reply after Ctrl+K leaving the new import preview intact. Existing offline recovery, calendar, planning, pairing and release tests remain in the run. Unsupported/invalid commands must not mutate saved state.

Companion tests cover 13 suites and 17 native Chrome journeys, including bookmark moves/classification/undo in a disposable mutable Chrome tree, all 21 packaged flyouts, notes, tab groups, safe-mode exit, startup animation and model lifecycle. Gmail cancellation uses a token-provider stub. External HTTP is intentionally blocked, so provider/resource failures in those fixtures are expected, not proof that a live provider works. No production bookmarks, tasks, notes, calendar or email were changed during testing.

Final candidate: `4fdff81b6f38bee0fb72c10f065bf8073de0ddc3`. [Dashboard CI](https://github.com/HoloHack/Operation-HQ/actions/runs/38647117785); [companion CI](https://github.com/HoloHack/Operation-HQ/actions/runs/38647117776). The install ZIP was produced by companion CI at `2b85b699b70a5ec5d4db874a328c7a4298ceea20`; every packaged source file matches the final candidate's Git blob (92 files checked, no mismatch). SHA256: `3863f257ba432ff737636a8c39a45050c749503155c5da5bd467995d5702c0af`; 2,912,089 bytes.

## CodeRabbit

CodeRabbit was already installed on this GitHub repository. Its public-repository policy requires manually triggered reviews while the repository has fewer than ten stars. Added `.coderabbit.yaml` with assertive, path-specific review guidance for user flows, state safety, accessibility, resource lifecycle and secret handling. No paid overage, new app authorization or automatic production changes were enabled. The first review was cancelled by a moving PR head. The completed full review at `4786d25` found two valid issues: Ctrl+K did not invalidate pending browser feedback, and Node 22.13 required an explicit type-stripping flag for the test command. Both were fixed in `4fdff81`, regression coverage was added, and CodeRabbit itself marked both threads resolved. A new minimum-Node CI job passes on 22.13.0. A full follow-up review was requested but hit the free OSS review limit; the bot's success status is not proof that it reviewed the entire final revision. Its earlier docstring-coverage warning has not been recalculated; concise JSDoc was added to the touched public helpers and UI entry points. No paid review allowance was activated.

## Install on the user's Mac

1. Extract **Operation-HQ-Browser-Companion-3.2.2.zip**. Copy its contents into the existing unpacked companion folder.
2. At `chrome://extensions`, reload the existing Operation HQ extension. **Do not remove/uninstall it or clear its data.** The extension ID remains `cbgepkbfmcahdpahipkdeahppfbggjok`.
3. Open its toolbar popup and enable **Allow dashboard access** in the same Chrome profile as the dashboard. Refresh the dashboard and retry Bookmarks/Mail. Existing Gmail authorization remains stored; reconnect only if Google says it is needed.

A hosted website cannot install/reload an extension in the user's local Chrome profile. No new key, Supabase project, permission or OAuth scope is needed for these fixes. Gmail remains read-only.

## Remaining work and verification limits

The whole roadmap is not complete. Cross-device deletion history, full recurrence exceptions/timezone-aware calendar integration, richer Study/Recall/Gleam dashboard ports and general model-backed assistant workflows remain open. Actual local-model response quality needs a loaded model or configured provider; the passing command tests do not prove general AI reasoning. Live Gmail authorization and device acceptance remain unverified. Total renderer/GPU memory on the M2 Mac and the 300 MB target remain unmeasured; the controlled companion JS heap measurement is not total tab memory.

Hosted Google Calendar/Gmail connectors were not newly declared: the required Sites eligibility discovery capability was unavailable in this task. An agent's connected app is not automatically a website visitor's connection. Existing declarations, sign-in client, D1 data, permissions, OAuth scope and dependencies were preserved.

Rollback: redeploy Site version 8, source `bf3dbf242fa63990266f0b642a517219ca649973`, and restore companion 3.2.1 files in place if needed; do not uninstall or restore an old user-data snapshot. The current update has no data/schema migration. Publication details are below.

## Published release

- GitHub PR #11 merged as `7199dbb9324ee1ac6e8b41f9f07b09c2e96f7293`.
- Site version **9**, published successfully at 2026-10-14 22:25:56 UTC (15 October in Sydney). Live URL: https://operation-hq-command-center.shour-ya11.chatgpt.site/
- Site source: `3eb0dc0e87c814e12903ba3728233736c55ddbfc`. Deployment: `appgdep_6ad00161e7c481918cddbb65fdc61b84`.
- Archive SHA256: `ddd7d2b875482cf8af7bce33ab29cc7f048f15964bf7c9895efc3340f96038ec`; 1,884,160 bytes; 75 deployment files. Public audience, application account sign-in and D1 binding preserved.
- Dashboard evidence: artifact `11932843211` in run `38647117785`. The delayed-reply regression passes; no uncaught errors in the 31 covered journeys.
- Source parity: all nine modified/new dashboard code/test/manifests checked against the final GitHub candidate, no mismatches.
