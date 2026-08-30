## Scope

Describe the change and why it is needed.

## Tests Performed

- [ ] `bash scripts/validate-release.sh`
- [ ] `git diff --check`
- [ ] Manual Chrome Load unpacked test, if relevant
- [ ] Native-helper test, if relevant
- [ ] Actual Vault note/attachments inspected, if save behavior changed

List every skipped or untested platform/live gate explicitly. Automatic tests are not live E2E evidence.

## Permission Changes

State whether Chrome permissions or host permissions changed.

## Privacy Impact

State whether the change processes, stores, or exposes any additional data.

## Documentation

- [ ] README/docs updated
- [ ] CHANGELOG updated when appropriate
- [ ] Troubleshooting updated when appropriate
- [ ] Public architecture/security/privacy documentation updated when applicable
- [ ] Bug fix has a regression test and useful sanitized reproduction
- [ ] Public validation/release documentation updated when applicable

## Version Impact

State whether this requires a version bump. Runtime behavior changes usually require one.

## Private Data Confirmation

- [ ] This PR contains no private ChatGPT conversations.
- [ ] This PR contains no real vault paths, credentials, tokens, or sensitive logs.
- [ ] This PR contains no private extension IDs or local-only screenshots.
