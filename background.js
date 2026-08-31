// background.js (service worker)
const VERSION = "1.5.50";
const RUNTIME_PING_TYPE = "gpt2obs-runtime-ping";
const NATIVE_PREFLIGHT_TYPE = "gpt2obs-native-preflight";
const NATIVE_OBSIDIAN_HOST = "com.gpt_obsidian_saver.open_direct";
const DUPLICATE_TTL_MS = 30000;
// ChatGPT may prepare generated artifacts for tens of seconds before Chrome
// reports the completed download. Keep this bounded to the current Save action.
const DOWNLOAD_WATCH_TIMEOUT_MS = 90000;
const MARKDOWN_DOWNLOAD_WATCH_TIMEOUT_MS = 90000;
const DOWNLOAD_WATCH_RETAIN_MS = 30000;
const DOWNLOAD_START_GRACE_MS = 3000;
const DOWNLOAD_SEARCH_LIMIT = 50;
const recentRequests = new Map();
const activeDownloadWatches = new Map();

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function pruneRecentRequests(now) {
  for (const [key, time] of recentRequests.entries()) {
    if (now - time > DUPLICATE_TTL_MS) recentRequests.delete(key);
  }
}

function isDuplicateRequest(key) {
  const now = Date.now();
  pruneRecentRequests(now);
  const last = recentRequests.get(key);
  if (last && now - last < DUPLICATE_TTL_MS) return true;
  recentRequests.set(key, now);
  return false;
}

function obsidianUriDedupeKey(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "obsidian:" && parsed.hostname === "new") {
      return [
        "obsidian-new",
        parsed.searchParams.get("vault") || "",
        hashString(parsed.searchParams.get("content") || "")
      ].join("::");
    }
  } catch {}
  return `open:${hashString(uri)}`;
}

function pathBasename(value) {
  return String(value || "").split(/[\\/]+/).pop() || "";
}

function isHtmlPath(value) {
  return /\.html?$/i.test(pathBasename(value));
}

function isMarkdownPath(value) {
  return /\.md$/i.test(pathBasename(value));
}

function isAllowedDownloadPath(value, kind) {
  return kind === "markdown" ? isMarkdownPath(value) : isHtmlPath(value);
}

function normalizeDownloadName(value) {
  return pathBasename(value)
    .toLowerCase()
    .replace(/\s+\(\d+\)(?=\.[^.]+$)/, "");
}

function sanitizeExpectedDownloadNames(value, kind = "html") {
  if (!Array.isArray(value)) return [];
  const names = [];
  value.forEach(item => {
    const name = normalizeDownloadName(item);
    if (isAllowedDownloadPath(name, kind) && !names.includes(name)) names.push(name);
  });
  return names.slice(0, 10);
}

function matchesExpectedDownloadName(filename, expectedNames) {
  if (!expectedNames.length) return false;
  const actual = normalizeDownloadName(filename);
  return expectedNames.includes(actual);
}

function downloadStartedInWatchWindow(item, watch) {
  const started = Date.parse(item?.startTime || "");
  if (!Number.isFinite(started)) return watch.kind !== "markdown";
  return started >= watch.startedAt - DOWNLOAD_START_GRACE_MS &&
    started <= watch.startedAt + watch.timeoutMs + DOWNLOAD_START_GRACE_MS;
}

function latestDownload(items) {
  return items.slice().sort((a, b) => {
    const aTime = Date.parse(a.startTime || "") || 0;
    const bTime = Date.parse(b.startTime || "") || 0;
    if (aTime !== bTime) return bTime - aTime;
    return (b.id || 0) - (a.id || 0);
  })[0] || null;
}

function cleanupDownloadWatch(watch) {
  if (!watch || watch.cleaned) return;
  watch.cleaned = true;
  clearTimeout(watch.timeoutId);
  try { chrome.downloads.onCreated.removeListener(watch.onCreated); } catch {}
  try { chrome.downloads.onChanged.removeListener(watch.onChanged); } catch {}
}

