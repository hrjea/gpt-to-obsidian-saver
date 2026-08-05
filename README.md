# GPT to Obsidian Saver

[English](README.md) | [한국어](README.ko.md)

GPT to Obsidian Saver is a Chrome extension that saves ChatGPT answers to Obsidian as local Markdown notes. It can also save real downloadable HTML learning materials as note-relative attachments.

Sanitized screenshots and a demo GIF will be added after public-safe capture. See [assets/screenshots/README.md](assets/screenshots/README.md) for the required manual capture process.

## What It Does

- Adds a Save to Obsidian button to ChatGPT assistant messages.
- Saves the current user question and assistant answer as Markdown.
- Records the current ChatGPT conversation URL as the note source.
- Supports Obsidian URI mode without a native helper.
- Supports native-helper mode for direct local file output and HTML attachments.
- Saves real HTML artifacts and immediate Chrome HTML downloads as attachments.
- Places the HTML learning-material section at the top of notes that contain real HTML attachments.
- Optionally uses the previous Q&A pair when saving HTML learning notes.
- Provides English and Korean UI labels.

## Supported Platforms

| Platform | Status |
| --- | --- |
| Chrome on macOS | Supported for URI mode and validated for native-helper mode. |
| Chrome on Windows | URI mode should work when Obsidian URI handling works. Native-helper support is Experimental and has not been validated on a real Windows machine for this release. |
| Linux | Obsidian URI mode may work depending on local URI handling. Native-helper mode is unsupported. |

## Distribution

The project is currently distributed through GitHub Releases only. It is installed as an unpacked Chrome extension.

This project is not available through the Chrome Web Store. Do not expect Chrome Web Store installation, listing, review, or automatic update behavior.

## Install from GitHub Releases

1. Download `gpt-to-obsidian-saver-v1.5.25-unpacked-extension.zip` from the GitHub Release.
2. Verify the SHA-256 checksum from `SHA256SUMS.txt`.
3. Unzip the file.
4. Open `chrome://extensions`.
5. Enable Developer mode.
6. Select Load unpacked.
7. Select the unzipped folder that contains `manifest.json`.
8. Refresh existing ChatGPT tabs.

Chrome may warn about developer-mode extensions because this is an unpacked GitHub installation.

For detailed steps, see [docs/github-installation.md](docs/github-installation.md).

## Obsidian URI Mode

URI mode does not require the native helper. It opens an `obsidian://new` URI containing the note content.

Use URI mode when:

- You only need Markdown note creation.
- You do not need HTML files copied into the vault as attachments.
- You want the simplest setup.

Limitations:

- Browser/OS URI length limits can affect very large notes.
- URI mode cannot directly write HTML attachment files into the vault.

## Native-Helper Mode

Chrome extensions cannot directly write arbitrary local files. Native-helper mode uses Chrome Native Messaging to call a local helper process that writes notes and HTML attachments into the configured Obsidian vault.

Native-helper mode is required for:

- Direct Markdown file creation in the vault.
- HTML artifact attachment saving.
- Chrome downloads fallback for immediate HTML downloads.

The native host allowed origin must match the actual extension ID shown by Chrome. Unpacked extension IDs can change when the extension is loaded from a different path or copy. If the extension ID changes, rerun the native-helper installer with the new ID.

### macOS Native Helper

1. Copy the extension ID from `chrome://extensions`.
2. Download and unzip `gpt-to-obsidian-saver-v1.5.25-native-host-macos.zip`.
3. Run:

```sh
./installers/macos-install.sh --extension-id <extension-id>
```

The installer does not require `sudo`. It installs a user-level native messaging host and writes a wrapper that uses the absolute Python path detected during installation.

### Windows Native Helper

Windows native-helper support is Experimental and has not been validated on a real Windows machine for this release.

From PowerShell:

```powershell
.\installers\windows-install.ps1 -ExtensionId <extension-id>
```

### Linux Native Helper

Linux native-helper mode is unsupported in this release.

## Extension Settings

