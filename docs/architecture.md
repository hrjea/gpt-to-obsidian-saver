# Architecture

Status: public architecture overview for release v1.5.52.

## System context

```text
ChatGPT page
  -> content.js
     -> background.js -> obsidian:// URI
     -> background.js -> Chrome Native Messaging
        -> native-host/native-open-obsidian.py
        -> configured Obsidian vault

ChatGPT page (explicit ordinary supplemental or shared-app consent)
  -> content.js -> current response or consented whole-conversation Share UI
  -> validated ChatGPT share URL
  -> ordinary: local body + supplemental link -> existing URI or Native route
  -> shared app: Native Messaging -> remote-reference Markdown note
```

There is no developer-operated application server. Extraction and note writing are local. Every ordinary save additionally invokes visible ChatGPT Share UI after explicit consent and includes a strict supplemental link. Specialized shared-app notes remain remote references; ordinary notes retain their captured local body.

## Components and responsibilities

### `content.js`

- Injects `Obsidian 저장` / `Save to Obsidian` buttons into eligible assistant messages.
- Identifies current and previous Q&A context by verified message roles and turn structure.
- Recovers an explicitly referenced previous Q&A across bounded, attempt-local ChatGPT turn-virtualization windows and restores the logical scroll position before Share/write boundaries.
- Converts selected ChatGPT DOM content to Markdown.
- Detects file-like deliverables, generated detailed Markdown, HTML artifacts, and rich app blocks.
- Performs capture-integrity, runtime, path/assembly, and share preflight checks.
- Builds normal, HTML learning, partial, Visualize, provider-neutral rich-app, and whole-conversation remote-reference notes.
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

### 1. Normal Markdown / URI-capable flow

1. User clicks Save on an assistant response.
2. Content script resolves nearest Q and the selected answer; intervening assistant turns are ordered provenance only. It freezes identity, route and content proof and converts only the selected current Q/A.
3. It prepares a complete draft, obtains explicit Share consent, validates one scoped URL and revalidates target/control/runtime proof before dispatch. Refusal, ambiguity or invalid URL stops with no note. The note retains `title`, `source`, `created`, tags and one supplemental Share section.
4. An ordinary note without a Native-only artifact is sent through Obsidian URI mode; merely configuring `vaultPath` does not switch this path to a direct Native file write.
5. The background may use the Native helper to open the URI. Direct fallback requires an explicit `ok: false` opener response plus healthy runtime and unchanged target/control proof; invalid callbacks fail closed. Deferred failure reaches the original Share reporter, warning only for tracked response Create/Update or conversation actions. Neither dispatch acknowledgement nor opener success verifies Vault creation.

### 2. HTML and generated-file Native flow

1. Content script inventories visible file and rich-artifact expectations.
2. It reads page-accessible HTML or a unique detailed Markdown viewer when possible.
3. If required, it starts a bounded exact-current download watch before asking for the one real user click.
4. It compares expected and captured deliverables.
5. Missing content cancels by default; supported partial capture requires explicit consent.
6. Runtime checks complete before the final save; Native-only artifact flows require the configured Vault path/helper.
7. Native helper validates and writes attachments, replaces markers, writes the note, and returns an audit.
8. Content script rejects a non-partial result whose requested/written audit is incomplete.

### 3. Interactive rich-app partial flow

When an app block has no verified complete local representation and no approved remote-reference path, the extension cancels by default. If the user explicitly accepts partial capture, only readable outer text and verified files are saved with permanent `capture_status: partial` metadata and a warning. The iframe/app shell is not represented as a local copy.

### 4. Response-scoped remote-reference flow

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

This fallback is broader than response sharing and has a separate consent boundary.

1. It is considered only when the response-scoped trigger is missing, not when that trigger is ambiguous.
2. The exact visible header `[data-testid='share-chat-button']` must be unique and revalidated before click.
3. The result may be a classified share surface or a fresh strict whole-conversation copy-success signal. One visually rendered success toast plus its `sr-only` ARIA live-region mirror is canonicalized as one semantic signal only when that exact structural pair is present; independent signals or a simultaneous surface/signal remain ambiguous and fail closed.
4. The final URL must pass strict validation.
5. The note uses `conversation_share_url`, `share_scope: conversation`, and `target_turn_id`; it must not claim `visualize_share_url` semantics.

## Trust boundaries

### ChatGPT DOM

ChatGPT page structure is untrusted and changes over time. Role, turn, file, viewer, app, toolbar, dialog, status, and URL candidates must be structurally validated and unique. One mounted DOM window is not assumed to contain the complete chronology; virtualized windows may be joined only through exact bounded overlap proof. A detached A1 conversion clone and a following-turn geometry anchor cannot operate Share UI or establish chronology. Response Share portal/remount evidence is attempt-local. Text similarity alone is not sufficient provenance.

### Clipboard

Clipboard access is optional. It is requested only during an approved Share flow after an immediate runtime/current-context guard, and may be read once only after a fresh strict success signal. A verified missing-only hydration window skips the request and never triggers it automatically after recovery. Raw values are not logged or persisted; only a validated URL may enter a note.

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

HTML learning, generated detailed Markdown and approved partial notes also require the ordinary supplemental consent and strict link before their existing Native dispatch. The explicit HTML previous-Q&A option preserves that previous pair and headings; Share still targets the clicked current response. Conversation fallback is missing-only and separately consented, never an ambiguity fallback.
