# GitHub Release Installation

This project is distributed through GitHub Releases and installed with Chrome's Load unpacked function.

## Install the Extension

1. Download `gpt-to-obsidian-saver-v1.5.25-unpacked-extension.zip` from the GitHub Release.
2. Download `SHA256SUMS.txt`.
3. Verify the checksum:

```sh
shasum -a 256 gpt-to-obsidian-saver-v1.5.25-unpacked-extension.zip
```

Compare the result with `SHA256SUMS.txt`.

4. Unzip the extension package.
5. Open `chrome://extensions`.
6. Enable Developer mode.
7. Select Load unpacked.
8. Select the unzipped folder containing `manifest.json`.
9. Confirm the displayed version is `1.5.25`.

Chrome may warn about developer-mode extensions because this is an unpacked GitHub installation.

## Copy the Extension ID

1. Open `chrome://extensions`.
2. Find GPT to Obsidian Saver.
3. Copy the extension ID.

If the extension is loaded from a different folder or copy, Chrome may assign a different unpacked extension ID. If the ID changes, rerun the native-helper installer with the new ID.

## Install the Native Helper

Native-helper mode is optional for normal Markdown URI saving, but required for direct vault writes and HTML attachment saving.

macOS:

```sh
./installers/macos-install.sh --extension-id <extension-id>
```

Windows Experimental:

```powershell
.\installers\windows-install.ps1 -ExtensionId <extension-id>
```

Windows native-helper installation has not been validated on a real Windows machine for this release.

Linux native-helper mode is unsupported.

## Configure Settings

Open the extension options page and configure:

- Language.
- Obsidian vault name.
- Local Obsidian vault path for native-helper mode.
- Save folder path.
- HTML file save folder.
- HTML code-block attachment option.
- Previous-Q&A option for HTML learning notes.

Refresh existing ChatGPT tabs after changing extension versions or reloading the extension.

## Test Normal Markdown Saving

1. Open a new temporary ChatGPT conversation.
2. Ask for a harmless Markdown answer.
3. Click Save to Obsidian.
4. Confirm the note is created.

## Test HTML Attachment Saving

1. Ask for a real downloadable HTML artifact.
2. Click Save to Obsidian on the artifact response.
3. Confirm the Markdown note is created.
4. Confirm the `.html` file exists in the configured attachment folder.
5. Confirm the note link opens the HTML file.

## Updating

1. Download the newer GitHub Release ZIP.
2. Verify checksums.
3. Extract to a stable local folder.
4. Reload the unpacked extension in `chrome://extensions`.
5. Confirm the displayed version.
6. Refresh ChatGPT tabs.
7. If the extension ID changed, rerun the native-helper installer.

## Uninstall

1. Remove the unpacked extension from `chrome://extensions`.
2. Run the native-helper uninstaller if installed.

macOS:

```sh
./installers/macos-uninstall.sh
```

Windows Experimental:

```powershell
.\installers\windows-uninstall.ps1
```

Uninstallers do not delete Obsidian vaults or notes.
