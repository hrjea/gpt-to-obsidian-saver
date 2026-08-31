# Release Checklist for v1.5.50

This checklist records evidence for the v1.5.50 GitHub release. It does not replace the immutable v1.5.40 evidence in `RELEASE_CHECKLIST.md` or `docs/manual-smoke-test.md`.

Status values: `PASS`, `AUTOMATED PASS`, `MANUAL PASS`, `FAIL`, `NOT RUN`, `NOT TESTED`, `LIVE UNVERIFIED`, `SKIPPED`, `UNSUPPORTED`.

## Candidate identity

| Check | Status | Evidence |
| --- | --- | --- |
| Version | PASS | Static `manifest.json`, content/background/options constants, and the options-page diagnostic source all report `1.5.50`; the rendered packaged diagnostic is checked separately at the fresh-load gate. |
| Public export commit | NOT RUN | Record the reviewed Public-only commit after server-side path-boundary verification. |
| Stable tag | NOT RUN | `v1.5.50` must be an annotated tag that peels to the Public export commit. |
| Release date | NOT RUN | Record the actual Asia/Seoul release date only after the Public `main`, stable tag, and GitHub Release publication succeeds. |

## Automatic verification

| Check | Status | Evidence |
| --- | --- | --- |
| Full release validation | AUTOMATED PASS | Fresh `/bin/bash scripts/validate-release.sh` passed on clean code commit `bb84b61`, including the release-boundary fixes; it is rerun after this checklist-only commit before tagging. |
| Patch whitespace/errors | AUTOMATED PASS | `git diff --check` passed on clean code commit `bb84b61`; it is rerun after this checklist-only commit before tagging. |
| JavaScript regression suites | AUTOMATED PASS | Content behavior, generated artifacts, options storage, background clipboard permission, and Visualize share-reference self-tests passed through the validation script. |
| Native helper | AUTOMATED PASS | Python compile and Native self-test passed. |
| macOS installer scripts | AUTOMATED PASS | Installer and uninstaller shell syntax passed. |
| Windows PowerShell syntax | SKIPPED | `pwsh` is unavailable on the release machine. |
| Privacy/artifact scan | AUTOMATED PASS | Exact Public inventory, private user-path, private conversation/share URL, Chrome extension-ID, cache, log, generated-artifact, and archive-boundary scans passed with redacted diagnostics. URL-token exemption is limited to `tests/` entries whose token starts with `synthetic-`; ellipsis, bare UUID, ordinary-test, and non-test synthetic tokens are rejected. |
| Runtime code review | PASS | Final runtime review found 0 Critical and 0 Important issues after the consent-remount, ID-less marker, Korean exclusion, privacy scanner, and contract fixes. |
| Public export review | NOT RUN | Whole-diff and focused release-tooling reviews cleared the code and scripts, but the final checklist review remains open; record `PASS` only after its blockers are closed. |

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
| Clean committed Public candidate | PASS | Reviewed code/package input commit `bb84b61` is a direct descendant of the preflighted Public `main` with no merge. The only following source change is this evidence checklist, which is revalidated from a clean commit before final packaging. |
| Public-only validation | AUTOMATED PASS | Full validation, exact 53-path allowlist, Markdown links, privacy scan, and `git diff --check` passed under macOS Bash 3.2 on clean `bb84b61`; the same commands are rerun after this checklist commit. |
| Four ZIP archives plus checksums | AUTOMATED PASS | `scripts/package-release.sh` generated exactly four ZIPs plus `SHA256SUMS.txt` from clean `bb84b61`; all files are regenerated from the final checklist commit before upload. |
| Archive contents | AUTOMATED PASS | Extension ZIP contained the exact ten allowlisted files with bytes matching committed inputs; Native ZIPs were platform-bounded; source ZIP matched all 53 committed paths and the required path-list hash. |
| Local SHA-256 verification | AUTOMATED PASS | All four clean-commit ZIPs passed `shasum -a 256 -c SHA256SUMS.txt`; the final checksum file is regenerated and reverified after this checklist commit. |
| Fresh unpacked-package load | MANUAL PASS | A new isolated Chrome for Testing profile loaded the clean-commit extension ZIP (SHA-256 `38cd5ddaad3cea95497ab8313691a0301881b242e124c65bd5f9133dbd598168`) as enabled version 1.5.50. Options showed Build/content-script 1.5.50, runtime ping returned `{ok:true,pong:true,version:"1.5.50"}`, the console had 0 errors and 0 warnings, and the package source used the explicit `<share-token>` placeholder. No user Chrome profile, Native registration, or Vault state was touched. |
| Public `main` push | NOT RUN | Re-read the server ref immediately before a normal non-force fast-forward push. |
| GitHub Release | NOT RUN | Publish non-draft, non-prerelease v1.5.50 with exactly five assets and mark it latest. |
| Public asset re-download | NOT RUN | Re-download all assets into a fresh directory and verify the four ZIPs against the published checksum file. |
| Server-side boundary | NOT RUN | Verify Public visibility, main/tag/release identity, exact allowed tree, and absence of internal-only records. |

## Release boundary

Chrome Web Store publication is not part of this GitHub release. Untested platform and variant rows remain explicit and are not promoted by automated coverage or by the one repaired live scenario.
