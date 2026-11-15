# Browser Companion 3.2.6 — resource lifecycle

The tool desk no longer retains a duplicate hidden DOM row for every task. All records, task context, pairing and storage remain intact. The explicit legacy-home route still renders its task list.

Closing or backgrounding statistics/venture tools destroys their chart instances and resets their canvas buffers. Opening them recreates charts from the current data. Statistics refreshes have a generation guard so late storage reads cannot recreate a closed chart or overwrite a newer render.

Verification includes 18 native suites, two additional Chromium journeys covering 2,000 task records and chart close/reopen, and matched empty/2,000-task Linux PSS comparisons against shipped 3.2.5. Final CI and measurement outcomes are recorded in root `PROJECT_STATUS.md`; they are pending until that record is updated. Target-Mac long-run and real-account acceptance remain open.

Update the existing permanent unpacked folder in place and Reload at `chrome://extensions`. Do not uninstall or clear storage. There are no new permissions, OAuth scopes, dependencies, keys, database changes or automatic user-data rewrites. Dashboard version 13 stays current.
