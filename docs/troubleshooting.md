# Troubleshooting

## Old Unpacked Version Still Loaded

Reload the extension in `chrome://extensions`, confirm the displayed version, then refresh existing ChatGPT tabs. Content scripts from an older build can remain active until the page is refreshed.

## Developer-Mode Extension Warning

Chrome may warn about developer-mode extensions because GitHub Releases are installed with Load unpacked. This is expected for the current distribution model.

## Native Host Not Found

Check that the native host manifest exists in the user-level Chrome Native Messaging location and that Chrome was restarted after installation.

macOS manifest:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.gpt_obsidian_saver.open_direct.json
```

Windows registry:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.gpt_obsidian_saver.open_direct
```

## Access to Native Messaging Host Is Forbidden

The native host manifest `allowed_origins` does not match the current extension ID. Copy the ID from `chrome://extensions` and rerun the installer with that ID.

## Native Host Has Exited

On macOS, inspect:

```text
~/Library/Logs/GPTObsidianSaver/native-wrapper.log
~/Library/Logs/GPTObsidianSaver/native-host.log
```

Common causes:

- Python not found in Chrome's GUI environment.
- The helper file is missing.
- The native host manifest points to an old wrapper.
- The payload was invalid.

The macOS installer generates a wrapper with the absolute Python path detected at install time.

## No HTML Attachment Created

Confirm:

- Native-helper mode is installed.
- `vaultPath` is configured.
- The answer contains a real HTML artifact or code block attachment option is enabled.
- The note was saved through native-helper mode, not URI-only mode.
- The HTML file save folder resolves inside the vault.

Plain filename text such as `options 2.html` and `example 1.html` should not create attachments.

## HTML Downloaded but Not Copied to Vault

This means Chrome downloaded an HTML file but the native helper did not copy it. Check:

- The downloads permission is present.
- The native helper is installed for the current extension ID.
- `vaultPath` is valid.
- `htmlSaveDir` is inside the vault.
- Native host logs for validation errors.

## Raw Attachment Marker Remains

If `%%GPT_OBSIDIAN_ATTACHMENTS%%` remains in the note after a successful native save, report a bug with a sanitized note excerpt and native-host response. Do not include private ChatGPT content.

## Attachment Link Does Not Open

The native helper generates links relative to the note's parent folder. Check whether the linked `.html` file exists in the configured attachment folder. If the file exists but the link is wrong, report the note path, attachment path, and link text using generic placeholders.

## vaultPath Missing or Invalid

Native-helper mode requires a local vault path. Use an absolute path to the Obsidian vault root. The helper rejects missing paths, nonexistent paths, and paths that are not directories.

## htmlSaveDir Outside Vault

Relative `htmlSaveDir` values are resolved inside the vault. Absolute paths are accepted only if they resolve inside `vaultPath`.

## Obsidian URI Does Not Open

Check that Obsidian is installed and URI handling is enabled. Try opening a simple `obsidian://` URI from the browser or terminal. URI mode depends on local OS and Obsidian URI handling.

## Favicon Appears as a Large Image

This should be filtered. If it happens, report a sanitized reproduction and the image URL pattern without private conversation content.

## False Attachment from Plain Filename Text

Plain text filenames should remain plain text and must not create an attachment. Report a bug if text like `options 2.html` creates an attachment without a real artifact.

## Update Procedure

1. Download the new GitHub Release ZIP.
2. Verify checksums.
3. Extract to a stable folder.
4. Reload the unpacked extension from `chrome://extensions`.
5. Confirm the displayed version.
6. Refresh ChatGPT tabs.
7. If the extension ID changed, rerun the native-helper installer with the new ID.
