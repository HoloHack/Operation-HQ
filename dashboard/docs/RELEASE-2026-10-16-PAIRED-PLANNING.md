# Operation HQ — paired-planning safety, 16 October 2026

## What changes for the owner

This is a dashboard update compatible with the existing Browser Companion 3.2.3. Refresh the dashboard after saving work; there is no new extension identity, permission, provider key, database or OAuth setup.

Paired planning now protects notes typed while the first connection is still waiting for the companion. Previously, that older reply could replace the newer dashboard document. The repaired flow keeps newer edits and revokes that unfinished association by its exact token. Existing planning copies remain on both sides. The companion may have completed its approved initial copy before the response arrived; revoking the association does not undo that copy.

Pair, exchange and disconnect share one lock across dashboard tabs and one in-flight guard within each page. A different tab's updated revision is reread before sending. A disconnected association cannot be recreated by an older response. Closed/account-replaced views cannot apply late replies or initiate a delayed exchange after a cloud save finishes.

An incomplete response, invalid revision, duplicated record, changed identifier or normalized-away preference is refused before replacing dashboard work. A failed device write on first pairing triggers exact-token revocation. If revocation cannot be confirmed, the interface says so and identifies the companion popup's **Disconnect paired account** control. A timed-out request can still finish in the companion; use that control before reviewing pairing again when needed.

A corrupt or already-revoked saved link also has an explicit **Forget saved link on this device** recovery action. It removes only the account-scoped link, reports storage failures, and does not revoke an active companion association or erase planning.

Failures pause automatic exchanges until manual retry. The interface shows the last confirmed companion exchange and separately reminds the owner to check cloud save status. Exchanges run every 30 seconds only while the dashboard is open, visible and not paused; this is not a background cloud daemon.

## Validation and scope

- 106 dashboard regression tests pass locally; the 21 new paired-planning tests cover delayed pairing/exchange replies, newer edits, disposal, storage failure, corrupt saved pairing, incomplete responses, revision validation, duplicate records, cross-tab locks, external disconnect and exact-token revocation.
- TypeScript and the supported production build pass locally. GitHub also checks the minimum Node version, production dependency audit and browser journeys.
- The native companion's 14 regression suites pass, including bookmark classification, mutation/undo, managed-folder protection, calendar safety, notes, optional-model lifecycle and sync protocol tests.
- Browser CI uses the actual dashboard component and actual companion messaging in a disposable Chromium profile, with an isolated account/cloud API fixture. Three additional journeys delay real pair/exchange replies, type newer notes, check that overlapping disconnect is disabled, test the paused state at 320px, retry, revoke the association, and recover a corrupt device link through the actual interface.
- No production user bookmarks, email, notes, tasks or calendar records are changed by these tests. No dependency, installed permission, account identity, schema migration, billing configuration or Gmail scope changes.

The behavior candidate `82b873d0d3f122a50a3eaef675682a9e85765ae3` passes all 106 regressions, 36 Chromium journeys, the declared minimum Node tests, TypeScript, production build and production dependency audit. Browser evidence artifact: `12038808563` (36 passed, no uncaught page errors). CI: https://github.com/HoloHack/Operation-HQ/actions/runs/38885496603.

CodeRabbit completed a full review of that exact candidate using its included allowance and reported no actionable comments. Its docstring-coverage warning is addressed by documentation comments for the three previously undocumented public functions/component; no further paid review is requested. Later release identifiers and the comment/documentation-only verification are recorded below. Test counts are evidence for this repair, not a whole-roadmap completion percentage.

## Boundaries that remain

Live owner Gmail/OAuth, the full installed bookmark collection, Mac renderer/GPU memory and the 300 MB target remain unverified remotely. JavaScript heap measurements are not total tab memory.

The prior automated sign-in request returned HTTP 404. The app uses the documented platform-owned `/signin-with-chatgpt` helper and a top-level anchor; the Site has an auth client. No replacement auth route or identity bypass was added. An isolated account fixture cannot certify a live platform login. Anonymous/account-isolation regression checks remain in place.

General model-backed assistance, full Google Calendar provider parity, some timetable editing restrictions and reviewed bookmark ambiguity remain broader product work. This repair does not claim to complete those packages. Bookmarks and mail do not enter paired-planning traffic.

## Recovery and rollback

Save pending work before refreshing. Already-paired accounts keep their stored association; pairing is not enabled automatically for a new account. If a failed first attempt leaves a companion association without a dashboard acknowledgement, use the companion popup's **Disconnect paired account**, then review pairing again. No planning copies are deleted by that control.

If an exchange pauses because both sides changed, preserve/export both copies before choosing a version or reconnecting. Manual retry is not an instruction to erase conflicts.

Rollback uses Site version 10, source `56f3e55513326fee9b246c07e808b0cce8244c11`. Keep the companion installed, retain local storage and do not restore an old cloud/user-data snapshot. Reverting dashboard code alone does not undo planning copies already accepted before rollback.

## Published release — 17 October 2026

- Published dashboard: https://operation-hq-command-center.shour-ya11.chatgpt.site
- Saved Site version: **11**, `appgprj_6aadff7e3da0819187238acbe434e132~appgver_72c1b834ddbc81919c163bdc0f73e8d2`.
- Verified pushed Site source: `90637152e620d158902e2940c2ebe0f1d0b658ec`.
- Production deployment: `appgdep_6ad2e94913cc81919623accf68514545`, native status **succeeded** on 17 October 2026.
- GitHub behavior candidate: `82b873d0d3f122a50a3eaef675682a9e85765ae3`. Final candidate: `0e3cdf78a9a13d72cf74b7e814996ce2af2268ad`. PR #13 merged as `e901c1da4f216c1aa14f6969cea44cf4caf61208`.
- Final CI: https://github.com/HoloHack/Operation-HQ/actions/runs/38998121449 — dashboard, minimum Node and browser jobs all successful. The final change after the CodeRabbit-reviewed behavior candidate adds only three documentation comments, release documentation and a screenshot assertion that waits for the normal panel entrance animation to settle.
- Browser artifact: `12087617983`, 36/36 journeys passed, no uncaught page errors. The settled 320px paused-settings capture was visually reviewed: opaque Paper surface, no horizontal overflow, close control inside its header. Tests use the actual companion messaging and dashboard UI with isolated cloud/account fixtures; this is not a live owner-account acceptance test.
- Local packaged archive SHA-256: `eb21b112c2f7947f181b2754f645669bc7f077b9954c0a082fa017fb98a320c9`. Sites stored-archive content hash: `sha256:42cc361489a4bc72188ed3a7cb3e92358d3e6ff29ef3a73945a0dcbbfaf23c3c`. These identify their respective local and service-packaged archives.
- Runtime/test source blobs in the local Sites checkout matched the final GitHub candidate before publication. Public site audience is preserved; account-data isolation remains in the application. Companion 3.2.3, its identity and permissions are unchanged.
- Existing production logs were inspected read-only. The historical platform sign-in requests still show HTTP 404; a robots.txt 404 is also present. These are not certified as resolved by this sync release. No new production account mutations were performed to test them.

**Owner action:** save pending work, then refresh the dashboard. Keep Companion 3.2.3 installed; no new keys, project or permissions are needed for this update. Live Gmail/account acceptance, the owner's complete bookmark collection and total Mac tab-memory measurement remain separate verification work. The broader roadmap is not marked complete.
