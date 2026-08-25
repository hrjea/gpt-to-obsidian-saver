
// content.js (1.5.40) — HTML→Markdown conversion for Obsidian-friendly content
(function() {
  const VERSION = "1.5.40";
  const STATE_KEY = "__gptToObsidianSaverState";
  const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {});
  state.generation = (state.generation || 0) + 1;
  state.recentSaves = state.recentSaves || new Map();
  state.activeSaves = state.activeSaves || new Set();
  const generation = state.generation;
  const DEBUG = false;
  const ARTIFACT_DEBUG = true;
  const MAX_HTML_ATTACHMENT_CHARS = 700000;
  const MAX_GENERATED_MARKDOWN_CHARS = 2000000;
  const GENERATED_MARKDOWN_VIEWER_TIMEOUT_MS = 90000;
  const GENERATED_MARKDOWN_VIEWER_POLL_MS = 150;
  const GENERATED_MARKDOWN_AMBIGUITY_STABILITY_MS = 1200;
  const RUNTIME_POLL_INTERVAL_MS = 1000;
  const RUNTIME_PING_TIMEOUT_MS = 1500;
  const RUNTIME_PING_TYPE = "gpt2obs-runtime-ping";
  const DETAILED_MARKDOWN_HEADING = "장별 상세 한국어 요약";
  const DETAILED_MARKDOWN_MARKER = "%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%";
  const MARKDOWN_OPEN_PROMPT_DELAY_MS = 800;
  const MARKDOWN_DOWNLOAD_PROMPT_DELAY_MS = 12000;

  const SUPPORTED_LANGUAGES = ["en", "ko"];
  const DEFAULT_LANGUAGE = "en";
  const I18N = {
    en: {
      saveButton: "Save to Obsidian",
      savingButton: "Saving…",
      untitledQuestion: "Untitled question",
      summaryTitle: "Summary title",
      questionHeading: "Question",
      answerHeading: "Answer",
      attachmentsHeading: "Attachments",
      htmlLearningHeading: "HTML Learning Material",
      originalQuestionHeading: "Original Question",
      originalAnswerHeading: "Original Answer",
      nativeSaveFailedPrefix: "Native helper save failed: ",
      nativeSaveFailedSuffix: "\nThe extension attempted to open the Markdown note through URI mode, but could not verify that Obsidian created it. HTML attachments may not have been saved.",
      nativeSaveNoFallbackSuffix: "\nThe note was not sent through URI mode because the generated Markdown is too large for a reliable URI save.",
      htmlDownloadNotAttachedWarning: "HTML file was downloaded by Chrome, but the extension could not attach it to the Obsidian note.",
      htmlDownloadCopyFailedWarning: "HTML file was downloaded by Chrome, but could not be copied into the Obsidian vault.",
      htmlArtifactCaptureFailedWarning: "The HTML artifact could not be read or downloaded, so it was not attached to the Obsidian note.",
      generatedArtifactWarningPrefix: "Some generated files could not be captured safely:\n",
      markdownOpenActionRequired: "ChatGPT requires a real click to open the detailed Markdown artifact. Close this message, then click the highlighted .md filename card once. The extension will read the opened file and continue saving automatically.",
      markdownDownloadActionRequired: "ChatGPT requires a real click to download the detailed Markdown file. Close this message, then click the highlighted File download button once. The extension will use only that current .md download and continue saving automatically.",
      htmlDownloadActionRequired: "The extension could not read the HTML source directly. Close this message, then click the small File download button on the file card once. Do not click the HTML learning material preview button. The extension will wait up to 90 seconds and then save it to Obsidian.",
      htmlAttachmentSavedLine: "HTML file saved as attachment.",
      runtimeUnavailable: "extension runtime unavailable",
      runtimeDisconnectedRefresh: "The extension was reloaded or its connection to this ChatGPT tab was lost. Refresh this tab, then click Save to Obsidian again."
    },
    ko: {
      savingButton: "\uC800\uC7A5 \uC911…",
      saveButton: "Obsidian 저장",
      untitledQuestion: "제목 없는 질문",
      summaryTitle: "요약 제목",
      questionHeading: "질문",
      answerHeading: "답변",
      attachmentsHeading: "첨부파일",
      htmlLearningHeading: "HTML 학습자료",
      originalQuestionHeading: "원본 질문",
      originalAnswerHeading: "원본 답변",
      nativeSaveFailedPrefix: "Native helper 저장 실패: ",
      nativeSaveFailedSuffix: "\nMarkdown 노트를 URI mode로 열도록 시도했지만 Obsidian이 실제 파일을 생성했는지는 확인할 수 없습니다. HTML 첨부파일은 저장되지 않았을 수 있습니다.",
      nativeSaveNoFallbackSuffix: "\n생성된 Markdown이 URI로 안정적으로 저장하기에는 너무 커서 URI mode로 다시 보내지 않았습니다.",
      htmlDownloadNotAttachedWarning: "HTML 파일이 Chrome으로 다운로드되었지만, 확장 프로그램이 Obsidian 노트에 첨부하지 못했습니다.",
      htmlDownloadCopyFailedWarning: "HTML 파일이 Chrome으로 다운로드되었지만, Obsidian vault로 복사하지 못했습니다.",
      htmlArtifactCaptureFailedWarning: "HTML artifact 내용을 읽거나 다운로드하지 못해 Obsidian 노트에 첨부하지 못했습니다.",
      generatedArtifactWarningPrefix: "일부 생성 파일을 안전하게 읽지 못했습니다:\n",
      markdownOpenActionRequired: "ChatGPT가 상세 Markdown artifact를 여는 데 실제 클릭을 요구합니다. 이 창을 닫은 뒤 강조된 .md 파일명 카드를 한 번 눌러주세요. 확장 프로그램이 열린 파일을 읽고 자동으로 저장을 계속합니다.",
      markdownDownloadActionRequired: "ChatGPT가 상세 Markdown 파일 다운로드에 실제 클릭을 요구합니다. 이 창을 닫은 뒤 강조된 '파일 다운로드' 버튼을 한 번 눌러주세요. 확장 프로그램은 이번에 내려받은 .md 파일만 사용해 자동으로 저장을 계속합니다.",
      htmlDownloadActionRequired: "확장 프로그램이 HTML 원문을 직접 읽지 못했습니다. 이 창을 닫은 뒤 파일 카드 오른쪽의 작은 '파일 다운로드' 버튼을 한 번 눌러주세요. 'HTML 학습자료 다운로드' 미리보기 버튼이 아닙니다. 확장 프로그램은 최대 90초 동안 기다린 후 Obsidian에 저장합니다.",
      htmlAttachmentSavedLine: "HTML 파일은 첨부파일로 저장되었습니다.",
      runtimeUnavailable: "extension runtime을 사용할 수 없습니다",
      runtimeDisconnectedRefresh: "확장 프로그램이 다시 로드되어 이 ChatGPT 탭의 연결이 끊겼습니다. 탭을 새로고침한 뒤 Obsidian 저장을 다시 눌러주세요."
    }
  };

  let settings = { uiLanguage: DEFAULT_LANGUAGE, vaultName: "", folderPath: "ChatGPT", prefixDate: true, vaultPath: "", htmlSaveDir: "", saveHtmlCodeBlocks: false, usePreviousQaForHtml: false };
  const SYNC_KEYS = ["uiLanguage","vaultName","folderPath","prefixDate","includeTime","keepQM","bodyTitle","saveHtmlCodeBlocks","usePreviousQaForHtml"];
  const LEGACY_SYNC_KEYS = [...SYNC_KEYS, "htmlSaveDir"];
  const LOCAL_KEYS = ["vaultPath","htmlSaveDir","htmlSaveDirMigratedFromSync"];

  function debugLog(message, data = undefined) {
    if (!DEBUG) return;
    if (data === undefined) {
      console.debug("[GPT→Obsidian]", message);
    } else {
      console.debug("[GPT→Obsidian]", message, data);
    }
  }

  function artifactDebugLog(message, data = undefined) {
    if (!ARTIFACT_DEBUG) return;
    if (data === undefined) {
      console.debug("[GPT→Obsidian][artifact]", message);
    } else {
      console.debug("[GPT→Obsidian][artifact]", message, data);
    }
  }

  function logBuildDiagnostic() {
    console.info("[GPT->Obsidian] content diagnostic", {
      buildVersion: VERSION,
      saveHtmlCodeBlocksAsAttachments: !!settings.saveHtmlCodeBlocks,
      usePreviousQaForHtml: !!settings.usePreviousQaForHtml,
      contentScriptVersion: VERSION
    });
  }

  function normalizeLanguage(value) {
    return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
  }

  function t(key) {
    const language = normalizeLanguage(settings.uiLanguage);
    return I18N[language]?.[key] || I18N[DEFAULT_LANGUAGE][key] || key;
  }

  function updateInjectedButtonText() {
    document.querySelectorAll(".gpt2obs-btn").forEach((button) => {
      if (button.dataset.gpt2obsBusy !== "true") {
        button.textContent = t("saveButton");
      }
    });
  }

  function applySyncSettings(st) {
    settings.uiLanguage = normalizeLanguage(st.uiLanguage);
    settings.vaultName = st.vaultName || "";
    settings.folderPath = st.folderPath || "ChatGPT";
    settings.prefixDate = (st.prefixDate === undefined) ? true : st.prefixDate;
    settings.includeTime = !!st.includeTime;
    settings.keepQM = !!st.keepQM;
    settings.bodyTitle = (st.bodyTitle === undefined) ? (navigator.userAgent.includes("Windows")) : !!st.bodyTitle;
    settings.saveHtmlCodeBlocks = !!st.saveHtmlCodeBlocks;
    settings.usePreviousQaForHtml = !!st.usePreviousQaForHtml;
  }

  function applyLocalSettings(st) {
    settings.vaultPath = st.vaultPath || "";
    settings.htmlSaveDir = st.htmlSaveDir || "";
  }

  function migrateHtmlSaveDir(syncState, localState, callback) {
    const legacyHtmlSaveDir = syncState.htmlSaveDir || "";
    if (!localState.htmlSaveDir && legacyHtmlSaveDir && !localState.htmlSaveDirMigratedFromSync) {
      chrome.storage.local.set({
        htmlSaveDir: legacyHtmlSaveDir,
        htmlSaveDirMigratedFromSync: true
      }, () => {
        localState.htmlSaveDir = legacyHtmlSaveDir;
        localState.htmlSaveDirMigratedFromSync = true;
        callback();
      });
      return;
    }
    callback();
  }

  chrome.storage.sync.get(LEGACY_SYNC_KEYS, (syncState) => {
    chrome.storage.local.get(LOCAL_KEYS, (localState) => {
      migrateHtmlSaveDir(syncState, localState, () => {
        applySyncSettings(syncState);
        applyLocalSettings(localState);
        logBuildDiagnostic();
        updateInjectedButtonText();
      });
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      if (changes.uiLanguage) {
        settings.uiLanguage = normalizeLanguage(changes.uiLanguage.newValue);
        updateInjectedButtonText();
      }
      if (changes.vaultName) settings.vaultName = changes.vaultName.newValue;
      if (changes.folderPath) settings.folderPath = changes.folderPath.newValue;
      if (changes.prefixDate) settings.prefixDate = changes.prefixDate.newValue;
      if (changes.includeTime) settings.includeTime = changes.includeTime.newValue;
      if (changes.keepQM) settings.keepQM = changes.keepQM.newValue;
      if (changes.bodyTitle) settings.bodyTitle = changes.bodyTitle.newValue;
      if (changes.saveHtmlCodeBlocks) {
        settings.saveHtmlCodeBlocks = !!changes.saveHtmlCodeBlocks.newValue;
        logBuildDiagnostic();
      }
      if (changes.usePreviousQaForHtml) {
        settings.usePreviousQaForHtml = !!changes.usePreviousQaForHtml.newValue;
        logBuildDiagnostic();
      }
    }
    if (area === "local") {
      if (changes.vaultPath) settings.vaultPath = changes.vaultPath.newValue || "";
      if (changes.htmlSaveDir) settings.htmlSaveDir = changes.htmlSaveDir.newValue || "";
    }
  });

  function nowIso() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDate(d=new Date()) {
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g,' ').trim();
  }

  function makeTitle(text) {
    if (!text) return t("untitledQuestion");
    let titleText = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/\!\[[^\]]*\]\([^\)]*\)/g, " ")
      .replace(/\[[^\]]*\]\([^\)]*\)/g, " ")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const m = titleText.match(/^(.*?)([?.!！？。]|$)/);
    titleText = (m && m[1]) ? m[1] : titleText;
    const MAX = 40;
    if (titleText.length > MAX) titleText = titleText.slice(0, MAX).trim() + "…";
    titleText = titleText.trim(); // keep trailing punctuation like '?'
    return titleText || t("summaryTitle");
  }

  function yamlQuote(value) {
    return JSON.stringify(String(value || ""));
  }

  function buildMarkdown({title, questionText, answerText, url, attachmentMarker = ""}) {
    const created = nowIso();
    return [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(url)}`,
      `created: ${yamlQuote(created)}`,
      "tags: [chatgpt, capture]",
      "---",
      "",
      (settings && settings.bodyTitle ? `# ${title}` : ''),
      "",
      `# ${t("questionHeading")}`,
      "",
      questionText || "",
      "",
      `# ${t("answerHeading")}`,
      "",
      answerText || "",
      attachmentMarker
    ].join("\n");
  }

  function buildHtmlLearningMarkdown({title, questionText, answerText, url, attachmentMarker = "", useOriginalHeadings = true}) {
    const created = nowIso();
    const questionHeading = useOriginalHeadings ? t("originalQuestionHeading") : t("questionHeading");
    const answerHeading = useOriginalHeadings ? t("originalAnswerHeading") : t("answerHeading");
    const lines = [
      "---",
      `title: ${yamlQuote(title)}`,
      `source: ${yamlQuote(url)}`,
      `created: ${yamlQuote(created)}`,
      "tags: [chatgpt, capture]",
      "---",
      ""
    ];
    if (settings && settings.bodyTitle) {
      lines.push(`# ${title}`, "");
    }
    lines.push(
      `# ${t("htmlLearningHeading")}`,
      "",
      attachmentMarker || "",
      "",
      `# ${questionHeading}`,
      "",
      questionText || "",
      "",
      `# ${answerHeading}`,
      "",
      answerText || ""
    );
    return lines.join("\n");
  }

  function buildFilePath(title) {
    const date = formatDate();
    const time = new Date();
    const pad = (n)=>String(n).padStart(2,"0");
    const hhmmss = `${pad(time.getHours())}-${pad(time.getMinutes())}-${pad(time.getSeconds())}`;
    const datePrefix = settings.prefixDate ? (settings.includeTime ? `${date} ${hhmmss} - ` : `${date} - `) : "";
    const folder = (settings.folderPath || "ChatGPT").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    const fileBase = sanitizeFileName(`${datePrefix}${title}`);
    return (folder ? `${folder}/` : "") + fileBase + ".md";
  }

  function buildObsidianURI(args) {
    const vault = args.vault || "";
    const file = args.file;
    const content = args.content;
    const parts = [];
    if (vault) parts.push("vault=" + encodeURIComponent(vault));
    parts.push("file=" + encodeURIComponent(file));
    parts.push("content=" + encodeURIComponent(content));
    return "obsidian://new?" + parts.join("&");
  }

  function isCurrentGeneration() {
    return globalThis[STATE_KEY]?.generation === generation;
  }

  function isDuplicateContentSave(key, ttlMs = 30000) {
    const now = Date.now();
    const recent = state.recentSaves;
    for (const [savedKey, time] of recent.entries()) {
      if (now - time > ttlMs) recent.delete(savedKey);
    }
    const last = recent.get(key);
    if (last && now - last < ttlMs) return true;
    recent.set(key, now);
    return false;
  }

  function openObsidianURIDirectly(uri) {
    try {
      const a = document.createElement("a");
      a.href = uri;
      a.rel = "noreferrer";
      a.style.display = "none";
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
      return;
    } catch (error) {
      console.warn("Failed to open Obsidian URI directly.", error);
    }

    window.location.href = uri;
  }

  function openObsidianURI(uri) {
    if (globalThis.chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({ type: "open-obsidian-uri", uri }, (response) => {
          const err = globalThis.chrome?.runtime?.lastError;
          if (err || !response?.ok) {
            const message = err?.message || response?.error || "unknown";
            console.warn("Failed to open Obsidian through extension runtime; falling back to direct URI.", message);
            openObsidianURIDirectly(uri);
          }
        });
        return;
      } catch (error) {
        console.warn("Failed to message extension runtime; falling back to direct Obsidian URI.", error);
      }
    }

    openObsidianURIDirectly(uri);
  }

  async function saveObsidianNote({vaultName, vaultPath, filePath, content, attachments, downloadedAttachments, downloadedMarkdown, attachmentNames, htmlSaveDir, fallbackUri}, options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const sender = options.sendMessage || sendExtensionMessage;
    const openUri = options.openUri || openObsidianURIDirectly;
    const showAlert = options.showAlert || alert;

    const notifyRuntimeFailure = (result, phase = "native-save") => {
      if (runtimeGuard?.fail) {
        runtimeGuard.fail(result, phase);
        runtimeGuard.notify?.();
      } else {
        showAlert(t("runtimeDisconnectedRefresh"));
      }
    };

    const fallbackToUri = (message) => {
      let fallbackAttempted = false;
      if (fallbackUri) {
        fallbackAttempted = true;
        try { openUri(fallbackUri); } catch (error) { console.warn("Failed to attempt direct Obsidian URI fallback.", error); }
      }
      const hasDownloadedAttachment = Array.isArray(downloadedAttachments) && downloadedAttachments.length > 0;
      const prefix = hasDownloadedAttachment
        ? `${t("htmlDownloadCopyFailedWarning")}\n${t("nativeSaveFailedPrefix")}`
        : t("nativeSaveFailedPrefix");
      showAlert(prefix + message + (fallbackAttempted ? t("nativeSaveFailedSuffix") : t("nativeSaveNoFallbackSuffix")));
      return { ok: false, error: message, fallbackAttempted };
    };

    const runtimeStatus = runtimeGuard
      ? await checkRuntimeGuard(runtimeGuard, "native-save")
      : await pingExtensionRuntime("native-save", { sendMessage: sender });
    if (!runtimeStatus?.ok) {
      notifyRuntimeFailure(runtimeStatus, "native-save");
      return runtimeStatus;
    }

    const response = await awaitWithRuntimeGuard(
      sender({
        type: "save-obsidian-note",
        payload: { vaultName, vaultPath, filePath, content, attachments, downloadedAttachments, downloadedMarkdown, attachmentNames, htmlSaveDir, fallbackUri, htmlCodeBlockReplacementText: t("htmlAttachmentSavedLine") }
      }, { phase: "native-save" }),
      runtimeGuard,
      "native-save-wait"
    );

    if (!response?.ok) {
      const message = response?.error || "unknown";
      if (isExtensionRuntimeFailure(response)) {
        console.warn("Extension runtime became unavailable before native save.", message);
        notifyRuntimeFailure(response, "native-save");
        return response;
      }
      console.warn("Failed to save Obsidian note through native helper.", message);
      return fallbackToUri(message);
    }

    if (Array.isArray(response.warnings) && response.warnings.length) {
      showAlert(t("generatedArtifactWarningPrefix") + response.warnings.join("\n"));
    }
    return response;
  }

  function getUserSelection() {
    try {
      const sel = window.getSelection();
      if (!sel) return "";
      const text = String(sel).trim();
      return (text && text.length >= 5) ? text : "";
    } catch { return ""; }
  }

  function closestMessageContainer(el) {
    return el?.closest?.('[data-message-author-role]') ||
      el?.closest?.('article, li, [role="listitem"]') ||
      null;
  }

  function closestArtifactContainer(el) {
    if (!el) return null;

    // GPT 5.6 can render generated file cards as siblings of the narrow
    // data-message-author-role node. Keep answer conversion scoped to the
    // message, but inspect the complete conversation turn for artifacts.
    const turn = el.closest?.("[data-testid^='conversation-turn-']");
    if (turn) return turn;

    const message = closestMessageContainer(el);
    if (!message) return null;

    let node = message;
    for (let depth = 0; depth < 4 && node?.parentElement; depth++) {
      node = node.parentElement;
      if (node.querySelector?.("[class*='artifact-row'], [data-testid*='artifact' i], [data-testid*='file' i]")) {
        return node;
      }
    }
    return message;
  }

  function roleAttrForNode(el) {
    return String(el?.getAttribute?.("data-message-author-role") || "").toLowerCase();
  }

  function getMessageRole(node) {
    const roleAttr = roleAttrForNode(node);
    if (roleAttr.includes("user")) return "user";
    if (roleAttr.includes("assistant")) return "assistant";

    const txt = node?.textContent?.slice(0, 80) || "";
    if (/^(You|사용자)\b/i.test(txt.trim())) return "user";
    if (node?.matches?.("article") && txt.trim()) return "assistant";
    return "";
  }

  function dedupeMessageNodes(nodes) {
    const result = [];
    nodes.forEach(node => {
      if (!getMessageRole(node)) return;
      if (result.some(existing => existing === node || existing.contains?.(node))) return;
      for (let i = result.length - 1; i >= 0; i--) {
        if (node.contains?.(result[i])) result.splice(i, 1);
      }
      result.push(node);
    });
    return result;
  }

  function getAllMessageNodes() {
    const root = document.querySelector('main') || document.body;
    const roleNodes = dedupeMessageNodes(Array.from(root.querySelectorAll('[data-message-author-role]')));
    if (roleNodes.length) return roleNodes;
    return dedupeMessageNodes(Array.from(root.querySelectorAll('article, li, [role="listitem"]')));
  }

  function isUserNode(el) {
    if (getMessageRole(el) === "user") return true;
    const txt = el?.textContent?.slice(0, 50) || "";
    if (/^(You|사용자)\b/i.test(txt)) return true;
    return false;
  }

  function findMessageNodeIndex(nodes, target) {
    const exact = nodes.indexOf(target);
    if (exact >= 0) return exact;
    return nodes.findIndex(node => node === target || node.contains?.(target) || target?.contains?.(node));
  }

  function findPreviousMessageByRole(nodes, startIndex, role) {
    for (let i = startIndex - 1; i >= 0; i--) {
      if (getMessageRole(nodes[i]) === role) return { node: nodes[i], index: i };
    }
    return null;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function restorePromptLineBreaks(text) {
    let code = (text || "").replace(/\r\n?/g, "\n").replace(/\u00A0/g, " ");
    const hasPromptLabels = /\b(?:Role|Personality|Goal|Decision Rules|Output|Safety and Boundaries)(?=[A-Z가-힣-]|\s)/.test(code);
    if (!hasPromptLabels) return text;

    const labels = ["Role", "Personality", "Goal", "Decision Rules", "Output", "Safety and Boundaries"];
    labels.forEach(label => {
      const escaped = escapeRegExp(label);
      code = code
        .replace(new RegExp(`([^\\n])(${escaped})(?=[A-Z가-힣-])`, "g"), "$1\n$2")
        .replace(new RegExp(`(${escaped})(?=[A-Z가-힣])`, "g"), "$1\n");
    });

    return code
      .replace(/([^\n])(-\s+)/g, "$1\n$2")
      .replace(/([.!?。！？])(?=(?:Do not|User requests)\b)/g, "$1\n")
      .replace(/([.!?。！？])(?=(?:Personality|Goal|Decision Rules|Output|Safety and Boundaries)\b)/g, "$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function repairFencedCodeBlocks(md) {
    if (!md) return "";
    return md.replace(/(^|\n)(`{3,})([^\n`]*)\n([\s\S]*?)\n\2(?=\n|$)/g, (match, prefix, fence, lang, code) => {
      return `${prefix}${fence}${lang || ""}\n${restorePromptLineBreaks(code)}\n${fence}`;
    });
  }

  // ---------- HTML → Markdown (lightweight) ----------
  function htmlToMarkdown(html) {
    const el = document.createElement("div");
    el.innerHTML = html;

    function escapeMd(s) {
      return s.replace(/([*_`~])/g, "\\$1");
    }

    function isDecorativeImage(node) {
      const src = node.getAttribute?.("src") || "";
      return /(?:^|\/\/)www\.google\.com\/s2\/favicons\b|favicon/i.test(src);
    }

    function stripDecorativeMarkdownImages(text) {
      return String(text || "")
        .replace(/!\[[^\]]*\]\((?:https?:\/\/www\.google\.com\/s2\/favicons[^)]*|[^)]*favicon[^)]*)\)/gi, "")
        .trim();
    }

    function extractPreText(pre) {
      const root = pre.querySelector("code") || pre;
      const rendered = (root.innerText || "").replace(/\r\n?/g, "\n");
      if (rendered.includes("\n")) return rendered;

      function collect(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
        if (node.nodeType !== Node.ELEMENT_NODE) return "";

        const tag = node.tagName.toLowerCase();
        if (tag === "br") return "\n";

        const text = Array.from(node.childNodes).map(collect).join("");
        if (/^(div|p|li|section|article|tr)$/i.test(tag) && text.trim()) {
          return text.replace(/\n+$/g, "") + "\n";
        }
        return text;
      }

      return collect(root) || root.textContent || "";
    }

    function repairCollapsedPromptCode(text, aggressive = false) {
      const labels = [
        "목표", "중요", "중요 규칙", "접근 규칙", "출력 형식", "출력 방식", "HTML 구성", "반드시 지킬 점", "수정 방식",
        "검수 대상", "검수 기준", "찾을 대상", "대상 문서", "대상 장",
        "페이지 범위", "시작 문구", "끝 문구", "요청", "파일명",
        "프로젝트 지침", "매번 넣는 프롬프트", "처음 한 번", "매 장마다",
        "출처 페이지", "웹페이지 주소", "제공 텍스트", "안정성 우선", "편의성 우선", "파일 생성이 불가능한 환경이면",
        "Role", "Personality", "Goal", "Decision Rules", "Output", "Safety and Boundaries"
      ];

      let code = text;

      code = code
        .replace(/^(\[[^\]\n]{2,40}\])(?=\S)/, "$1\n")
        .replace(/([^\n])(\[[^\]\n]{2,40}\])/g, "$1\n$2")
        .replace(/([^\n])([─━]{6,})/g, "$1\n$2")
        .replace(/([─━]{6,})([^\n])/g, "$1\n$2");

      labels.forEach(label => {
        const escaped = escapeRegExp(label);
        code = code
          .replace(new RegExp(`([^\\n])(${escaped}\\s*[:=])`, "g"), "$1\n$2")
          .replace(new RegExp(`(${escaped}\\s*[:=])(?=\\S)`, "g"), "$1\n");
      });

      code = code
        .replace(/([^\n])(파일명은\s+)/g, "$1\n$2")
        .replace(/파일명\n은/g, "파일명은")
        .replace(/([^\n\s])(\d+\.\s+)/g, "$1\n$2")
        .replace(/([^\n])(-\s+)/g, "$1\n$2");

      if (aggressive) {
        code = code.replace(/([.!?。！？])(?=[가-힣A-Z\[])/g, "$1\n");
      }

      return code.replace(/\n{3,}/g, "\n\n").trim();
    }

    function formatCapturedCodeBlock(text) {
      let code = (text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/\n$/, "");

      const meaningfulLines = code.split("\n").filter(l => l.trim()).length;
      const looksLikeKoreanPrompt = /[가-힣]/.test(code);
      const looksLikeRealCode = /^\s*(?:<!doctype|<html\b|<\?xml|function\b|const\b|let\b|var\b|class\b|import\b|export\b)/i.test(code);

      if (!looksLikeKoreanPrompt || looksLikeRealCode) {
        return code;
      }

      return repairCollapsedPromptCode(code, meaningfulLines <= 1 && code.length >= 40);
    }

    function codeFenceFor(code) {
      const longest = (code.match(/`+/g) || []).reduce((max, ticks) => Math.max(max, ticks.length), 0);
      return "`".repeat(Math.max(3, longest + 1));
    }

    function cellText(cell) {
      return Array.from(cell.childNodes)
        .map(n => walk(n, {listDepth:0, olIndex:1}))
        .join("")
        .replace(/\s+/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
    }

    function tableToMarkdown(table) {
      const rows = Array.from(table.querySelectorAll("tr")).map(tr => {
        return Array.from(tr.children)
          .filter(cell => /^(th|td)$/i.test(cell.tagName || ""))
          .map(cellText);
      }).filter(row => row.length);

      if (!rows.length) return "";

      const width = Math.max(...rows.map(row => row.length));
      const normalized = rows.map(row => {
        const copy = row.slice();
        while (copy.length < width) copy.push("");
        return copy;
      });
      const hasHeader = table.querySelector("th") || normalized.length > 1;
      const header = hasHeader ? normalized[0] : normalized[0].map((_, i) => `Column ${i + 1}`);
      const body = hasHeader ? normalized.slice(1) : normalized;
      const lines = [
        `| ${header.join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
        ...body.map(row => `| ${row.join(" | ")} |`)
      ];

      return `\n${lines.join("\n")}\n`;
    }

    function walk(node, ctx = {listDepth:0, olIndex:1}) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue.replace(/\u00A0/g, ' ');
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }
      if (node.matches?.(".katex-display")) {
        const tex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "";
        if (tex.trim()) return `\n$$\n${tex.trim()}\n$$\n`;
      }
      if (node.matches?.(".katex") && !node.parentElement?.closest?.(".katex-display")) {
        const tex = node.querySelector?.('annotation[encoding="application/x-tex"]')?.textContent || "";
        if (tex.trim()) return `$${tex.trim()}$`;
      }
      const tag = node.tagName.toLowerCase();
      const child = () => Array.from(node.childNodes).map(n => walk(n, ctx)).join("");

      switch (tag) {
        case "br": return "\n";
        case "hr": return "\n---\n";
        case "strong":
        case "b": return `**${child()}**`;
        case "em":
        case "i": return `*${child()}*`;
        case "code":
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === "pre") return child();
          return "`" + child().replace(/\n+/g, ' ') + "`";
        case "pre": {
          const code = formatCapturedCodeBlock(extractPreText(node).replace(/\n$/, ""));
          const fence = codeFenceFor(code);
          return "\n" + fence + "\n" + code + "\n" + fence + "\n";
        }
        case "table":
          return tableToMarkdown(node);
        case "thead":
        case "tbody":
        case "tfoot":
        case "tr":
        case "th":
        case "td":
          return child();
        case "a": {
          const href = node.getAttribute("href") || "";
          const text = stripDecorativeMarkdownImages(child()) || href;
          return `[${text}](${href})`;
        }
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const level = parseInt(tag[1], 10);
          return `\n${"#".repeat(level)} ${child()}\n`;
        }
        case "p":
        case "div": {
          let inner = child();
          // treat empty divs as line breaks
          if (!inner.trim()) return "\n";
          return `\n${inner}\n`;
        }
        case "ul": {
          const items = Array.from(node.children).filter(n => n.tagName && n.tagName.toLowerCase() === "li")
            .map(li => {
              const saved = { ...ctx };
              ctx.listDepth++;
              const text = walk(li, ctx).trim().replace(/\n/g, "\n  ");
              ctx.listDepth = saved.listDepth;
              return `- ${text}`;
            }).join("\n");
          return `\n${items}\n`;
        }
        case "ol": {
          let i = 1;
          const items = Array.from(node.children).filter(n => n.tagName && n.tagName.toLowerCase() === "li")
            .map(li => {
              const saved = { ...ctx };
              ctx.listDepth++;
              const text = walk(li, ctx).trim().replace(/\n/g, "\n   ");
              ctx.listDepth = saved.listDepth;
              return `${i++}. ${text}`;
            }).join("\n");
          return `\n${items}\n`;
        }
        case "li": {
          return child();
        }
        case "blockquote": {
          const inner = child().split(/\r?\n/).map(l => l ? `> ${l}` : ">").join("\n");
          return `\n${inner}\n`;
        }
        case "img": {
          const alt = node.getAttribute("alt") || "";
          const src = node.getAttribute("src") || "";
          if (isDecorativeImage(node)) return "";
          return `![${alt}](${src})`;
        }
      }
      return child();
    }

    const result = walk(el).replace(/\n{3,}/g, "\n\n").trim();
    return result;
  }

  function shouldRemoveButton(button) {
    const text = (button.innerText || button.textContent || "").trim();
    const aria = button.getAttribute("aria-label") || "";
    const testid = button.getAttribute("data-testid") || "";
    const title = button.getAttribute("title") || "";
    const marker = `${text} ${aria} ${testid} ${title}`;

    if (button.classList?.contains("gpt2obs-btn") || text === "Obsidian 저장" || text === "Save to Obsidian") return true;
    if (/citation|source|출처|인용|근거/i.test(marker)) return false;
    if (!text) return true;

    return /copy|복사|read aloud|소리내어|good response|bad response|regenerate|share|edit|more|더보기|menu|메뉴/i.test(marker);
  }

  function removeNonAnswerChrome(root) {
    if (!root) return;
    try {
      root.querySelectorAll("button").forEach(button => {
        if (shouldRemoveButton(button)) button.remove();
      });
      root.querySelectorAll("nav, menu, style, svg, path").forEach(n => n.remove());
    } catch {}
  }

  function removePreviousQaMarkdownChrome(root) {
    removeNonAnswerChrome(root);
    try {
      root.querySelectorAll([
        ".gpt2obs-btn",
        "button",
        "menu",
        "nav",
        "[role='toolbar']",
        "[data-testid*='copy' i]",
        "[data-testid*='menu' i]",
        "[data-testid*='citation' i]",
        "[data-testid*='toolbar' i]",
        "[aria-label*='copy' i]",
        "[aria-label*='menu' i]",
        "[aria-label*='citation' i]",
        "[aria-label*='source' i]",
        "[aria-label*='출처' i]"
      ].join(",")).forEach(n => n.remove());
    } catch {}
  }

  function stripChatGptFooterLines(md) {
    if (!md) return "";
    const lines = md.split(/\r?\n/);
    let i = lines.length - 1;
    while (i >= 0 && !lines[i].trim()) i--;

    const statsLine = /^\d[\d,]*\s+chars\s*•\s*\d[\d,]*\s+words$/i;
    const timeLine = /^(?:Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}[.-]\d{1,2}[.-]\d{1,2})\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*•?$/;
    const combinedLine = /(?:Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|[A-Z][a-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}[.-]\d{1,2}[.-]\d{1,2})\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\s*•\s*\d[\d,]*\s+chars\s*•\s*\d[\d,]*\s+words$/i;

    if (i >= 0 && combinedLine.test(lines[i].trim())) {
      lines.splice(i, 1);
      return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }

    if (i >= 0 && statsLine.test(lines[i].trim())) {
      lines.splice(i, 1);
      i--;
      while (i >= 0 && !lines[i].trim()) {
        lines.splice(i, 1);
        i--;
      }
      if (i >= 0 && timeLine.test(lines[i].trim())) {
        lines.splice(i, 1);
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function extractAssistantMessageHTML(btn) {
    const container = closestMessageContainer(btn);
    if (!container) return "";
    const clone = container.cloneNode(true);
    removeNonAnswerChrome(clone);
    return clone.innerHTML;
  }

  function messageNodeToPlainText(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    removePreviousQaMarkdownChrome(clone);
    const markdown = htmlToMarkdown(clone.innerHTML || "");
    if (markdown && markdown.length >= 3) return markdown.trim();
    return (clone.innerText || clone.textContent || "").trim();
  }

  function assistantNodeToMarkdown(node) {
    if (!node) return "";
    const clone = node.cloneNode(true);
    removePreviousQaMarkdownChrome(clone);
    const md = htmlToMarkdown(clone.innerHTML || "");
    return stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(md || "")));
  }

  function findPreviousQaPair(currentAssistantNode, nodes = getAllMessageNodes(), options = {}) {
    const currentIndex = findMessageNodeIndex(nodes, currentAssistantNode);
    if (currentIndex < 0 || getMessageRole(nodes[currentIndex]) !== "assistant") return null;

    const request = findPreviousMessageByRole(nodes, currentIndex, "user");
    if (!request) return null;
    const answer = findPreviousMessageByRole(nodes, request.index, "assistant");
    if (!answer) return null;
    const question = findPreviousMessageByRole(nodes, answer.index, "user");
    if (!question) return null;

    const extractQuestion = options.extractQuestion || ((node) => cleanQuestionText(messageNodeToPlainText(node)));
    const extractAnswer = options.extractAnswer || assistantNodeToMarkdown;
    const questionText = cleanQuestionText(extractQuestion(question.node) || "");
    const answerText = stripChatGptFooterLines(cleanAnswerText(repairFencedCodeBlocks(extractAnswer(answer.node) || "")));

    if (!questionText || !answerText) return null;

    return {
      questionNode: question.node,
      answerNode: answer.node,
      requestNode: request.node,
      questionText,
      answerText
    };
  }

  function htmlOrClipboardToMarkdown(btn, clipboardText, preferClipboard = false) {
    const html = extractAssistantMessageHTML(btn);
    if (html) {
      const md = htmlToMarkdown(html);
      if (md && md.length > 10) return md;
    }
    return clipboardText || "";
  }

  function decodePercentEncodedRuns(text) {
    return String(text || "").replace(/(?:%[0-9a-f]{2}){2,}/gi, (encoded) => {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    });
  }

  function filenameFromArtifactText(text, extensions = ["html", "htm"]) {
    const decoded = decodePercentEncodedRuns(text);
    const extensionPattern = extensions.map(escapeRegExp).join("|");
    const m = decoded.match(new RegExp(`([A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af][A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af._ ()-]{0,220}\\.(?:${extensionPattern}))(?=$|[\\s?#'\"<>])`, "i"));
    return m ? m[1].trim() : "";
  }

  function filenamesFromArtifactText(text, extensions = ["html", "htm"]) {
    const names = new Set();
    const extensionPattern = extensions.map(escapeRegExp).join("|");
    const matches = decodePercentEncodedRuns(text).matchAll(new RegExp(`([A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af][A-Za-z0-9\\u1100-\\u11ff\\u3130-\\u318f\\uac00-\\ud7af._ ()-]{0,220}\\.(?:${extensionPattern}))(?=$|[\\s?#'\"<>])`, "gi"));
    for (const match of matches) {
      names.add(safeArtifactName(match[1].trim(), extensions));
    }
    return Array.from(names);
  }

  function filenameFromText(text) {
    return filenameFromArtifactText(text, ["html", "htm"]);
  }

  function filenamesFromText(text) {
    return filenamesFromArtifactText(text, ["html", "htm"]);
  }

  function filenameFromUrl(href) {
    try {
      const url = new URL(href, location.href);
      const path = decodeURIComponent(url.pathname.split("/").pop() || "");
      return filenameFromText(path);
    } catch {
      return filenameFromText(href);
    }
  }

  function safeDownloadName(name) {
    return sanitizeFileName(name || "chatgpt-download.html").replace(/\s+/g, "_") || "chatgpt-download.html";
  }

  function safeArtifactName(name, extensions = ["html", "htm"]) {
    const fallback = extensions.includes("md") ? "chatgpt-generated.md" : "chatgpt-download.html";
    return sanitizeFileName(name || fallback).replace(/\s+/g, "_") || fallback;
  }

  function findNearbyFilename(el) {
    const attrs = [
      el.getAttribute?.("download"),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.textContent
    ];
    for (const attr of attrs) {
      const found = filenameFromText(attr);
      if (found) return found;
    }

    let n = el;
    for (let i = 0; i < 5 && n; i++) {
      const found = filenameFromText(n.innerText || n.textContent || "");
      if (found) return found;
      n = n.parentElement;
    }
    return "";
  }

  function findDownloadHref(el) {
    const direct = el.href || el.getAttribute?.("href");
    if (direct) return new URL(direct, location.href).href;

    const ownAnchor = el.matches?.("a[href]") ? el : el.querySelector?.("a[href]");
    if (ownAnchor?.href) return ownAnchor.href;

    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      const anchor = n.matches?.("a[href]") ? n : n.querySelector?.("a[href]");
      if (anchor?.href) return anchor.href;
      n = n.parentElement;
    }
    return "";
  }

  function isAssociatedArtifactHref(node, href) {
    if (!href) return false;
    if (/^(?:blob:|data:|sandbox:)/i.test(href)) return true;
    if (hasDownloadAttribute(node) || isKnownChatGptFileHref(href)) return true;
    if (node?.matches?.("a[href]")) {
      const ownName = filenameFromArtifactText(artifactNodeTextValues(node).join(" "), ["html", "htm", "md"]);
      const hrefName = filenameFromArtifactText(decodePercentEncodedRuns(href), ["html", "htm", "md"]);
      return !!ownName && !!hrefName && safeArtifactName(ownName, ["html", "htm", "md"]) === safeArtifactName(hrefName, ["html", "htm", "md"]);
    }
    return false;
  }

  function hasDownloadAttribute(el) {
    return !!(el?.hasAttribute?.("download") || el?.querySelector?.("[download]"));
  }

  function isBlobOrSandboxHref(href) {
    return /^(blob:|sandbox:)/i.test(String(href || ""));
  }

  function hrefScheme(href) {
    const value = String(href || "");
    if (!value) return "empty";
    const match = value.match(/^([a-z][a-z0-9+.-]*):/i);
    return match ? match[1].toLowerCase() : "relative";
  }

  function isFetchableDownloadHref(href) {
    if (!href) return false;
    const scheme = hrefScheme(href);
    if (scheme === "blob" || scheme === "data") return true;
    if (scheme !== "http" && scheme !== "https" && scheme !== "relative") return false;
    try {
      return new URL(href, location.href).origin === location.origin;
    } catch {
      return false;
    }
  }

  function isKnownChatGptFileHref(href) {
    try {
      const url = new URL(href, location.href);
      if (/(?:^|\.)oaiusercontent\.com$/i.test(url.hostname)) return true;
      return url.origin === location.origin && /\/(?:backend-api\/)?files?\/|\/download\//i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isPlainExternalAnchor(node, href) {
    if (!node?.matches?.("a[href]")) return false;
    if (hasDownloadAttribute(node) || isBlobOrSandboxHref(href)) return false;
    if (isKnownChatGptFileHref(href)) return false;
    try {
      const url = new URL(href, location.href);
      return /^https?:$/i.test(url.protocol) && url.origin !== location.origin;
    } catch {
      return false;
    }
  }

  function hasNearbyArtifactViewer(node) {
    const messageRoot = closestArtifactContainer(node) ||
      node?.closest?.('[data-message-author-role="assistant"]') ||
      node?.closest?.("article") ||
      null;
    if (!messageRoot?.querySelectorAll) return false;

    const buttons = Array.from(messageRoot.querySelectorAll("button"));
    const hasCodeToggle = buttons.some(button => /^(?:code|coding|코드|코딩)$/i.test(controlLabel(button)));
    const hasPreviewToggle = buttons.some(isArtifactPreviewToggle);
    const hasViewer = !!messageRoot.querySelector?.("iframe, .cm-editor, pre.cm-content, [data-testid*='artifact' i]");
    return hasCodeToggle && hasPreviewToggle && hasViewer;
  }

  function isLikelyInteractiveHtmlFileCard(node, href = "") {
    if (!node || node.classList?.contains("gpt2obs-btn")) return false;

    const rawOwnText = [
      node.getAttribute?.("download") || "",
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.getAttribute?.("data-testid") || "",
      node.getAttribute?.("data-file-name") || "",
      node.getAttribute?.("data-filename") || "",
      node.innerText || node.textContent || ""
    ].join(" ");
    const decodedOwnText = decodePercentEncodedRuns(rawOwnText);
    const ownFilename = filenameFromText(decodedOwnText) || filenameFromUrl(href);
    if (!ownFilename || !/\.html?$/i.test(ownFilename)) return false;

    const tagName = String(node.tagName || "").toLowerCase();
    const role = String(node.getAttribute?.("role") || "").toLowerCase();
    const isButtonLike = tagName === "button" || role === "button";
    const isAnchor = tagName === "a" || node.matches?.("a[href]");
    const explicitFileMarker = /download|다운로드|artifact|attachment|첨부|(?:^|[\s_-])file(?:[\s_-]|$)|파일/i.test(decodedOwnText);
    const artifactStats = /\d[\d,]*\s*(?:chars?|characters?|문자)\s*[•·]\s*\d[\d,]*\s*(?:words?|단어)/i.test(decodedOwnText);
    const encodedFilename = /(?:%[0-9a-f]{2}){2,}[^\s]*\.html?/i.test(rawOwnText);
    const fileHref = /^(?:blob:|sandbox:|data:)/i.test(href) || isKnownChatGptFileHref(href) || /\/(?:backend-api\/)?files?\/|\/download\//i.test(href);
    const artifactViewerContext = isButtonLike && hasNearbyArtifactViewer(node);

    if (isButtonLike) {
      return explicitFileMarker || artifactStats || encodedFilename || fileHref || artifactViewerContext;
    }
    if (isAnchor && !isPlainExternalAnchor(node, href)) {
      return explicitFileMarker || artifactStats || encodedFilename || fileHref || hasDownloadAttribute(node);
    }
    return explicitFileMarker && (artifactStats || encodedFilename || fileHref);
  }

  function canClickDownloadCandidate(candidate) {
    const node = candidate?.node;
    if (!node) return false;
    if (hasDownloadAttribute(node) || isBlobOrSandboxHref(candidate.href)) return true;
    if (isLikelyInteractiveHtmlFileCard(node, candidate.href)) return true;
    if (isPlainExternalAnchor(node, candidate.href)) return false;
    return !node.matches?.("a[href]");
  }

  function downloadControlLabels(node) {
    if (!node) return [];
    return [
      node.getAttribute?.("aria-label") || "",
      node.getAttribute?.("title") || "",
      node.innerText || node.textContent || ""
    ]
      .map(value => decodePercentEncodedRuns(value).replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function isExactDownloadControl(node) {
    const labels = downloadControlLabels(node);
    if (labels.some(label => /^(?:download|download file|file download|다운로드|파일 다운로드)$/i.test(label))) {
      return true;
    }

    const testId = String(node?.getAttribute?.("data-testid") || "").trim();
    return /^(?:download|download-button|file-download|file-download-button|download-file|download-file-button)$/i.test(testId);
  }

  function artifactNodeTextValues(node) {
    return [
      node?.getAttribute?.("download") || "",
      node?.getAttribute?.("aria-label") || "",
      node?.getAttribute?.("title") || "",
      node?.getAttribute?.("data-file-name") || "",
      node?.getAttribute?.("data-filename") || "",
      node?.innerText || node?.textContent || ""
    ].map(value => decodePercentEncodedRuns(String(value || "")));
  }

  function elementVisibilityDetails(node) {
    if (!node) {
      return {
        connected: false,
        rectKnown: false,
        rectVisible: false,
        display: "",
        visibility: "",
        visible: false
      };
    }

    const connected = node.isConnected !== false;
    let display = "";
    let visibility = "";
    try {
      const view = node.ownerDocument?.defaultView || globalThis.window;
      const computed = view?.getComputedStyle?.(node);
      display = String(computed?.display || node.style?.display || "").toLowerCase();
      visibility = String(computed?.visibility || node.style?.visibility || "").toLowerCase();
    } catch {
      display = String(node.style?.display || "").toLowerCase();
      visibility = String(node.style?.visibility || "").toLowerCase();
    }

    let rectKnown = false;
    let rectVisible = true;
    try {
      if (typeof node.getBoundingClientRect === "function") {
        rectKnown = true;
        const rect = node.getBoundingClientRect();
        rectVisible = !!rect && Number(rect.width) > 0 && Number(rect.height) > 0;
      }
    } catch {
      rectKnown = false;
      rectVisible = true;
    }

    const styleVisible = display !== "none" && visibility !== "hidden" && visibility !== "collapse";
    return {
      connected,
      rectKnown,
      rectVisible,
      display,
      visibility,
      visible: connected && styleVisible && rectVisible
    };
  }

  function artifactRowPreferenceScore(item) {
    if (!item) return -1;
    const rowState = elementVisibilityDetails(item.row);
    const openState = elementVisibilityDetails(item.openButton);
    const downloadState = elementVisibilityDetails(item.downloadButton);
    let score = 0;
    if (rowState.visible) score += 100;
    if (rowState.connected) score += 20;
    if (openState.visible) score += 8;
    if (downloadState.visible) score += 6;
    if (item.href) score += 2;
    return score;
  }

  function choosePreferredArtifactRow(rows) {
    const list = Array.from(rows || []);
    if (!list.length) return null;
    return list
      .map((row, index) => ({ row, index, score: artifactRowPreferenceScore(row) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0].row;
  }

  function artifactControlDebugSummary(node) {
    if (!node) return null;
    const href = findDownloadHref(node);
    return {
      tag: String(node.tagName || "").toUpperCase(),
      ariaLabel: String(node.getAttribute?.("aria-label") || "").slice(0, 240),
      title: String(node.getAttribute?.("title") || "").slice(0, 240),
      testId: String(node.getAttribute?.("data-testid") || "").slice(0, 160),
      hrefScheme: hrefScheme(href),
      exactDownload: isExactDownloadControl(node),
      hasDownloadAttribute: hasDownloadAttribute(node),
      visibility: elementVisibilityDetails(node)
    };
  }

  function artifactRowDebugSummary(item) {
    const rowNode = item?.row || null;
    const turn = rowNode?.closest?.("[data-testid^='conversation-turn-']") || null;
    const controls = Array.from(rowNode?.querySelectorAll?.("button, a[href], [role='button']") || []);
    return {
      name: item?.name || "",
      rowClass: String(rowNode?.className || rowNode?.getAttribute?.("class") || "").slice(0, 300),
      turnTestId: String(turn?.getAttribute?.("data-testid") || "").slice(0, 160),
      visibility: elementVisibilityDetails(rowNode),
      controls: controls.slice(0, 20).map(artifactControlDebugSummary),
      selectedOpen: artifactControlDebugSummary(item?.openButton),
      selectedDownload: artifactControlDebugSummary(item?.downloadButton)
    };
  }

  function logArtifactRowResolution(phase, canonicalName, rows, selected) {
    artifactDebugLog("Markdown artifact row resolution", {
      phase,
      canonicalName,
      matchingRowCount: rows.length,
      selectedVisible: !!selected && elementVisibilityDetails(selected.row).visible,
      selectedConnected: !!selected && elementVisibilityDetails(selected.row).connected,
      rows: rows.map(artifactRowDebugSummary)
    });
  }

  function resolveArtifactFileRow(container, name, extensions = ["html", "htm"], options = {}) {
    const canonicalName = safeArtifactName(name, extensions);
    const collector = options.collectRows || collectArtifactFileRows;
    const rows = Array.from(collector(container, extensions) || []);
    const matches = rows.filter(item => safeArtifactName(item?.name, extensions) === canonicalName);
    const selected = choosePreferredArtifactRow(matches);
    if (options.debugPhase) logArtifactRowResolution(options.debugPhase, canonicalName, matches, selected);
    return selected;
  }

  function filenameFromArtifactNode(node, extensions) {
    for (const value of artifactNodeTextValues(node)) {
      const name = filenameFromArtifactText(value, extensions);
      if (name) return safeArtifactName(name, extensions);
    }
    return "";
  }

  function findArtifactFileRow(node, container, extensions) {
    let current = node;
    for (let depth = 0; depth < 7 && current; depth++, current = current.parentElement) {
      if (current === container) break;
      const controls = Array.from(current.querySelectorAll?.("button, a[href], [role='button']") || []);
      if (node && !controls.includes(node)) controls.unshift(node);
      const names = new Set(controls.map(control => filenameFromArtifactNode(control, extensions)).filter(Boolean));
      const className = String(current.className || current.getAttribute?.("class") || "");
      const rowMarker = /(?:^|[\s/:-])(?:artifact|file)(?:[\s/:-]|$)/i.test(className) || /artifact-row/i.test(className);
      const hasDownloadControl = controls.some(control => isExactDownloadControl(control) || hasDownloadAttribute(control));
      const hasFileHref = controls.some(control => isKnownChatGptFileHref(findDownloadHref(control)));
      if (names.size === 1 && (hasDownloadControl || hasFileHref || rowMarker)) {
        return current;
      }
    }

    const ownName = filenameFromArtifactNode(node, extensions);
    const ownHref = findDownloadHref(node);
    if (ownName && (hasDownloadAttribute(node) || isKnownChatGptFileHref(ownHref))) return node;
    return null;
  }

  function collectArtifactFileRows(container, extensions = ["html", "htm"]) {
    if (!container?.querySelectorAll) return [];
    const nodes = Array.from(container.querySelectorAll([
      "button",
      "a[href]",
      "a[download]",
      "[role='button']",
      "[data-file-name]",
      "[data-filename]"
    ].join(",")));
    const rows = [];

    for (const node of nodes) {
      const ownName = filenameFromArtifactNode(node, extensions);
      if (!ownName) continue;
      const detectedRow = findArtifactFileRow(node, container, extensions);
      if (!detectedRow) continue;
      const nearestArtifactRow = node.closest?.("[class*='artifact-row']") || detectedRow;
      const row = nearestArtifactRow || detectedRow;
      const controls = Array.from(row.querySelectorAll?.("button, a[href], [role='button']") || []);
      if (!controls.includes(node)) controls.unshift(node);
      const names = Array.from(new Set(controls.map(control => filenameFromArtifactNode(control, extensions)).filter(Boolean)));
      const name = names.length === 1 ? names[0] : ownName;
      const openButton = controls.find(control => filenameFromArtifactNode(control, extensions) === name && !isExactDownloadControl(control)) || node;
      const downloadButton = controls.find(isExactDownloadControl) || controls.find(hasDownloadAttribute) || null;
      const hrefEntry = [downloadButton, openButton, ...controls]
        .filter(Boolean)
        .map(control => ({ control, href: findDownloadHref(control) }))
        .find(item => item.href && (
          hasDownloadAttribute(item.control) ||
          /^(?:blob:|data:|sandbox:)/i.test(item.href) ||
          isKnownChatGptFileHref(item.href)
        ));
      const href = hrefEntry?.href || "";
      if (rows.some(item => item.row === row && item.name === name)) continue;
      rows.push({ name, row, openButton, downloadButton, href });
    }
    return rows;
  }

  function isCollapsedArtifactListControl(button) {
    const label = controlLabel(button).replace(/\s+/g, " ").trim();
    return /^\d+\s*개\s*더\s*보기$/i.test(label) || /^(?:show\s+)?\d+\s+more$/i.test(label);
  }

  async function revealCollapsedGeneratedArtifacts(container) {
    if (!container?.querySelectorAll) return 0;
    let clicked = 0;
    for (let pass = 0; pass < 4; pass++) {
      const controls = Array.from(container.querySelectorAll("button")).filter(isCollapsedArtifactListControl);
      if (!controls.length) break;
      controls.forEach(control => {
        try {
          control.click();
          clicked++;
        } catch {}
      });
      await sleep(150);
    }
    return clicked;
  }

  function markdownArtifactNameScore(name) {
    const value = decodePercentEncodedRuns(name).toLowerCase();
    let score = 0;
    if (/상세/.test(value)) score += 8;
    if (/요약/.test(value)) score += 7;
    if (/detailed/.test(value)) score += 8;
    if (/summary/.test(value)) score += 7;
    if (/study[-_ ]?guide/.test(value)) score += 6;
    return score;
  }

  function selectGeneratedMarkdownArtifact(rows) {
    const byName = new Map();
    Array.from(rows || []).forEach(row => {
      const name = safeArtifactName(row?.name, ["md"]);
      if (!name) return;
      const group = byName.get(name) || [];
      if (!group.some(item => item.row === row.row)) group.push({ ...row, name });
      byName.set(name, group);
    });

    const uniqueNames = Array.from(byName.entries()).map(([name, group]) => {
      const preferred = choosePreferredArtifactRow(group);
      return preferred ? { ...preferred, name } : null;
    }).filter(Boolean);
    if (uniqueNames.length === 0) return { row: null, warning: "" };
    if (uniqueNames.length === 1) return { row: uniqueNames[0], warning: "" };

    const ranked = uniqueNames.map(row => ({ row, score: markdownArtifactNameScore(row.name) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0].score > 0 && ranked[0].score > ranked[1].score) {
      return { row: ranked[0].row, warning: "" };
    }
    return {
      row: null,
      warning: `Markdown artifact mapping is ambiguous: ${uniqueNames.map(item => item.name).join(", ")}`
    };
  }

  async function readTextArtifactHref(href, maxChars) {
    if (!href || !isFetchableDownloadHref(href)) {
      throw new Error(`artifact href is not page-fetchable: ${hrefScheme(href)}`);
    }
    const response = await fetch(href, { credentials: "include" });
    if (!response.ok) throw new Error(`artifact fetch failed: ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error("artifact file is empty");
    if (text.length > maxChars) throw new Error(`artifact exceeds ${maxChars} characters`);
    return text.replace(/\r\n?/g, "\n");
  }

  function generatedMarkdownRegionRoot(node) {
    if (!node) return null;
    const canonicalSelector = "[data-testid='screen-threadFlyOut']";
    const flyoutSelector = `${canonicalSelector}, [data-testid*='flyout' i]`;

    // ChatGPT currently nests the real screen-threadFlyOut inside a broader
    // stage-thread-flyout wrapper. Always collapse both DOM views to the
    // inner screen so one visible viewer cannot become two mapping regions.
    if (node.matches?.(canonicalSelector)) return node;
    const closestCanonical = node.closest?.(canonicalSelector);
    if (closestCanonical) return closestCanonical;

    const nestedCanonical = Array.from(node.querySelectorAll?.(canonicalSelector) || []);
    const visibleNested = nestedCanonical.filter(candidate => elementVisibilityDetails(candidate).visible);
    if (visibleNested.length === 1) return visibleNested[0];
    if (nestedCanonical.length === 1) return nestedCanonical[0];

    if (node.matches?.(flyoutSelector)) return node;
    return node.closest?.(flyoutSelector) || node;
  }

  function collectGeneratedMarkdownRegions(options = {}) {
    const rawRegions = options.nodes || Array.from(document.querySelectorAll?.([
      "[role='region'][aria-label]",
      "[data-testid='screen-threadFlyOut']",
      "[data-testid*='flyout' i]"
    ].join(",")) || []);
    const regions = [];
    const seen = new Set();
    for (const rawRegion of rawRegions) {
      const region = generatedMarkdownRegionRoot(rawRegion);
      if (!region || seen.has(region)) continue;
      seen.add(region);
      if (options.includeHidden !== true && !elementVisibilityDetails(region).visible) continue;
      regions.push(region);
    }
    return regions;
  }

  function captureGeneratedMarkdownRegionSnapshot(options = {}) {
    return new Set(collectGeneratedMarkdownRegions(options));
  }

  function generatedMarkdownRegionHasName(region, name) {
    const safeName = safeArtifactName(name, ["md"]);
    const labels = artifactNodeTextValues(region).join(" ");
    return safeArtifactName(filenameFromArtifactText(labels, ["md"]), ["md"]) === safeName;
  }

  function markdownCandidatesFromGeneratedRegion(region) {
    if (!region?.querySelectorAll) return [];
    const selectors = [
      ".ProseMirror.markdown",
      ".markdown.prose",
      "[class~='markdown'][class~='prose']",
      "[data-testid*='artifact' i] .markdown",
      ".ProseMirror"
    ];
    const nodes = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const node of Array.from(region.querySelectorAll(selector))) {
        if (seen.has(node)) continue;
        seen.add(node);
        if (!elementVisibilityDetails(node).visible) continue;
        nodes.push(node);
      }
    }

    const candidates = [];
    for (const node of nodes) {
      const clone = node.cloneNode(true);
      removePreviousQaMarkdownChrome(clone);
      const markdown = htmlToMarkdown(clone.innerHTML || "");
      if (markdown && markdown.length >= 20 && markdown.length <= MAX_GENERATED_MARKDOWN_CHARS) {
        candidates.push({
          node,
          markdown: markdown.replace(/\r\n?/g, "\n").trim()
        });
      }
    }
    return candidates.sort((a, b) => b.markdown.length - a.markdown.length);
  }

  function generatedMarkdownRegionContains(ancestor, descendant) {
    if (!ancestor || !descendant || ancestor === descendant) return ancestor === descendant;
    try {
      return typeof ancestor.contains === "function" && ancestor.contains(descendant);
    } catch {
      return false;
    }
  }

  function generatedMarkdownRegionsEquivalent(left, right, readCandidates = markdownCandidatesFromGeneratedRegion) {
    if (!left || !right) return false;
    if (left === right) return true;
    const nested = generatedMarkdownRegionContains(left, right) || generatedMarkdownRegionContains(right, left);
    if (!nested) return false;

    const leftCandidates = Array.from(readCandidates(left) || []);
    const rightCandidates = Array.from(readCandidates(right) || []);
    const leftNodes = new Set(leftCandidates.map(candidate => candidate?.node).filter(Boolean));
    if (rightCandidates.some(candidate => candidate?.node && leftNodes.has(candidate.node))) return true;

    const normalize = value => String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const leftBodies = new Set(leftCandidates.map(candidate => normalize(candidate?.markdown)).filter(Boolean));
    return rightCandidates.some(candidate => leftBodies.has(normalize(candidate?.markdown)));
  }

  function preferredGeneratedMarkdownRegion(left, right) {
    const isCanonical = region => region?.matches?.("[data-testid='screen-threadFlyOut']") === true;
    if (isCanonical(left) !== isCanonical(right)) return isCanonical(left) ? left : right;
    if (generatedMarkdownRegionContains(left, right)) return right;
    if (generatedMarkdownRegionContains(right, left)) return left;
    return left;
  }

  function collapseEquivalentGeneratedMarkdownRegions(regions, readCandidates = markdownCandidatesFromGeneratedRegion) {
    const collapsed = [];
    for (const region of Array.from(regions || [])) {
      if (!region) continue;
      const index = collapsed.findIndex(existing => generatedMarkdownRegionsEquivalent(existing, region, readCandidates));
      if (index < 0) {
        collapsed.push(region);
      } else {
        collapsed[index] = preferredGeneratedMarkdownRegion(collapsed[index], region);
      }
    }
    return collapsed;
  }

  function findGeneratedMarkdownRegion(name) {
    return collectGeneratedMarkdownRegions().find(region => generatedMarkdownRegionHasName(region, name)) || null;
  }

  function markdownFromGeneratedRegion(region) {
    return markdownCandidatesFromGeneratedRegion(region)[0]?.markdown || "";
  }

  function findGeneratedMarkdownRegionCandidate(name, options = {}) {
    const readCandidates = options.readCandidates || markdownCandidatesFromGeneratedRegion;
    const rawRegions = options.regions || collectGeneratedMarkdownRegions(options.regionOptions || {});
    const regions = collapseEquivalentGeneratedMarkdownRegions(rawRegions, readCandidates);
    const exactRegions = regions.filter(region => generatedMarkdownRegionHasName(region, name));

    if (exactRegions.length === 1) {
      const readable = Array.from(readCandidates(exactRegions[0]) || []);
      if (readable.length >= 1) {
        return {
          region: exactRegions[0],
          markdown: readable[0].markdown || "",
          ambiguous: false,
          matchKind: readable.length === 1 ? "exact-name" : "exact-name-best-readable-node",
          regionCount: regions.length,
          newRegionCount: 0,
          readableNodeCount: readable.length
        };
      }
      return {
        region: exactRegions[0],
        markdown: "",
        ambiguous: false,
        matchKind: "exact-name-pending",
        regionCount: regions.length,
        newRegionCount: 0,
        readableNodeCount: 0
      };
    }

    if (exactRegions.length > 1) {
      return {
        region: null,
        markdown: "",
        ambiguous: true,
        matchKind: "multiple-exact-name-regions",
        regionCount: regions.length,
        newRegionCount: 0,
        readableNodeCount: exactRegions.reduce((count, region) => count + Array.from(readCandidates(region) || []).length, 0)
      };
    }

    const hasBeforeSnapshot = options.beforeRegions instanceof Set || Array.isArray(options.beforeRegions);
    if (!hasBeforeSnapshot) {
      return {
        region: null,
        markdown: "",
        ambiguous: false,
        matchKind: "no-exact-name",
        regionCount: regions.length,
        newRegionCount: 0,
        readableNodeCount: 0
      };
    }

    const beforeRegions = options.beforeRegions instanceof Set
      ? options.beforeRegions
      : new Set(options.beforeRegions || []);
    const newRegions = regions.filter(region => !beforeRegions.has(region));
    if (newRegions.length === 1) {
      const readable = Array.from(readCandidates(newRegions[0]) || []);
      if (readable.length === 1) {
        return {
          region: newRegions[0],
          markdown: readable[0].markdown || "",
          ambiguous: false,
          matchKind: "single-new-flyout",
          regionCount: regions.length,
          newRegionCount: 1,
          readableNodeCount: 1
        };
      }
      if (readable.length > 1) {
        return {
          region: null,
          markdown: "",
          ambiguous: true,
          matchKind: "single-new-flyout-multiple-readable-nodes",
          regionCount: regions.length,
          newRegionCount: 1,
          readableNodeCount: readable.length
        };
      }
      return {
        region: newRegions[0],
        markdown: "",
        ambiguous: false,
        matchKind: "single-new-flyout-pending",
        regionCount: regions.length,
        newRegionCount: 1,
        readableNodeCount: 0
      };
    }

    if (newRegions.length > 1) {
      return {
        region: null,
        markdown: "",
        ambiguous: true,
        matchKind: "multiple-new-flyouts",
        regionCount: regions.length,
        newRegionCount: newRegions.length,
        readableNodeCount: newRegions.reduce((count, region) => count + Array.from(readCandidates(region) || []).length, 0)
      };
    }

    return {
      region: null,
      markdown: "",
      ambiguous: false,
      matchKind: "no-new-flyout",
      regionCount: regions.length,
      newRegionCount: 0,
      readableNodeCount: 0
    };
  }

  async function waitForGeneratedMarkdownRegion(name, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : GENERATED_MARKDOWN_VIEWER_TIMEOUT_MS;
    const pollMs = Number.isFinite(options.pollMs)
      ? Math.max(1, options.pollMs)
      : GENERATED_MARKDOWN_VIEWER_POLL_MS;
    const ambiguityStabilityMs = Number.isFinite(options.ambiguityStabilityMs)
      ? Math.max(0, options.ambiguityStabilityMs)
      : GENERATED_MARKDOWN_AMBIGUITY_STABILITY_MS;
    const runtimeCheckIntervalMs = Number.isFinite(options.runtimeCheckIntervalMs)
      ? Math.max(1, options.runtimeCheckIntervalMs)
      : RUNTIME_POLL_INTERVAL_MS;
    const now = options.now || (() => Date.now());
    const pause = options.sleepFn || sleep;
    const legacyMode = typeof options.findRegion === "function" || typeof options.readRegion === "function";
    const findRegion = options.findRegion || findGeneratedMarkdownRegion;
    const readRegion = options.readRegion || markdownFromGeneratedRegion;
    const findCandidate = options.findCandidate || findGeneratedMarkdownRegionCandidate;
    const runtimeCheck = typeof options.runtimeCheck === "function"
      ? options.runtimeCheck
      : typeof options.runtimeGuard?.check === "function"
        ? phase => options.runtimeGuard.check(phase)
        : null;
    const startedAt = now();
    let nextRuntimeCheckAt = startedAt;
    let region = null;
    let lastCandidate = null;
    let ambiguitySignature = "";
    let ambiguityStartedAt = null;
    let stabilizedAmbiguity = false;

    while (true) {
      if (options.isCancelled?.()) {
        return {
          region,
          markdown: "",
          elapsedMs: Math.max(0, now() - startedAt),
          cancelled: true,
          ambiguous: !!lastCandidate?.ambiguous,
          matchKind: lastCandidate?.matchKind || "cancelled",
          runtimeUnavailable: false
        };
      }

      const beforeCheckElapsed = Math.max(0, now() - startedAt);
      if (runtimeCheck && beforeCheckElapsed >= Math.max(0, nextRuntimeCheckAt - startedAt)) {
        let runtimeStatus;
        try {
          runtimeStatus = await runtimeCheck("markdown-viewer-wait");
        } catch (error) {
          runtimeStatus = {
            ok: false,
            error: error?.message || String(error),
            runtimeUnavailable: true,
            runtimeFailureKind: "runtime-check-exception",
            phase: "markdown-viewer-wait"
          };
        }
        const runtimeOk = runtimeStatus === true || runtimeStatus?.ok === true;
        if (!runtimeOk) {
          const failure = runtimeStatus && typeof runtimeStatus === "object"
            ? runtimeStatus
            : { ok: false, error: t("runtimeUnavailable"), runtimeUnavailable: true, phase: "markdown-viewer-wait" };
          artifactDebugLog("extension runtime lost during Markdown viewer wait", {
            phase: failure.phase || "markdown-viewer-wait",
            kind: failure.runtimeFailureKind || "runtime-unavailable",
            error: failure.error || t("runtimeUnavailable")
          });
          return {
            region,
            markdown: "",
            elapsedMs: Math.max(0, now() - startedAt),
            cancelled: true,
            ambiguous: !!lastCandidate?.ambiguous,
            matchKind: "runtime-unavailable",
            runtimeUnavailable: true,
            runtimeFailure: failure
          };
        }
        nextRuntimeCheckAt = now() + runtimeCheckIntervalMs;
      }

      if (legacyMode) {
        region = findRegion(name);
        const markdown = readRegion(region);
        if (markdown) {
          return {
            region,
            markdown,
            elapsedMs: Math.max(0, now() - startedAt),
            cancelled: false,
            ambiguous: false,
            matchKind: "custom",
            runtimeUnavailable: false
          };
        }
      } else {
        lastCandidate = findCandidate(name, { beforeRegions: options.beforeRegions });
        region = lastCandidate?.region || null;
        if (lastCandidate?.markdown) {
          artifactDebugLog("generated Markdown viewer matched", {
            name: safeArtifactName(name, ["md"]),
            matchKind: lastCandidate.matchKind,
            regionCount: lastCandidate.regionCount,
            newRegionCount: lastCandidate.newRegionCount,
            readableNodeCount: lastCandidate.readableNodeCount,
            markdownLength: lastCandidate.markdown.length
          });
          return {
            region,
            markdown: lastCandidate.markdown,
            elapsedMs: Math.max(0, now() - startedAt),
            cancelled: false,
            ambiguous: false,
            matchKind: lastCandidate.matchKind,
            runtimeUnavailable: false
          };
        }

        if (lastCandidate?.ambiguous) {
          const signature = [
            lastCandidate.matchKind || "ambiguous",
            lastCandidate.regionCount || 0,
            lastCandidate.newRegionCount || 0,
            lastCandidate.readableNodeCount || 0
          ].join(":");
          if (signature !== ambiguitySignature) {
            ambiguitySignature = signature;
            ambiguityStartedAt = now();
          } else if (ambiguityStartedAt !== null && now() - ambiguityStartedAt >= ambiguityStabilityMs) {
            stabilizedAmbiguity = true;
            break;
          }
        } else {
          ambiguitySignature = "";
          ambiguityStartedAt = null;
        }
      }

      const elapsedMs = Math.max(0, now() - startedAt);
      if (elapsedMs >= timeoutMs) break;
      let delay = Math.min(pollMs, Math.max(1, timeoutMs - elapsedMs));
      if (lastCandidate?.ambiguous && ambiguityStartedAt !== null) {
        const remainingStability = ambiguityStabilityMs - Math.max(0, now() - ambiguityStartedAt);
        if (remainingStability > 0) delay = Math.min(delay, remainingStability);
      }
      await pause(Math.max(1, delay));
    }

    artifactDebugLog("generated Markdown viewer wait ended", {
      name: safeArtifactName(name, ["md"]),
      elapsedMs: Math.max(0, now() - startedAt),
      matchKind: lastCandidate?.matchKind || (legacyMode ? "custom-timeout" : "not-found"),
      ambiguous: !!lastCandidate?.ambiguous,
      stabilizedAmbiguity,
      regionCount: lastCandidate?.regionCount || 0,
      newRegionCount: lastCandidate?.newRegionCount || 0,
      readableNodeCount: lastCandidate?.readableNodeCount || 0
    });
    return {
      region,
      markdown: "",
      elapsedMs: Math.max(0, now() - startedAt),
      cancelled: false,
      ambiguous: !!lastCandidate?.ambiguous,
      stabilizedAmbiguity,
      matchKind: lastCandidate?.matchKind || (legacyMode ? "custom-timeout" : "not-found"),
      runtimeUnavailable: false
    };
  }

  function beginMarkdownDownloadWatch(name, startedAt = Date.now()) {
    return sendExtensionMessage({
      type: "begin-markdown-download-watch",
      expectedNames: [safeArtifactName(name, ["md"])],
      startedAt
    }, { phase: "markdown-download-watch-start" });
  }

  function awaitMarkdownDownloadWatch(watchId) {
    return sendExtensionMessage({
      type: "await-markdown-download-watch",
      watchId
    }, { phase: "markdown-download-watch-await" });
  }

  function cancelMarkdownDownloadWatch(watchId) {
    if (!watchId) return Promise.resolve({ ok: true });
    return sendExtensionMessage({
      type: "cancel-markdown-download-watch",
      watchId
    }, { phase: "markdown-download-watch-cancel" });
  }

  function clickArtifactControl(node) {
    if (!node) return { found: false, attempted: false, error: "" };
    if (typeof node.click !== "function") {
      return { found: true, attempted: false, error: "control does not expose click()" };
    }
    try {
      node.click();
      return { found: true, attempted: true, error: "" };
    } catch (error) {
      return { found: true, attempted: true, error: error?.message || String(error) };
    }
  }

  function startGeneratedMarkdownDownloadCapture(row, options = {}) {
    const canonicalName = safeArtifactName(row?.name, ["md"]);
    const resolveRow = typeof options.resolveRow === "function" ? options.resolveRow : (() => row);
    const beginWatch = options.beginWatch || beginMarkdownDownloadWatch;
    const awaitWatch = options.awaitWatch || awaitMarkdownDownloadWatch;
    const cancelWatch = options.cancelWatch || cancelMarkdownDownloadWatch;
    const runtimeGuard = options.runtimeGuard || null;
    const promptDelayMs = Number.isFinite(options.promptDelayMs)
      ? Math.max(0, options.promptDelayMs)
      : MARKDOWN_DOWNLOAD_PROMPT_DELAY_MS;
    const controlPollMs = Number.isFinite(options.controlPollMs)
      ? Math.max(1, options.controlPollMs)
      : 200;
    const promptUser = options.promptUser || (() => alert(t("markdownDownloadActionRequired")));
    const attemptedControls = new Set();
    const controller = {
      watchId: "",
      captured: false,
      settled: false,
      cancelled: false,
      controlFound: false,
      activationAttempts: 0,
      activationErrors: [],
      runtimeUnavailable: false,
      runtimeFailure: null,
      promptTimer: 0,
      promptProbeTimer: 0,
      controlProbeTimer: 0,
      restore: () => {},
      result: null,
      cancel: null,
      refreshAndActivate: null
    };
    let unsubscribeRuntimeAbort = () => {};
    let cancelPromise = null;

    const cleanup = () => {
      clearTimeout(controller.promptTimer);
      clearTimeout(controller.promptProbeTimer);
      clearTimeout(controller.controlProbeTimer);
      controller.restore();
      controller.restore = () => {};
      unsubscribeRuntimeAbort();
      unsubscribeRuntimeAbort = () => {};
    };

    const markRuntimeFailure = (result, phase) => {
      const failure = runtimeGuard?.fail
        ? runtimeGuard.fail(result, phase)
        : isExtensionRuntimeFailure(result)
          ? result
          : classifyExtensionRuntimeFailure(result?.error || result || t("runtimeUnavailable"), {
            source: result?.runtimeFailureKind || "runtime-unavailable",
            phase
          });
      controller.runtimeUnavailable = true;
      controller.runtimeFailure = failure;
      controller.settled = true;
      cleanup();
      return {
        downloadedMarkdown: null,
        error: failure?.error || t("runtimeUnavailable"),
        runtimeUnavailable: true,
        runtimeFailure: failure
      };
    };

    controller.refreshAndActivate = (phase = "download-control") => {
      if (controller.settled || controller.cancelled || controller.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
        return { found: false, attempted: false, error: "", row: null };
      }
      const currentRow = resolveRow(phase) || null;
      const button = currentRow?.downloadButton || null;
      if (!button) return { found: false, attempted: false, error: "", row: currentRow };
      controller.controlFound = true;
      if (attemptedControls.has(button)) {
        return { found: true, attempted: false, error: "", row: currentRow };
      }
      attemptedControls.add(button);
      const activation = clickArtifactControl(button);
      if (activation.attempted) controller.activationAttempts += 1;
      if (activation.error) controller.activationErrors.push(activation.error);
      artifactDebugLog("Markdown download control activation", {
        phase,
        canonicalName,
        found: activation.found,
        attempted: activation.attempted,
        error: activation.error || "",
        control: artifactControlDebugSummary(button)
      });
      return { ...activation, row: currentRow };
    };

    const scheduleLateControlProbe = () => {
      const probe = () => {
        if (controller.settled || controller.cancelled || controller.controlFound || runtimeGuard?.isAborted?.()) return;
        const activation = controller.refreshAndActivate("download-control-probe");
        if (activation.found || controller.settled) return;
        controller.controlProbeTimer = setTimeout(probe, controlPollMs);
      };
      controller.controlProbeTimer = setTimeout(probe, controlPollMs);
    };

    const scheduleUserPrompt = () => {
      const tryPrompt = () => {
        if (controller.settled || controller.cancelled || controller.captured || runtimeGuard?.isAborted?.()) return;
        const currentRow = resolveRow("download-prompt-resolve") || null;
        const button = currentRow?.downloadButton || null;
        if (!button) {
          controller.promptProbeTimer = setTimeout(tryPrompt, controlPollMs);
          return;
        }
        controller.controlFound = true;
        controller.refreshAndActivate("download-prompt");
        if (controller.settled || runtimeGuard?.isAborted?.()) return;
        controller.restore();
        controller.restore = revealDownloadCandidate({ node: button });
        try { button.focus?.({ preventScroll: true }); } catch {}
        artifactDebugLog("requesting real Markdown download click", {
          canonicalName,
          control: artifactControlDebugSummary(button)
        });
        promptUser();
      };
      controller.promptTimer = setTimeout(tryPrompt, promptDelayMs);
    };

    const watchPromise = (async () => {
      const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "markdown-download-watch-start");
      if (!runtimeStatus?.ok) return markRuntimeFailure(runtimeStatus, "markdown-download-watch-start");
      if (controller.cancelled) return { ok: false, error: "download watch cancelled before start" };
      try {
        return await awaitWithRuntimeGuard(
          beginWatch(canonicalName, Date.now()),
          runtimeGuard,
          "markdown-download-watch-start",
          { intervalMs: options.runtimePollIntervalMs }
        );
      } catch (error) {
        return { ok: false, error: error?.message || String(error) };
      }
    })();

    controller.result = (async () => {
      const watch = await watchPromise;
      if (watch?.runtimeUnavailable) return watch;
      if (controller.cancelled) {
        return { downloadedMarkdown: null, error: "download watch cancelled" };
      }
      if (isExtensionRuntimeFailure(watch)) {
        return markRuntimeFailure(watch, "markdown-download-watch-start");
      }
      controller.watchId = watch?.watchId || "";
      if (!watch?.ok || !controller.watchId) {
        return {
          downloadedMarkdown: null,
          error: watch?.error || "Markdown download watch failed to start"
        };
      }

      // The exact-name watch must exist before any download activation. A
      // fresh runtime ping above prevents a stale content script from clicking
      // a file that it can no longer track or pass to the native helper.
      const initialActivation = controller.refreshAndActivate("download-watch-start");
      if (!initialActivation.found) scheduleLateControlProbe();
      scheduleUserPrompt();

      const result = await awaitWithRuntimeGuard(
        awaitWatch(controller.watchId),
        runtimeGuard,
        "markdown-download-watch-wait",
        {
          intervalMs: options.runtimePollIntervalMs,
          onRuntimeFailure: () => cancelWatch(controller.watchId)
        }
      );
      if (isExtensionRuntimeFailure(result)) {
        return markRuntimeFailure(result, "markdown-download-watch-await");
      }
      if (controller.runtimeUnavailable) {
        return {
          downloadedMarkdown: null,
          error: controller.runtimeFailure?.error || t("runtimeUnavailable"),
          runtimeUnavailable: true,
          runtimeFailure: controller.runtimeFailure
        };
      }
      if (controller.cancelled) {
        return { downloadedMarkdown: null, error: "download watch cancelled" };
      }
      if (!result?.ok || !result.download) {
        return {
          downloadedMarkdown: null,
          error: result?.error || "current Markdown download was not captured",
          downloadTrackingFailed: true
        };
      }

      const download = result.download;
      controller.captured = true;
      return {
        downloadedMarkdown: {
          name: safeArtifactName(download.name || canonicalName, ["md"]),
          sourcePath: download.sourcePath,
          downloadId: download.id,
          startTime: download.startTime,
          endTime: download.endTime
        },
        error: "",
        downloadTrackingFailed: false
      };
    })().catch(error => {
      if (isExtensionRuntimeFailure(error)) return markRuntimeFailure(error, "markdown-download-watch");
      return {
        downloadedMarkdown: null,
        error: error?.message || String(error)
      };
    }).finally(() => {
      controller.settled = true;
      cleanup();
    });

    controller.cancel = () => {
      if (cancelPromise) return cancelPromise;
      controller.cancelled = true;
      controller.settled = true;
      cleanup();
      cancelPromise = (async () => {
        const watch = await watchPromise.catch(() => null);
        controller.watchId = controller.watchId || watch?.watchId || "";
        if (controller.watchId) {
          try { await cancelWatch(controller.watchId); } catch {}
        }
      })();
      return cancelPromise;
    };

    if (runtimeGuard?.onAbort) {
      unsubscribeRuntimeAbort = runtimeGuard.onAbort((failure) => {
        controller.runtimeUnavailable = true;
        controller.runtimeFailure = failure;
        void controller.cancel();
      });
    }

    return controller;
  }

  function closeGeneratedArtifactRegion(region) {
    const close = Array.from(region?.querySelectorAll?.("button") || [])
      .find(button => /^(?:close|닫기)$/i.test(controlLabel(button)));
    try { close?.click?.(); } catch {}
  }

  async function readGeneratedMarkdownArtifactRow(row, options = {}) {
    const canonicalName = safeArtifactName(row?.name, ["md"]);
    const warnings = [];
    const runtimeGuard = options.runtimeGuard || null;
    const hasDynamicResolver = typeof options.resolveRow === "function";
    const resolveCurrentRow = (phase) => {
      if (!hasDynamicResolver) return row;
      return options.resolveRow(phase) || { name: canonicalName };
    };
    let currentRow = resolveCurrentRow("read-start");

    if (currentRow?.href) {
      try {
        const hrefRuntime = await checkRuntimeGuard(runtimeGuard, "markdown-href-read");
        if (!hrefRuntime?.ok) {
          return {
            markdown: "",
            warnings,
            runtimeUnavailable: true,
            runtimeFailure: hrefRuntime
          };
        }
        const readOperation = options.readHref
          ? options.readHref(currentRow.href, MAX_GENERATED_MARKDOWN_CHARS)
          : readTextArtifactHref(currentRow.href, MAX_GENERATED_MARKDOWN_CHARS);
        const text = await awaitWithRuntimeGuard(
          readOperation,
          runtimeGuard,
          "markdown-href-read"
        );
        if (isExtensionRuntimeFailure(text)) {
          return {
            markdown: "",
            warnings,
            runtimeUnavailable: true,
            runtimeFailure: text
          };
        }
        return { markdown: text, warnings };
      } catch (error) {
        warnings.push(`${canonicalName}: ${error?.message || String(error)}`);
        options.onHrefFailure?.();
        currentRow = resolveCurrentRow("after-href-failure") || currentRow;
      }
    }

    let region = null;
    try {
      if (options.openAndRead) {
        const text = await options.openAndRead(currentRow || { name: canonicalName });
        if (!text || !String(text).trim()) throw new Error("opened Markdown artifact is empty");
        if (String(text).length > MAX_GENERATED_MARKDOWN_CHARS) throw new Error("opened Markdown artifact is too large");
        return { markdown: String(text).replace(/\r\n?/g, "\n").trim(), warnings };
      }

      if (!options.alreadyOpened) {
        const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "markdown-viewer-open");
        if (!runtimeStatus?.ok) {
          return {
            markdown: "",
            warnings,
            runtimeUnavailable: true,
            runtimeFailure: runtimeStatus
          };
        }
        currentRow = resolveCurrentRow("viewer-open") || currentRow;
        const activation = clickArtifactControl(currentRow?.openButton);
        artifactDebugLog("Markdown file-card open activation", {
          phase: "viewer-open",
          canonicalName,
          found: activation.found,
          attempted: activation.attempted,
          error: activation.error || "",
          control: artifactControlDebugSummary(currentRow?.openButton)
        });
      }
      const result = await waitForGeneratedMarkdownRegion(canonicalName, {
        ...(options.viewerWaitOptions || {}),
        runtimeGuard: options.viewerWaitOptions?.runtimeGuard || runtimeGuard
      });
      region = result.region;
      if (result.runtimeUnavailable) {
        return {
          markdown: "",
          warnings,
          runtimeUnavailable: true,
          runtimeFailure: result.runtimeFailure || runtimeGuard?.getFailure?.() || null
        };
      }
      if (!result.markdown) {
        if (result.ambiguous) {
          throw new Error(`Markdown artifact viewer mapping is ambiguous (${result.matchKind}) after ${result.elapsedMs}ms`);
        }
        throw new Error(`matching Markdown artifact viewer did not expose readable content within ${result.elapsedMs}ms`);
      }
      artifactDebugLog("generated Markdown viewer ready", {
        name: canonicalName,
        elapsedMs: result.elapsedMs,
        matchKind: result.matchKind,
        markdownLength: result.markdown.length
      });
      return { markdown: result.markdown, warnings };
    } catch (error) {
      warnings.push(`${canonicalName}: ${error?.message || String(error)}`);
      return { markdown: "", warnings };
    } finally {
      if (region) closeGeneratedArtifactRegion(region);
    }
  }

  async function extractGeneratedMarkdownArtifact(container, options = {}) {
    if (!container) return { name: "", markdown: "", downloadedMarkdown: null, warnings: [], candidatesCount: 0 };

    const runtimeGuard = options.runtimeGuard || null;
    const runtimeStatus = runtimeGuard?.checkSync
      ? runtimeGuard.checkSync("markdown-artifact-start")
      : { ok: true, phase: "markdown-artifact-start" };
    if (!runtimeStatus?.ok) {
      return {
        name: "",
        markdown: "",
        downloadedMarkdown: null,
        warnings: [],
        candidatesCount: 0,
        runtimeUnavailable: true,
        runtimeFailure: runtimeStatus
      };
    }

    const staticRows = Array.isArray(options.rows) ? options.rows : null;
    const collectRowsNow = () => {
      let currentRows = [];
      if (typeof options.resolveRows === "function") {
        currentRows = Array.from(options.resolveRows(container, ["md"]) || []);
      } else {
        currentRows = collectArtifactFileRows(container, ["md"]);
      }
      if (!currentRows.length && staticRows && typeof options.resolveRows !== "function") {
        return staticRows;
      }
      return currentRows;
    };

    let rows = staticRows || collectRowsNow();
    let selected = selectGeneratedMarkdownArtifact(rows);
    if (!selected.row && !options.skipReveal) {
      await revealCollapsedGeneratedArtifacts(container);
      rows = collectRowsNow();
      selected = selectGeneratedMarkdownArtifact(rows);
    }

    const warnings = selected.warning ? [selected.warning] : [];
    if (!selected.row) {
      return { name: "", markdown: "", downloadedMarkdown: null, warnings, candidatesCount: rows.length };
    }

    const canonicalName = safeArtifactName(selected.row.name, ["md"]);
    const staticFallbackAllowed = !!staticRows && typeof options.resolveRows !== "function";
    const resolveSelectedRow = (phase = "") => {
      const currentRows = collectRowsNow();
      const matches = currentRows.filter(item => safeArtifactName(item?.name, ["md"]) === canonicalName);
      let current = choosePreferredArtifactRow(matches);
      if (!current && staticFallbackAllowed) {
        current = choosePreferredArtifactRow(staticRows.filter(item => safeArtifactName(item?.name, ["md"]) === canonicalName));
      }
      if (phase) logArtifactRowResolution(phase, canonicalName, matches, current);
      return current;
    };

    const viewerSnapshot = options.viewerSnapshot || captureGeneratedMarkdownRegionSnapshot();
    let alreadyOpened = false;
    let downloadCapture = null;
    let openPromptTimer = 0;
    let restoreOpenControl = () => {};
    let openPromptScheduled = false;
    let openPromptCancelled = false;
    const openActivationErrors = [];
    const attemptedOpenControls = new Set();

    const cleanupOpenPrompt = () => {
      openPromptCancelled = true;
      clearTimeout(openPromptTimer);
      restoreOpenControl();
      restoreOpenControl = () => {};
    };

    const scheduleOpenPrompt = () => {
      if (openPromptScheduled || options.openAndRead) return;
      openPromptScheduled = true;
      const delayMs = Number.isFinite(options.openPromptDelayMs)
        ? Math.max(0, options.openPromptDelayMs)
        : MARKDOWN_OPEN_PROMPT_DELAY_MS;
      const probeMs = Number.isFinite(options.openPromptPollMs)
        ? Math.max(1, options.openPromptPollMs)
        : 200;
      const promptUser = options.promptOpenUser || (() => alert(t("markdownOpenActionRequired")));
      const tryPrompt = async () => {
        if (openPromptCancelled || downloadCapture?.captured || runtimeGuard?.isAborted?.()) return;
        const promptRuntime = await checkRuntimeGuard(runtimeGuard, "markdown-viewer-open-prompt");
        if (!promptRuntime?.ok) {
          cleanupOpenPrompt();
          return;
        }
        const currentRow = resolveSelectedRow();
        const button = currentRow?.openButton || null;
        if (!button) {
          openPromptTimer = setTimeout(() => { void tryPrompt(); }, probeMs);
          return;
        }
        logArtifactRowResolution("open-prompt", canonicalName, [currentRow], currentRow);
        restoreOpenControl();
        restoreOpenControl = revealDownloadCandidate({ node: button });
        try { button.focus?.({ preventScroll: true }); } catch {}
        promptUser();
      };
      openPromptTimer = setTimeout(() => { void tryPrompt(); }, delayMs);
    };

    const ensureDownloadCapture = () => {
      if (downloadCapture || options.openAndRead) return downloadCapture;
      const startCapture = options.startDownloadCapture || startGeneratedMarkdownDownloadCapture;
      const currentRow = resolveSelectedRow("download-watch-resolve") || { name: canonicalName };
      downloadCapture = startCapture(
        { ...currentRow, name: canonicalName },
        {
          ...(options.downloadCaptureOptions || {}),
          runtimeGuard: options.downloadCaptureOptions?.runtimeGuard || runtimeGuard,
          resolveRow: (phase) => resolveSelectedRow(phase)
        }
      );
      return downloadCapture;
    };

    const attemptOpen = (phase) => {
      const openRuntime = runtimeGuard?.checkSync
        ? runtimeGuard.checkSync(phase)
        : { ok: true, phase };
      if (!openRuntime?.ok) {
        return { found: false, attempted: false, error: openRuntime.error || t("runtimeUnavailable"), runtimeUnavailable: true };
      }
      const currentRow = resolveSelectedRow(phase);
      const button = currentRow?.openButton || null;
      const activation = button && attemptedOpenControls.has(button)
        ? { found: true, attempted: false, error: "" }
        : clickArtifactControl(button);
      if (button && activation.attempted) attemptedOpenControls.add(button);
      if (activation.error) openActivationErrors.push(activation.error);
      artifactDebugLog("Markdown file-card open activation", {
        phase,
        canonicalName,
        found: activation.found,
        attempted: activation.attempted,
        error: activation.error || "",
        control: artifactControlDebugSummary(currentRow?.openButton)
      });
      if (activation.attempted && !activation.error) alreadyOpened = true;
      return activation;
    };

    const initialRow = resolveSelectedRow("initial-selection");
    if ((!initialRow?.href || !isFetchableDownloadHref(initialRow.href)) && !options.openAndRead) {
      ensureDownloadCapture();
      scheduleOpenPrompt();
      attemptOpen("open-before-first-wait");
    }

    const rowForRead = resolveSelectedRow("read-resolve") || (staticFallbackAllowed ? selected.row : { name: canonicalName });
    if ((!rowForRead?.href || !isFetchableDownloadHref(rowForRead.href)) && !options.openAndRead) {
      ensureDownloadCapture();
      scheduleOpenPrompt();
      attemptOpen("open-after-rerender-resolve");
    }
    const result = await readGeneratedMarkdownArtifactRow(
      { ...rowForRead, name: canonicalName },
      {
        ...options,
        runtimeGuard,
        resolveRow: (phase) => resolveSelectedRow(phase),
        alreadyOpened,
        onHrefFailure: () => {
          ensureDownloadCapture();
          scheduleOpenPrompt();
        },
        viewerWaitOptions: {
          ...(options.viewerWaitOptions || {}),
          beforeRegions: options.viewerWaitOptions?.beforeRegions || viewerSnapshot,
          runtimeGuard: options.viewerWaitOptions?.runtimeGuard || runtimeGuard,
          isCancelled: () => !!downloadCapture?.captured || !!options.viewerWaitOptions?.isCancelled?.()
        }
      }
    );

    if (result.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
      await downloadCapture?.cancel?.();
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length,
        runtimeUnavailable: true,
        runtimeFailure: result.runtimeFailure || runtimeGuard?.getFailure?.() || null
      };
    }

    if (result.markdown) {
      await downloadCapture?.cancel?.();
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: result.markdown,
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length
      };
    }

    const fallbackRuntime = await checkRuntimeGuard(runtimeGuard, "markdown-download-fallback");
    if (!fallbackRuntime?.ok) {
      await downloadCapture?.cancel?.();
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length,
        runtimeUnavailable: true,
        runtimeFailure: fallbackRuntime
      };
    }
    downloadCapture?.refreshAndActivate?.("download-fallback-before-await");
    const downloadedResult = downloadCapture
      ? await downloadCapture.result
      : { downloadedMarkdown: null, error: "" };
    if (downloadedResult.runtimeUnavailable || runtimeGuard?.isAborted?.()) {
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: null,
        warnings,
        candidatesCount: rows.length,
        runtimeUnavailable: true,
        runtimeFailure: downloadedResult.runtimeFailure || runtimeGuard?.getFailure?.() || null
      };
    }
    if (downloadedResult.downloadedMarkdown) {
      artifactDebugLog("captured generated Markdown download", {
        name: downloadedResult.downloadedMarkdown.name,
        downloadId: downloadedResult.downloadedMarkdown.downloadId
      });
      cleanupOpenPrompt();
      return {
        name: canonicalName,
        markdown: "",
        downloadedMarkdown: downloadedResult.downloadedMarkdown,
        warnings,
        candidatesCount: rows.length
      };
    }

    const finalRow = resolveSelectedRow("final-warning");
    const exactControlFound = !!finalRow?.downloadButton || !!downloadCapture?.controlFound;
    const classifiedWarnings = [];
    if (!options.openAndRead && downloadCapture) {
      if (!exactControlFound) {
        classifiedWarnings.push(`${canonicalName}: exact File download control was not found in the current artifact row`);
        if (downloadedResult.error && !/download-watch-timeout/i.test(downloadedResult.error)) {
          classifiedWarnings.push(`${canonicalName}: Markdown download fallback failed: ${downloadedResult.error}`);
        }
      } else if (downloadCapture.activationErrors?.length) {
        classifiedWarnings.push(`${canonicalName}: exact File download control was found, but activation failed: ${downloadCapture.activationErrors[0]}`);
      } else {
        const detail = downloadedResult.error || "the current download could not be tracked";
        classifiedWarnings.push(`${canonicalName}: exact File download control was found and activation was attempted, but the current download could not be tracked: ${detail}`);
      }
    }
    if (openActivationErrors.length) {
      classifiedWarnings.push(`${canonicalName}: Markdown file-card open control was found, but activation failed: ${openActivationErrors[0]}`);
    }

    cleanupOpenPrompt();
    return {
      name: canonicalName,
      markdown: "",
      downloadedMarkdown: null,
      warnings: Array.from(new Set([
        ...warnings,
        ...result.warnings,
        ...classifiedWarnings
      ].filter(Boolean))),
      candidatesCount: rows.length
    };
  }

  function normalizeMarkdownForComparison(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function detailedMarkdownBody(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g, "GPT_OBSIDIAN_ATTACHMENTS")
      .replace(new RegExp(`^# ${escapeRegExp(DETAILED_MARKDOWN_HEADING)}\\s*$`, "gm"), "")
      .trim();
  }

  function mergeDetailedMarkdownSection(noteContent, detailedMarkdown) {
    const body = detailedMarkdownBody(detailedMarkdown);
    if (!body) return noteContent;

    const headingLine = `# ${DETAILED_MARKDOWN_HEADING}`;
    const headingPattern = new RegExp(`^${escapeRegExp(headingLine)}\\s*$`, "gm");
    let base = String(noteContent || "").replace(/\r\n?/g, "\n");
    const exactBodyIndex = base.indexOf(body);
    if (exactBodyIndex >= 0) {
      base = `${base.slice(0, exactBodyIndex).trimEnd()}\n\n${base.slice(exactBodyIndex + body.length).trimStart()}`.trim();
    } else {
      const normalizedBody = normalizeMarkdownForComparison(body);
      if (normalizeMarkdownForComparison(base).includes(normalizedBody) && headingPattern.test(base)) {
        return base;
      }
    }

    headingPattern.lastIndex = 0;
    const existingHeading = headingPattern.exec(base);
    if (existingHeading) {
      base = base.slice(0, existingHeading.index).trimEnd();
    }
    base = base.replace(headingPattern, "").trimEnd();
    return `${base}\n\n${headingLine}\n\n${body}\n`;
  }

  function mergeDownloadedDetailedMarkdownMarker(noteContent) {
    return mergeDetailedMarkdownSection(noteContent, DETAILED_MARKDOWN_MARKER);
  }

  function downloadCandidateClickPriority(candidate) {
    const node = candidate?.node;
    if (!node) return 0;
    if (isExactDownloadControl(node)) return 600;
    if (hasDownloadAttribute(node)) return 500;
    if (isBlobOrSandboxHref(candidate.href)) return 400;
    if (isFetchableDownloadHref(candidate.href)) return 300;
    if (isLikelyInteractiveHtmlFileCard(node, candidate.href)) return 100;
    return 10;
  }

  function getDownloadCandidates(container, expectedNames = []) {
    if (!container) return [];

    const nodes = Array.from(container.querySelectorAll([
      "a[href]",
      "a[download]",
      "button",
      "[role='button']",
      "[data-testid*='download']",
      "[data-testid*='artifact' i]",
      "[data-testid*='file' i]",
      "[data-file-name]",
      "[data-filename]",
      "[aria-label*='download' i]",
      "[aria-label*='file' i]",
      "[aria-label*='파일' i]",
      "[title*='download' i]"
    ].join(",")));

    const seen = new Map();
    const candidates = [];
    nodes.forEach(node => {
      const discoveredHref = findDownloadHref(node);
      const href = isAssociatedArtifactHref(node, discoveredHref) ? discoveredHref : "";
      const ownText = `${node.innerText || node.textContent || ""} ${node.getAttribute?.("download") || ""} ${node.getAttribute?.("data-file-name") || ""} ${node.getAttribute?.("data-filename") || ""}`;
      const singletonExpectedName = expectedNames.length === 1 ? expectedNames[0] : "";
      const detectedName = filenameFromText(ownText) || findNearbyFilename(node) || filenameFromUrl(href) || singletonExpectedName || "";
      if (!detectedName) return;
      const name = safeDownloadName(detectedName);
      const marker = decodePercentEncodedRuns(`${href} ${ownText} ${node.getAttribute?.("aria-label") || ""} ${node.getAttribute?.("title") || ""} ${node.getAttribute?.("data-testid") || ""}`);
      const htmlMarker = `${name} ${marker}`;
      const looksLikeHtml = /\.html?(?:$|[?#\s])/i.test(htmlMarker);
      const looksLikeFileCard = isLikelyInteractiveHtmlFileCard(node, href);
      const looksLikeDownload = /download|다운로드|artifact|attachment|첨부/i.test(marker) || hasDownloadAttribute(node) || isBlobOrSandboxHref(href) || looksLikeFileCard;
      if (!looksLikeDownload) return;
      if (!looksLikeHtml && !expectedNames.length) return;
      if (isPlainExternalAnchor(node, href)) return;

      const key = `${href || "nohref"}::${name}`;
      const candidate = { name, href, node };
      const existingIndex = seen.get(key);
      if (existingIndex !== undefined) {
        if (downloadCandidateClickPriority(candidate) > downloadCandidateClickPriority(candidates[existingIndex])) {
          candidates[existingIndex] = candidate;
        }
        return;
      }
      seen.set(key, candidates.length);
      candidates.push(candidate);
    });

    return candidates;
  }

  function hasSynchronousReadableHtmlSource(container) {
    if (!container?.querySelector) return false;
    return !!container.querySelector([
      "iframe[srcdoc]",
      "iframe[src^='blob:']",
      "iframe[src^='data:']",
      "pre.cm-content",
      ".cm-content",
      "[role='textbox'][contenteditable='true']",
      ".cm-editor",
      "pre code"
    ].join(","));
  }

  function findUserActivatedDownloadCandidate(btn) {
    const container = closestArtifactContainer(btn);
    if (!container || hasSynchronousReadableHtmlSource(container)) return null;
    return getDownloadCandidates(container)
      .filter(canClickDownloadCandidate)
      .filter(candidate => !isFetchableDownloadHref(candidate.href))
      .filter(candidate => isExactDownloadControl(candidate.node) || hasDownloadAttribute(candidate.node))
      .sort((a, b) => downloadCandidateClickPriority(b) - downloadCandidateClickPriority(a))[0] || null;
  }

  function revealDownloadCandidate(candidate) {
    const changed = [];
    let node = candidate?.node || null;
    for (let depth = 0; depth < 4 && node; depth++, node = node.parentElement) {
      if (!node.style) continue;
      changed.push({
        node,
        pointerEvents: node.style.pointerEvents,
        opacity: node.style.opacity,
        outline: node.style.outline,
        outlineOffset: node.style.outlineOffset
      });
      node.style.pointerEvents = "auto";
      node.style.opacity = "1";
    }
    if (candidate?.node?.style) {
      candidate.node.style.outline = "3px solid #f59e0b";
      candidate.node.style.outlineOffset = "3px";
    }
    try { candidate?.node?.scrollIntoView?.({ block: "center", inline: "nearest" }); } catch {}

    return () => {
      changed.forEach(item => {
        item.node.style.pointerEvents = item.pointerEvents;
        item.node.style.opacity = item.opacity;
        item.node.style.outline = item.outline;
        item.node.style.outlineOffset = item.outlineOffset;
      });
    };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function readDownloadCandidate(candidate) {
    if (!candidate.href) {
      throw new Error("download link not found");
    }
    if (/^sandbox:/i.test(candidate.href)) {
      throw new Error("sandbox link cannot be fetched by the extension");
    }
    if (!isFetchableDownloadHref(candidate.href)) {
      throw new Error(`download href is not page-fetchable: ${hrefScheme(candidate.href)}`);
    }

    const res = await fetch(candidate.href, { credentials: "include" });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);

    const text = await res.text();
    if (!text.trim()) throw new Error("downloaded file is empty");
    if (text.length > MAX_HTML_ATTACHMENT_CHARS) throw new Error("downloaded file is too large for native messaging");

    return {
      name: candidate.name,
      content: text
    };
  }

  async function readHtmlPreviews(container, expectedNames = [], candidates = []) {
    const files = [];
    if (!container) return files;

    const frames = Array.from(container.querySelectorAll("iframe"));
    const fallbackNames = Array.from(new Set([
      ...expectedNames,
      ...candidates.map(candidate => candidate?.name || "")
    ].filter(name => /\.html?$/i.test(name || "")).map(safeDownloadName)));
    for (const frame of frames) {
      const root = findArtifactRoot(frame, container);
      const scopedName = findScopedArtifactFilename(root);
      const fallbackName = frames.length === 1 && fallbackNames.length === 1 ? fallbackNames[0] : "";
      const name = scopedName || fallbackName;
      if (!name) continue;
      let content = "";

      try {
        if (frame.getAttribute("srcdoc")) {
          content = frame.getAttribute("srcdoc");
        } else if (frame.src && /^blob:/i.test(frame.src)) {
          const res = await fetch(frame.src);
          if (res.ok) content = await res.text();
        } else if (frame.contentDocument?.documentElement) {
          content = "<!doctype html>\n" + frame.contentDocument.documentElement.outerHTML;
        }
      } catch (error) {
        console.warn("Failed to read ChatGPT HTML preview frame.", error);
      }

      if (content && /<html\b|<!doctype html/i.test(content) && content.length <= MAX_HTML_ATTACHMENT_CHARS) {
        debugLog("captured HTML preview frame", { name, bytes: content.length, scheme: hrefScheme(frame.src) });
        files.push({ name, content });
      }
    }

    return files;
  }

  function controlLabel(node) {
    return String(
      node?.getAttribute?.("aria-label") ||
      node?.getAttribute?.("title") ||
      node?.innerText ||
      node?.textContent ||
      ""
    ).trim();
  }

  function isArtifactPreviewToggle(button) {
    return /^(?:preview|미리\s*보기)$/i.test(controlLabel(button));
  }

  function findArtifactToggleGroup(button) {
    if (!button) return null;
    const explicitGroup = button.closest?.('[role="group"]');
    let node = explicitGroup || button.parentElement;
    for (let depth = 0; depth < 8 && node; depth++, node = node.parentElement) {
      const buttons = Array.from(node.querySelectorAll?.("button") || []);
      if (buttons.includes(button) && buttons.some(candidate => candidate !== button && isArtifactPreviewToggle(candidate))) {
        return node;
      }
    }
    return null;
  }

  function isArtifactCodeToggle(button) {
    if (!/^(?:code|coding|코드|코딩)$/i.test(controlLabel(button))) return false;
    return !!findArtifactToggleGroup(button);
  }

  function findArtifactRoot(toggle, container) {
    let node = toggle;
    for (let depth = 0; depth < 10 && node; depth++, node = node.parentElement) {
      if (node.querySelector?.("iframe, pre.cm-content, .cm-content, .cm-editor, pre code")) return node;
      if (node === container) break;
    }
    return null;
  }

  function findScopedArtifactFilename(root) {
    if (!root?.querySelectorAll) return "";
    const nodes = [root, ...Array.from(root.querySelectorAll([
      "[data-file-name]",
      "[data-filename]",
      "[aria-label]",
      "[title]",
      "header",
      "button",
      "[role='button']"
    ].join(",")))];
    const names = new Set();
    for (const node of nodes) {
      const values = [
        node.getAttribute?.("data-file-name") || "",
        node.getAttribute?.("data-filename") || "",
        node.getAttribute?.("aria-label") || "",
        node.getAttribute?.("title") || ""
      ];
      const ownText = String(node.innerText || node.textContent || "").trim();
      if (ownText.length <= 260) values.push(ownText);
      values.forEach(value => {
        const name = filenameFromArtifactText(value, ["html", "htm"]);
        if (name) names.add(safeDownloadName(name));
      });
    }
    return names.size === 1 ? Array.from(names)[0] : "";
  }

  function collectInteractiveArtifactDescriptors(container, expectedNames = [], candidates = []) {
    if (!container?.querySelectorAll) return [];
    const descriptors = [];
    const toggles = Array.from(container.querySelectorAll("button")).filter(isArtifactCodeToggle);
    toggles.forEach(codeToggle => {
      const root = findArtifactRoot(codeToggle, container);
      if (!root || descriptors.some(item => item.root === root)) return;
      const group = findArtifactToggleGroup(codeToggle);
      const previewToggle = Array.from(group?.querySelectorAll?.("button") || []).find(isArtifactPreviewToggle) || null;
      descriptors.push({
        name: findScopedArtifactFilename(root),
        root,
        codeToggle,
        previewToggle,
        restorePreview: codeToggle.getAttribute?.("aria-pressed") !== "true" && !!previewToggle
      });
    });

    const fallbackNames = Array.from(new Set([
      ...expectedNames,
      ...candidates.map(candidate => candidate?.name || "")
    ].filter(name => /\.html?$/i.test(name || "")).map(safeDownloadName)));
    if (descriptors.length === 1 && !descriptors[0].name && fallbackNames.length === 1) {
      descriptors[0].name = fallbackNames[0];
    }
    return descriptors;
  }

  function extractCompleteHtmlSource(root) {
    if (!root?.querySelectorAll) return "";
    const sourceSelector = [
      "pre.cm-content",
      ".cm-content",
      "[role='textbox'][contenteditable='true']",
      "pre code",
      "code",
      "textarea"
    ].join(",");
    const nodes = Array.from(root.querySelectorAll(sourceSelector));
    if (root.matches?.(sourceSelector)) nodes.unshift(root);
    for (const node of nodes) {
      const source = String(
        node.value ||
        node.getAttribute?.("aria-valuetext") ||
        node.innerText ||
        node.textContent ||
        ""
      )
        .replace(/\r\n?/g, "\n")
        .trim();
      if (!source || source.length > MAX_HTML_ATTACHMENT_CHARS) continue;
      if (!/^\s*(?:<!doctype html>|<html\b)/i.test(source)) continue;
      if (!/<\/html>\s*$/i.test(source)) continue;
      return source;
    }
    return "";
  }

  function extractCurrentArtifactHtmlSource(codeToggle, container) {
    const currentRoot = findArtifactRoot(codeToggle, container);
    return extractCompleteHtmlSource(currentRoot);
  }

  function hasInteractiveHtmlArtifactCandidate(container, candidates, expectedNames = []) {
    const candidateMatch = candidates.some(candidate => {
      const candidateName = candidate?.name || findNearbyFilename(candidate?.node) || filenameFromUrl(candidate?.href || "");
      if (!/\.html?$/i.test(candidateName)) return false;
      return isLikelyInteractiveHtmlFileCard(candidate.node, candidate.href) ||
        isExactDownloadControl(candidate.node) ||
        hasDownloadAttribute(candidate.node) ||
        isBlobOrSandboxHref(candidate.href) ||
        hasNearbyArtifactViewer(candidate.node);
    });
    if (candidateMatch) return true;

    const visibleNames = filenamesFromText(container?.innerText || container?.textContent || "");
    const hasHtmlName = [...expectedNames, ...visibleNames].some(name => /\.html?$/i.test(name || ""));
    if (!hasHtmlName || !container?.querySelectorAll) return false;

    const buttons = Array.from(container.querySelectorAll("button"));
    const hasCodeToggle = buttons.some(button => /^(?:code|coding|코드|코딩)$/i.test(controlLabel(button)));
    const hasPreviewToggle = buttons.some(isArtifactPreviewToggle);
    const hasViewer = !!container.querySelector?.("iframe, .cm-editor, pre.cm-content, .cm-content, [data-testid*='artifact' i]");
    return hasCodeToggle && hasPreviewToggle && hasViewer;
  }

  async function readInteractiveHtmlArtifacts(container, expectedNames = [], candidates = []) {
    const files = [];
    const warnings = [];
    if (!container) return files;
    if (!hasInteractiveHtmlArtifactCandidate(container, candidates, expectedNames)) {
      return files;
    }

    const descriptors = collectInteractiveArtifactDescriptors(container, expectedNames, candidates);
    const nameCounts = new Map();
    descriptors.forEach(item => {
      if (item.name) nameCounts.set(item.name, (nameCounts.get(item.name) || 0) + 1);
    });

    for (const descriptor of descriptors) {
      const { name } = descriptor;
      if (!name) {
        warnings.push("An HTML artifact viewer had no unique filename in its own viewer root.");
        continue;
      }
      if ((nameCounts.get(name) || 0) !== 1) {
        warnings.push(`Multiple HTML artifact viewers claimed the same filename: ${name}`);
        continue;
      }

      let currentDescriptor = descriptor;
      let source = extractCompleteHtmlSource(currentDescriptor.root);

      if (!source) {
        try {
          descriptor.codeToggle.click();
          for (let attempt = 0; attempt < 30 && !source; attempt++) {
            await sleep(100);
            const refreshed = collectInteractiveArtifactDescriptors(container, expectedNames, candidates);
            currentDescriptor = refreshed.find(item => item.name === name) || currentDescriptor;
            source = extractCompleteHtmlSource(currentDescriptor.root);
          }
        } catch (error) {
          debugLog("failed to open ChatGPT artifact code view", {
            name,
            reason: error?.message || String(error)
          });
        }
      }

      if (source) {
        pushUniqueFile(files, { name, content: source, source: "artifact-code-view" });
        debugLog("captured ChatGPT artifact code view", { name, bytes: source.length });
      } else {
        warnings.push(`HTML artifact source was not readable for ${name}.`);
      }

      if (descriptor.restorePreview) {
        try {
          const refreshed = collectInteractiveArtifactDescriptors(container, expectedNames, candidates);
          const currentPreviewToggle = refreshed.find(item => item.name === name)?.previewToggle || currentDescriptor.previewToggle || descriptor.previewToggle;
          currentPreviewToggle?.click?.();
        } catch {}
      }
    }

    files.warnings = warnings;
    return files;
  }

  function extractHtmlCodeBlockFiles(markdownText, expectedNames = []) {
    if (!settings.saveHtmlCodeBlocks) return [];

    const files = [];
    const source = String(markdownText || "");
    const codeBlocks = source.matchAll(/(^|\n)(`{3,})([^\n`]*)\n([\s\S]*?)\n\2(?=\n|$)/g);
    let index = 0;

    for (const match of codeBlocks) {
      const lang = (match[3] || "").trim().toLowerCase();
      const code = (match[4] || "").trim();
      const looksLikeHtml = lang === "html" || /^\s*(?:<!doctype html>|<html\b)/i.test(code);
      if (!looksLikeHtml) continue;

      index += 1;
      const name = safeDownloadName(expectedNames[index - 1] || `html-code-block-${index}.html`);
      pushUniqueFile(files, { name, content: code, source: "html-code-block" });
      debugLog("captured HTML code block attachment", { name, bytes: code.length });
    }

    return files;
  }

  function pushUniqueFile(files, file) {
    if (!file?.content) return;
    const key = `${file.name}::${file.content.length}::${file.content.slice(0, 80)}`;
    if (files.some(existing => `${existing.name}::${existing.content.length}::${existing.content.slice(0, 80)}` === key)) {
      return;
    }
    files.push(file);
  }

  function htmlDocumentMetadata(content) {
    const source = String(content || "");
    const stripTags = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return {
      title: stripTags(source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
      heading: stripTags(source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1])
    };
  }

  function validateCapturedHtmlFiles(inputFiles) {
    const warnings = [];
    const byName = new Map();
    const ambiguousNames = new Set();

    for (const file of inputFiles || []) {
      if (!file?.content || !/\.html?$/i.test(file.name || "")) continue;
      const normalizedContent = String(file.content).replace(/\r\n?/g, "\n").trim();
      if (!/^\s*(?:<!doctype html>|<html\b)/i.test(normalizedContent) || !/<\/html>\s*$/i.test(normalizedContent)) {
        warnings.push(`Incomplete HTML was excluded: ${file.name}`);
        continue;
      }
      const key = String(file.name).toLowerCase();
      const existing = byName.get(key);
      if (existing && existing.content !== normalizedContent) {
        ambiguousNames.add(key);
        warnings.push(`Conflicting HTML sources claimed the same filename: ${file.name}`);
        continue;
      }
      if (!existing) {
        const metadata = htmlDocumentMetadata(normalizedContent);
        byName.set(key, { ...file, content: normalizedContent, metadata });
        debugLog("validated HTML identity", { name: file.name, title: metadata.title, heading: metadata.heading });
      }
    }

    ambiguousNames.forEach(key => byName.delete(key));
    const contentGroups = new Map();
    for (const file of byName.values()) {
      const group = contentGroups.get(file.content) || [];
      group.push(file);
      contentGroups.set(file.content, group);
    }

    const rejectedNames = new Set();
    for (const group of contentGroups.values()) {
      const names = Array.from(new Set(group.map(file => file.name)));
      if (names.length > 1) {
        names.forEach(name => rejectedNames.add(name.toLowerCase()));
        warnings.push(`Identical HTML content was mapped to different filenames and was excluded: ${names.join(", ")}`);
      }
    }

    return {
      files: Array.from(byName.values())
        .filter(file => !rejectedNames.has(file.name.toLowerCase()))
        .map(({ metadata, ...file }) => file),
      warnings
    };
  }

  function classifyExtensionRuntimeFailure(error, options = {}) {
    const message = String(error?.message || error || t("runtimeUnavailable")).trim() || t("runtimeUnavailable");
    const lower = message.toLowerCase();
    let kind = options.source || "runtime-error";
    if (options.source === "runtime-missing" || /runtime.*unavailable/.test(lower)) {
      kind = "runtime-missing";
    } else if (/extension context invalidated|context invalidated|extension has been reloaded/.test(lower)) {
      kind = "context-invalidated";
    } else if (/receiving end does not exist|could not establish connection|message port closed|port closed|no matching message handler/.test(lower)) {
      kind = "message-channel-unavailable";
    } else if (options.source === "runtime-last-error") {
      kind = "runtime-last-error";
    } else if (options.source === "send-exception") {
      kind = "runtime-send-exception";
    }
    return {
      ok: false,
      error: message,
      runtimeUnavailable: true,
      runtimeFailureKind: kind,
      phase: options.phase || ""
    };
  }

  function isExtensionRuntimeFailure(result) {
    return !!result?.runtimeUnavailable;
  }

  function checkExtensionRuntimeSynchronously(phase = "runtime-sync-check") {
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        return classifyExtensionRuntimeFailure(t("runtimeUnavailable"), {
          source: "runtime-missing",
          phase
        });
      }
      // A stale content script left behind by an unpacked-extension reload can
      // retain a chrome.runtime-shaped object while losing its extension ID.
      if (!globalThis.chrome.runtime.id) {
        return classifyExtensionRuntimeFailure("extension context invalidated", {
          source: "context-invalidated",
          phase
        });
      }
      return { ok: true, phase };
    } catch (error) {
      return classifyExtensionRuntimeFailure(error, {
        source: "context-invalidated",
        phase
      });
    }
  }

  function sendExtensionMessage(message, options = {}) {
    return new Promise(resolve => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve(classifyExtensionRuntimeFailure(t("runtimeUnavailable"), {
          source: "runtime-missing",
          phase: options.phase || message?.type || ""
        }));
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          let err = null;
          try { err = globalThis.chrome?.runtime?.lastError || null; } catch (error) { err = error; }
          if (err) {
            resolve(classifyExtensionRuntimeFailure(err, {
              source: "runtime-last-error",
              phase: options.phase || message?.type || ""
            }));
            return;
          }
          resolve(response || { ok: false, error: "empty extension response" });
        });
      } catch (error) {
        resolve(classifyExtensionRuntimeFailure(error, {
          source: "send-exception",
          phase: options.phase || message?.type || ""
        }));
      }
    });
  }

  async function pingExtensionRuntime(phase = "runtime-ping", options = {}) {
    const sender = options.sendMessage || sendExtensionMessage;
    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(1, options.timeoutMs)
      : RUNTIME_PING_TIMEOUT_MS;
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(classifyExtensionRuntimeFailure(`extension runtime ping timed out after ${timeoutMs}ms`, {
            source: "runtime-ping-timeout",
            phase
          }));
        }, timeoutMs);
        Promise.resolve(sender({ type: RUNTIME_PING_TYPE, phase }, { phase })).then(
          value => {
            clearTimeout(timer);
            resolve(value);
          },
          error => {
            clearTimeout(timer);
            reject(error);
          }
        );
      });
    } catch (error) {
      return classifyExtensionRuntimeFailure(error, { source: "send-exception", phase });
    }
    if (result?.ok && result?.pong === true) {
      if (result.version && result.version !== VERSION) {
        return classifyExtensionRuntimeFailure(
          `extension version changed from ${VERSION} to ${result.version}`,
          { source: "runtime-version-mismatch", phase }
        );
      }
      return { ok: true, pong: true, phase, backgroundVersion: result.version || "" };
    }
    if (isExtensionRuntimeFailure(result)) {
      return { ...result, phase: result.phase || phase };
    }
    return classifyExtensionRuntimeFailure(result?.error || "extension runtime ping failed", {
      source: "runtime-ping-failed",
      phase
    });
  }

  function createRuntimeGuard(options = {}) {
    const ping = options.ping || pingExtensionRuntime;
    const syncCheck = options.syncCheck || checkExtensionRuntimeSynchronously;
    const notifyUser = options.notifyUser || (() => alert(t("runtimeDisconnectedRefresh")));
    const listeners = new Set();
    let failure = null;
    let notified = false;
    let checkInFlight = null;

    const recordFailure = (result, phase = "") => {
      if (failure) return failure;
      const normalized = isExtensionRuntimeFailure(result)
        ? { ...result, phase: result.phase || phase }
        : classifyExtensionRuntimeFailure(result?.error || result || t("runtimeUnavailable"), {
          source: result?.runtimeFailureKind || "runtime-unavailable",
          phase
        });
      failure = normalized;
      artifactDebugLog("extension runtime unavailable", {
        phase: normalized.phase || phase,
        kind: normalized.runtimeFailureKind || "runtime-unavailable",
        error: normalized.error || t("runtimeUnavailable")
      });
      listeners.forEach(listener => {
        try { listener(normalized); } catch {}
      });
      return failure;
    };

    return {
      checkSync(phase = "runtime-sync-check") {
        if (failure) return failure;
        let result;
        try {
          result = syncCheck(phase);
        } catch (error) {
          result = classifyExtensionRuntimeFailure(error, { source: "runtime-check-exception", phase });
        }
        if (result?.ok) return result;
        return recordFailure(result, phase);
      },
      async check(phase = "runtime-check") {
        if (failure) return failure;
        const synchronous = this.checkSync(phase);
        if (!synchronous?.ok) return synchronous;
        if (!checkInFlight) {
          checkInFlight = (async () => {
            try {
              return await ping(phase);
            } catch (error) {
              return classifyExtensionRuntimeFailure(error, { source: "runtime-check-exception", phase });
            }
          })().finally(() => {
            checkInFlight = null;
          });
        }
        const result = await checkInFlight;
        if (failure) return failure;
        if (result?.ok) return result;
        return recordFailure(result, phase);
      },
      fail(result, phase = "runtime-check") {
        return recordFailure(result, phase);
      },
      isAborted() {
        return !!failure;
      },
      getFailure() {
        return failure;
      },
      onAbort(listener) {
        if (typeof listener !== "function") return () => {};
        listeners.add(listener);
        if (failure) {
          try { listener(failure); } catch {}
        }
        return () => listeners.delete(listener);
      },
      notify() {
        if (!failure || notified) return false;
        notified = true;
        notifyUser(failure);
        return true;
      }
    };
  }

  async function checkRuntimeGuard(runtimeGuard, phase) {
    if (!runtimeGuard?.check) return { ok: true, phase };
    return runtimeGuard.check(phase);
  }

  async function awaitWithRuntimeGuard(operation, runtimeGuard, phase, options = {}) {
    if (!runtimeGuard?.check) return operation;
    const intervalMs = Number.isFinite(options.intervalMs)
      ? Math.max(1, options.intervalMs)
      : RUNTIME_POLL_INTERVAL_MS;
    const tracked = Promise.resolve(operation).then(
      value => ({ settled: true, value }),
      error => ({ settled: true, error })
    );

    while (true) {
      const outcome = await Promise.race([
        tracked,
        sleep(intervalMs).then(() => null)
      ]);
      if (outcome?.settled) {
        if (outcome.error) throw outcome.error;
        return outcome.value;
      }
      const runtimeStatus = await checkRuntimeGuard(runtimeGuard, phase);
      if (!runtimeStatus?.ok) {
        try { await options.onRuntimeFailure?.(runtimeStatus); } catch {}
        return runtimeStatus;
      }
    }
  }

  function htmlExpectedNamesForCandidate(candidate, expectedNames = []) {
    const names = [];
    const addName = (value) => {
      const name = safeDownloadName(value);
      if (/\.html?$/i.test(name) && !names.includes(name)) names.push(name);
    };

    if (candidate?.name) addName(candidate.name);
    expectedNames.forEach(addName);
    return names;
  }

  async function beginHtmlDownloadWatch(expectedNames) {
    return sendExtensionMessage({
      type: "begin-html-download-watch",
      expectedNames,
      startedAt: Date.now()
    }, { phase: "html-download-watch-start" });
  }

  async function awaitHtmlDownloadWatch(watchId) {
    return sendExtensionMessage({
      type: "await-html-download-watch",
      watchId
    }, { phase: "html-download-watch-await" });
  }

  async function cancelHtmlDownloadWatch(watchId) {
    if (!watchId) return { ok: true };
    return sendExtensionMessage({
      type: "cancel-html-download-watch",
      watchId
    }, { phase: "html-download-watch-cancel" });
  }

  async function captureDownloadedHtmlFallback(fallbackCandidates, expectedNames = [], options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const candidate = fallbackCandidates
      .filter(canClickDownloadCandidate)
      .filter(item => isExactDownloadControl(item.node) || hasDownloadAttribute(item.node))
      .sort((a, b) => downloadCandidateClickPriority(b) - downloadCandidateClickPriority(a))[0];
    const downloadedFiles = [];
    const failures = [];
    let clickedFallback = 0;

    if (!candidate) {
      return { downloadedFiles, clickedFallback, failures };
    }

    const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "html-download-watch-start");
    if (!runtimeStatus?.ok) {
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: runtimeStatus
      };
    }

    const watchNames = htmlExpectedNamesForCandidate(candidate, expectedNames);
    const watch = await awaitWithRuntimeGuard(
      beginHtmlDownloadWatch(watchNames),
      runtimeGuard,
      "html-download-watch-start",
      { intervalMs: options.runtimePollIntervalMs }
    );
    if (isExtensionRuntimeFailure(watch)) {
      runtimeGuard?.fail?.(watch, "html-download-watch-start");
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: runtimeGuard?.getFailure?.() || watch
      };
    }
    let watchId = watch?.watchId || "";

    if (!watch?.ok || !watchId) {
      failures.push({ name: candidate.name, reason: watch?.error || "download watch failed to start" });
      watchId = "";
    }

    if (!watchId) {
      return { downloadedFiles, clickedFallback, failures };
    }

    const beforePrompt = await checkRuntimeGuard(runtimeGuard, "html-download-prompt");
    if (!beforePrompt?.ok) {
      try { await cancelHtmlDownloadWatch(watchId); } catch {}
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: beforePrompt
      };
    }

    const restore = revealDownloadCandidate(candidate);
    alert(t("htmlDownloadActionRequired"));
    try { candidate.node?.focus?.({ preventScroll: true }); } catch {}
    clickedFallback++;
    debugLog("waiting for user HTML download fallback", {
      name: candidate.name,
      watchId,
      priority: downloadCandidateClickPriority(candidate)
    });

    let result;
    try {
      result = await awaitWithRuntimeGuard(
        awaitHtmlDownloadWatch(watchId),
        runtimeGuard,
        "html-download-watch-wait",
        { onRuntimeFailure: () => cancelHtmlDownloadWatch(watchId) }
      );
    } finally {
      restore();
    }
    if (isExtensionRuntimeFailure(result)) {
      runtimeGuard?.fail?.(result, "html-download-watch-wait");
      return {
        downloadedFiles,
        clickedFallback,
        failures,
        runtimeUnavailable: true,
        runtimeFailure: runtimeGuard?.getFailure?.() || result
      };
    }
    if (result?.ok && result.download) {
      const download = result.download;
      downloadedFiles.push({
        name: safeDownloadName(download.name || candidate.name),
        sourcePath: download.sourcePath,
        downloadId: download.id,
        startTime: download.startTime,
        endTime: download.endTime
      });
      debugLog("captured Chrome downloads fallback", {
        name: download.name,
        sourcePath: download.sourcePath,
        downloadId: download.id
      });
    } else {
      failures.push({ name: candidate.name, reason: result?.error || "download watch did not capture HTML file" });
    }

    return { downloadedFiles, clickedFallback, failures };
  }

  async function extractDownloadFiles(btn, expectedNames = [], answerText = "", options = {}) {
    const runtimeGuard = options.runtimeGuard || null;
    const runtimeStatus = await checkRuntimeGuard(runtimeGuard, "html-artifact-start");
    if (!runtimeStatus?.ok) {
      return {
        files: [],
        downloadedFiles: [],
        candidatesCount: 0,
        clickedFallback: 0,
        failures: [],
        warnings: [],
        runtimeUnavailable: true,
        runtimeFailure: runtimeStatus
      };
    }
    const container = closestArtifactContainer(btn);
    await revealCollapsedGeneratedArtifacts(container);
    const candidates = getDownloadCandidates(container, expectedNames);
    const files = [];
    const downloadedFiles = [];
    const failures = [];
    const warnings = [];
    const fallbackCandidates = [];
    let clickedFallback = 0;

    debugLog("download candidates found", { count: candidates.length });

    for (const candidate of candidates) {
      debugLog("download candidate", {
        name: candidate.name,
        scheme: hrefScheme(candidate.href),
        href: candidate.href ? candidate.href.slice(0, 120) : ""
      });

      try {
        const file = await readDownloadCandidate(candidate);
        pushUniqueFile(files, file);
        debugLog("download content extraction succeeded", { name: file.name, bytes: file.content.length });
      } catch (error) {
        const reason = error?.message || String(error);
        failures.push({ name: candidate.name, scheme: hrefScheme(candidate.href), reason });
        debugLog("download content extraction failed", { name: candidate.name, scheme: hrefScheme(candidate.href), reason });
        if (canClickDownloadCandidate(candidate)) {
          fallbackCandidates.push(candidate);
        }
      }
    }

    for (const previewFile of await readHtmlPreviews(container, expectedNames, candidates)) {
      pushUniqueFile(files, previewFile);
    }

    const interactiveFiles = await readInteractiveHtmlArtifacts(container, expectedNames, candidates);
    warnings.push(...(interactiveFiles.warnings || []));
    for (const artifactFile of interactiveFiles) {
      pushUniqueFile(files, artifactFile);
    }

    for (const codeBlockFile of extractHtmlCodeBlockFiles(answerText, expectedNames)) {
      pushUniqueFile(files, codeBlockFile);
    }

    const validated = validateCapturedHtmlFiles(files);
    warnings.push(...validated.warnings);
    const safeFiles = validated.files;

    if (files.length === 0 && safeFiles.length === 0) {
      const fallback = await captureDownloadedHtmlFallback(fallbackCandidates, expectedNames, {
        runtimeGuard,
        runtimePollIntervalMs: options.runtimePollIntervalMs
      });
      if (fallback.runtimeUnavailable) {
        return {
          files: safeFiles,
          downloadedFiles,
          candidatesCount: candidates.length,
          clickedFallback,
          failures,
          warnings,
          runtimeUnavailable: true,
          runtimeFailure: fallback.runtimeFailure || runtimeGuard?.getFailure?.() || null
        };
      }
      downloadedFiles.push(...fallback.downloadedFiles);
      clickedFallback += fallback.clickedFallback;
      failures.push(...fallback.failures);
    }

    const actualHtmlRows = collectArtifactFileRows(container, ["html", "htm"]);
    const capturedNames = new Set([
      ...safeFiles.map(file => file.name.toLowerCase()),
      ...downloadedFiles.map(file => file.name.toLowerCase())
    ]);
    const missingRows = Array.from(new Set(actualHtmlRows.map(row => row.name)))
      .filter(name => !capturedNames.has(name.toLowerCase()));
    if (missingRows.length) {
      warnings.push(`HTML file cards without safely captured content: ${missingRows.join(", ")}`);
    }

    debugLog("attachment extraction result", {
      attachmentsLength: safeFiles.length,
      downloadedAttachmentsLength: downloadedFiles.length,
      candidatesCount: candidates.length,
      clickedFallback,
      failures,
      warnings
    });

    return {
      files: safeFiles,
      downloadedFiles,
      candidatesCount: candidates.length,
      clickedFallback,
      failures,
      warnings
    };
  }

  function convertGeneratedHtmlToMarkdown(text) {
    if (!text) return "";

    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
    const candidate = (fenced ? fenced[1] : trimmed).trim();
    const looksLikeHtml = /^<\s*(?:article|aside|blockquote|body|div|h[1-6]|html|main|ol|p|section|table|ul)\b/i.test(candidate);

    if (!looksLikeHtml) return text;

    const converted = htmlToMarkdown(candidate);
    return converted && converted.length > 10 ? converted : text;
  }

  function cleanAnswerText(text) {
    if (!text) return "";
    const lines = text.split(/\r?\n/).filter(l => !/^obsidian:\/\/\S+/i.test(l.trim()));
    return lines.join("\n").trim();
  }

  function removeInternalAttachmentMarkers(text) {
    return String(text || "").replace(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g, "GPT_OBSIDIAN_ATTACHMENTS").trim();
  }

  function cleanQuestionText(text) {
    if (!text) return "";
    return text
      .replace(/\s*더 보기\s*간단히\s*$/g, "")
      .replace(/\s*더 보기\s*$/g, "")
      .trim();
  }

  function findPrevUserMessageText(fromEl) {
    const selected = getUserSelection();
    if (selected) return cleanQuestionText(selected);
    const nodes = getAllMessageNodes();
    const container = closestMessageContainer(fromEl);
    const idx = findMessageNodeIndex(nodes, container);
    for (let i = idx - 1; i >= 0; i--) {
      const el = nodes[i];
      if (getMessageRole(el) === "user") {
        return cleanQuestionText(messageNodeToPlainText(el));
      }
    }
    return "";
  }

  async function readClipboardSafe() {
    try { return await navigator.clipboard.readText(); } catch { return ""; }
  }

  async function handleCopyClick(btn, { preferClipboard = false, delayMs = 80 } = {}) {
    const run = async () => {
      if (!isCurrentGeneration()) return;
      const runtimeGuard = createRuntimeGuard();
      const runtimeSyncStatus = runtimeGuard.checkSync("save-start");
      if (!runtimeSyncStatus?.ok) {
        runtimeGuard.notify();
        return;
      }
      // Start the real background ping immediately, but do not await it before
      // the generated-file card receives the originating user click. Every
      // download/native boundary below awaits this same in-flight preflight.
      void runtimeGuard.check("save-start");
      let answerText = preferClipboard ? await readClipboardSafe() : "";
      // If clipboard is just an Obsidian test URI, prefer DOM extraction.
      if (answerText && /^obsidian:\/\/\S+/i.test(answerText.trim())) {
        answerText = "";
      }
      // Prefer HTML→Markdown conversion to preserve structure
      answerText = htmlOrClipboardToMarkdown(btn, answerText, preferClipboard);
      if (!answerText || answerText.length < 3) {
        // final fallback: plain text from DOM
        const container = closestMessageContainer(btn);
        const clone = container?.cloneNode(true);
        clone?.querySelectorAll('button, nav, menu').forEach(n=>n.remove());
        answerText = clone?.innerText?.trim() || "";
      }
      answerText = convertGeneratedHtmlToMarkdown(answerText);
      answerText = repairFencedCodeBlocks(answerText);
      const questionText = findPrevUserMessageText(btn);
      answerText = cleanAnswerText(answerText);
      answerText = stripChatGptFooterLines(answerText);
      const preSaveKey = `${location.href}::${answerText.length}::${questionText.slice(0, 120)}`;
      if (state.activeSaves.has(preSaveKey)) return;
      if (isDuplicateContentSave(preSaveKey)) return;
      state.activeSaves.add(preSaveKey);
      try {
      const currentAssistantNode = closestMessageContainer(btn);
      const artifactContainer = closestArtifactContainer(btn) || currentAssistantNode;
      const generatedMarkdown = await extractGeneratedMarkdownArtifact(artifactContainer, { runtimeGuard });
      if (generatedMarkdown.runtimeUnavailable || runtimeGuard.isAborted()) {
        runtimeGuard.fail(generatedMarkdown.runtimeFailure || runtimeGuard.getFailure(), "markdown-artifact");
        runtimeGuard.notify();
        return;
      }
      const hintedAttachmentNames = filenamesFromText(answerText);
      const extraction = await extractDownloadFiles(btn, hintedAttachmentNames, answerText, { runtimeGuard });
      if (extraction.runtimeUnavailable || runtimeGuard.isAborted()) {
        runtimeGuard.fail(extraction.runtimeFailure || runtimeGuard.getFailure(), "html-artifact");
        runtimeGuard.notify();
        return;
      }
      const attachments = extraction.files;
      const downloadedAttachments = extraction.downloadedFiles;
      const attachmentNames = [];
      const hasRealHtmlAttachment = attachments.length > 0 || downloadedAttachments.length > 0;
      const downloadedMarkdown = generatedMarkdown.downloadedMarkdown || null;
      const hasDetailedMarkdown = !!generatedMarkdown.markdown || !!downloadedMarkdown;
      const extractionWarnings = Array.from(new Set([
        ...(generatedMarkdown.warnings || []),
        ...(extraction.warnings || [])
      ].filter(Boolean)));
      if (!hasRealHtmlAttachment && extraction.clickedFallback > 0) {
        alert(t("htmlArtifactCaptureFailedWarning"));
      }
      if (extractionWarnings.length) {
        alert(t("generatedArtifactWarningPrefix") + extractionWarnings.join("\n"));
      }
      const previousQa = (settings.usePreviousQaForHtml && hasRealHtmlAttachment)
        ? findPreviousQaPair(currentAssistantNode)
        : null;
      const useOriginalQaHeadings = !!previousQa;
      let noteQuestionText = previousQa?.questionText || questionText;
      let noteAnswerText = previousQa?.answerText || answerText;
      if (hasRealHtmlAttachment) {
        noteQuestionText = removeInternalAttachmentMarkers(noteQuestionText);
        noteAnswerText = removeInternalAttachmentMarkers(noteAnswerText);
      }
      const title = makeTitle(noteQuestionText || noteAnswerText);
      const filePath = buildFilePath(title);
      const attachmentMarker = hasRealHtmlAttachment ? "%%GPT_OBSIDIAN_ATTACHMENTS%%" : "";
      const baseMd = hasRealHtmlAttachment
        ? buildHtmlLearningMarkdown({
          title,
          questionText: noteQuestionText,
          answerText: noteAnswerText,
          url: location.href,
          attachmentMarker,
          useOriginalHeadings: useOriginalQaHeadings
        })
        : buildMarkdown({title, questionText: noteQuestionText, answerText: noteAnswerText, url: location.href, attachmentMarker: ""});
      const md = generatedMarkdown.markdown
        ? mergeDetailedMarkdownSection(baseMd, generatedMarkdown.markdown)
        : downloadedMarkdown
          ? mergeDownloadedDetailedMarkdownMarker(baseMd)
          : baseMd;
      const fallbackBaseMd = hasRealHtmlAttachment
        ? buildHtmlLearningMarkdown({
          title,
          questionText: noteQuestionText,
          answerText: noteAnswerText,
          url: location.href,
          attachmentMarker: "",
          useOriginalHeadings: useOriginalQaHeadings
        })
        : md;
      const fallbackMd = generatedMarkdown.markdown
        ? mergeDetailedMarkdownSection(fallbackBaseMd, generatedMarkdown.markdown)
        : fallbackBaseMd;
      const uri = buildObsidianURI({vault: settings.vaultName, file: filePath, content: fallbackMd});
      const requiresNativeSave = hasRealHtmlAttachment || hasDetailedMarkdown;
      debugLog("save mode", {
        mode: requiresNativeSave ? "native" : "uri",
        attachmentsLength: attachments.length,
        downloadedAttachmentsLength: downloadedAttachments.length,
        generatedMarkdownName: generatedMarkdown.name,
        generatedMarkdownLength: generatedMarkdown.markdown.length,
        downloadedMarkdownName: downloadedMarkdown?.name || "",
        usePreviousQaForHtml: !!settings.usePreviousQaForHtml,
        usedPreviousQaNote: useOriginalQaHeadings,
        usedHtmlLearningLayout: hasRealHtmlAttachment,
        candidatesCount: extraction.candidatesCount,
        failures: extraction.failures,
        warnings: extractionWarnings
      });
      if (requiresNativeSave) {
        await saveObsidianNote({
          vaultName: settings.vaultName,
          vaultPath: settings.vaultPath,
          filePath,
          content: md,
          attachments,
          downloadedAttachments,
          downloadedMarkdown,
          attachmentNames,
          htmlSaveDir: settings.htmlSaveDir,
          fallbackUri: hasDetailedMarkdown ? "" : uri
        }, { runtimeGuard });
      } else {
        openObsidianURI(uri);
      }
      } finally {
        state.activeSaves.delete(preSaveKey);
      }
    };

    if (delayMs > 0) {
      return new Promise(resolve => {
        setTimeout(() => resolve(run()), delayMs);
      });
    }
    return run();
  }

  function injectOwnButtons() {
    const msgs = getAllMessageNodes().filter(message => getMessageRole(message) === "assistant");
    msgs.forEach(m => {
      const existing = m.querySelector('.gpt2obs-btn');
      if (existing?.dataset?.gpt2obsVersion === VERSION) {
        if (existing.dataset.gpt2obsBusy !== "true") {
          existing.textContent = t("saveButton");
        }
        return;
      }
      if (existing) existing.remove();
      const toolbarHost = m.querySelector('header, footer, [role="toolbar"]') || m;
      const btn = document.createElement('button');
      btn.textContent = t("saveButton");
      btn.className = "gpt2obs-btn";
      btn.dataset.gpt2obsVersion = VERSION;
      btn.style.cssText = "margin-left:8px;padding:4px 8px;border:1px solid #888;border-radius:6px;background:#f6f6f6;cursor:pointer;font-size:12px;";
      btn.addEventListener('click', () => {
        if (btn.dataset.gpt2obsBusy === "true") return;
        btn.dataset.gpt2obsBusy = "true";
        btn.disabled = true;
        btn.textContent = t("savingButton");
        Promise.resolve(handleCopyClick(btn, {
          preferClipboard: false,
          delayMs: 0
        })).catch(error => {
          console.warn("Failed to save ChatGPT response.", error);
        }).finally(() => {
          if (!btn.isConnected) return;
          btn.dataset.gpt2obsBusy = "false";
          btn.disabled = false;
          btn.textContent = t("saveButton");
        });
      });
      toolbarHost.appendChild(btn);
    });
  }

  function watchAssistantMessages() {
    const attach = (root=document) => {
      injectOwnButtons();
    };
    const mo = new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(n => {
            if (n.nodeType === 1) attach(n);
          });
        }
      });
    });
    mo.observe(document.documentElement, {childList:true, subtree:true});
    attach();
  }

  if (globalThis.__GPT_OBSIDIAN_ENABLE_TEST_HOOKS__) {
    globalThis.__GPT_OBSIDIAN_TEST_HOOKS__ = {
      VERSION,
      getMessageRole,
      closestArtifactContainer,
      findPreviousMessageByRole,
      findPreviousQaPair,
      buildMarkdown,
      buildHtmlLearningMarkdown,
      makeTitle,
      cleanQuestionText,
      cleanAnswerText,
      decodePercentEncodedRuns,
      filenameFromArtifactText,
      filenamesFromArtifactText,
      filenameFromText,
      elementVisibilityDetails,
      choosePreferredArtifactRow,
      resolveArtifactFileRow,
      collectArtifactFileRows,
      revealCollapsedGeneratedArtifacts,
      selectGeneratedMarkdownArtifact,
      generatedMarkdownRegionRoot,
      generatedMarkdownRegionsEquivalent,
      collapseEquivalentGeneratedMarkdownRegions,
      collectGeneratedMarkdownRegions,
      captureGeneratedMarkdownRegionSnapshot,
      markdownCandidatesFromGeneratedRegion,
      findGeneratedMarkdownRegionCandidate,
      waitForGeneratedMarkdownRegion,
      clickArtifactControl,
      startGeneratedMarkdownDownloadCapture,
      readGeneratedMarkdownArtifactRow,
      extractGeneratedMarkdownArtifact,
      normalizeMarkdownForComparison,
      mergeDetailedMarkdownSection,
      mergeDownloadedDetailedMarkdownMarker,
      hasNearbyArtifactViewer,
      isLikelyInteractiveHtmlFileCard,
      isExactDownloadControl,
      downloadCandidateClickPriority,
      getDownloadCandidates,
      findUserActivatedDownloadCandidate,
      extractCompleteHtmlSource,
      findScopedArtifactFilename,
      collectInteractiveArtifactDescriptors,
      hasInteractiveHtmlArtifactCandidate,
      readInteractiveHtmlArtifacts,
      validateCapturedHtmlFiles,
      extractDownloadFiles,
      classifyExtensionRuntimeFailure,
      isExtensionRuntimeFailure,
      checkExtensionRuntimeSynchronously,
      sendExtensionMessage,
      pingExtensionRuntime,
      createRuntimeGuard,
      checkRuntimeGuard,
      awaitWithRuntimeGuard,
      saveObsidianNote,
      openObsidianURIDirectly,
      handleCopyClick,
      setTestLanguage(language) {
        settings.uiLanguage = normalizeLanguage(language);
      }
    };
  }

  watchAssistantMessages();
})();
