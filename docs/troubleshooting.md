# Troubleshooting

Report automatic fixture results and actual Chrome/Vault E2E results separately. Public bug reports must use sanitized examples only.

## Old Unpacked Version Still Loaded

Reload the extension in `chrome://extensions`, confirm the displayed version, then refresh existing ChatGPT tabs. Content scripts from an older build can remain active until the page is refreshed.

If Save reports that the extension was reloaded or lost its connection to the ChatGPT tab, refresh that tab before trying again. The extension now stops the current artifact operation, cancels its bounded download watch, and does not describe an unverifiable URI attempt as a successful note save.

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

## Detailed Markdown Artifact Was Not Added to the Note

Generated detailed `.md` files are read from the matching ChatGPT file card or from the exact download started by the current Save action. If ChatGPT blocks a synthetic click, follow the prompt and click the highlighted Markdown filename card or its exact `File download` / `파일 다운로드` control once. The bounded viewer and download window is 90 seconds.

If capture still fails, open the page console and look for `[GPT→Obsidian][artifact]` entries. These diagnostics contain filenames, row visibility, control labels, runtime-failure phase, and candidate counts, but not the generated Markdown body. A warning that activation failed is different from a warning that activation was attempted but the current download could not be tracked, and both differ from a warning that no exact control exists.

ChatGPT can render one visible Markdown viewer as a nested outer `stage-thread-flyout` and inner `screen-threadFlyOut`. The extension treats that pair as one viewer. Two independent visible viewers with the same filename remain an ambiguity and are not guessed.

## Interactive App Share Save Stops Before a Note Is Created

The failure message includes a stage. Preserve that exact stage and sanitized reason:

- `preflight`: required context, artifact completeness, title/path assembly, runtime, or Native availability was not established. No Share click should occur.
- `share-button`: the current response Share or approved whole-conversation header Share was missing, changed, or ambiguous. Do not use a different turn's or app toolbar's Share control.
- `share-dialog`: no unique supported share surface or fresh whole-conversation copy outcome was established.
- `share-url`: no single strict ChatGPT share URL was validated.
- `native-save`: the URL was validated but the Obsidian write failed.

Remote-reference saves require Native-helper mode and never use URI fallback. If the message says a share action may have succeeded but the note did not, inspect/manage the link in ChatGPT. The extension does not automatically revoke it.

ChatGPT can render one successful copy action as both a visual alert and an `sr-only` ARIA live-region mirror. Current development canonicalizes only that verified structural pair. Independent copy signals, multiple surfaces, or a simultaneous surface/signal still fail closed and retain distinct diagnostic subtypes.

## Note and HTML Folders Resolve to Different Roots

Options shows the final Markdown note path and HTML attachment path computed from the stored settings. A warning appears when the first relative folder differs, such as `ChatGPT` versus `ChatGPT_Test`.

Saving remains allowed because custom layouts are supported. To restore the conventional layout, use the button that sets the HTML folder to `<note folder>/Attachments`, then click Save. The page reads both storage areas again and reports when the persisted values have been verified.

Current development distinguishes a missing note-folder key from an explicitly empty value: missing keeps the `ChatGPT` first-install default, while explicit empty means Vault root. If a reloaded extension still writes an explicitly empty setting under `ChatGPT/`, report the persisted setting and final note path using sanitized placeholders; do not move the note silently.

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

When a self-contained HTML file includes all chapter content but still links to missing paths such as `chapters/00-overview.html`, the helper redirects each link to a unique matching embedded chapter anchor such as `#ch-00-title`. Real separately captured chapter files remain preferred. Ambiguous or unmatched chapter links remain unchanged and produce a warning.

## vaultPath Missing or Invalid

Native-helper mode requires a local vault path. Use an absolute path to the Obsidian vault root. The helper rejects missing paths, nonexistent paths, and paths that are not directories.

## htmlSaveDir Outside Vault

Relative `htmlSaveDir` values are resolved inside the vault. Absolute paths are accepted only if they resolve inside `vaultPath`.

## Obsidian URI Does Not Open

Check that Obsidian is installed and URI handling is enabled. Try opening a simple `obsidian://` URI from the browser or terminal. URI mode depends on local OS and Obsidian URI handling.

## Note Exists on Disk but Not in Obsidian's File Explorer

First confirm that the configured vault path and note folder point to the vault currently open in Obsidian. If the Markdown file exists there but Obsidian search and File Explorer do not show it, quit Obsidian normally and reopen the vault so its filesystem index is rebuilt. Do not run the command that reloads the app without saving.

This can affect files written by an external native helper even though the note and attachments were saved successfully. Reopening Obsidian does not require creating a duplicate note.

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