function finishDownloadWatch(watch, response) {
  if (!watch || watch.done) return;
  watch.done = true;
  watch.result = response;
  cleanupDownloadWatch(watch);
  watch.waiters.splice(0).forEach(sendResponse => {
    try { sendResponse(response); } catch {}
  });
  watch.retainTimer = setTimeout(() => {
    activeDownloadWatches.delete(watch.id);
  }, DOWNLOAD_WATCH_RETAIN_MS);
}

function downloadItemToResponse(item) {
  return {
    id: item.id,
    name: pathBasename(item.filename),
    sourcePath: item.filename,
    startTime: item.startTime || "",
    endTime: item.endTime || ""
  };
}

function chooseMatchingDownload(items, watch) {
  const allowedItems = items.filter(item => (
    item &&
    item.state === "complete" &&
    item.exists !== false &&
    item.filename &&
    isAllowedDownloadPath(item.filename, watch.kind) &&
    downloadStartedInWatchWindow(item, watch)
  ));
  if (!allowedItems.length) return null;

  const expectedMatches = allowedItems.filter(item => matchesExpectedDownloadName(item.filename, watch.expectedNames));
  if (expectedMatches.length) return latestDownload(expectedMatches);
  // Markdown is note body content, so never accept a merely recent arbitrary
  // .md download. It must match the file card selected for this Save action.
  if (watch.kind === "markdown") return null;
  if (!watch.expectedNames.length || allowedItems.length === 1) return latestDownload(allowedItems);
  return null;
}

function checkDownloadWatch(watch) {
  if (!watch || watch.done || !watch.ids.size) return;
  const ids = Array.from(watch.ids);
  const items = [];
  let pending = ids.length;

  ids.forEach(id => {
    chrome.downloads.search({ id }, (found) => {
      if (Array.isArray(found) && found[0]) items.push(found[0]);
      pending -= 1;
      if (pending === 0) {
        const match = chooseMatchingDownload(items, watch);
        if (match) {
          finishDownloadWatch(watch, {
            ok: true,
            download: downloadItemToResponse(match)
          });
        }
      }
    });
  });
}

function seedDownloadWatchFromRecentItems(watch) {
  try {
    chrome.downloads.search({
      limit: DOWNLOAD_SEARCH_LIMIT,
      orderBy: ["-startTime"]
    }, (items) => {
      if (watch.done) return;
      for (const item of Array.isArray(items) ? items : []) {
        if (!item?.filename || !isAllowedDownloadPath(item.filename, watch.kind)) continue;
        if (!downloadStartedInWatchWindow(item, watch)) continue;
        watch.ids.add(item.id);
      }
      checkDownloadWatch(watch);
    });
  } catch {}
}

