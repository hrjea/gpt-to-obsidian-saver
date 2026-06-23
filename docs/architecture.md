# Architecture

```text
ChatGPT page
  -> content.js
  -> background service worker
  -> Obsidian URI mode

ChatGPT page
  -> content.js
  -> background service worker
  -> Chrome Native Messaging
  -> native-host/native-open-obsidian.py
  -> configured Obsidian vault
```

## Components

### `content.js`

- Runs on `chatgpt.com` and `chat.openai.com`.
- Adds Save to Obsidian buttons to assistant messages.
- Converts ChatGPT HTML to Markdown.
- Finds the relevant user question and assistant answer.
- Detects real HTML artifacts.
- Builds the Markdown note payload.
- Sends save requests to the background service worker.

### `background.js`

- Receives messages from the content script.
- Opens Obsidian URI requests.
- Calls Chrome Native Messaging for native-helper saves.
- Tracks immediate HTML downloads when page-readable extraction fails.
- Rejects stale or unrelated downloads by using watch timing, expected extension, and filename hints.

### Native Helper

- Receives Native Messaging payloads.
- Validates `vaultPath`.
- Resolves note and attachment paths.
- Prevents path traversal and vault escapes.
- Reads only the downloaded HTML file explicitly reported for the current save operation.
- Writes notes and attachments inside the configured vault.
- Generates note-relative attachment links.

## HTML Extraction Flow

The content script first tries direct page-readable extraction:

- `blob:` href
- `data:` href
- same-origin downloadable href
- `a[download]` href when fetchable
- iframe `srcdoc`
- iframe `blob:` source when fetchable
- accessible preview frame document

If direct extraction fails, the background service worker can watch Chrome downloads for a newly completed `.html` or `.htm` file associated with the current Save action.

## Native Validation

The native helper validates:

- Note path is relative and inside the vault.
- Attachment directory resolves inside the vault.
- Attachment filename is safe and ends in `.html` or `.htm`.
- Downloaded source path is a specific file reported for the active save.
- Total attachment size stays within configured limits.

## URI Fallback

Normal notes without real HTML attachments can use Obsidian URI mode. If native save fails for a note that also has a URI fallback, the extension attempts the URI fallback and reports that attachments may not have been saved.

## Duplicate Protection

The content script and background service worker keep short-lived duplicate-save keys to reduce accidental duplicate saves from immediate repeated clicks.

## External Services

The extension has no external application server. It does not send note content to a developer-operated service.
