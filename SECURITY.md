# Security Policy

## Supported Releases

The initial public release candidate is `1.5.25-rc.1`. Security fixes are expected to target the latest public release unless a later policy states otherwise.

## Architecture Summary

GPT to Obsidian Saver is local-first:

- `content.js` runs on ChatGPT pages and extracts content only when the user invokes Save to Obsidian.
- `background.js` mediates extension messages, native messaging, and immediate HTML download matching.
- Obsidian URI mode passes note content to Obsidian through `obsidian://`.
- Native-helper mode uses Chrome Native Messaging to call a local Python helper.

There is no analytics, telemetry, tracking, developer server, or remote storage implemented by this extension.

## Trust Boundaries

### ChatGPT Page to Extension

The content script reads the selected ChatGPT message and nearby conversation context only for a user-initiated save. ChatGPT DOM structure can change, so selector maintenance is a normal risk.

### Extension to Native Helper

Native Messaging is an explicit trust boundary. The native host manifest `allowed_origins` must match the installed extension ID exactly. If an unpacked extension ID changes, rerun the installer with the new ID.

### Downloads Permission

The downloads permission is constrained to the immediate HTML download associated with the active Save to Obsidian action. The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

### Vault-Contained Writes

The native helper validates the configured vault path, note path, attachment directory, filenames, and downloaded source file. Note and attachment output is written only inside the configured vault path. The downloaded source file may be outside the vault only when it is the exact `.html` or `.htm` path reported by Chrome for that save operation.

### HTML Content

HTML is stored as text/file content. The extension and native helper do not execute HTML.

## Protections

- Path traversal checks for note and attachment paths.
- Attachment filename validation.
- `.html` and `.htm` restriction for downloaded HTML attachments.
- Size limits for native messaging payloads and attachments.
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
