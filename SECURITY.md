# Security Policy

## Supported Releases

This security policy targets release `1.5.53`. Security fixes are expected to target the latest supported public release unless a later policy states otherwise.

## Architecture Summary

GPT to Obsidian Saver is local-first:

- `content.js` runs on ChatGPT pages and extracts content only when the user invokes Save to Obsidian.
- `background.js` mediates extension messages, native messaging, bounded exact HTML/Markdown download matching, and the optional clipboard permission request.
- Obsidian URI mode passes note content to Obsidian through `obsidian://`.
- Native-helper mode uses Chrome Native Messaging to call a local Python helper.

There is no analytics, telemetry, tracking, developer server, or developer-operated remote storage. Recognized project conversations save locally without Share consent, Share actions, clipboard permission/read or generated Share links. Non-project ordinary notes require a separately consented supplemental Share link while retaining their local body and URI/Native route. Supported non-project interactive-app flows can instead create a specialized Native-only remote reference for behavior not copied locally. Both Share flows use ChatGPT's visible UI and a strictly validated URL; neither calls a private sharing API.

## Trust Boundaries

### ChatGPT Page to Extension

The content script reads the selected ChatGPT message and nearby conversation context only for a user-initiated save. ChatGPT DOM structure can change, so selector maintenance is a normal risk.

### Extension to Native Helper

Native Messaging is an explicit trust boundary. The native host manifest `allowed_origins` must match the installed extension ID exactly. If an unpacked extension ID changes, rerun the installer with the new ID.

### Downloads Permission

The downloads permission is constrained to a bounded active-save watch and an expected HTML or generated detailed-Markdown filename. The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

### Share UI and Clipboard

Outside project conversations, ordinary supplemental and specialized remote-reference sharing require explicit consent, selected-target proof, a scoped unambiguous Share action and one strictly validated final URL. Native-required ordinary notes and specialized Native-only references complete Native preflight before Share; URI-only ordinary notes gain no Native requirement. `clipboardRead` remains optional and may read at most one value after a fresh current-action copy-success signal. Raw clipboard/manual values are not logged or persisted. The extension warns when tracked response Create/Update or whole-conversation Share actions may remain active after later save failure; it does not automatically revoke sharing. Existing response-link reuse alone does not claim that a new link was created.

Project routes skip both Share flows and retain their frozen source, exact selected-node/role/ID, route and runtime guards, initial artifact expectations, explicit partial consent and local Native/Vault checks. Missing local app content remains explicitly partial when saved; skipping Share cannot turn it into a complete local app or a remote reference.

### Vault-Contained Writes

The native helper validates the configured vault path, note path, attachment directory, filenames, and downloaded source file. Note and attachment output is written only inside the configured vault path. A downloaded source may be outside the Vault only when it is the exact current `.html`, `.htm`, or detailed `.md` file reported through the bounded Chrome watch and it passes Native validation.

### HTML Content

HTML is stored as text/file content. The extension and native helper do not execute HTML.

## Protections

- Path traversal checks for note and attachment paths.
- Attachment filename validation.
- `.html` and `.htm` restriction for downloaded HTML attachments.
- Exact `.md` restriction and size limits for downloaded detailed Markdown.
- Size limits for native messaging payloads and attachments.
- Strict capture-state metadata and share-URL validation.
- Note-relative attachment links.
- No wildcard native host origins.
- Native helper stdout reserved for the Native Messaging protocol.

## Reporting Vulnerabilities

If there is no private security contact available, create a minimal public GitHub issue without sensitive details and ask the maintainers for a private contact path.

Do not include:

- Private ChatGPT content.
- Credentials, tokens, cookies, or API keys.
- Private extension IDs.
- Real vault paths.
- Sensitive logs.
- Private local file paths.

Use placeholders such as `<extension-id>`, `<vault-path>`, and `<conversation summary>`.
