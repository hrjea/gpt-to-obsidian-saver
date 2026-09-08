# Architecture

Status: public architecture overview for version v1.5.54. Validation and release delivery are recorded separately in [the release checklist](../RELEASE_CHECKLIST_v1.5.54.md).

## System context

```text
ChatGPT project conversation
  -> content.js -> local capture and selected-node/route/runtime guard
  -> background.js -> existing URI or Native local-save route

ChatGPT non-project ordinary conversation
  -> content.js -> explicit scoped Share consent and visible Share UI
  -> validated supplemental link + local body
  -> background.js -> existing URI or Native local-save route

ChatGPT non-project specialized shared app
  -> content.js -> explicit scoped Share consent and visible Share UI
  -> validated ChatGPT share URL
  -> background.js -> Native Messaging -> remote-reference Markdown note
```

There is no developer-operated application server. Extraction and note writing are local. Recognized project conversations omit every Share flow and preserve their original source URL. Every non-project ordinary save additionally invokes visible ChatGPT Share UI after explicit consent and includes a strict supplemental link. Specialized shared-app notes remain remote references; ordinary notes retain their captured local body.

## Components and responsibilities

### `content.js`

- Injects `Obsidian 저장` / `Save to Obsidian` buttons into eligible assistant messages.
- Identifies current and previous Q&A context by verified message roles and turn structure.
- For non-project specialized sharing, recovers an explicitly referenced previous Q&A across bounded, attempt-local ChatGPT turn-virtualization windows and restores the logical scroll position before Share/write boundaries.
- Converts selected ChatGPT DOM content to Markdown.
- Detects file-like deliverables, generated detailed Markdown, HTML artifacts, and rich app blocks.
- Performs capture-integrity, runtime, path/assembly, and share preflight checks.
- Builds project local normal/HTML/partial notes without Share, non-project ordinary notes with one supplemental Share link, and supported non-project Visualize/provider-neutral remote-reference notes.
- Requests explicit background operations implemented and tested in `background.js`.
- Owns user consent for partial capture and sharing.

`content.js` is intentionally fail-closed where ChatGPT DOM state is missing or ambiguous.

### `background.js`

- Provides a versioned runtime ping and Native helper preflight.
- Requests the optional `clipboardRead` permission only on an explicit content-script request.
- Opens Obsidian URI requests and mediates all Native Messaging.
- Starts, awaits, and cancels bounded HTML/Markdown download watches.
- Correlates downloads with the current save window and expected filenames.
- Rejects duplicate URI/save requests for a short bounded period.
- Normalizes Native helper responses before returning them to the content script.

### `options.js` / `options.html`

- Own the settings UI and English/Korean labels.
- Store general settings in `chrome.storage.sync`.
- Store machine-local `vaultPath` and `htmlSaveDir` in `chrome.storage.local`.
- Migrate legacy synced `htmlSaveDir` once and verify stored values after Save.
- Display version and resolved path diagnostics.

### `native-host/native-open-obsidian.py`

- Implements Chrome Native Messaging framing.
- Accepts `ping`, `save-note`, and URI-open requests.
- Validates vault, note, attachment, downloaded-file, size, and marker contracts.
- Writes only inside the configured vault.
- Rewrites verified local HTML links and Native placeholders.
- Returns note/attachment audit data including byte counts and SHA-256 values.
- Opens the durably written note in Obsidian where supported.

### Installers and release scripts

- Platform installers register a user-level Native Messaging host for one extension ID.
- `scripts/validate-release.sh` is the automated project gate.
- `scripts/package-release.sh` requires a clean committed Git tree, packages platform artifacts from explicit file allowlists, checks archive hygiene, and writes checksums.

## Save flows

### Project conversation local flow

The exemption is determined from the actual absolute HTTPS URL on the exact hosts `chatgpt.com` or `chat.openai.com`. Its path must be `/g/g-p-<32 hexadecimal characters>[-<nonempty single-segment slug>]/c/<UUID>`, where the UUID has the hexadecimal 8-4-4-4-12 form. An optional trailing slash, query or fragment is accepted. Credentials and all explicit ports, including `:443`, are rejected. Plain `/c/` conversations, custom GPTs, project home pages, fake hosts and malformed identifiers do not qualify; UI labels or `/g/` alone cannot grant the exception.

