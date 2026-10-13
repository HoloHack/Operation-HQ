# Companion 3.2.1: paired planning repair

Chrome can reorder stored object keys. Planning exchange previously compared insertion-order JSON, treating equivalent data as changed. A dashboard critical task could then conflict with its native high-priority projection. This was reproduced in the real native-Chrome Maths/pairing journey.

Comparisons now use stable content ordering and ignore only the record timestamp. Native changes update only changed projected fields, preserving richer dashboard metadata such as critical priority when the browser editor changes an estimate. True simultaneous conflicting edits still stop atomically.

Two added paired-sync regressions cover Chrome-style key reordering and a native estimate edit without priority loss. Native-Chrome and full companion-suite outcomes are recorded in the final dashboard release report after CI completes.

The extension ID, OAuth client, permissions, paired protocol and browser-data boundary are unchanged. No model or dependency is upgraded. Ordinary new tabs still load no Operation HQ scripts. No real bookmarks, email or planning records were used for tests.

Upgrade the existing unpacked folder in place and click Reload at chrome://extensions. Do not uninstall and erase the existing browser profile. For the new Study desk's paired planning, use 3.2.1; older companions can produce the false conflict described above.

Rollback: disconnect pairing before returning to the previous companion, retaining canonical copies and exporting current planning. A UI rollback must not delete new planning data or deletion history.
