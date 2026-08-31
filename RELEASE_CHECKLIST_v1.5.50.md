# Release Checklist for v1.5.50

This checklist records evidence for the v1.5.50 GitHub release. It does not replace the immutable v1.5.40 evidence in `RELEASE_CHECKLIST.md` or `docs/manual-smoke-test.md`.

Status values: `PASS`, `AUTOMATED PASS`, `MANUAL PASS`, `FAIL`, `NOT RUN`, `NOT TESTED`, `LIVE UNVERIFIED`, `SKIPPED`, `UNSUPPORTED`.

## Candidate identity

| Check | Status | Evidence |
| --- | --- | --- |
| Version | PASS | Static `manifest.json`, content/background/options constants, and the options-page diagnostic source all report `1.5.50`; the rendered packaged diagnostic is checked separately at the fresh-load gate. |
| Public export commit | NOT RUN | Record the reviewed Public-only commit after server-side path-boundary verification. |
| Stable tag | NOT RUN | `v1.5.50` must be an annotated tag that peels to the Public export commit. |
| Release date | PASS | 2026-08-31 (Asia/Seoul). |

## Automatic verification

| Check | Status | Evidence |
| --- | --- | --- |
| Full release validation | AUTOMATED PASS | Fresh `bash scripts/validate-release.sh` on the pre-commit Public candidate passed all available checks. Run it again on each clean committed candidate. |
| Patch whitespace/errors | AUTOMATED PASS | Fresh `git diff --check` passed on the pre-commit Public candidate. Run it again on each clean committed candidate. |
| JavaScript regression suites | AUTOMATED PASS | Content behavior, generated artifacts, options storage, background clipboard permission, and Visualize share-reference self-tests passed through the validation script. |
| Native helper | AUTOMATED PASS | Python compile and Native self-test passed. |
| macOS installer scripts | AUTOMATED PASS | Installer and uninstaller shell syntax passed. |
| Windows PowerShell syntax | SKIPPED | `pwsh` is unavailable on the release machine. |
| Privacy/artifact scan | AUTOMATED PASS | Exact Public inventory, private user-path, private conversation/share URL, Chrome extension-ID, cache, log, generated-artifact, and archive-boundary scans passed with redacted diagnostics. |
| Runtime code review | PASS | Final runtime review found 0 Critical and 0 Important issues after the consent-remount, ID-less marker, Korean exclusion, privacy scanner, and contract fixes. |
| Public export review | NOT RUN | Re-run after the Public-only documentation and release-tooling adaptations are final. |

## Live and manual evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Repaired previous-answer Visualize scenario | MANUAL PASS | After a fresh 1.5.50 extension/page reload and action-time approval, response Share, strict URL validation, Native save, and Vault inspection completed. The Markdown count increased by one while the HTML count remained unchanged. |
| Saved note pairing | MANUAL PASS | Exactly one new `remote-reference` note used `previous-qa-visualize-share-link`, verified Visualize provenance, exact Q1/A1, and no Q2 marker. |
| Saved Share target | MANUAL PASS | The strict saved Share page rendered the selected A2 visualization and was not an error page. Raw URLs and turn IDs are not retained. |
| Initial restoration geometry-anchor variants | AUTOMATED PASS | Live-shaped long-tail, aligned lazy-remount, aligned timeout, subpixel tolerance, anchor loss, and negative fail-closed cases pass. Only the repaired integrated scenario above is a live result. |
| Consent-time missing-window recovery variants | LIVE UNVERIFIED | Recovery branches, including exact natural A1/Q2 remounts after verified deferral, have focused automated coverage but were not separately established by the final live result. |
| Direct Q2 Visualize pairing without a previous-answer reference | LIVE UNVERIFIED | Automated final-Markdown and resolver coverage passes; no separate current-build Vault save is claimed here. |
| Provider-neutral previous-Q&A marker-loss rich app | LIVE UNVERIFIED | Compound app-preview/runtime, schema, precedence, disappearing-evidence, and fail-closed fixtures pass. No current-build marker-loss Native/Vault save is claimed, and the repaired structured-Visualize live result does not promote this branch. |
| Ordinary Markdown/URI save | NOT TESTED | Unchanged by the v1.5.50 runtime fix and not repeated for this candidate. |
| HTML/generated-file local attachment save | NOT TESTED | Unchanged by the v1.5.50 runtime fix; historical v1.5.40 evidence is not relabeled as current. |
| macOS Native installer/uninstaller from the release ZIP | NOT TESTED | Syntax passed; a fresh packaged install/uninstall was not run and is explicitly non-blocking for this GitHub release. The existing user installation is left untouched. |
| Real Windows native helper | NOT TESTED | Windows remains Experimental. |
| Linux native helper | UNSUPPORTED | No Linux native-helper support is shipped. |

## Package and publication gate

| Check | Status | Evidence |
| --- | --- | --- |
| Clean committed Public candidate | NOT RUN | Must be a descendant of the preflighted Public `main`, with no unrelated history merge. |
| Public-only validation | NOT RUN | Run the Public validation, allowlist/denylist scan, link scan, and `git diff --check`. |
| Four ZIP archives plus checksums | NOT RUN | Generate only from the clean committed Public checkout. |
| Archive contents | NOT RUN | Extension manifest at ZIP root; Native ZIPs platform-bounded; source ZIP matches the Public allowlist. |
| Local SHA-256 verification | NOT RUN | Run from `dist/` against `SHA256SUMS.txt`. |
| Fresh unpacked-package load | NOT RUN | Extract the release ZIP in a fresh temporary Chrome profile and verify manifest/runtime version 1.5.50. |
| Public `main` push | NOT RUN | Re-read the server ref immediately before a normal non-force fast-forward push. |
| GitHub Release | NOT RUN | Publish non-draft, non-prerelease v1.5.50 with exactly five assets and mark it latest. |
| Public asset re-download | NOT RUN | Re-download all assets into a fresh directory and verify the four ZIPs against the published checksum file. |
| Server-side boundary | NOT RUN | Verify Public visibility, main/tag/release identity, exact allowed tree, and absence of internal-only records. |

## Release boundary

Chrome Web Store publication is not part of this GitHub release. Untested platform and variant rows remain explicit and are not promoted by automated coverage or by the one repaired live scenario.
