# Permissions

| Permission | Code Location | Purpose | Data Involved | Optional or Required | Effect If Removed |
| --- | --- | --- | --- | --- | --- |
| `storage` | `content.js`, `options.js`, `background.js` | Store and read extension settings. | Language, vault name, folder path, toggles, local vault path, HTML attachment folder. | Required | Options cannot persist and content/background scripts cannot read save settings. |
| `nativeMessaging` | `background.js` | Call the local native helper for direct vault writes and HTML attachments. | Save payloads, note content, attachment metadata, downloaded HTML source path for the active save. | Required for native-helper mode | Direct file saving and HTML attachment copying fail; URI mode may still work for normal notes. |
| `downloads` | `background.js`, `content.js` | Identify the HTML file downloaded immediately after Save to Obsidian on a real HTML download candidate. | Download ID, filename, path, start/end time for the immediate `.html` or `.htm` download. | Required for Chrome downloads fallback | Page-readable HTML extraction can still work, but click-only/sandboxed HTML downloads cannot be copied into the vault. |
| `https://chatgpt.com/*` | `manifest.json`, `content.js` | Inject Save to Obsidian UI and read user-selected ChatGPT message content. | ChatGPT page DOM content involved in a user-initiated save. | Required | The extension cannot run on the current ChatGPT domain. |
| `https://chat.openai.com/*` | `manifest.json`, `content.js` | Support the older ChatGPT domain. | Same as above. | Required for older-domain support | The extension cannot run on the older ChatGPT domain. |

The downloads permission is used only to identify the HTML file downloaded immediately after the user clicks Save to Obsidian, so that specific file can be copied into the configured Obsidian vault. The extension does not scan, upload, or transmit unrelated files from the Downloads folder.