1. Freeze the original full source URL, conversation route, exact connected selected assistant node, assistant role and `data-message-id`. Keep the selected local answer rather than substituting text from a subsequently opened viewer.
2. Bypass supplemental full-Markdown/provenance proof, Share acquisition/consent, clipboard permission/read, manual Share-URL entry and every structured Visualize or provider-neutral remote-reference dispatch. Add no extension-generated Share metadata, link or body section.
3. Capture HTML and exact generated detailed Markdown through the existing page/viewer or bounded current-download path. Preserve initial expected file and app evidence across extraction, so a disappearing card or preview cannot silently make an incomplete capture complete. Rich expectations follow the actual current or explicitly selected previous-Q&A answer body being stored.
4. Keep the existing explicit partial-save decision for missing local files or apps. Incomplete rich apps cancel by default; approved partial notes retain `capture_status: partial`, truthful expected/complete counts, `interactive_behavior_preserved: false` and a permanent warning. They never claim a copied local app or a remote reference from a skipped Share action.
5. Revalidate the route, exact selected-node connection/role/ID and runtime at initial, post-artifact and final write/fallback boundaries. A replacement node fails even if it reuses the same ID. The existing route key includes query parameters and ignores the fragment; the saved source remains the original full URL.
6. Retain existing URI/Native transport, required Native preflight, Vault-contained writes, payload limits, markers and attachment audit. Permitted fallback reruns the local guard; downloaded detailed Markdown still has no URI fallback. URI dispatch does not prove a Vault file exists.

### 1. Normal Markdown / URI-capable flow

This supplemental Share flow applies to non-project conversations.

1. User clicks Save on an assistant response.
2. Content script resolves nearest Q and the selected answer; intervening assistant turns are ordered provenance only. It freezes identity, route and content proof and converts only the selected current Q/A.
3. It prepares a complete draft, obtains explicit Share consent, validates one scoped URL and revalidates target/control/runtime proof before dispatch. Refusal, ambiguity or invalid URL stops with no note. The note retains `title`, `source`, `created`, tags and one supplemental Share section.
4. An ordinary note without a Native-only artifact is sent through Obsidian URI mode; merely configuring `vaultPath` does not switch this path to a direct Native file write.
5. The background may use the Native helper to open the URI. Direct fallback requires an explicit `ok: false` opener response plus healthy runtime and unchanged target/control proof; invalid callbacks fail closed. Deferred failure reaches the original Share reporter, warning only for tracked response Create/Update or conversation actions. Neither dispatch acknowledgement nor opener success verifies Vault creation.

### 2. HTML and generated-file Native flow

1. Content script inventories visible file and rich-artifact expectations; project saves retain initial expectations and match rich content to the actual selected current/previous-Q&A body.
2. It reads page-accessible HTML or a unique detailed Markdown viewer when possible. After this attempt opens HTML Code, it waits for bounded, uniquely scoped Preview restoration before ordinary Share proof. Unconfirmed restoration stops ordinary saving; genuine answer changes still fail the original proof. Already-open Code views and project local guards are preserved.
3. If required, it starts a bounded exact-current download watch before asking for the one real user click.
4. It compares expected and captured deliverables.
5. Missing content cancels by default; supported partial capture requires explicit consent.
6. Runtime checks complete before the final save; Native-only artifact flows require the configured Vault path/helper and Native preflight. Non-project ordinary artifacts then require one consented, validated supplemental Share link; project artifacts omit that stage.
7. Native helper validates and writes attachments, replaces markers, writes the note, and returns an audit.
8. Content script rejects a non-partial result whose requested/written audit is incomplete.

### 3. Interactive rich-app partial flow

When an app block has no verified complete local representation and no approved remote-reference path, the extension cancels by default. If the user explicitly accepts partial capture, only readable outer text and verified files are saved with permanent `capture_status: partial` metadata and a warning. The iframe/app shell is not represented as a local copy. All project rich-app variants use this local completeness/partial decision instead of specialized Share. Non-project approved partial notes also require the ordinary supplemental Share consent and validated link before dispatch.

### 4. Response-scoped remote-reference flow

Recognized project conversations never enter this flow.

