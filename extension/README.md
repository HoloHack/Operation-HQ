# Operation HQ — Browser Companion 3.2.4

The browser companion opens browser-only tools on demand. Ordinary new tabs remain ordinary Chrome tabs. The website and companion share the Study desk layout, Paper/Night colours, navigation and readable drawers; they have different capabilities because a website cannot directly manage Chrome bookmarks, tabs or extension OAuth.

## Install or update

1. Unzip the release into a permanent folder.
2. Open `chrome://extensions`, enable Developer mode, and load the folder containing `manifest.json`.
3. If already installed, update the existing unpacked folder and click **Reload**. Do not uninstall it or clear storage. The extension key, ID, Gmail client and permissions are unchanged.
4. Pin Operation HQ. Open its popup, check version **3.2.4**, and choose **Connect dashboard** if you want the exact-origin bridge. Pairing planning data is a separate, explicit step in dashboard Settings.
5. Refresh existing browser-tool and dashboard tabs after updating. An open older tab can retain old scripts.

## Bookmarks

Preview shows the current tree and proposed destinations before a bulk move. Automatic sorting is for newly saved links while its switch is On. It first saves a persistent queue, then applies only strong topic or exact-page evidence. A busy operation no longer drops a new bookmark. Changes to a pending bookmark title trigger another attempt. After three inconclusive attempts the item waits quietly for evidence or a decision; it is not randomly filed to make a counter reach zero.

Exact corrections distinguish deep paths, meaningful query parameters, concrete video/document IDs and application routes. Broad historical rules and existing folder placement are suggestions, not proof. Ambiguous links stay in their current folders. Page reading requires its own explicit permission. Owner Undo waits for background sorting, restores recorded positions and preserves unrelated folders. Cleanup only targets folders registered as created by HQ.

## Available tools

- Bookmarks: topic sorting, page evidence, exact corrections, decisions, durable automatic queue, transaction recovery and Undo.
- Chrome workspaces: review duplicate tabs, inspect bookmark cross-references, save/restore groups without closing the originals.
- Gmail: read-only OAuth connection, message lanes, local priority/category correction, pagination, thread links and reviewed planning actions. This does not create Gmail labels or send mail.
- Calendar, timetable, tasks, notes, assignments, assessments, recall/study tools, focus, generated study themes, weather, wallpaper tools, Gleam practice and Nexus commands.
- Optional on-device model: explicitly loaded, bounded and unloadable. It is not downloaded at startup and cannot make unsupported commands real.

Historical feature descriptions remain in Git history; the current acceptance ledger in `dashboard/docs/ACCEPTANCE-2026-10-18.md` distinguishes implemented capabilities from unverified provider/device behaviour and unfinished roadmap work.

## Verification

Run `npm ci --ignore-scripts` and `npm test` for 16 suites. GitHub Actions installs Chromium and runs `npm run test:browser` against a disposable profile, then `python3 scripts/package-release.py`. All bookmark, notes and tab mutations in tests use that isolated profile, never an owner's data.

Live Gmail approval, an owner's real bookmark collection, target-Mac performance, complete Google Calendar parity and general-purpose autonomous AI are not certified by these tests. A Linux profile PSS reading is not a Mac per-tab 300 MB guarantee.
