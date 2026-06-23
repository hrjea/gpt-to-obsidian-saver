# Changelog

## [1.5.20] - 2026-06-23

Initial public release.

### Added

- ChatGPT answer to Obsidian Markdown saving.
- Obsidian URI mode.
- macOS native helper.
- Windows native-helper implementation marked Experimental.
- HTML attachment saving.
- Chrome downloads fallback for immediate HTML downloads.
- Note-relative HTML links.
- English and Korean UI.
- Optional previous-Q&A mode for HTML learning notes.
- HTML learning-material section at the top of HTML notes.
- macOS and Windows installer/uninstaller scripts.
- Privacy, security, native-messaging, permission, release, and troubleshooting documentation.
- Release validation and packaging scripts for GitHub Releases.

### Fixed

- Decorative favicon/OpenAI-logo insertion into saved Markdown.
- False attachments caused by plain `.html` filename text.
- Raw attachment marker remaining in notes after native processing.
- Native host execution under Chrome's macOS GUI environment.
- Native-host extension-ID mismatch troubleshooting.
- Incorrect HTML attachment relative links.
- HTML code blocks remaining after successful attachment conversion.

### Known Limitations

- Windows native-helper installation has not been validated on a real Windows machine.
- Linux native-helper mode is unsupported.
- ChatGPT DOM changes can require selector maintenance.
- Native helper requires separate installation.
- GitHub distribution requires Load unpacked installation.
- Restricted or sandboxed downloads depend on Chrome and ChatGPT UI behavior.
