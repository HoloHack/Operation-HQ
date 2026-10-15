# Operation HQ — recorded-flow repair, 16 October 2026

## What the recording established

The hosted study desk and browser companion were exposing different home screens. Opening Mail or Bookmarks led back to the old cyberpunk dashboard; wallpaper settings changed that old screen, not the hosted desk. The recording showed Gmail already connected, but many bookmarks still unresolved. Clear subjects such as chess, piano, language learning and a game guide were missing from the topic vocabulary or receiving generic Saved Reading suggestions. Destination selectors were too narrow to read. Some older suggestions were then confirmed, which made them remembered owner decisions.

## Changes

- **One visual language:** the companion's normal entry now opens Paper/Night browser tools, with the same typography, colour family and spacing as the hosted desk. Dashboard tool launches pass the selected surface, hue and motion preference. The popup matches that preference. The old home is retained only at an explicit `?legacy=1` compatibility address. All 21 native tool panels remain reachable. Advanced settings and tool panels close one another, close buttons stay inside their panels, and keyboard focus returns to a visible navigation control.
- **Backgrounds on the actual dashboard:** Settings now offers a local image, a public direct-image URL, or explicit use of a working companion wallpaper. Local images are compressed and stored in account-scoped IndexedDB on this device, with a maximum retained canvas of 3840×2160; smaller images are not represented as genuine 4K. Backgrounds are still images under opaque readable cards. Dimming previews are saved only by Apply dimming. Storage/host failures preserve the persisted selection and restore the previous dimming value. File-picker focus, blocked storage, connection cleanup and account-change races are handled.
- **Native wallpaper lifecycle:** image loads have a bounded timeout. Refreshes are queued; superseded searches/decodes cannot repaint a newer choice, and cached/current metadata are saved together. Named anime discovery tries shorter character aliases before the long intersecting query. This improves search behaviour but does not guarantee a remote provider will return a particular character or scene.
- **Bookmark topics and evidence:** stronger subject rules cover the observed title patterns and known AI services. Folder names do not vote as page-content evidence. Permission requests start during the click, before lazy loading; denial and API errors have different outcomes. One mutation lock spans the sort and evidence phases. Metadata reads stop at 128,000 bytes, successful metadata is cached by complete URL/path/query, and non-streaming reads fail closed. No cloud model is silently loaded.
- **Bookmark review:** readable controls, a title/address search and paginated decisions retain explicit selections across pages. Confirmations reject bookmarks that changed after review. Recheck saved decisions flags a remembered destination that conflicts with a clear page topic; it does not erase learning or move the bookmark. This addresses old generic corrections without silently replacing an owner's choice.

The architecture still has two origins: a hosted dashboard for account planning and a Chrome extension for privileged browser APIs. Matching visuals do not bypass Chrome's security boundary. Tasks, notes and timetable copies are combined only through reviewed import or explicit Paired planning. Bookmarks, Gmail and credentials remain local to the companion.

## Verification

Candidate: `67df544af56456d52efe671c5388ee0142e22e86`, PR #12.

- 85 dashboard regressions pass, including blocked IndexedDB opens and late connection cleanup. TypeScript, production build and the production dependency audit pass. The regressions also pass on the declared minimum Node 22.13.0.
- 33 dashboard Chromium journeys pass, including shared Paper/Night handoffs, exact local-image reload persistence, visible file-picker focus, a quota-failure dimming rollback and an explicitly aborted image host retaining the old background. These run the actual product component with an isolated account/API fixture.
- 14 companion suites pass, including nine smoke-specific regressions. Native Chromium runs 18 journeys; all 21 tool panels are checked at 320px and 1440px, with in-panel close controls. Bookmark mutation, undo, ownership, tab-group preservation, notes, safe-mode recovery and optional model lifecycle checks remain included. A controlled legacy route still verifies the retained launch animation.
- A native run caught an inherited half-height close-button transform; it was fixed. Another caught a background-colour transition during reduced motion; reduced motion now disables that transition. Those failures were corrected before release.
- Source/test/manifest changes were checked against their GitHub blob hashes. Final screenshot inspection also caught transparent home widgets over a dark photo and dark legacy interiors beneath forced light-theme text. Every wallpaper widget now has an opaque reading surface; nested study/social/command surfaces, toast messages, field legends and input placeholders follow the active desk colours. Native regression assertions cover the previously failing surface and text selectors. The narrow Gleam calibration view now uses document flow with a bounded grid, no overflowing decorative orbit, readable wrapping and a regression assertion for content width. The width check caught decorative overflow during validation, which was corrected before packaging.
- Dashboard CI: https://github.com/HoloHack/Operation-HQ/actions/runs/38824276650. Companion CI: https://github.com/HoloHack/Operation-HQ/actions/runs/38824276838 (evidence `12013859626`, install package `12013889623`). The published dashboard app source also passed the identical 33-journey workflow at https://github.com/HoloHack/Operation-HQ/actions/runs/38823126275 before publication; subsequent changes affect companion CSS and its browser assertions only.

