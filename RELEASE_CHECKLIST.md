# Release Checklist for v1.5.20

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
| Actual HTML artifact | NOT TESTED | Requires manual ChatGPT/Obsidian UI. |
| Previous Q&A available | PASS | `tests/previous-qa-html-learning-self-test.js` covers generated note structure. Manual end-to-end still recommended. |
| Previous Q&A unavailable | PASS | `tests/previous-qa-html-learning-self-test.js` covers generated note structure. Manual end-to-end still recommended. |
| Plain filename does not create attachment | PASS | `tests/previous-qa-html-learning-self-test.js` and native self-test cover marker/filename behavior. |
| Favicon filtering | NOT TESTED | Requires manual ChatGPT note capture. Source filter exists in `content.js`. |
| Duplicate click | NOT TESTED | Requires manual UI timing test. Source duplicate protection exists in `content.js` and `background.js`. |
| English UI | PASS | Static source and self-test headings. Manual options-page check recommended. |
| Korean UI | PASS | Static source and self-test headings. Manual options-page check recommended. |
| Native helper missing | NOT TESTED | Requires manual install/remove scenario. |
| Wrong extension ID | NOT TESTED | Requires manual native-host mismatch scenario. |
| macOS installer | NOT TESTED | Syntax is validated by `./scripts/validate-release.sh`, but fresh v1.5.20 release ZIP installation has not been manually tested. |
| macOS uninstaller | NOT TESTED | Syntax is validated by `./scripts/validate-release.sh`, but fresh v1.5.20 uninstall behavior has not been manually tested. |
| Windows native helper | NOT TESTED | Not validated on a real Windows machine. |
| Linux native helper | UNSUPPORTED | No Linux native-helper support in this release. |

## Final Tag Gate

Do not create final tag `v1.5.20` until required manual macOS release tests are completed or explicitly accepted as not blocking.
