# Release Checklist for v1.5.53

Date: 2026-09-08. GitHub-only release. Feature freeze: runtime version 1.5.53; no new runtime change during release preparation.

## Required release gates

| Gate | Status |
| --- | --- |
| Coherent manifest/content/background/options version | AUTOMATED PASS; all version fields 1.5.53 |
| Full standalone release validator and whitespace | AUTOMATED PASS on 2026-09-08; five JS suites, Native self-test, exact 55-file inventory, privacy, links and whitespace |
| Independent documentation, complete file inventory, privacy and dependency review | PASS; all 55 paths classified: 9 product/tests, 11 public documents, 1 standalone validator, 7 unchanged binary assets and 27 unchanged public text files; no remaining blocker |
| Clean committed candidate and unused annotated tags | Clean RC `aaf1915e03c4baebf6c174932f4e597354372b08`; annotated `v1.5.53-rc.1` resolves to that commit. The stable tag is checked at publication and is never overwritten. |
| Four ZIPs, SHA256SUMS, exact source archive and package contents | RC PASS in an independent audit: CRC/checksums, exact 10/9/9/55 file inventories, safe paths/types and every inner file matched to committed source. Extension files match the installed runtime. Final generation and matching from clean committed HEAD are required before upload. |
| Fresh isolated packaged extension load and options/runtime version | NOT RUN; no fresh isolated browser/package installation was performed |
| Normal main push and exact remote SHA | Publication checks compare Public main and the stable tag without force pushing; see the published repository and tag for the remote result. |
| Stable GitHub Release metadata, downloaded assets and checksums | Publication requires re-downloading all five assets, matching every byte/checksum and comparing the source archive with the published tree; see GitHub release metadata and `SHA256SUMS.txt`. |

This committed checklist records completed candidate checks. External publication results are verified against the published stable tag, release metadata and downloaded assets; they are not predicted here.

## User verification and release authorization

After the five updated runtime files were placed in the existing unpacked-extension installation, reload and functional testing were delegated to the user. The user reported that the originally failing project save works and explicitly requested the v1.5.53 release.

This is **USER-REPORTED PASS for the original project-save scenario only**. It does not establish an independently observed loaded runtime, every Share/clipboard interaction, a Native payload/audit, or a direct inspection of the resulting Vault note and all artifacts. The user authorized release with the unperformed checks below remaining explicit limitations. Candidate automatic, review and package checks passed as recorded above; final packaging and delivery checks must pass before release completion.

| Scenario | Status |
| --- | --- |
| Original project save using the updated existing installation | USER-REPORTED PASS on 2026-09-08 |
| Agent-observed loaded v1.5.53 runtime and reload | NOT RUN |
| Agent-inspected new Vault note, detailed Markdown and HTML attachments | NOT RUN |
| Agent-observed actual no-Share/clipboard sequence and Native audit | NOT RUN |
| Project rich-app partial/cancel and all current/previous-Q&A combinations live | NOT RUN |
| Non-project response/conversation Share, cancellation and failure-warning live matrix | NOT RUN for this release |
| Fresh isolated packaged extension load | NOT RUN; separate from the updated-installation user report |
| Packaged macOS installer/uninstaller on a fresh installation | NOT RUN; non-blocking; existing installation preserved |
| Windows PowerShell syntax | SKIPPED; `pwsh` is unavailable in the release environment |
| Real Windows Native helper | NOT RUN; Experimental |
| Linux Native helper | UNSUPPORTED |
| Chrome Web Store | NOT RUN; outside GitHub distribution scope |

Automated tests, file deployment, package integrity, package load, user-reported success and agent-inspected Chrome/Native/Vault delivery are separate evidence. A URI dispatch or Native self-test does not prove the resulting note and attachments exist.

## Release behavior

Recognized project conversations save locally without Share consent/acquisition, clipboard access or generated Share fields and sections. Frozen source/answer, selected-node/role/ID, route/runtime checks, initial artifact expectations, actual current/previous-Q&A rich scope, explicit partial consent, Native preflight, Vault containment and audit remain in force. Non-project supplemental Share and specialized remote-reference behavior remain unchanged.

See [Architecture](docs/architecture.md), [Privacy](docs/privacy.md), [Permissions](docs/permissions.md), [Installation](docs/github-installation.md) and [Changelog](CHANGELOG.md). Earlier version checklists retain their original evidence and are unchanged.
