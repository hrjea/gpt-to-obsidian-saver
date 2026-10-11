# Release Checklist for v1.5.63

Date: 2026-10-11. Unpublished GitHub-only candidate **v1.5.63-rc.1**. Runtime and planned archive filenames use version 1.5.63. Keep `main` and the latest stable v1.5.54 release unchanged. The stable v1.5.63 tag is BLOCKED.

## Reason for this candidate

A later installed v1.5.62 save captured only 24 of 41 expected HTML files. The next file completed after the note was written. This candidate removes the shared 90-second total cutoff while preserving finite waits and exact-name matching. A separately repaired note is not evidence of a successful extension save.

## Candidate gates

| Check | Status |
| --- | --- |
| Automated source tests and independent timing review | PASS for version 1.5.63; separate from live saving |
| Independent Public validator, version coherence, privacy, exact inventory and local Markdown links | AUTOMATED PASS on 2026-10-11; Windows PowerShell skipped because pwsh is unavailable |
| Every included Public file and dependency classified against the preceding candidate | PASS: all 64 paths classified; nine explicit runtime/test exports match the frozen source, with Public-specific documentation/validator maintenance |
| Existing Mac installation files match all 13 runtime files | PASS; file deployment only |
| Chrome reload and refreshed ChatGPT page running 1.5.63 | PASS: version observed at the save action |
| New installed original-project Save and actual Native/Vault output | PASS: 41 HTML files and note body; assisted and explicitly limited as described below |
| Installed non-project save and unrelated Share regressions | NOT RUN |
| Fresh isolated Load unpacked from the exact packaged extension | NOT RUN |
| Actual Branch & visualize generation | NOT RUN |
| Clean committed Public candidate and unused annotated v1.5.63-rc.1 tag | NOT RUN; required before packaging |
| Four ZIPs plus SHA256SUMS, exact contents, CRC and per-file comparison | NOT RUN |
| Candidate branch/tag push, prerelease and independent asset re-download | NOT RUN; no v1.5.63 publication yet |

Windows PowerShell syntax validation is SKIPPED when pwsh is unavailable; real Windows Native is NOT RUN/Experimental. Linux Native is UNSUPPORTED. Packaged macOS Native installer/uninstaller is NOT RUN and non-blocking because the helper is unchanged. Chrome Web Store is outside scope.

## Manual gate and publication decision

The original project scenario is LIVE PASS within the scope below. Stable publication remains BLOCKED until the remaining installed non-project Save/Share and isolated package-load gates pass. Missing checks permit only the explicitly labeled RC with these limits disclosed. Prior-version evidence and source tests do not replace current results.

After a confirmed 1.5.63 reload, the original project Save displayed 41 expected and 41 captured HTML files. The run included assistance at the generated-Markdown download prompt, then explicit user approval to save the HTML files and note body while omitting ZIP, detailed Markdown (.md) and mind-map (.mm) files. Those formats were not verified as captured. The resulting new note was observed in Obsidian. Independent output inspection verified 41 HTML files with 41 distinct hashes, byte agreement with the current downloads after Native filename-alias rewriting, and all 227 local-file references plus 388 fragments with zero broken targets. This is the actual extension-created note; a separately repaired older note is not this evidence.

Project saving performs no Share/clipboard action. Non-project Share and fresh isolated package load remain NOT RUN, as do broader live cancellation/ambiguity cases. Automated tests separately verify that partial-save refusal creates no note and that missing/ambiguous files, runtime failures or timeouts are not treated as complete capture. These results do not establish an unattended all-format save.

## Timing and trust boundaries

Each verified matching download receipt renews a 90-second progress allowance. An absolute ten-minute batch deadline and the existing 100-file bound remain fixed. Setup, download wait and cleanup use the earlier remaining deadline. A stall or unconfirmed cleanup stops collection; late watch IDs are cancelled without another click, and late download callbacks cannot resume the batch. Wrong names and missing/ambiguous controls never renew progress. Cleanup time is excluded from the verified receipt timestamp.

Canonical filenames, current-control uniqueness, runtime guards, explicit partial-save consent, Share boundaries and Native/Vault validation remain unchanged. See [Changelog](CHANGELOG.md), [Architecture](docs/architecture.md), [Installation](docs/github-installation.md) and [Release process](docs/release.md). Earlier checklists retain their historical evidence.
