# Release Checklist for v1.5.54

Date: 2026-09-08. GitHub-only release. Runtime frozen after the verified fix.

## User verification and authorization

The user reports that the originally failing ordinary HTML save succeeds after the five runtime files were updated in the existing installation, and explicitly requested this release. This is USER-REPORTED PASS for that scenario. Agent-observed runtime reload, actual Share/Native trace, direct Vault/attachment inspection and fresh isolated package load remain NOT RUN.

## Candidate gates

- Version coherence, complete standalone validator, privacy, exact inventory and local links: AUTOMATED PASS on 2026-09-08; PowerShell SKIPPED (unavailable).
- Separate source/dependency review: PASS, all 56 paths classified: nine product/tests, seven public documents, one standalone validator, seven unchanged binary assets and 32 unchanged text files. No internal documentation or ancestry added.
- Clean committed candidate and unused annotated RC/stable tags: required; no history rewrite.
- Four ZIPs plus SHA256SUMS: require CRC, exact inventories, safe paths and every inner file matched to committed source.
- Public main/tag push, stable release and re-downloaded asset bytes/checksums: verified at publication, not predicted by this committed checklist.

## Behavior and limits

HTML extraction now waits for Preview restoration before unchanged ordinary Share proof. Timeout, missing/ambiguous viewers and genuine answer drift remain fail-closed. Ordinary consented Share and project no-Share policies are preserved.

Packaged macOS installer/uninstaller: NOT RUN, non-blocking. Windows PowerShell: SKIPPED when unavailable; real Windows Native: NOT RUN/Experimental. Linux Native: UNSUPPORTED. Chrome Web Store: outside scope. Source-file identity and automatic validation do not prove agent-observed Vault delivery.

See [Changelog](CHANGELOG.md), [Architecture](docs/architecture.md), and [Release process](docs/release.md). Earlier checklists retain their historical evidence.
