# Operation HQ — completion and controlled evolution

## Product contract

The web dashboard is the everyday workspace. The Chrome companion performs browser-only actions. Each feature must declare its owner, data source, permission, confirmation level, recovery path and real availability. The word “AI” never substitutes for a capability that is absent.

Current implementation is a reliability release, not the finished roadmap. Do not increase the old 75% estimate just because tests were added. Maintain a countable acceptance ledger, distinguish source coverage from real-device verification, and never equate source/ZIP bytes with renderer RAM.

## Architecture decisions

| Decision | Rationale | Reconsider when |
|---|---|---|
| Keep Sites as production source authority; mirror reviewed dashboard snapshots to GitHub | Separate release ownership avoids two independent writers; GitHub supplies regression checks and review | Automated release parity and rollback have been verified |
| Keep D1 for the existing account-scoped dashboard | Avoid an unneeded second database, identity migration and synchronization path | A specific Postgres/realtime/search requirement cannot be met adequately here |
| Unpaired browser planning never transfers automatically | Origin access is separate from account/profile approval; paired planning is explicitly enabled | Fine-grained collection selection and wider device/provider acceptance |
| Automatic planning exchanges only after explicit account pairing | Protocol 2 retains canonical rich planning; native task/note views have their own limits; mail and bookmarks remain local | Broader schema and conflict UX acceptance, including recurrence restrictions |
| Deterministic commands always available | Fast, cheap and predictable; no model download on startup | A model may complement these tools after explicit load and evaluation |
| Model interpretation is advisory | Prevent hallucinated tools, deadlines, chapter links and unsafe side effects | Still require typed validation and confirmation regardless of model quality |
| No automatic dependency/model upgrades | “Latest” is not a quality or compatibility guarantee | Candidate beats the pinned baseline on accuracy, latency, memory and safety tests |

## Data-flow and threat ledger

| Surface | Data | Boundary | Retention/recovery | Remaining work |
|---|---|---|---|---|
| Browser dashboard and device journal | Tasks, notes, events, preferences | Signed-in account AND separately locked tab identity | Pending copies in IndexedDB; exact same-tab reload recovery; selected copies can be recovered/exported | Cloud conflict history; encrypted exports; deletion/tombstones; target-device crash tests |
| D1 account row | Sanitized dashboard snapshot, revision | Server-injected user identity; bound queries | Persistent, revision checked | Event-level history, deletion/tombstones, retention UI, backup restore |
| Browser import and paired planning | Whitelisted planning projection / canonical HQ schema | Exact origin, extension opt-in, explicit account/profile approval and token | Preview; namespaced additions; notes choice; revocable pairing; lifecycle and cross-tab guards | Fine-grained collection selection; broader field parity and owner-device acceptance |
| Browser tool handoff | Requested tool name | Extension allowlist and Chrome permissions | No dashboard copying of bookmark/mail contents | Real Chrome tests cover disabled/connected bridge and Nexus handoff; live account/provider checks remain |
| Weather | Coordinates and forecast request | Browser location permission; HTTPS provider | Response held in memory | Units/forecast settings; age label and independent provider tests |
| Recovery export | Current planning snapshot | Explicit download action | User-controlled plaintext file | Import preview and validated restore; optional encryption |
| Local model (extension) | Selected local context per roadmap | Explicit model load/source selection | Not independently verified this run | Download/unload, quotas, unsupported GPU and retention tests |

Recovery JSON contains personal tasks/notes. It is not encrypted and should not be shared publicly. It does not intentionally export credentials. No new telemetry, microphone access, scraping, paid services, OAuth scopes or production database migration was introduced by this pass.

### Threats requiring ongoing testing

