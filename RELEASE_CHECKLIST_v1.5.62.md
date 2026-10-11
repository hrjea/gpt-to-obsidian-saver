# Release Checklist for v1.5.62

Date: 2026-10-11. GitHub-only prerelease candidate **v1.5.62-rc.1**. Runtime and package filenames use version 1.5.62. The latest stable release remains v1.5.54; do not create the stable v1.5.62 tag.

## Candidate gates

- Independent public validator, version coherence, privacy, exact inventory and local Markdown links: AUTOMATED PASS on 2026-10-11.
- Every included file and dependency classified against the previous public release: PASS, all 63 paths classified and independently reviewed; no internal source records or history imported.
- Clean committed candidate and unused annotated v1.5.62-rc.1 tag: REQUIRED before packaging/prerelease publication; not yet created. Stable tag creation is blocked.
- Four ZIPs plus SHA256SUMS: REQUIRED CRC, exact inventory, safe paths and every inner file matched to the committed candidate; NOT RUN.
- Public candidate branch `codex/release-v1.5.62` and new `v1.5.62-rc.1` tag push, prerelease and re-downloaded asset checksums: NOT RUN; verify at publication. Keep `main` and the latest stable release unchanged.

## Manual verification and publication decision

Existing macOS installation files were updated and checked against the source hashes: PASS. This establishes file deployment only. Installed Chrome reload, the original multi-file HTML Save action, actual Native Messaging and the newly saved Vault note/attachment graph: NOT RUN for this version. A separately repaired note is not extension E2E evidence. Synthetic source tests do not establish real browser download behavior or Vault delivery.

Stable publication is BLOCKED until the required installed project/non-project Save/Native/Vault scenarios and a fresh isolated unpacked-package load pass. No earlier version's user report counts as v1.5.62 evidence. These missing checks permit only a clearly labeled prerelease with its limits disclosed. Fresh isolated package load and actual Branch & visualize generation are NOT RUN for this candidate.

The linked-HTML manual scenario uses an answer with an index and multiple HTML files, including collapsed resource cards. Confirm all requested files, distinct contents, note-relative links and HTML-relative links in a test Vault. Confirm project saving performs no Share/clipboard action; when testing a non-project save, follow its separate Share consent. Also check cancellation and missing/ambiguous downloads fail closed rather than producing a falsely complete note.

Packaged macOS Native installer/uninstaller: NOT RUN, non-blocking because the helper is unchanged. Windows PowerShell validation: SKIPPED (pwsh unavailable); real Windows Native: NOT RUN/Experimental. Linux Native: UNSUPPORTED. Chrome Web Store: outside scope.

## Behavior

The current inline file references, resource rows and collapsed file list contribute to expected HTML files. Each remaining file uses a bounded exact-name download watch even if the index is already readable. Canonical filenames preserve sibling-link rewriting after Chrome adds a duplicate suffix. A shared 90-second batch budget, 100-file bound, exact current control, ambiguity and runtime checks remain in effect. Incomplete capture still cancels by default or requires explicit partial-save consent.

This release also includes Branch & visualize and compatibility fixes since v1.5.54. Its explicit button opens one ChatGPT branch and sends a fixed Visualize request; it is separate from saving. See [Changelog](CHANGELOG.md), [Architecture](docs/architecture.md), [Privacy](docs/privacy.md) and [Release process](docs/release.md). Earlier checklists retain their historical evidence.
