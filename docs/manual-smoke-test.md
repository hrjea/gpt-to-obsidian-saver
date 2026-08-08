# Manual Smoke Test for v1.5.30

Use only a test vault and a new temporary ChatGPT conversation. Do not use private conversations or a main Obsidian vault.

## Static Checks

```sh
./scripts/validate-release.sh
node tests/previous-qa-html-learning-self-test.js
```

## GitHub ZIP Fresh Installation

1. Extract `gpt-to-obsidian-saver-v1.5.30-unpacked-extension.zip` to a fresh temporary folder.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Select Load unpacked.
5. Select the extracted folder containing `manifest.json`.
6. Confirm version `1.5.30`.
7. Confirm there are no manifest errors.

## Options

Configure:

- Language: English, then Korean for localized heading tests.
- Obsidian vault name: test vault name.
- Local vault path: test vault path.
- Save folder path: a test-only folder.
- HTML file save folder: a test-only attachment folder.
- Save HTML code blocks as `.html` attachments: test both OFF and ON.
- Use previous Q&A for HTML learning notes: test both OFF and ON.

## Normal Markdown Note

Prompt a temporary ChatGPT conversation with a harmless Markdown answer. Click Save to Obsidian.

Pass:

- Markdown note is created.
- Question appears before Answer.
- No HTML learning-material section.
- No attachment marker remains.

## Actual HTML Artifact

Ask for a real downloadable HTML artifact. Click Save to Obsidian on the assistant response.

Pass:

- Markdown note is created.
- HTML file is copied to the configured attachment folder.
- HTML link is note-relative and opens from Obsidian.
- HTML learning-material section appears first.
- No raw attachment marker remains.

## Page-accessible HTML Artifact

Use a generated HTML artifact with Code and Preview controls. Click Save only once.

Pass:

- The extension switches to Code, reads the complete HTML source, and saves without requiring a Chrome download when the source is page-accessible.
- The Preview view is restored after source extraction.
- The HTML file is written into the configured vault attachment folder.
- Previous-Q&A mode activates when enabled.
- A second click while the first extraction is active does not start another save.
- The button shows its saving state while source extraction is active.

## Manual Download Fallback

If direct source extraction is intentionally made unavailable, verify the bounded fallback separately:

- The extension highlights only the small `File download` or `파일 다운로드` control, never the HTML learning-material preview button.
- After one real click on that exact control, the note and attachment save complete without another Save-button click.

## HTML Code Block Option OFF

Ask for an HTML code block but no real downloadable artifact.

Pass:

- Code block remains Markdown.
- No HTML attachment is created from the code block.

## HTML Code Block Option ON

Enable the option and repeat.

Pass:

- HTML code block is saved as an `.html` attachment.
- The code block is replaced by the localized saved-as-attachment line.

## Previous Q&A Available

Conversation sequence:

1. Ask a normal question.
2. Wait for the answer.
3. Ask ChatGPT to turn the previous answer into a self-contained HTML learning file.
4. Save the HTML artifact response.

Pass:

- HTML section appears first.
- Original question is preserved.
- Original answer is preserved.
- HTML-generation request and response are not used as the saved Q&A.

## Previous Q&A Unavailable

Use a conversation with only the HTML-generation request and response.

Pass:

- HTML section appears first.
- Current question is under Question.
- Current answer is under Answer.

## False HTML Filename

Use text containing `options 2.html` and `example 1.html` without a real artifact.

Pass:

- No attachment is created.
- No HTML learning-material section is created.

## Favicon Filtering

Use an answer with external links.

Pass:

- Decorative favicon/OpenAI-logo images do not appear as large Markdown images.

## Duplicate Click

Click Save twice quickly.

Pass:

- No uncontrolled duplicate burst is created.

## Error Cases

Record the result for:

- Invalid `vaultPath`.
- Missing native helper.
- Native host ID mismatch.
- macOS fresh native-helper installation.
- macOS uninstaller.

Windows native-helper testing is NOT TESTED unless executed on a real Windows machine. Linux native-helper mode is UNSUPPORTED.
