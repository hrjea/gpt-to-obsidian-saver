# Release Process

This document describes the GitHub-only release process. Do not add Chrome Web Store submission steps.

## 1. Feature Freeze

- Do not add user-facing features.
- Fix only genuine release-blocking bugs.
- If runtime files change during freeze, bump the patch version and update docs, changelog, tags, and archive names.

## 2. Version Consistency

Verify the version matches across:

- `manifest.json`
- `content.js` `VERSION`
- `options.js` `BUILD_VERSION`
- `options.js` `CONTENT_SCRIPT_VERSION`
- `options.html` visible build diagnostic

## 3. Source Validation

Run:

```sh
./scripts/validate-release.sh
node tests/previous-qa-html-learning-self-test.js
```

## 4. Privacy Scan

Check for:

- Private local paths.
- Private ChatGPT conversation URLs.
- Local unpacked extension IDs.
- Test vault names.
- Tokens, credentials, logs, screenshots, and caches.

## 5. Release Candidate

Create a release commit and annotated RC tag:

```sh
git commit -m "Prepare v1.5.20 public release"
git tag -a v1.5.20-rc.1 -m "Release candidate 1 for v1.5.20"
```

Do not overwrite existing tags.

## 6. Manual Smoke Testing

Use [manual-smoke-test.md](manual-smoke-test.md). Record results in `RELEASE_CHECKLIST.md`.

## 7. Archive Generation

Run:

```sh
./scripts/package-release.sh
```

The script creates GitHub Release ZIP files and `SHA256SUMS.txt` in `dist/`.

## 8. Archive Inspection

Confirm:

- `manifest.json` is at the extension ZIP root.
- No `.DS_Store`, logs, caches, or smoke-test artifacts are included.
- No absolute private paths are included.
- Native-host ZIPs include only the intended platform files.
- Source ZIP is created from Git after initialization.

## 9. Final Tag

Create the final local tag only after required validation and macOS smoke tests pass:

```sh
git tag -a v1.5.20 -m "Initial public release v1.5.20"
```

## 10. GitHub Publication

Publication requires explicit approval before any external action:

- Creating a public repository.
- Adding or pushing a remote.
- Pushing code or tags.
- Creating a GitHub Release.
- Uploading release assets.

After approval, publish the repository and upload:

- Unpacked extension ZIP.
- macOS native-host ZIP.
- Windows experimental native-host ZIP.
- Source ZIP.
- `SHA256SUMS.txt`.

Use `CHANGELOG.md` as the basis for release notes.