- Spoofed/untrusted bridge messages: validate origin, message type, protocol and bounded typed payloads in the extension; the website alone cannot enforce the extension's entire trust boundary.
- Shared-browser account confusion: require visible account and browser-profile confirmation; pairing should use a revocable per-account association rather than assuming exact origin means same person.
- Malicious imported titles/notes/links: escape content, reject dangerous URL schemes, prevent remote text from becoming executable commands.
- Prompt injection in email, documents or pages: treat source text as data. It must not grant tool authority, alter permissions or initiate communications.
- Stale writers: server compare-and-swap plus merge/review; serializing one browser page is not a global lock.
- Corrupt rows: fail closed and preserve bytes. Do not “recover” by quietly saving a blank snapshot.
- Secret leakage: do not include tokens, API keys, PINs or provider payloads in debug output, backups, schedules, issues or commits.
- Denial of service: bound request bytes before parse, array sizes, model allocations and provider polling. Rate limiting and operation-level storage remain future hardening work.

## Feature completion backlog

| Work package | Concrete next deliverable | Acceptance criteria | Dependencies |
|---|---|---|---|
| Extension source parity | Current 3.2.3 source and install archive recovered; 94 packaged files match GitHub | Mutation/undo/lock and native Chrome evidence exists; exact historical 3.0 comparison remains unverified | Historical archive only for that historical comparison, not as a blocker to current-source development |
| Shared sync protocol | Delivered explicit protocol-2 pairing, canonical planning and tombstones; harden lifecycle and cross-tab responses | Delayed replies preserve newer notes; shared lock; malformed acks refused; disconnect/recovery tested. Remaining: finer data selection and broader conflict/device acceptance | Companion 3.2.3 and account-scoped dashboard |
| Calendar/timetable | Real month/week/day/agenda plus recurring timetable projection and editable events | Local dates, DST, recurrence exceptions, week start, overlapping sessions, tomorrow rollover and ICS round trip | Shared schema; actual timetable fixture |
| Tasks/planner | Task details, subtasks, dependencies, effort and deadlines; reviewed rescheduling | Math 5/7/8/10 now asks due date and estimate; remaining: respects fixed blocks and capacity, shows moved tasks and exact undo | Calendar and shared store |
| Study integration | Assignment/exam/recall/research views with linked sources and reviewed intake | Extracted deadlines confirmed; no invented rubric/metadata; duplicate imports idempotent | Shared schema |
| Browser intelligence | Topic-first sorting and workspace duplicate review | Ambiguity stays put; saves/restore retain pinned and saved-only tabs; no silent close | Real Chrome test profile |
| Gmail | Verified connect/revoke/reconnect, local lanes, pagination and thread open | Read-only scope enforced; errors visible; no fake replies or Gmail labels | Authorized real account test |
| Gleam | Port existing module after recovering its source | Core practice/journal/progress workflows are real; no invented scoring or diagnostic claims | Extension source and module specification |
| Nexus | One capability registry with input schemas, availability, preview, confirmation and undo | Every command maps to a real tested action; unknown commands stay inert; cancellation works | Modules above |
| Local intelligence | Opt-in provider profile and fixed task benchmark | Resource limits and unload tested; model never mutates stores directly; clear offline/support state | Nexus typed tools |
| Wallpaper/motion | Real quality-checked assets; theme/reduced-motion parity and bounded animation | Last valid scene preserved on provider errors; pointer-safe overlays; consistent frame pacing | Provider fixtures plus target monitor |
| Offline recovery | Delivered: account/tab device drafts, reload recovery, metadata pagination, explicit note conflict choice and selected-copy recovery | Automated tests and native Chrome cover reload/offline, account isolation, duplicate-tab locks and schema migration; remaining: target-device crash/private-storage cases and cloud conflict history | Tested local journal; shared operation sync remains separate work |
| Integration gallery | Capability/permission/health/disconnect ledger | Every adapter shows exact scope, last success, current error and deletion choice | At least two real adapters to validate contract |

## Testing ladder

### Every code change

1. Run `npm test` (Node 24 for the built-in SQLite test harness).
2. Run `npm run typecheck`.
3. Check the diff for accidental data/permission changes and run `git diff --check`.
4. Build with the project’s supported Sites workflow.
5. Record exact test counts, source commit and known limitations. A build pass is not a browser pass.

### Every major feature stage

