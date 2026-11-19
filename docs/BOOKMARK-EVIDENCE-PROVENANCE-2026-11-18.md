# Resource-bound bookmark evidence — 18 November 2026

## Reproduction and repair

Synthetic reproduction used the actual metadata reader and extracted automatic-worker sorting function: a vague bookmark at `https://example.org/item/one` initially abstained. A response redirected to an unrelated music page supplied music metadata; the old reader accepted a public final host, cached that text under the original link, and the worker automatically filed the original as Music. No owner links or external network requests were used.

Evidence fetch now uses `redirect: error` and rejects redirected responses, missing response identity and any mismatch against the exact requested endpoint. Origin, path and query (including video/resource IDs) must agree; ordinary HTTP fragments are ignored. oEmbed responses must match the exact provider endpoint and encoded resource query. Existing seven-second request and streaming byte limits, omitted credentials, private-host exclusion and explicit permission controls remain intact.

Evidence cache entries now require `schema: 2`, the matching exact `resourceKey`, nonempty text and a valid nonfuture timestamp younger than seven days. **Both** foreground and automatic-worker readers reject old unproven or mismatched entries. This is lazy cache invalidation, not deletion of bookmarks or other user records. Old metadata may need an authorized refetch. The background worker still never fetches arbitrary pages or starts AI.

Trade-off: legitimate redirects/canonical moves are also refused. This may reduce coverage until the owner supplies the canonical link or a separately reviewed provenance policy is built. No inferred cross-resource equivalence, redirect scraping workaround or silent permission expansion was added. Same-resource metadata can still be misleading; provenance is not semantic accuracy or prompt-injection immunity.

## Verification

- All **26 local native suites pass** after registering the new provenance suite. Five new tests cover cross-origin redirect, changed path/query, missing final URL, reported redirect, exact oEmbed query, direct-resource caching, legacy invalidation and actual worker non-movement on incorrectly bound cache. Existing positive fixtures now explicitly model response URL and cache schema instead of silently accepting missing provenance.
- Independent evaluation and current-head Chrome/CI are required before accepting this stage. Earlier green recovery CI belongs to its exact source, not these changed readers.
- Recovery phases from `772d6d2` remain intact. Dedicated recovery layout and native 320px/keyboard journey are in `c06e98e`; its Chrome step passed before this evidence change. No website source, OAuth identity, permissions, dependency/model or production records changed.

Research for the run is recorded in [recovery acceptance](BOOKMARK-RECOVERY-2026-11-18.md). The Chrome move API lacks expected-parent CAS; prepared/applied recovery remains conservative. Vite's documented development-server security advisory remains blocked by the prior denied upgrade, which was not retried.

## Next acceptance and continuity

1. Finish current-head full CI, native recovery UI and metadata-failure regressions; inspect actual CodeRabbit findings. Requests/green tests are not approval.
2. Compare actual opted-in semantic inference against the labelled baseline, including precision, coverage and abstention. Current 31-resource input-only baseline still has one wrong confident acceptance and eight known topics unresolved. This metadata fix does not change or certify that benchmark.
3. Continue sustained paired memory work before calendar/timetable/Maths expansion. No new RAM reduction or 300 MB Mac result is claimed.

No production deployment or owner installation occurred. Whole-product completion is not measurable from these bounded safety stages. Keep pending new-format recovery journals away from older Undo code; code rollback must not erase personal storage. Automatic sorting under older code also lacks the new provenance checks, so it cannot be considered an equivalent safe fallback.
