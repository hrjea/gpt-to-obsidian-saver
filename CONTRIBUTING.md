# Contributing

Thank you for helping improve GPT to Obsidian Saver. This project handles local notes, ChatGPT page content, and native messaging, so privacy and reproducibility matter.

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
./scripts/validate-release.sh
node tests/previous-qa-html-learning-self-test.js
```

The release validation script checks JavaScript syntax, JSON syntax, Python compile/self-test, macOS installer syntax, required files, manifest permissions, and private-string hygiene.

## Coding Expectations

- Keep runtime behavior small and local-first.
- Do not add telemetry, analytics, tracking, remote storage, or external runtime services.
- Avoid broad filesystem access.
- Preserve vault-bounded native-helper writes.
- Preserve false-attachment protection for plain `.html` filenames.
- Preserve favicon/decorative-image filtering.
- Preserve English/Korean UI behavior.

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
