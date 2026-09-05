# Release Checklist for v1.5.52

Date: 2026-09-05. GitHub-only release. Feature freeze: runtime version 1.5.52; no new runtime change during release preparation.

## Required release gates

| Gate | Status |
| --- | --- |
| Coherent manifest/content/background/options version | AUTOMATED PASS; all version fields 1.5.52 |
| Full standalone release validator and whitespace | AUTOMATED PASS; including five JS suites, Native self-test, exact inventory, privacy and links |
| Independent export, complete file inventory, privacy and dependency review | PASS after correcting five invalid documentation links; all54 files classified, no remaining blocker |
| Clean committed candidate, annotated unused RC/stable tags | Clean RC commit `b3a965c736d022d7048c1bc858ec07b420f7dbb3`; RC tag created. Stable tag is verified at publication, never overwritten. |
| Four ZIPs, SHA256SUMS, exact source archive, package contents | RC AUTOMATED PASS; 54 exact source files, 10 extension files and 9 per Native-host ZIP. Final archives are regenerated from the clean release commit and checked before upload. |
| Fresh isolated packaged extension load and options/runtime version | PASS: one Chrome for Testing extension worker; manifest/runtime/options Build and content-version diagnostic 1.5.52, runtime pong true, zero options console errors/warnings. No real ChatGPT/Native/Vault action. |
| Normal main push and exact remote SHA | Verify against the published stable tag and GitHub repository; remote outcome is recorded after publication, not predicted by this committed checklist. |
| Public release metadata, downloaded assets and checksums | Publication requires re-download/checksum/archive verification of the four ZIPs and SHA256SUMS; see the GitHub release metadata and assets. |

## Manual evidence and scope

The user reports: **현재까지 이상 없음** (no issues found in approximate manual operation checks so far). This is a bounded user report, not a scenario-by-scenario live PASS; exact tested scenarios and inspected Vault artifacts were not supplied.

The release proceeds under the user's explicit instruction to complete deployment after the remaining required automatic/export/package gates, while retaining these unperformed scenarios as follow-up. No failed observed manual gate is waived or relabeled. A new observed problem or required gate failure blocks publication until corrected and revalidated.

| Scenario | Status |
| --- | --- |
| Current real ChatGPT response Share, selected Q+A3 and inspected new Vault note | NOT RUN by release agent; user general report only |
| Conversation fallback, cancellation and failure-warning live cases | NOT RUN |
| Current Chrome Native Messaging direct save with inspected note/attachments | NOT RUN |
| Packaged macOS installer/uninstaller against a fresh real installation | NOT RUN; non-blocking; existing installation preserved |
| Windows PowerShell syntax | SKIPPED if pwsh unavailable; automatic result recorded separately |
| Real Windows Native helper | NOT RUN; Experimental |
| Linux Native helper | UNSUPPORTED |
| Chrome Web Store | NOT RUN; outside GitHub distribution scope |

Fresh package load is separate from real ChatGPT/Native/Vault E2E. URI dispatch or a Native self-test is never evidence of a saved Vault file. Historical v1.5.50 checklists remain unchanged.

The initial browser harness used an unsupported callback signature and a missing harness URL global; those harness-only errors were corrected before the fresh-load assertions. They were not product failures or live save tests. The reviewed product bytes remain unchanged between RC and final release preparation.
