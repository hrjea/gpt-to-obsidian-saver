# Native Messaging

Native messaging is used because Chrome extensions cannot directly write arbitrary local files. The local native helper enables direct Markdown saves and HTML attachment copying into a configured Obsidian vault.

## Extension ID

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Find GPT to Obsidian Saver.
4. Copy the extension ID.

The native host manifest `allowed_origins` entry must be exactly:

```json
"chrome-extension://<extension-id>/"
```

Unpacked extension IDs can change when the extension is loaded from a different path or copy. If the ID changes, rerun the installer.

## macOS Installation

Download and unzip `gpt-to-obsidian-saver-v1.5.25-native-host-macos.zip`, then run:

```sh
./installers/macos-install.sh --extension-id <extension-id>
```

The installer writes user-level files only and does not require `sudo`.

Installed helper files:

```text
~/Library/Application Support/GPTObsidianSaver/native-host/
```

Native host manifest:

```text
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.gpt_obsidian_saver.open_direct.json
```

The macOS installer detects an absolute `python3` path at install time and generates a wrapper using that path. This avoids failures when Chrome's GUI environment has a smaller `PATH` than an interactive shell.

Wrapper log:

```text
~/Library/Logs/GPTObsidianSaver/native-wrapper.log
```

Native helper log:

```text
~/Library/Logs/GPTObsidianSaver/native-host.log
```

## Windows Installation

Windows native-helper support is Experimental and has not been validated on a real Windows machine for this release.

From PowerShell:

```powershell
.\installers\windows-install.ps1 -ExtensionId <extension-id>
```

The installer writes under the current user's `%LOCALAPPDATA%` and registers:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.gpt_obsidian_saver.open_direct
```

Windows logs are written under:

```text
%LOCALAPPDATA%\GPTObsidianSaver\Logs\
```

## Linux

Linux native-helper mode is unsupported in this release.

## Verification

Run the helper self-test:

```sh
python3 native-host/native-open-obsidian.py --self-test
```

After installation, test through Chrome with a normal Markdown save and an HTML attachment save. If Chrome reports `Access to the specified native messaging host is forbidden`, the extension ID in `allowed_origins` is wrong. If Chrome reports `Native host has exited`, inspect the wrapper and native-host logs.

## Uninstall

macOS:

```sh
./installers/macos-uninstall.sh
```

Windows PowerShell:

```powershell
.\installers\windows-uninstall.ps1
```

Uninstallers remove native host registration and installed helper files. They do not delete Obsidian vaults or notes.
