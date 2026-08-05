# Changelog

## [1.5.25] - 2026-07-13

### Fixed

- Recognizes GPT 5.6 HTML filename-only buttons when the same assistant response contains a real Code/Preview artifact viewer.
- Keeps plain `.html` filename text excluded while restoring attachment extraction and previous-Q&A selection for branched conversations.

## [1.5.24] - 2026-07-13

### Fixed

- Detects branch-conversation artifact toolbars whose Code and Preview controls are not wrapped in an ARIA group.
- Restores real HTML attachment capture so previous-Q&A selection activates for branched HTML learning notes.

## [1.5.23] - 2026-07-11

### Changed

- Uses level-one headings for the main HTML learning material, question, and answer sections so answer subsections can start at level two.

## [1.5.22] - 2026-07-10

### Fixed

- Captures GPT 5.6 code/preview HTML artifacts directly from their complete CodeMirror source.
- Restores the artifact preview after extracting its HTML source.
- Avoids claiming that Chrome downloaded a file when a click-only artifact produced no download.

## [1.5.21] - 2026-07-10

### Fixed

- Detects GPT 5.6 HTML file cards whose clickable control no longer exposes download or artifact labels.
- Decodes percent-encoded HTML filenames before matching the immediate Chrome download.
- Preserves Markdown structure in long user prompts when selecting the current or previous question.
- Injects save buttons only into deduplicated assistant message nodes.

## [1.5.20] - 2026-06-23

Initial public-release candidate baseline.

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