- Language: English or Korean UI.
- Obsidian Vault name: used for Obsidian URI open/create calls.
- Local Obsidian vault path: required for native-helper direct saves.
- Save folder path: relative note folder inside the vault.
- HTML file save folder: relative attachment folder inside the vault. Defaults to `Attachments` when empty.
- Add date prefix: adds `YYYY-MM-DD` to file names.
- Also add time: adds `HH-mm-ss` after the date.
- Allow question marks in file names: useful on macOS/Linux, not Windows-safe.
- Add title H1 to note body: optional visible H1 in the note.
- Save HTML code blocks as `.html` attachments: off by default.
- Use the previous Q&A when saving an HTML learning note: off by default.

## HTML Attachments

For real HTML artifacts, the extension first tries to read page-accessible content:

- `blob:` and `data:` URLs
- same-origin downloadable links
- `a[download]` links when fetchable
- iframe `srcdoc`
- fetchable iframe `blob:` sources
- accessible preview frame documents

If those fail and the user clicked Save to Obsidian on a real HTML download candidate, the `downloads` permission is used to identify the HTML file downloaded immediately after the save action. The native helper copies only that specific `.html` or `.htm` file into the configured vault attachment folder.

Plain text such as `options 2.html` or `example 1.html` does not create an attachment.

## HTML Learning Notes

When a note has a real HTML attachment, the note places the learning-material section at the top:

```md
# HTML Learning Material

<attachment link after native processing>

# Question

...

# Answer

...
```

When the previous-Q&A option is enabled and the previous pair is found, the note uses:

```md
# HTML Learning Material

<attachment link after native processing>

# Original Question

...

# Original Answer

...
```

If the previous pair is unavailable, the note falls back safely to the current question and current assistant answer.

## Required Permissions

| Permission | Reason |
| --- | --- |
| `storage` | Stores extension settings such as language, vault name, folder path, and feature toggles. |
| `nativeMessaging` | Calls the local native helper for direct vault writes and HTML attachment saving. |
| `downloads` | Used only to identify the HTML file downloaded immediately after the user clicks Save to Obsidian, so that specific file can be copied into the configured Obsidian vault. The extension does not scan, upload, or transmit unrelated files from the Downloads folder. |
| `https://chatgpt.com/*` | Injects the Save to Obsidian button and reads the selected ChatGPT message when the user invokes saving. |
| `https://chat.openai.com/*` | Supports the older ChatGPT domain with the same behavior. |

See [docs/permissions.md](docs/permissions.md).

## Privacy Summary

The extension processes ChatGPT page content locally when the user clicks Save to Obsidian. It stores settings in Chrome extension storage and saves notes locally through Obsidian URI mode or Chrome Native Messaging. It does not add analytics, telemetry, tracking, developer servers, remote storage, or data sale behavior.

The current page URL can be recorded as the note source. Native-helper mode uses the configured local vault path to write notes and attachments.

See [docs/privacy.md](docs/privacy.md) and [docs/privacy.ko.md](docs/privacy.ko.md).

## Security Model

- The content script runs only on ChatGPT host permissions.
- The background service worker mediates native messaging and immediate HTML download matching.
- The native helper writes note and attachment output only inside the configured vault path.
- Attachment filenames and note paths are validated.
- HTML files are stored as text/file content; the extension and native helper do not execute HTML.
- The native host manifest must allow the exact installed extension ID.

See [SECURITY.md](SECURITY.md) and [docs/architecture.md](docs/architecture.md).

## Known Limitations

- Windows native-helper installation has not been validated on a real Windows machine.
- Linux native-helper mode is unsupported.
- ChatGPT DOM changes can require selector maintenance.
- Native-helper mode requires separate installation.
- GitHub distribution requires Load unpacked installation.
- Restricted or sandboxed downloads depend on Chrome and ChatGPT UI behavior.
- Unpacked extension IDs can change when loaded from a different path.

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md) for native host errors, extension ID mismatch, old unpacked builds, HTML attachment failures, attachment link issues, and update steps.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not include private ChatGPT conversations, real vault paths, tokens, credentials, or sensitive logs in public issues or pull requests.

## License

MIT License. See [LICENSE](LICENSE).