CodeRabbit completed a full review of the earlier stable candidate. Its 14 inline threads were addressed or clarified with regression evidence, and all are resolved. The context already aborted external image requests in the relevant test; an explicit URL abort was added for clarity. Final fixes were checked by regression/Chrome CI; resolved threads are not a claim that CodeRabbit performed another complete review of the final head. No paid overage or autonomous deployment feature was enabled.

## Limits and remaining work

No production bookmarks, notes, tasks, calendar or email were mutated by these tests. The user's full bookmark collection has not been sorted by this environment. The recording's unresolved count is not a measured post-update result. Mixed-topic, unavailable, private or vague pages can still require an owner decision; zero visible review items is not proof of semantic correctness. Explicit learned choices remain authoritative unless the owner revisits them.

Live wallpaper-provider availability could not be established here; the provider fetch was unavailable/forbidden in this environment. This does not prove the provider is down for the user. Local image support works independently of that provider. The recording shows the user's earlier Gmail connection, but the updated build's live OAuth/provider session has not been exercised on the user's Mac. Provider tests use isolated fixtures or cancellation stubs. No local model weights were downloaded; supported command tests do not establish general AI reasoning.

Known private hostnames, credential-bearing addresses and numeric IP hosts are rejected for new image URLs/page-evidence requests. Browser URL validation cannot resolve DNS or guarantee protection against DNS rebinding; a redirect response check also occurs after a followed request. This is a browser feature operating on user-requested sources, not a DNS-enforced network sandbox. No external DNS service or new permission was added.

Total renderer/GPU memory and the 300 MB Mac target remain unmeasured. Controlled JavaScript-heap checks are not total tab memory. The wider roadmap, including full provider calendar integration and general model-backed assistant workflows, is not declared complete and no new completion percentage is invented.

## Installation and acceptance

1. Save open work. Extract companion 3.2.3 and copy its contents into the current permanent unpacked folder. Reload the existing extension at `chrome://extensions`; do not uninstall or clear storage. Extension ID, permissions, OAuth client and read-only Gmail scope are unchanged.
2. Refresh the dashboard and any already-open companion page so neither keeps old JavaScript. Enable Allow dashboard access in the popup if needed.
3. In dashboard Settings, pair planning only after reviewing that this is the correct browser profile/account. Without import/pairing, existing browser timetable and notes will not automatically appear in the hosted desk.
4. Choose the dashboard background in Settings → Background. A local image needs no key. After changing dimming, click Apply dimming.
5. Export Chrome bookmarks as a backup, then Preview and inspect destinations. Apply the sort only when satisfied. Afterwards, Recheck saved decisions can expose older generic corrections for explicit confirmation. Uncertain destinations stay in place. Do not interpret an unresolved count as a reason to approve an incorrect suggestion.

Rollback: redeploy Site version 9 (source `3eb0dc0e87c814e12903ba3728233736c55ddbfc`) and restore companion 3.2.2 files in place. Do not uninstall, erase the new local image database, restore an old user-data snapshot or overwrite D1 records. This update makes no D1/schema migration and adds no dependency, OAuth scope or installed permission.

## Publication

Dashboard version 10 is published at https://operation-hq-command-center.shour-ya11.chatgpt.site/.

- Sites source commit: `56f3e55513326fee9b246c07e808b0cce8244c11` (separate from GitHub repository provenance).
- Deployment: `appgdep_6ad160e13a8481918659bc2afa5510da`, succeeded.
- Build archive SHA-256: `a658252a503cad934c0fc73683d7ee593309c4a17529728efb4750682a3be419`.
- The cloud browser opened the published sign-in screen. It has no owner account session or installed owner extension, so this is not an authenticated production-account acceptance test. A read-only log check returned two automated-agent GET `/signin-with-chatgpt` requests with HTTP 404. This route is platform-owned; the app already uses the documented sign-in helper and a normal top-level anchor, and the Site has an auth client. No replacement OAuth route, identity bypass or access-policy change was introduced. This remains a platform/session verification limitation, not a successful automated login.

Companion 3.2.3 install ZIP: 2,921,209 bytes, SHA-256 `382438d5f5ffd441b67d0b40170e9a78484768fa70a5271869f765ff111ac1dc`.

Every one of the 94 packaged files matches the final GitHub source blob. The 24 changed source/test/manifest files also match the final revision. The extension ID remains `cbgepkbfmcahdpahipkdeahppfbggjok`.

The final native Chrome fixture measured 18,930,408 bytes of JavaScript heap with optional model weights unloaded. This is one isolated test run, not total process memory and not the owner's Mac measurement. The default browser-tools route skips the old wallpaper/compositor/living-widget startup; the explicit legacy compatibility route retains it.

GitHub code merge: `60579077511db66404504321e33717456780054b`, PR https://github.com/HoloHack/Operation-HQ/pull/12. Both final workflows completed successfully against the candidate cited above.