function beginDownloadWatch(message, kind = "html") {
  if (!chrome.downloads?.onCreated || !chrome.downloads?.onChanged) {
    return { ok: false, error: "downloads permission is unavailable" };
  }

  const expectedNames = sanitizeExpectedDownloadNames(message.expectedNames, kind);
  if (kind === "markdown" && expectedNames.length === 0) {
    return { ok: false, error: "markdown download watch requires an exact expected filename" };
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = kind === "markdown" ? MARKDOWN_DOWNLOAD_WATCH_TIMEOUT_MS : DOWNLOAD_WATCH_TIMEOUT_MS;
  const watch = {
    id,
    kind,
    startedAt: Number(message.startedAt) || Date.now(),
    expectedNames,
    timeoutMs,
    ids: new Set(),
    waiters: [],
    done: false,
    cleaned: false,
    timeoutId: 0,
    retainTimer: 0,
    result: null,
    onCreated: null,
    onChanged: null
  };

  watch.onCreated = (item) => {
    if (watch.done || !downloadStartedInWatchWindow(item, watch)) return;
    watch.ids.add(item.id);
    if (item.state === "complete") checkDownloadWatch(watch);
  };

  watch.onChanged = (delta) => {
    if (watch.done || !watch.ids.has(delta.id)) return;
    if (delta.state?.current === "complete" || delta.filename) {
      checkDownloadWatch(watch);
    }
  };

  chrome.downloads.onCreated.addListener(watch.onCreated);
  chrome.downloads.onChanged.addListener(watch.onChanged);
  watch.timeoutId = setTimeout(() => {
    finishDownloadWatch(watch, { ok: false, error: `${kind}-download-watch-timeout` });
  }, timeoutMs);
  activeDownloadWatches.set(id, watch);
  // A synthetic file-card click can race service-worker startup. Search only
  // the bounded current-action window so that the just-created download is
  // still found without ever selecting an old Downloads file.
  seedDownloadWatchFromRecentItems(watch);

  return {
    ok: true,
    watchId: id,
    timeoutMs
  };
}

function beginHtmlDownloadWatch(message) {
  return beginDownloadWatch(message, "html");
}

function beginMarkdownDownloadWatch(message) {
  return beginDownloadWatch(message, "markdown");
}

function awaitDownloadWatch(message, kind, sendResponse) {
  const watch = activeDownloadWatches.get(message.watchId);
  if (!watch || watch.kind !== kind) {
    sendResponse({ ok: false, error: "download watch not found" });
    return false;
  }
  if (watch.done) {
    sendResponse(watch.result || { ok: false, error: "download watch finished without result" });
    return false;
  }
  watch.waiters.push(sendResponse);
  return true;
}

function cancelDownloadWatch(message, kind, sendResponse) {
  const watch = activeDownloadWatches.get(message.watchId);
  if (watch && watch.kind === kind) {
    finishDownloadWatch(watch, { ok: false, error: "download watch cancelled" });
    clearTimeout(watch.retainTimer);
    activeDownloadWatches.delete(message.watchId);
  }
  sendResponse({ ok: true });
  return false;
}

chrome.runtime.onInstalled.addListener(() => {
  // Set defaults once.
  chrome.storage.sync.get(["uiLanguage","vaultName","folderPath","prefixDate"], (st) => {
    const def = {
      uiLanguage: st.uiLanguage ?? "en",
      vaultName: st.vaultName ?? "",
      folderPath: st.folderPath ?? "ChatGPT",
      prefixDate: (st.prefixDate === undefined) ? true : st.prefixDate
    };
    chrome.storage.sync.set(def);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "gpt2obs-request-clipboard-read-permission") {
    try {
      chrome.permissions.request({ permissions: ["clipboardRead"] }, granted => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: "clipboard-read-permission-request-failed" });
          return;
        }
        sendResponse({ ok: true, granted: granted === true });
      });
      return true;
    } catch {
      sendResponse({ ok: false, error: "clipboard-read-permission-request-failed" });
      return false;
    }
  }

  if (msg && msg.type === RUNTIME_PING_TYPE) {
    sendResponse({ ok: true, pong: true, version: VERSION });
    return false;
  }

  if (msg && msg.type === NATIVE_PREFLIGHT_TYPE) {
    chrome.runtime.sendNativeMessage(NATIVE_OBSIDIAN_HOST, { action: "ping" }, (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response || !response.ok || response.pong !== true) {
        sendResponse({ ok: false, error: err?.message || response?.error || "native-preflight-failed" });
        return;
      }
      sendResponse({ ok: true, pong: true, native: true });
    });
    return true;
  }

  if (msg && msg.type === "begin-html-download-watch") {
    sendResponse(beginHtmlDownloadWatch(msg));
    return false;
  }

  if (msg && msg.type === "begin-markdown-download-watch") {
    sendResponse(beginMarkdownDownloadWatch(msg));
    return false;
  }

  if (msg && msg.type === "await-html-download-watch" && msg.watchId) {
    return awaitDownloadWatch(msg, "html", sendResponse);
  }

  if (msg && msg.type === "await-markdown-download-watch" && msg.watchId) {
    return awaitDownloadWatch(msg, "markdown", sendResponse);
  }

  if (msg && msg.type === "cancel-html-download-watch" && msg.watchId) {
    return cancelDownloadWatch(msg, "html", sendResponse);
  }

  if (msg && msg.type === "cancel-markdown-download-watch" && msg.watchId) {
    return cancelDownloadWatch(msg, "markdown", sendResponse);
  }

  if (msg && msg.type === "open-obsidian-uri" && msg.uri) {
    if (!/^obsidian:\/\//i.test(msg.uri)) {
      sendResponse({ ok: false, error: "invalid-uri" });
      return false;
    }
    if (isDuplicateRequest(obsidianUriDedupeKey(msg.uri))) {
      sendResponse({ ok: true, duplicate: true });
      return false;
    }

    chrome.runtime.sendNativeMessage(NATIVE_OBSIDIAN_HOST, { uri: msg.uri }, (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response || !response.ok) {
        const error = err?.message || response?.error || "unknown";
        console.warn("Native Obsidian opener failed.", error);
        sendResponse({ ok: false, error });
        return;
      }
      sendResponse({ ok: true, native: true });
    });
    return true;
  }

  if (msg && msg.type === "save-obsidian-note" && msg.payload) {
    const payload = msg.payload;
    if (!payload.filePath || !payload.content) {
      sendResponse({ ok: false, error: "missing-note-payload" });
      return false;
    }
    const attachmentKey = [
      ...(Array.isArray(payload.attachments) ? payload.attachments.map(item => item?.name || "") : []),
      ...(Array.isArray(payload.downloadedAttachments) ? payload.downloadedAttachments.map(item => `${item?.name || ""}:${item?.sourcePath || ""}:${item?.downloadId || ""}`) : []),
      payload.downloadedMarkdown ? `${payload.downloadedMarkdown.name || ""}:${payload.downloadedMarkdown.sourcePath || ""}:${payload.downloadedMarkdown.downloadId || ""}` : "",
      ...(Array.isArray(payload.attachmentNames) ? payload.attachmentNames : [])
    ].join("|");
    const saveKey = [
      payload.vaultName || "",
      payload.vaultPath || "",
      payload.filePath || "",
      hashString(payload.content),
      hashString(attachmentKey)
    ].join("::");
    if (isDuplicateRequest(`save:${saveKey}`)) {
      sendResponse({ ok: true, duplicate: true });
      return false;
    }

    chrome.runtime.sendNativeMessage(NATIVE_OBSIDIAN_HOST, {
      action: "save-note",
      vaultName: payload.vaultName || "",
      vaultPath: payload.vaultPath || "",
      filePath: payload.filePath,
      content: payload.content,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      downloadedAttachments: Array.isArray(payload.downloadedAttachments) ? payload.downloadedAttachments : [],
      downloadedMarkdown: payload.downloadedMarkdown && typeof payload.downloadedMarkdown === "object" ? payload.downloadedMarkdown : null,
      attachmentNames: Array.isArray(payload.attachmentNames) ? payload.attachmentNames : [],
      allowPartialAttachments: payload.allowPartialAttachments === true,
      htmlSaveDir: payload.htmlSaveDir || "",
      htmlCodeBlockReplacementText: payload.htmlCodeBlockReplacementText || ""
    }, (response) => {
      const err = chrome.runtime.lastError;
      if (err || !response || !response.ok) {
        const error = err?.message || response?.error || "native-save-failed";
        console.warn("Native Obsidian save failed.", error);
        sendResponse({ ok: false, error });
        return;
      }
      sendResponse({
        ok: true,
        native: true,
        notePath: response.notePath,
        attachments: response.attachments,
        attachmentAudit: response.attachmentAudit || null,
        noteSha256: response.noteSha256 || "",
        noteBytes: response.noteBytes || 0,
        detailedMarkdown: response.detailedMarkdown || null,
        warnings: response.warnings || []
      });
    });
    return true;
  }
});

if (globalThis.__GPT_OBSIDIAN_ENABLE_TEST_HOOKS__) {
  globalThis.__GPT_OBSIDIAN_BACKGROUND_TEST_HOOKS__ = {
    DOWNLOAD_WATCH_TIMEOUT_MS,
    MARKDOWN_DOWNLOAD_WATCH_TIMEOUT_MS,
    sanitizeExpectedDownloadNames,
    chooseMatchingDownload,
    downloadStartedInWatchWindow
  };
}
