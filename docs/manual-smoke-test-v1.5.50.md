# Manual Smoke Test for v1.5.50

Use a temporary Chrome profile, a test Obsidian Vault, and non-private ChatGPT conversations. Do not retain raw conversation/share URLs, extension IDs, personal paths, credentials, or private content in release evidence.

## 1. Fresh package load

1. Verify the downloaded `SHA256SUMS.txt` and unpacked-extension ZIP.
2. Extract the ZIP into a new temporary directory.
3. Start a fresh Chrome profile with only that unpacked extension.
4. Confirm `manifest.json`, the extension page, the options diagnostic, and the content runtime all report `1.5.50`.
5. Refresh any ChatGPT tab after loading or reloading the extension.

## 2. Native preflight

1. Install the matching macOS Native ZIP with the temporary extension ID.
2. Configure a test Vault path and folders.
3. Run the options-to-background-to-Native diagnostic.
4. Confirm the helper answers its ping and keeps all writes inside the configured test Vault.

Windows is Experimental and Linux Native mode is unsupported. Do not promote syntax checks into real-platform results.

## 3. Ordinary Markdown

1. Save a harmless ordinary answer.
2. Confirm one note appears with the expected source, question, answer, and no attachment metadata.
3. Record whether the URI or Native path ran; do not infer a file save from an attempted URI alone.

## 4. Local artifact path

1. Save one response with a real page-readable or exact downloaded HTML artifact.
2. Confirm the note and every requested attachment exist.
3. Confirm note-relative links resolve, filenames are non-empty, and Native audit counts, bytes, and hashes agree.
4. Confirm plain `.html` text or an href-less filename does not become an attachment.

## 5. Visualize direct request

1. Create an independent Q2 that requests a visualization without referring to the immediately previous answer.
2. Save A2 and approve Share only at the extension-owned consent surface.
3. Confirm the note contains Q2 plus the A2 explanation/reference and does not reuse an older Q1/A1.
4. Confirm the Share URL is strict, the note is `remote-reference`, and no local interactive-artifact claim is made.

## 6. Visualize previous-answer request

1. Use an explicit request equivalent to “visualize the answer immediately above.”
2. Exercise a conversation long enough for ChatGPT turn virtualization to unmount earlier turns.
3. Confirm bounded restoration reaches consent without selecting a different answer.
4. Approve Share at action time.
5. Confirm exactly one new note contains exact Q1/A1, excludes Q2 marker text, records verified Visualize provenance, and links to the selected A2 Share page.
6. Confirm the Vault delta and inspect the saved Share page. A success dialog without the expected Vault delta is a failure.

## 7. Provider-neutral previous-Q&A rich app

1. Reproduce a current A2 that retains exactly one app-preview block and one allowed app-runtime iframe while no structured Visualize provider marker is present.
2. Confirm the extension selects the provider-neutral Share path only while that compound evidence and strict Q1/A1/Q2/A2 chronology remain current and unambiguous.
3. After action-time Share consent, inspect the Vault delta and confirm the note uses `previous-qa-rich-app-share-link`, Q1/A1, `app_provider: unknown`, and no Visualize provenance or URI fallback.
4. Record `LIVE UNVERIFIED` if this exact current-build path is not reproduced; do not promote it from structured-Visualize or automated evidence.

## 8. Failure boundaries

Verify focused automated coverage remains green for duplicate/ambiguous turns, changed route/runtime/scroller, wrong or duplicate iframe source, Share-surface competitors, invalid URLs, permission-time conflicts, target loss, and zero later effects after a failed boundary.

## 9. Cleanup

Remove the temporary Chrome profile and test-only Native registration after collecting sanitized evidence. Do not delete a real Vault, main Chrome profile, or user notes.
