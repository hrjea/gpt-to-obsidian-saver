# Release Checklist for v1.5.52

Date: 2026-09-05. GitHub-only release. Feature freeze: runtime version 1.5.52; no new runtime change during release preparation.

## Required release gates

| Gate | Status |
| --- | --- |
| Coherent manifest/content/background/options version | PENDING automatic validation |
| Full standalone release validator and whitespace | PENDING |
| Independent export, complete file inventory, privacy and dependency review | PENDING |
| Clean committed candidate, annotated unused RC/stable tags | PENDING |
| Four ZIPs, SHA256SUMS, exact source archive, package contents | PENDING |
| Fresh isolated packaged extension load and options/runtime version | PENDING; blocks publication until checked |
| Normal main push and exact remote SHA | PENDING |
| Public release metadata, downloaded assets and checksums | PENDING |

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