- Review producer, store, consumer, UI feedback, failure recovery and undo together—not just the changed file.
- Exercise initial empty state, real populated state, maximum supported data, malformed input, timeout, denial, revocation, cancellation, duplicate click and two simultaneous clients.
- Require visual/keyboard review of all affected screens. Use a 320px viewport, target laptop/monitor and 200% browser zoom.
- Verify every close button is contained in its panel and reachable; no animated layer intercepts input.
- Confirm Reduced Motion works before load, while running and after the OS preference changes.

### Release candidate on the target Mac

| Scenario | Evidence to retain | Pass condition |
|---|---|---|
| Existing extension upgrade | Backup, version, data counts before/after | Reload existing unpacked installation; don't uninstall and erase data |
| Clean Chrome profile | Manifest/permission list, empty-state captures | No sample private data or dead buttons |
| Ordinary new tabs | Chrome Task Manager capture, five tabs | No Operation HQ dashboard automatically started |
| Open dashboard | Start/5/15/30-minute Task Manager captures | Target <=300MB renderer footprint in Balanced, no local model; report actual result |
| Effects and background | Frame trace, hidden-tab CPU and GPU observation | No sustained growth; hidden rendering stops; no blocked input |
| Two tabs | Notes conflict, task update and calendar edit | Latest draft survives; conflict choices preserve both versions |
| Network failure | Offline save/retry and page-close warning | Never show Saved for unacknowledged data |
| Gmail lifecycle | Connect, refresh, revoke, reconnect | Visible state and no silent button failures |
| Browser actions | Bookmark preview/apply/undo and workspace restore | No user-folder or saved-tab loss |
| Maths mission | Exact chapter list and user deadline | No invented chapter URL, due date or capacity |

Chrome distinguishes operating-system memory footprint from JavaScript heap. Measure both, and report GPU/process scope separately. See [Chrome memory diagnostics](https://developer.chrome.com/docs/devtools/memory-problems) and [extension message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), checked 29 September 2026.

## Safe self-evolution loop

1. Observe: run available tests and inspect explicit failures; do not collect private content as telemetry.
2. Research: check official release notes/security advisories for used dependencies and candidate models; record date and source.
3. Evaluate: compare against fixed tasks—exact chapter extraction, missing-deadline clarification, no-op unknown commands, tool-schema validity, ambiguous-bookmark abstention and injection resistance.
4. Propose: produce a small ranked change with benefit, risk, memory cost, compatibility and rollback.
5. Implement: isolated patch with regression tests; never auto-merge generated code based solely on a model's self-rating.
6. Release: explicit reviewed publishing step; preserve audience and permissions; do not enable billable services silently.
7. Verify: rerun smoke tests and retain previous deployable version. Data migrations need their own backward-compatible recovery plan; reverting UI code alone cannot undo a destructive migration.

This is an engineering feedback loop, not a claim of autonomous general intelligence. Weekly checks can surface regressions and update the backlog; unattended feature deployment is intentionally not enabled.

## Progress scoring that cannot hide unfinished work

Give each agreed capability four binary gates: source implemented, automated behavior tests, real-browser acceptance, target-device/provider acceptance. Report each dimension separately. Missing evidence scores unverified, not failed and not passed. Keep optional desktop work outside the extension/dashboard denominator. Freeze the scope list before calculating a percentage.

Current whole-product completion: **not independently measurable yet**. The previous 75% remains historical only. Today's verified work is a dashboard reliability slice, not completion of Calendar parity, local AI, Gleam, browser intelligence or the full roadmap.

## Earlier bridge and recovery release

See [8 October bridge and recovery update](RELEASE-2026-10-08-BRIDGE-AND-RECOVERY.md) as a historical snapshot. Current companion source is 3.2.3. Explicit paired planning now exists, with bounded canonical exchanges; that is not a claim of complete provider or schema parity. Exact historical 3.0 comparison remains unavailable.

## Latest paired-planning safety release

See [16 October paired-planning safety](RELEASE-2026-10-16-PAIRED-PLANNING.md) for current source, tests and limitations. This replaces earlier statements that all two-way planning is unimplemented. It does not mark full calendar-provider integration, model-backed general assistance, live Gmail acceptance or the Mac memory target complete. The [recorded-flow repair](RELEASE-2026-10-16-SMOKE-TEST.md) documents the shared visual desk, wallpaper and bookmark fixes.
