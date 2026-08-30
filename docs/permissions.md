# Permissions

| Permission | Code Location | Purpose | Data Involved | Optional or Required | Effect If Removed |
| --- | --- | --- | --- | --- | --- |
| `storage` | `content.js`, `options.js`, `background.js` | Store and read extension settings. | Language, vault name, folder path, toggles, local vault path, HTML attachment folder. | Required | Options cannot persist and content/background scripts cannot read save settings. |
| `nativeMessaging` | `background.js` | Call the local native helper for direct vault writes and HTML attachments. | Save payloads, note content, attachment metadata, downloaded HTML source path for the active save. | Required for native-helper mode | Direct file saving and HTML attachment copying fail; URI mode may still work for normal notes. |
| `downloads` | `background.js`, `content.js` | Identify one exact current HTML or generated detailed-Markdown download associated with the active Save action. | Download ID, expected filename, local path, and start/end time for a bounded `.html`, `.htm`, or `.md` watch. | Required for Chrome downloads fallback | Page-readable extraction can still work, but click-only/sandboxed artifact downloads cannot be copied into the Vault. |
| `clipboardRead` | `manifest.json`, `background.js`, `content.js` | Read one freshly copied ChatGPT share URL during an explicitly approved remote-reference flow when the URL is not available in the page DOM. | One clipboard string, read only after a strict current-action copy-success signal; only a validated ChatGPT share URL may enter a note. | Optional and requested at runtime | The extension uses its own empty manual URL field or stops the remote-reference save; required local capture permissions are unchanged. |
| `https://chatgpt.com/*` | `manifest.json`, `content.js` | Inject Save to Obsidian UI and read user-selected ChatGPT message content. | ChatGPT page DOM content involved in a user-initiated save. | Required | The extension cannot run on the current ChatGPT domain. |
| `https://chat.openai.com/*` | `manifest.json`, `content.js` | Support the older ChatGPT domain. | Same as above. | Required for older-domain support | The extension cannot run on the older ChatGPT domain. |

The downloads permission is used only for a bounded watch tied to the active Save action and expected HTML or detailed-Markdown filename. The exact matching file can then be copied/read by the local Native helper. The extension does not scan, upload, or transmit unrelated files from the Downloads folder.

`clipboardRead` is not a required install-time permission. It is requested only after the user approves a supported Share flow. Permission denial must not cause broad clipboard polling or weaker URL validation. The raw clipboard/manual value is not logged or persisted.

Creating or updating a ChatGPT share link is a separate remote side effect performed through ChatGPT's visible UI after consent; it is not caused by the host permission itself. See [Privacy](privacy.md) and [Architecture](architecture.md).
