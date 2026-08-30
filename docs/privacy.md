# Privacy

GPT to Obsidian Saver is local-first and user-initiated.

## What Is Processed

When the user clicks Save to Obsidian, the extension reads the relevant ChatGPT message and nearby conversation context needed to build the note. It may also inspect the current assistant turn for page-readable HTML or generated detailed-Markdown artifacts and one exact current download when page extraction is unavailable.

Conversation text is processed locally in the browser extension. The current ChatGPT page URL can be recorded in the Markdown frontmatter as the note source.

For a supported interactive-app response, the extension may offer a separate, explicitly consented ChatGPT Share flow. That action can create, update, reuse, or copy a ChatGPT-hosted share link. The saved Obsidian note then contains only a strictly validated ChatGPT share URL as a remote reference; it is not an offline copy of the app. A whole-conversation fallback is broader than a response link and requires its own consent.

## Settings Storage

Extension settings are stored in Chrome extension storage:

- General settings such as language, vault name, save folder, and feature toggles use `chrome.storage.sync`.
- Machine-specific settings such as `vaultPath` and `htmlSaveDir` use `chrome.storage.local`.

## Downloads Permission

The downloads permission is used only for a bounded current-action watch for an expected `.html`, `.htm`, or generated `.md` filename. That exact file can then be copied or read by the local Native helper for the configured Obsidian Vault.

The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

## Optional Clipboard Permission

The optional `clipboardRead` permission may be requested only during an explicitly approved remote-reference Share flow. The extension reads at most one clipboard value only after a fresh, strict copy-success signal for the current action. Raw clipboard/manual values are not logged or persisted. A value enters the note only after strict ChatGPT share-URL validation.

## Local Saving

Data is saved locally through:

- Obsidian URI mode, using an `obsidian://` URI.
- Chrome Native Messaging, using a local native helper that writes inside the configured vault path.

## What This Extension Does Not Add

- No analytics.
- No telemetry.
- No tracking.
- No developer server.
- No sale of user data.
- No remote upload of notes, Vault files, downloaded attachments, or logs by the extension. General settings use Chrome's sync storage and may be synchronized by Chrome according to the user's browser/account configuration.

The explicit ChatGPT Share flow described above is the only current remote-sharing exception. It uses ChatGPT's own visible UI and service, not a developer-operated server. A created or updated link may remain active if the later Obsidian save fails; the extension warns the user and does not automatically revoke it.

This document describes the extension's behavior. Chrome, ChatGPT, Obsidian, and the operating system may have their own network and privacy behavior outside this extension.
