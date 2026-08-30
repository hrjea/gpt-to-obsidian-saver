# Release Checklist for v1.5.40

This is immutable release evidence for v1.5.40, not a checklist for the current development version. Create a new version-specific checklist for a future release.

Status values: PASS, MANUAL PASS, FAIL, NOT TESTED, SKIPPED, UNSUPPORTED.

## Static Validation

| Check | Status | Evidence |
| --- | --- | --- |
| Version consistency | PASS | `./scripts/validate-release.sh` |
| JavaScript syntax | PASS | `node --check` via validation script |
| Python compile | PASS | `python3 -m py_compile` via validation script |
| Native helper self-test | PASS | `python3 native-host/native-open-obsidian.py --self-test` |
| JSON validation | PASS | Manifest and locale JSON via validation script |
| Privacy scan | PASS | Validation script forbidden-string checks |

## Manual Smoke Tests

| Test | Status | Evidence |
| --- | --- | --- |
| GitHub extension ZIP fresh Load unpacked | NOT TESTED | Requires manual Chrome UI after archive generation. |
| Normal answer Markdown note | NOT TESTED | Requires manual ChatGPT/Obsidian UI. |
| Actual HTML artifact | MANUAL PASS | Live v1.5.40 macOS save on 2026-08-25 created one 91,202-byte Markdown note and 12 HTML attachments totaling 359,295 bytes. |
| Generated detailed Markdown artifact | MANUAL PASS | The live v1.5.40 note contains the generated detailed Markdown body; no raw detailed-Markdown marker remains. |
| Multiple HTML artifacts and links | MANUAL PASS | All 12 note-relative HTML links from the live v1.5.40 note resolve to files in the configured attachment folder. |
| Previous Q&A available | PASS | `tests/previous-qa-html-learning-self-test.js` covers a/b selection and attachment-first structure; v1.5.40 live retest remains recommended. |
| Previous Q&A unavailable | PASS | `tests/previous-qa-html-learning-self-test.js` covers generated note structure. Manual end-to-end still recommended. |
| Plain filename does not create attachment | PASS | `tests/previous-qa-html-learning-self-test.js` and native self-test cover marker/filename behavior. |
| Favicon filtering | NOT TESTED | Requires manual ChatGPT note capture. Source filter exists in `content.js`. |
| Duplicate click | NOT TESTED | Requires manual UI timing test. Source duplicate protection exists in `content.js` and `background.js`. |
| English UI | PASS | Static source and self-test headings. Manual options-page check recommended. |
| Korean UI | PASS | Static source and self-test headings. Manual options-page check recommended. |
| Native helper missing | NOT TESTED | Requires manual install/remove scenario. |
| Wrong extension ID | NOT TESTED | Requires manual native-host mismatch scenario. |
| macOS native-helper save | MANUAL PASS | Live v1.5.40 Chrome-to-native-helper save created the Markdown note and 12 HTML files on 2026-08-25. |
| macOS installer | NOT TESTED | Syntax is validated by `./scripts/validate-release.sh`, but fresh v1.5.40 release ZIP installation has not been manually tested. |
| macOS uninstaller | NOT TESTED | Syntax is validated by `./scripts/validate-release.sh`, but fresh v1.5.40 uninstall behavior has not been manually tested. |
| Windows native helper | NOT TESTED | Not validated on a real Windows machine. |
| Linux native helper | UNSUPPORTED | No Linux native-helper support in this release. |

## Final Tag Gate

PASS for v1.5.40: automated release validation passed, and the live macOS artifact workflow saved a detailed Markdown note plus 12 usable HTML attachments. In one Obsidian 1.13.x run, the externally written note appeared in File Explorer only after a normal app restart; the files were already present on disk and the recovery is documented in `docs/troubleshooting.md`. Remaining NOT TESTED platform and failure-mode checks are documented as non-blocking; Windows remains Experimental and Linux native-helper mode remains unsupported.
