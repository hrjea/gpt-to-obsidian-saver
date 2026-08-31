# Privacy

GPT to Obsidian Saver is local-first and user-initiated.

## What Is Processed

When the user clicks Save to Obsidian, the extension reads the relevant ChatGPT message and nearby conversation context needed to build the note. It may also inspect the current assistant turn for page-readable HTML or generated detailed-Markdown artifacts and one exact current download when page extraction is unavailable.

Conversation text is processed locally in the browser extension. The current ChatGPT page URL can be recorded in the Markdown frontmatter as the note source.

For an explicit previous-answer Visualize request whose required conversation anchors are temporarily unmounted, the extension may briefly scroll the current conversation to verify adjacent virtualized windows and then restore the logical position. When the stable clicked window contains a unique role-bearing turn immediately after A2, its in-memory identity/content fingerprint and scroller-relative pixel offset may be used once as navigation-only evidence to calculate the initial restoration position; it is not note content or chronology proof and is not logged, persisted, or transmitted. When the clicked window contains only Q2/A2, it requires one A1/Q2 overlap followed by one Q1/A1 overlap; it does not infer chronology from a direct scroll jump. The recovered A1 is copied into an independent, conversion-only in-memory DOM clone so its Markdown and fingerprint remain available after A1 is unmounted again. That clone is not used to operate ChatGPT UI. If a verified missing-only window appears during consent, the extension does not scroll or recover inside the consent callback; after approved consent it may spend one bounded restore to rebind the A1/Q2 anchors required by the frozen proof while retaining the exact original A2 and production conversation scroller. The following-turn geometry anchor is not reused by that post-consent recovery. If response Share moves the app iframe into its final surface, the extension compares only in-memory source fingerprints and structural counts to the pre-Share A2 proof. Turn text, identity, cloned conversion data, relocation evidence, and rich-app runtime evidence used for these checks stay in attempt-local memory; raw runtime sources are not logged or persisted, and all proof is discarded when the attempt ends.

For a supported interactive-app response, the extension may offer a separate, explicitly consented ChatGPT Share flow. That action can create, update, reuse, or copy a ChatGPT-hosted share link. The saved Obsidian note then contains only a strictly validated ChatGPT share URL as a remote reference; it is not an offline copy of the app. A whole-conversation fallback is broader than a response link and requires its own consent.

## Settings Storage

Extension settings are stored in Chrome extension storage:

- General settings such as language, vault name, save folder, and feature toggles use `chrome.storage.sync`.
- Machine-specific settings such as `vaultPath` and `htmlSaveDir` use `chrome.storage.local`.

## Downloads Permission

The downloads permission is used only for a bounded current-action watch for an expected `.html`, `.htm`, or generated `.md` filename. That exact file can then be copied or read by the local Native helper for the configured Obsidian Vault.

The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

## Optional Clipboard Permission

The optional `clipboardRead` permission may be requested only during an explicitly approved remote-reference Share flow. Immediately before making that request from the consent flow, the extension revalidates its runtime and the current hydrated conversation proof. A mismatch stops before Chrome is asked for permission, except that one strictly verified missing-only virtualization window skips the optional permission with zero permission requests and defers its bounded recovery until after consent returns approved. Recovery never scrolls inside the consent callback, and the skipped permission is not requested automatically afterward. The extension then keeps clipboard reading disabled and may use its own empty manual URL field. It reads at most one clipboard value only after both permission and a fresh, strict copy-success signal for the current action. Raw clipboard/manual values are not logged or persisted. A value enters the note only after strict ChatGPT share-URL validation.

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
