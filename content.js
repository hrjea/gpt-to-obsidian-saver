
// content.js (1.5.20) — HTML→Markdown conversion for Obsidian-friendly content
(function() {
  const VERSION = "1.5.20";
  const STATE_KEY = "__gptToObsidianSaverState";
  const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {});
  state.generation = (state.generation || 0) + 1;
  state.recentSaves = state.recentSaves || new Map();
  const generation = state.generation;
  const DEBUG = false;

  const SUPPORTED_LANGUAGES = ["en", "ko"];
  const DEFAULT_LANGUAGE = "en";
  const I18N = {
    en: {
      saveButton: "Save to Obsidian",
      untitledQuestion: "Untitled question",
      summaryTitle: "Summary title",
      questionHeading: "Question",
      answerHeading: "Answer",
      attachmentsHeading: "Attachments",
      htmlLearningHeading: "HTML Learning Material",
      originalQuestionHeading: "Original Question",
      originalAnswerHeading: "Original Answer",
      nativeSaveFailedPrefix: "Native helper save failed: ",
      nativeSaveFailedSuffix: "\nThe Markdown note was opened through URI mode, but HTML attachments may not have been saved.",
      htmlDownloadNotAttachedWarning: "HTML file was downloaded by Chrome, but the extension could not attach it to the Obsidian note.",
      htmlDownloadCopyFailedWarning: "HTML file was downloaded by Chrome, but could not be copied into the Obsidian vault.",
      htmlAttachmentSavedLine: "HTML file saved as attachment.",
      runtimeUnavailable: "extension runtime unavailable"
    },
    ko: {
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
      nativeSaveFailedSuffix: "\nMarkdown 노트는 URI mode로 다시 열었지만, HTML 첨부파일은 저장되지 않았을 수 있습니다.",
      htmlDownloadNotAttachedWarning: "HTML 파일이 Chrome으로 다운로드되었지만, 확장 프로그램이 Obsidian 노트에 첨부하지 못했습니다.",
      htmlDownloadCopyFailedWarning: "HTML 파일이 Chrome으로 다운로드되었지만, Obsidian vault로 복사하지 못했습니다.",
      htmlAttachmentSavedLine: "HTML 파일은 첨부파일로 저장되었습니다.",
      runtimeUnavailable: "extension runtime을 사용할 수 없습니다"
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
      button.textContent = t("saveButton");
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
      `## ${t("questionHeading")}`,
      "",
      questionText || "",
      "",
      `## ${t("answerHeading")}`,
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
      `## ${t("htmlLearningHeading")}`,
      "",
      attachmentMarker || "",
      "",
      `## ${questionHeading}`,
      "",
      questionText || "",
      "",
      `## ${answerHeading}`,
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

  function saveObsidianNote({vaultName, vaultPath, filePath, content, attachments, downloadedAttachments, attachmentNames, htmlSaveDir, fallbackUri}) {
    const fallbackToUri = (message) => {
      if (fallbackUri) openObsidianURIDirectly(fallbackUri);
      const hasDownloadedAttachment = Array.isArray(downloadedAttachments) && downloadedAttachments.length > 0;
      const prefix = hasDownloadedAttachment
        ? `${t("htmlDownloadCopyFailedWarning")}\n${t("nativeSaveFailedPrefix")}`
        : t("nativeSaveFailedPrefix");
      alert(prefix + message + t("nativeSaveFailedSuffix"));
    };

    if (globalThis.chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: "save-obsidian-note",
          payload: { vaultName, vaultPath, filePath, content, attachments, downloadedAttachments, attachmentNames, htmlSaveDir, fallbackUri, htmlCodeBlockReplacementText: t("htmlAttachmentSavedLine") }
        }, (response) => {
          const err = globalThis.chrome?.runtime?.lastError;
          if (err || !response?.ok) {
            const message = err?.message || response?.error || "unknown";
            console.warn("Failed to save Obsidian note through native helper.", message);
            fallbackToUri(message);
          }
        });
        return;
      } catch (error) {
        console.warn("Failed to message native save helper.", error);
        fallbackToUri(error?.message || String(error));
        return;
      }
    }

    fallbackToUri(t("runtimeUnavailable"));
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

  function filenameFromText(text) {
    const m = String(text || "").match(/([A-Za-z0-9가-힣][A-Za-z0-9가-힣._ ()-]{0,180}\.html?)/i);
    return m ? m[1].trim() : "";
  }

  function filenamesFromText(text) {
    const names = new Set();
    const matches = String(text || "").matchAll(/([A-Za-z0-9가-힣][A-Za-z0-9가-힣._ ()-]{0,180}\.html?)/gi);
    for (const match of matches) {
      names.add(safeDownloadName(match[1].trim()));
    }
    return Array.from(names);
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

  function isPlainExternalAnchor(node, href) {
    if (!node?.matches?.("a[href]")) return false;
    if (hasDownloadAttribute(node) || isBlobOrSandboxHref(href)) return false;
    try {
      const url = new URL(href, location.href);
      return /^https?:$/i.test(url.protocol) && url.origin !== location.origin;
    } catch {
      return false;
    }
  }

  function canClickDownloadCandidate(candidate) {
    const node = candidate?.node;
    if (!node) return false;
    if (hasDownloadAttribute(node) || isBlobOrSandboxHref(candidate.href)) return true;
    if (isPlainExternalAnchor(node, candidate.href)) return false;
    return !node.matches?.("a[href]");
  }

  function getDownloadCandidates(container, expectedNames = []) {
    if (!container) return [];

    const nodes = Array.from(container.querySelectorAll([
      "a[href]",
      "a[download]",
      "button",
      "[role='button']",
      "[data-testid*='download']",
      "[aria-label*='download' i]",
      "[title*='download' i]"
    ].join(",")));

    const seen = new Set();
    const candidates = [];
    nodes.forEach(node => {
      const href = findDownloadHref(node);
      const name = safeDownloadName(findNearbyFilename(node) || filenameFromUrl(href) || expectedNames[0]);
      const marker = `${href} ${node.innerText || ""} ${node.getAttribute?.("aria-label") || ""} ${node.getAttribute?.("title") || ""} ${node.getAttribute?.("data-testid") || ""}`;
      const htmlMarker = `${name} ${marker}`;
      const looksLikeHtml = /\.html?(?:$|[?#\s])/i.test(htmlMarker);
      const looksLikeDownload = /download|다운로드|artifact|attachment|첨부/i.test(marker) || hasDownloadAttribute(node) || isBlobOrSandboxHref(href);
      if (!looksLikeDownload) return;
      if (!looksLikeHtml && !expectedNames.length) return;
      if (isPlainExternalAnchor(node, href)) return;

      const key = `${href || "nohref"}::${name}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ name, href, node });
    });

    return candidates;
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
    if (text.length > 700000) throw new Error("downloaded file is too large for native messaging");

    return {
      name: candidate.name,
      content: text
    };
  }

  async function readHtmlPreviews(container) {
    const files = [];
    if (!container) return files;

    const frames = Array.from(container.querySelectorAll("iframe"));
    for (const frame of frames) {
      const name = safeDownloadName(findNearbyFilename(frame) || "chatgpt-preview.html");
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

      if (content && /<html\b|<!doctype html/i.test(content) && content.length <= 700000) {
        debugLog("captured HTML preview frame", { name, bytes: content.length, scheme: hrefScheme(frame.src) });
        files.push({ name, content });
      }
    }

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
      const name = safeDownloadName(expectedNames[index - 1] || expectedNames[0] || `html-code-block-${index}.html`);
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

  function sendExtensionMessage(message) {
    return new Promise(resolve => {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        resolve({ ok: false, error: t("runtimeUnavailable") });
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          const err = globalThis.chrome?.runtime?.lastError;
          if (err) {
            resolve({ ok: false, error: err.message || String(err) });
            return;
          }
          resolve(response || { ok: false, error: "empty extension response" });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
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
    });
  }

  async function awaitHtmlDownloadWatch(watchId) {
    return sendExtensionMessage({
      type: "await-html-download-watch",
      watchId
    });
  }

  async function cancelHtmlDownloadWatch(watchId) {
    if (!watchId) return;
    await sendExtensionMessage({
      type: "cancel-html-download-watch",
      watchId
    });
  }

  async function captureDownloadedHtmlFallback(fallbackCandidates, expectedNames = []) {
    const candidate = fallbackCandidates.find(canClickDownloadCandidate);
    const downloadedFiles = [];
    const failures = [];
    let clickedFallback = 0;

    if (!candidate) {
      return { downloadedFiles, clickedFallback, failures };
    }

    const watchNames = htmlExpectedNamesForCandidate(candidate, expectedNames);
    const watch = await beginHtmlDownloadWatch(watchNames);
    let watchId = watch?.watchId || "";

    if (!watch?.ok || !watchId) {
      failures.push({ name: candidate.name, reason: watch?.error || "download watch failed to start" });
      watchId = "";
    }

    try {
      candidate.node?.click?.();
      clickedFallback++;
      debugLog("clicked HTML download fallback candidate", { name: candidate.name, watchId });
    } catch (error) {
      failures.push({ name: candidate.name, reason: error?.message || String(error) });
      await cancelHtmlDownloadWatch(watchId);
      return { downloadedFiles, clickedFallback, failures };
    }

    if (!watchId) {
      return { downloadedFiles, clickedFallback, failures };
    }

    const result = await awaitHtmlDownloadWatch(watchId);
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

  async function extractDownloadFiles(btn, expectedNames = [], answerText = "") {
    const container = closestMessageContainer(btn);
    const candidates = getDownloadCandidates(container, expectedNames);
    const files = [];
    const downloadedFiles = [];
    const failures = [];
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

    for (const previewFile of await readHtmlPreviews(container)) {
      pushUniqueFile(files, previewFile);
    }

    for (const codeBlockFile of extractHtmlCodeBlockFiles(answerText, expectedNames)) {
      pushUniqueFile(files, codeBlockFile);
    }

    if (files.length === 0) {
      const fallback = await captureDownloadedHtmlFallback(fallbackCandidates, expectedNames);
      downloadedFiles.push(...fallback.downloadedFiles);
      clickedFallback += fallback.clickedFallback;
      failures.push(...fallback.failures);
    }

    debugLog("attachment extraction result", {
      attachmentsLength: files.length,
      downloadedAttachmentsLength: downloadedFiles.length,
      candidatesCount: candidates.length,
      clickedFallback,
      failures
    });

    return {
      files,
      downloadedFiles,
      candidatesCount: candidates.length,
      clickedFallback,
      failures
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
      if (isDuplicateContentSave(preSaveKey)) return;
      const hintedAttachmentNames = filenamesFromText(answerText);
      const extraction = await extractDownloadFiles(btn, hintedAttachmentNames, answerText);
      const attachments = extraction.files;
      const downloadedAttachments = extraction.downloadedFiles;
      const attachmentNames = [];
      const hasRealHtmlAttachment = attachments.length > 0 || downloadedAttachments.length > 0;
      if (!hasRealHtmlAttachment && extraction.clickedFallback > 0) {
        alert(t("htmlDownloadCopyFailedWarning"));
      }
      const currentAssistantNode = closestMessageContainer(btn);
      const previousQa = (settings.usePreviousQaForHtml && hasRealHtmlAttachment)
        ? findPreviousQaPair(currentAssistantNode)
        : null;
      const useOriginalQaHeadings = !!previousQa;
      let noteQuestionText = previousQa?.questionText || questionText;
      let noteAnswerText = previousQa?.answerText || answerText;
      if (useOriginalQaHeadings) {
        noteQuestionText = removeInternalAttachmentMarkers(noteQuestionText);
        noteAnswerText = removeInternalAttachmentMarkers(noteAnswerText);
      }
      const title = makeTitle(noteQuestionText || noteAnswerText);
      const filePath = buildFilePath(title);
      const attachmentMarker = hasRealHtmlAttachment ? "%%GPT_OBSIDIAN_ATTACHMENTS%%" : "";
      const md = hasRealHtmlAttachment
        ? buildHtmlLearningMarkdown({
          title,
          questionText: noteQuestionText,
          answerText: noteAnswerText,
          url: location.href,
          attachmentMarker,
          useOriginalHeadings: useOriginalQaHeadings
        })
        : buildMarkdown({title, questionText: noteQuestionText, answerText: noteAnswerText, url: location.href, attachmentMarker: ""});
      const fallbackMd = hasRealHtmlAttachment
        ? buildHtmlLearningMarkdown({
          title,
          questionText: noteQuestionText,
          answerText: noteAnswerText,
          url: location.href,
          attachmentMarker: "",
          useOriginalHeadings: useOriginalQaHeadings
        })
        : md;
      const uri = buildObsidianURI({vault: settings.vaultName, file: filePath, content: fallbackMd});
      debugLog("save mode", {
        mode: hasRealHtmlAttachment ? "native" : "uri",
        attachmentsLength: attachments.length,
        downloadedAttachmentsLength: downloadedAttachments.length,
        usePreviousQaForHtml: !!settings.usePreviousQaForHtml,
        usedPreviousQaNote: useOriginalQaHeadings,
        usedHtmlLearningLayout: hasRealHtmlAttachment,
        candidatesCount: extraction.candidatesCount,
        failures: extraction.failures
      });
      if (hasRealHtmlAttachment) {
        saveObsidianNote({
          vaultName: settings.vaultName,
          vaultPath: settings.vaultPath,
          filePath,
          content: md,
          attachments,
          downloadedAttachments,
          attachmentNames,
          htmlSaveDir: settings.htmlSaveDir,
          fallbackUri: uri
        });
      } else {
        openObsidianURI(uri);
      }
    };

    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      run();
    }
  }

  function injectOwnButtons() {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"], article');
    msgs.forEach(m => {
      const existing = m.querySelector('.gpt2obs-btn');
      if (existing?.dataset?.gpt2obsVersion === VERSION) {
        existing.textContent = t("saveButton");
        return;
      }
      if (existing) existing.remove();
      const toolbarHost = m.querySelector('header, footer, [role="toolbar"]') || m;
      const btn = document.createElement('button');
      btn.textContent = t("saveButton");
      btn.className = "gpt2obs-btn";
      btn.dataset.gpt2obsVersion = VERSION;
      btn.style.cssText = "margin-left:8px;padding:4px 8px;border:1px solid #888;border-radius:6px;background:#f6f6f6;cursor:pointer;font-size:12px;";
      btn.addEventListener('click', () => handleCopyClick(btn, { preferClipboard: false, delayMs: 0 }));
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
      findPreviousMessageByRole,
      findPreviousQaPair,
      buildMarkdown,
      buildHtmlLearningMarkdown,
      makeTitle,
      cleanQuestionText,
      cleanAnswerText,
      setTestLanguage(language) {
        settings.uiLanguage = normalizeLanguage(language);
      }
    };
  }

  watchAssistantMessages();
})();