1. Resolve structured `previous-qa` or `direct-visualize`, provider-neutral `previous-qa-rich-app`, or provider-neutral `rich-app-continuation` context. Text or history alone never proves a provider.
2. Freeze the selected Q2/A2 identity, content, app/runtime proof, route, and production conversation scroller. Explicit previous-answer requests may join only the approved adjacent virtualized windows through exact role/content/identity overlap.
3. Restore the logical position and reacquire the exact target. An optional first-following-turn geometry anchor is navigation-only; it cannot prove chronology, note content, or Share scope.
4. Complete all remaining read-only context, artifact, file, Markdown, title/path, runtime, and Native preflight checks.
5. Ask for Share/clipboard consent. Immediately before an optional clipboard permission request, revalidate the current proof. A narrowly verified missing-only A1/Q2 window skips permission and defers one bounded recovery until after approved consent; recovery never runs in the consent callback and never replaces A2.
6. Re-resolve one Share control inside the already approved response or separately consented conversation scope immediately before clicking.
7. Reuse or create a link through one classified visible Share surface. Hydrated response flows admit DOM remounts or iframe portal movement only when the fresh surface family and exact source proof remain unique and current.
8. Accept a URL only through the strict final validator. Copy/clipboard/surface awaits are rechecked before the next effect.
9. Build mode-specific `remote-reference` Markdown with truthful provider provenance.
10. Save through Native only. URI fallback is forbidden for this flow.

### 5. Whole-conversation remote-reference fallback

This fallback is available only outside recognized project conversations, is broader than response sharing and has a separate consent boundary.

1. It is considered only when the response-scoped trigger is missing, not when that trigger is ambiguous.
2. The exact visible header `[data-testid='share-chat-button']` must be unique and revalidated before click.
3. The result may be a classified share surface or a fresh strict whole-conversation copy-success signal. One visually rendered success toast plus its `sr-only` ARIA live-region mirror is canonicalized as one semantic signal only when that exact structural pair is present; independent signals or a simultaneous surface/signal remain ambiguous and fail closed.
4. The final URL must pass strict validation.
5. The note uses `conversation_share_url`, `share_scope: conversation`, and `target_turn_id`; it must not claim `visualize_share_url` semantics.

## Trust boundaries

### ChatGPT DOM

ChatGPT page structure is untrusted and changes over time. Selection, artifact, control and URL evidence is validated within the active local-capture or Share boundary. Project local saves use the exact selected-node/role/ID, route and runtime guard above rather than supplemental full-content/provenance fingerprints. For non-project specialized sharing, one mounted DOM window is not assumed to contain the complete chronology; virtualized windows may be joined only through exact bounded overlap proof. A detached A1 conversion clone and a following-turn geometry anchor cannot operate Share UI or establish chronology. Response Share portal/remount evidence is attempt-local. Text similarity alone is not sufficient provenance.

### Clipboard

Project saves do not request or read the clipboard. Outside project conversations, clipboard access is optional. It is requested only during an approved Share flow after an immediate runtime/current-context guard, and may be read once only after a fresh strict success signal. A verified missing-only hydration window skips the request and never triggers it automatically after recovery. Raw values are not logged or persisted; only a validated URL may enter a note.

### Background service worker

The background script is the boundary for Native Messaging, downloads, and optional permission requests. Content scripts do not receive broad filesystem access.

### Native helper and filesystem

The Native helper treats all incoming paths and content metadata as untrusted. It validates the vault boundary before writing and validates downloaded source files before reading them.

### Remote share links

A share URL is not a local copy and may expose content according to ChatGPT policy. Specialized remote-reference notes state remote-only and offline-unavailable status. Ordinary notes keep local content and label the URL as supplemental. A created or updated link may remain active if later saving fails; the extension warns but does not auto-revoke it.

## Integrity and size boundaries

Current public boundaries include a 16 MiB Native message ceiling, at most 100 HTML attachments, 12 MiB aggregate attachment bytes, 700,000 characters per HTML text attachment, and bounded detailed Markdown limits.

## Duplicate and runtime protection

- The content script prevents simultaneous saves for the same response and keeps short-lived recent-save state.
- The background worker deduplicates URI/native requests for 30 seconds.
- Runtime ping/guard checks stop operations after an unpacked extension reload.
- Active download watches are cancelled when the runtime becomes unavailable.

## Public compatibility contract

- Normal Markdown notes may use Obsidian URI mode; Native-only artifact and remote-reference flows require the Native helper.
- Incomplete rich artifacts cancel by default and require explicit consent before a permanently marked partial note.
- Remote references contain only a strictly validated ChatGPT share URL, are online-only, and never claim a local interactive copy.
- Native writes remain Vault-bounded and return attachment/note audit metadata.
- Missing or ambiguous message, artifact, Share, or URL candidates fail closed instead of selecting a fallback by similarity.

Non-project HTML learning, generated detailed Markdown and approved partial notes also require the ordinary supplemental consent and strict link before their existing URI/Native dispatch. Project equivalents omit Share while retaining artifact and partial-consent checks. The explicit HTML previous-Q&A option preserves that previous pair and headings; for non-project notes, Share still targets the clicked current response. Conversation fallback is missing-only and separately consented, never an ambiguity fallback.
