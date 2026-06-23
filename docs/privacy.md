# Privacy

GPT to Obsidian Saver is local-first and user-initiated.

## What Is Processed

When the user clicks Save to Obsidian, the extension reads the relevant ChatGPT message and nearby conversation context needed to build the note. For HTML learning notes, it may also inspect the current assistant message for page-readable HTML artifacts or an immediate HTML download.

Conversation text is processed locally in the browser extension. The current ChatGPT page URL can be recorded in the Markdown frontmatter as the note source.

## Settings Storage

Extension settings are stored in Chrome extension storage:

- General settings such as language, vault name, save folder, and feature toggles use `chrome.storage.sync`.
- Machine-specific settings such as `vaultPath` and `htmlSaveDir` use `chrome.storage.local`.

## Downloads Permission

The downloads permission is used only to identify the HTML file downloaded immediately after the user clicks Save to Obsidian. That specific `.html` or `.htm` file can then be copied into the configured Obsidian vault by the native helper.

The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

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
- No third-party storage performed by this extension.
- No remote upload of notes, vault files, downloaded attachments, settings, or logs.

This document describes the extension's behavior. Chrome, ChatGPT, Obsidian, and the operating system may have their own network and privacy behavior outside this extension.
