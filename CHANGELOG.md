# Changelog

## [1.5.40] - 2026-08-25

- Canonicalize nested ChatGPT artifact flyouts to the inner `screen-threadFlyOut`, and collapse equivalent ancestor/descendant wrappers that expose the same detailed Markdown body.
- Preserve a real ambiguity when two independent visible viewers expose the same filename, but stop a structurally stable ambiguity after a short bounded stabilization period instead of waiting the full 90 seconds.
- Add a side-effect-free background runtime ping, synchronous stale-context detection, bounded ping timeout, and runtime checks at Save start, viewer/download boundaries, long download waits, and immediately before native save.
- Cancel current exact-name download watches, clear delayed prompts, release the active Save lock, and instruct the user to refresh the ChatGPT tab when an unpacked-extension reload invalidates the content-script context.
- Distinguish download-control activation from download tracking, and describe an unverified URI fallback as an attempted open rather than a confirmed saved note.
- Add regression coverage for nested/equivalent flyouts, genuine ambiguity, early ambiguity exit, stale runtime at Save start, runtime invalidation during a watch, watch cancellation, ping timeout, and URI fallback wording.
- Document recovery when an externally written note exists on disk but Obsidian's file index does not show it until a normal app restart.

## [1.5.39] - 2026-08-25

- Repair missing chapter-file links when a captured self-contained HTML document already contains a unique matching chapter anchor such as `ch-00-title`.
- Keep real separately captured chapter files as the preferred target, and leave ambiguous or unmatched links unresolved instead of guessing.

## [1.5.38] - 2026-08-25

- Re-resolve generated Markdown artifact rows and controls by canonical filename before open, download fallback, and final warning so React re-renders do not leave stale DOM references.
- Prefer visible connected rows when ChatGPT renders hidden duplicates, and keep probing for a replacement exact File download control during the bounded current-save watch.
- Accept a filename-less Markdown flyout only when it is the single newly visible flyout with one readable Markdown body; continue to reject ambiguous mappings.
- Extend the generated Markdown viewer and exact-download fallback windows to 90 seconds for slower manual interaction.
- Show the resolved Markdown and HTML save paths in Options, warn about mismatched first folders, provide an explicit HTML-folder reset action, and verify persisted local and sync values after Save.
- Add regression coverage for row re-rendering, hidden duplicates, late controls, filename-less and ambiguous flyouts, slow manual opening, warning classification, and settings persistence.

## [1.5.37] - 2026-08-25

- Detect generated Markdown and HTML file cards across the complete ChatGPT conversation turn when GPT 5.6 renders them outside the narrow assistant message node.
- Keep Question and Answer conversion scoped to the assistant message so sibling artifact controls do not leak into saved note text.

## [1.5.36] - 2026-08-25

- When ChatGPT blocks synthetic opening of a detailed Markdown artifact, highlight its filename card and ask for one real click; then read the viewer directly without requiring a download.
- Keep the strict current-download fallback as a later backup only when a real File download control exists.
- On macOS, open the exact newly written Markdown file with Obsidian through LaunchServices instead of relying on Obsidian's index lookup for long Unicode filenames.

## [1.5.35] - 2026-08-25

- Start the exact-name Markdown download fallback when a generated file card exposes a non-page-fetchable URL, and start it after a fetch failure when necessary.
- Report a generated Markdown file row that has no exact File download control instead of silently omitting its body.
- Open the configured vault first, wait for its file index, and then open the new note by its vault-relative path.

## [1.5.34] - 2026-08-25

- Capture the exact generated detailed `.md` file from the current Save action when ChatGPT blocks page-side viewer extraction.
- Reject old, unrelated, or non-matching Markdown downloads and enforce the existing 2,000,000-character detailed-note limit in the native helper.
- Replace one native detailed-Markdown marker before writing the note, so generated bodies larger than URI limits remain intact without leaving raw markers.
- Open a durably written native note by its exact absolute path after a short file-watcher delay to avoid a new-note lookup race in Obsidian.

## [1.5.33] - 2026-08-25

- Open an already-visible generated Markdown file card before the first asynchronous wait so ChatGPT can use the Save click's transient user activation.

## [1.5.32] - 2026-08-25

- Wait up to 30 seconds for delayed generated Markdown artifact viewers before reporting a capture failure.
- Close the generated Markdown viewer after both successful and failed extraction attempts.

## [1.5.31] - 2026-08-25

- Capture generated detailed Markdown artifacts without requiring the user to open their preview, and append the full body under one `# 장별 상세 한국어 요약` heading through native save mode.
- Bind each interactive HTML artifact filename to its own viewer root instead of reusing a global viewer index or the first expected filename.
- Reject ambiguous filename mappings and identical HTML content assigned to different filenames instead of silently creating aliases.
- Rewrite verified local HTML anchor links to the flat attachment batch while preserving external URLs, anchors, and unresolved paths.

## [1.5.30] - 2026-08-08

### Fixed

- Reads the current ChatGPT CodeMirror HTML source before starting any browser-download fallback.
- Activates source extraction for ChatGPT's filename-less `HTML learning material download` control when the same assistant message contains a real Code/Preview artifact viewer.
- Re-resolves artifact source nodes after ChatGPT replaces the Preview DOM with the Code view.
- Recognizes current `.cm-content` and contenteditable editor nodes while keeping complete-document and size validation.
- Uses a 90-second manual download watch only when direct HTML source extraction fails.
- Prefers exact `File download` or `파일 다운로드` controls and excludes the `HTML learning material download` preview button.
- Blocks another save of the same response while its HTML download is being captured.
- Restores the ChatGPT file-card styling after the download succeeds or the bounded watch ends.

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
