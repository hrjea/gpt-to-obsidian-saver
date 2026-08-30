# Security Policy

## Supported Releases

The latest tagged/public release is `1.5.40`. Security fixes are expected to target the latest supported public release unless a later policy states otherwise. The repository development version is 1.5.47 but is not yet established as a tagged packaged release.

## Architecture Summary

GPT to Obsidian Saver is local-first:

- `content.js` runs on ChatGPT pages and extracts content only when the user invokes Save to Obsidian.
- `background.js` mediates extension messages, native messaging, bounded exact HTML/Markdown download matching, and the optional clipboard permission request.
- Obsidian URI mode passes note content to Obsidian through `obsidian://`.
- Native-helper mode uses Chrome Native Messaging to call a local Python helper.

There is no analytics, telemetry, tracking, developer server, or developer-operated remote storage. Current development has one explicit remote side effect: after separate consent, the extension can operate ChatGPT's visible Share UI and store a strictly validated ChatGPT share URL as an online-only reference. It does not copy the interactive app locally or call a private sharing API.

## Trust Boundaries

### ChatGPT Page to Extension

The content script reads the selected ChatGPT message and nearby conversation context only for a user-initiated save. ChatGPT DOM structure can change, so selector maintenance is a normal risk.

### Extension to Native Helper

Native Messaging is an explicit trust boundary. The native host manifest `allowed_origins` must match the installed extension ID exactly. If an unpacked extension ID changes, rerun the installer with the new ID.

### Downloads Permission

The downloads permission is constrained to a bounded active-save watch and an expected HTML or generated detailed-Markdown filename. The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

### Share UI and Clipboard

Remote-reference sharing requires separate user consent, side-effect-free Native preflight, one scoped and unambiguous Share action, and one strictly validated final ChatGPT share URL. `clipboardRead` remains optional and can be used for at most one fresh current-action copy signal. Raw clipboard/manual values are not logged or persisted. Share links may remain active after a later save failure; the extension warns and does not automatically revoke them.

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
