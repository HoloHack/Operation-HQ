# Operation HQ source recovery and reliability work

This repository contains historical extension snapshots. Directory numbering
does **not** indicate release order:

| Directory | Manifest version | Status |
| --- | --- | --- |
| `Operation-HQ` | 2.4.0 | Historical source |
| `Operation-HQ 3` | 2.7.0 | Historical source |
| `Operation-HQ 2` | 2.8.1 | Newest recoverable GitHub source; September 30 repairs applied here |

**Do not replace an installed 3.0 extension with this 2.8.1 snapshot.** The
3.0 Browser Power Layer package was located but its transfer failed. These
repairs need to be reconciled with that source before an upgrade is packaged.
The manifest version is intentionally unchanged: this is a source repair,
not a tested migration or a claimed 3.0 release.

The separate dashboard is maintained in its own Sites repository. Its current
reliability release uses D1 storage. Supabase is not required for these fixes;
no unrelated Supabase project was modified.

Run all available source regression checks with Node 24:

```sh
node scripts/check-extension.mjs
```

See [the September 30 audit and handoff](docs/RELIABILITY-2026-09-30.md) for
verified changes, remaining limitations and acceptance gates. A GitHub Actions
workflow checks pushes and pull requests. Weekly runs take effect only once
the workflow is on the default branch. It never deploys or updates models.
