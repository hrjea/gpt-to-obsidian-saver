# Contributing

Thank you for helping improve GPT to Obsidian Saver. This project handles local notes, ChatGPT page content, and native messaging, so privacy and reproducibility matter.

## Public repository scope

This repository contains the distributable extension source, installation and contributor documentation, public regression tests, and release tooling. Before changing behavior, read `docs/architecture.md`, the relevant user-facing documentation, the source, and the owning regression test.

Keep contributions independently understandable from the public tree. Do not include private ChatGPT conversations, real Vault paths, local extension IDs, credentials, tokens, or internal work records.

## Bug Reports

Use the bug report issue template. Include:

- Extension version.
- Chrome version.
- Operating system.
- Obsidian version, if relevant.
- URI mode or native-helper mode.
- GitHub Release package version.
- Sanitized reproduction steps.
- Expected and actual results.
- Sanitized logs when useful.

Do not paste private ChatGPT conversations, real vault paths, credentials, tokens, extension IDs from private installs, or sensitive logs.

## Feature Requests

Use the feature request template. Describe:

- The problem.
- Proposed behavior.
- Alternatives considered.
- Permission impact.
- Privacy impact.
- Platform impact.

New features should not be added during a release feature freeze.

## Development Setup

1. Clone the repository.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Select Load unpacked.
5. Choose the repository folder containing `manifest.json`.
6. Refresh ChatGPT tabs after reloading the extension.

For native-helper testing, install the helper with the actual unpacked extension ID:

```sh
./installers/macos-install.sh --extension-id <extension-id>
```

Windows native-helper support is Experimental and should be tested on a real Windows machine before claiming validation.

## Static Validation

Run:

```sh
bash scripts/validate-release.sh
git diff --check
```

The release validation script checks version/permission consistency, JavaScript syntax, every repository JS self-test, JSON syntax, Python compile/self-test, installer syntax where tools are available, required files, and private-string/artifact hygiene. A skipped platform tool is not a PASS.

## Coding Conventions

- Keep the current no-build Manifest V3 layout unless an explicitly reviewed public change replaces it.
- Use the surrounding style: two-space indentation and semicolons in JavaScript, four-space indentation in Python, and `set -euo pipefail` in Bash entry scripts.
- Prefer small pure helpers for DOM classification, normalization, metadata assembly, and validation so synthetic fixtures can exercise them.
- Keep asynchronous Chrome message channels explicit and bounded; clean up observers, timers, watches, and temporary UI on every exit.
- Treat ChatGPT DOM, clipboard data, paths, downloads, and Native payloads as untrusted.
- Select UI controls by verified scope, role, visibility, and uniqueness; do not add text-similarity or first-candidate fallbacks across trust boundaries.
- Keep English/Korean user-visible strings and tests aligned.
- Keep debug logging disabled by default and exclude content bodies, raw clipboard values, and private URLs from diagnostics.
- Add exact final-Markdown/payload assertions for schema changes; testing only that a helper was called is insufficient.

## Engineering Expectations

- Keep runtime behavior small and local-first.
- Do not add telemetry, analytics, tracking, developer-operated remote storage, or new external runtime services. The existing consented ChatGPT Share exception is documented in the public architecture, permissions, and privacy documents and must not be broadened implicitly.
- Avoid broad filesystem access.
- Preserve vault-bounded native-helper writes.
- Preserve false-attachment protection for plain `.html` filenames.
- Preserve favicon/decorative-image filtering.
- Preserve English/Korean UI behavior.
- Fail closed when artifacts, message topology, Share UI, or URLs are missing or ambiguous.
- Distinguish local-complete, explicitly approved partial, and validated remote-reference results.
- Do not claim live E2E success until the actual Vault note and attachments were inspected.

## Documentation Coupling

| Change | Required updates |
| --- | --- |
| User-visible behavior | regression tests, `CHANGELOG.md`, and applicable README/docs |
| Architecture or trust-boundary change | `docs/architecture.md`, security/privacy docs, and tests |
| Important bug fix | regression test and applicable troubleshooting guidance |
| Permission/data-flow change | manifest, permissions/privacy docs, tests, and changelog |
| Verification/release gate | public validation and release scripts/docs |

Documentation-only changes do not require a version bump. Runtime behavior changes do.

## Pull Request Checklist

- Scope is clear and limited.
- Tests were run and listed.
- Permission changes are explained.
- Privacy impact is explained.
- Documentation was updated.
- Version impact is stated.
- No private data is included.

## Version Policy

Runtime source changes that alter shipped behavior require a version bump. Documentation, GitHub templates, sanitized screenshots, release scripts, and packaging-only changes do not require an extension version bump.

For a frozen release, do not add user-facing features. Fix only genuine release-blocking bugs, and bump the patch version if runtime files change.
