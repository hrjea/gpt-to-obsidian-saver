# Release Process

This document describes the GitHub-only release process. Do not add Chrome Web Store submission steps.

The current publication target is the **v1.5.62-rc.1 prerelease**, with runtime/archive version 1.5.62. Keep v1.5.54 as the latest stable release. Use [the version-specific checklist](../RELEASE_CHECKLIST_v1.5.62.md) and never reuse an existing tag.

## 1. Feature Freeze

- Do not add user-facing features.
- Fix only genuine release-blocking bugs.
- If runtime files change during freeze, bump the patch version and update docs, changelog, tags, and archive names.

## 2. Version Consistency

Verify the version matches across:

- `manifest.json`
- `content.js` `VERSION`
- `background.js` `VERSION`
- `options.js` `BUILD_VERSION`
- `options.js` `CONTENT_SCRIPT_VERSION`
- `options.html` visible build diagnostic

Also verify the public release documentation is current:

- `README.md` and `README.ko.md`
- `docs/architecture.md`
- permissions, privacy, Native Messaging, and troubleshooting documents
- `CHANGELOG.md`

## 3. Source Validation

Run:

```sh
bash scripts/validate-release.sh
git diff --check
```

## 4. Privacy Scan

Check for:

- Private local paths.
- Private ChatGPT conversation URLs.
- Local unpacked extension IDs.
- Tokens, credentials, logs, screenshots, and caches.

## 5. Release Candidate

Create a release commit and annotated RC tag, substituting the approved version:

```sh
git commit -m "Release v1.5.62"
git tag -a v1.5.62-rc.1 -m "Release candidate 1 for v1.5.62"
```

Do not overwrite existing tags.

The candidate tree must be committed and clean before archive generation. `scripts/package-release.sh` enforces a Git `HEAD`, rejects tracked or untracked dirty state, builds the source archive from that `HEAD`, and copies extension/runtime assets from explicit file allowlists.

## 6. Manual Smoke Testing

The current checklist records installed Chrome reload, original multi-file HTML saving, actual Native/Vault inspection, isolated package load and Branch generation separately from source tests. They are NOT RUN until directly verified. The installed project/non-project saving and fresh isolated package-load gates block the stable v1.5.62 tag. Until they pass, publish only the explicitly labeled RC with these limits disclosed; no historical report may substitute for current evidence.

Preserve the historical v1.5.40 evidence in [manual-smoke-test.md](manual-smoke-test.md) and `RELEASE_CHECKLIST.md`. For the current linked-HTML and Branch checks, record results in `RELEASE_CHECKLIST_v1.5.62.md`. The older [v1.5.50 smoke test](manual-smoke-test-v1.5.50.md) remains historical.

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

The stable v1.5.62 tag is currently BLOCKED. Create it only after required validation and every blocking live/manual gate in the current checklist passes. The command below is a future stable-release step, not part of the RC publication:

```sh
git tag -a v1.5.62 -m "Release v1.5.62"
```

A packaged macOS Native installer/uninstaller run is not a blocking gate unless the current version-specific checklist marks it as required. When it is not run, retain `NOT TESTED`; do not alter an existing user installation solely to convert that row to `PASS`.

## 10. GitHub Publication

Publication requires explicit approval before any external action:

- Creating a public repository.
- Adding or pushing a remote.
- Pushing code or tags.
- Creating a GitHub Release.
- Uploading release assets.

After approval, push only `codex/release-v1.5.62` and its new annotated `v1.5.62-rc.1` tag. Keep `main` and the latest stable v1.5.54 release unchanged. Create a GitHub prerelease and upload:

- Unpacked extension ZIP.
- macOS native-host ZIP.
- Windows experimental native-host ZIP.
- Source ZIP.
- `SHA256SUMS.txt`.

Use `CHANGELOG.md` as the basis for release notes.
