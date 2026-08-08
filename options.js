// options.js
const $ = (id) => document.getElementById(id);
const BUILD_VERSION = "1.5.30";
const CONTENT_SCRIPT_VERSION = "1.5.30";
const SUPPORTED_LANGUAGES = ["en", "ko"];
const DEFAULT_LANGUAGE = "en";
const I18N = {
  en: {
    pageTitle: "GPT → Obsidian Saver Settings",
    uiLanguageLabel: "Language",
    uiLanguageHint: "English is the default. Choose Korean to use the previous Korean UI.",
    vaultNameLabel: "Obsidian Vault name",
    vaultNamePlaceholder: "Example: MyVault",
    vaultNameHint: "Enter the exact vault name used by Obsidian. The Obsidian URI core plugin must be enabled.",
    vaultPathLabel: "Local Obsidian vault path",
    vaultPathPlaceholder: "macOS: /Users/you/Documents/Obsidian/MyVault / Windows: C:\\Users\\you\\Documents\\Obsidian\\MyVault",
    vaultPathHint: "Required only for Native helper mode. Used to write notes and HTML attachments directly into the local vault.",
    folderPathLabel: "Save folder path (optional)",
    folderPathPlaceholder: "Example: ChatGPT",
    folderPathHint: "Example: Notes/ChatGPT. Leave empty to save at the vault root.",
    htmlSaveDirLabel: "HTML file save folder",
    htmlSaveDirPlaceholder: "Leave empty for Attachments",
    htmlSaveDirHint: "Relative paths are resolved inside the vault. Absolute paths are allowed only inside vaultPath. Default is Attachments inside the vault.",
    prefixDateLabel: "Add date prefix (YYYY-MM-DD) to file names",
    includeTimeLabel: "Also add time (HH-mm-ss) after the date",
    includeTimeHint: "This helps avoid duplicate file names when saving the same title multiple times.",
    keepQMLabel: "Allow question marks (?) in file names",
    keepQMHint: "Not allowed on Windows. Enable only on macOS/Linux.",
    bodyTitleLabel: "Add title H1 to note body (Windows compatible)",
    bodyTitleHint: "Adds a visible title at the top of the note body for environments where ? cannot be used in file names.",
    saveHtmlCodeBlocksLabel: "Save HTML code blocks as .html attachments",
    saveHtmlCodeBlocksHint: "Default off. When enabled, fenced HTML code blocks are also saved as HTML attachment files.",
    usePreviousQaForHtmlLabel: "Use the previous Q&A when saving an HTML learning note",
    usePreviousQaForHtmlHint: "Default off. When enabled, HTML attachment notes use the Q&A immediately before the HTML-generation request.",
    saveButton: "Save",
    savedStatus: "Saved ✓"
  },
  ko: {
    pageTitle: "GPT → Obsidian Saver 설정",
    uiLanguageLabel: "언어",
    uiLanguageHint: "기본값은 영어입니다. 기존처럼 한국어 UI를 쓰려면 한국어를 선택하세요.",
    vaultNameLabel: "Obsidian Vault 이름",
    vaultNamePlaceholder: "예: MyVault",
    vaultNameHint: "Obsidian에서 볼트 이름을 정확히 입력하세요. Core URI 플러그인을 활성화해야 합니다.",
    vaultPathLabel: "Obsidian Vault 로컬 경로",
    vaultPathPlaceholder: "macOS: /Users/you/Documents/Obsidian/MyVault / Windows: C:\\Users\\you\\Documents\\Obsidian\\MyVault",
    vaultPathHint: "Native helper 모드에서만 필요합니다. 노트와 HTML 첨부파일을 로컬 vault에 직접 저장할 때 사용합니다.",
    folderPathLabel: "저장 폴더 경로 (옵션)",
    folderPathPlaceholder: "예: ChatGPT",
    folderPathHint: "예: Notes/ChatGPT. 비워두면 vault 루트에 저장합니다.",
    htmlSaveDirLabel: "HTML 파일 저장 폴더",
    htmlSaveDirPlaceholder: "비워두면 Attachments",
    htmlSaveDirHint: "상대경로는 vault 내부 기준입니다. 절대경로는 vaultPath 안쪽일 때만 허용됩니다. 비워두면 vault의 Attachments 폴더에 저장합니다.",
    prefixDateLabel: "파일명 앞에 날짜(YYYY-MM-DD) 붙이기",
    includeTimeLabel: "날짜 뒤에 시간(HH-mm-ss)도 붙이기",
    includeTimeHint: "같은 제목을 여러 번 저장해도 중복 없이 저장됩니다.",
    keepQMLabel: "파일명에 물음표(?) 허용",
    keepQMHint: "Windows에서는 허용되지 않습니다. macOS/Linux에서만 켜세요.",
    bodyTitleLabel: "본문에 제목 H1 추가(Windows 호환)",
    bodyTitleHint: "파일명에 ?를 못 넣는 환경에서 보이는 제목을 본문 최상단에 추가합니다.",
    saveHtmlCodeBlocksLabel: "HTML 코드 블록을 .html 첨부파일로 저장",
    saveHtmlCodeBlocksHint: "기본값은 꺼짐입니다. 켜면 fenced HTML 코드 블록도 HTML 첨부파일로 저장합니다.",
    usePreviousQaForHtmlLabel: "HTML 학습자료 저장 시 이전 질문·답변 사용",
    usePreviousQaForHtmlHint: "기본값은 꺼짐입니다. 켜면 HTML 첨부 노트가 HTML 생성 요청 직전의 질문·답변을 사용합니다.",
    saveButton: "저장",
    savedStatus: "저장됨 ✓"
  }
};

let currentLanguage = DEFAULT_LANGUAGE;
const SYNC_KEYS = ["uiLanguage","vaultName","folderPath","prefixDate","includeTime","keepQM","bodyTitle","saveHtmlCodeBlocks","usePreviousQaForHtml"];
const LEGACY_SYNC_KEYS = [...SYNC_KEYS, "htmlSaveDir"];
const LOCAL_KEYS = ["vaultPath","htmlSaveDir","htmlSaveDirMigratedFromSync"];

function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

function t(key) {
  return I18N[currentLanguage]?.[key] || I18N[DEFAULT_LANGUAGE][key] || key;
}

function renderI18n(language = currentLanguage) {
  currentLanguage = normalizeLanguage(language);
  document.documentElement.lang = currentLanguage;
  document.title = t("pageTitle");

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
  });
}

function renderBuildDiagnostic(saveHtmlCodeBlocks = false, usePreviousQaForHtml = false) {
  const node = $("buildDiagnostic");
  if (!node) return;
  const codeBlocksEnabled = saveHtmlCodeBlocks ? "true" : "false";
  const previousQaEnabled = usePreviousQaForHtml ? "true" : "false";
  node.textContent = `Build version ${BUILD_VERSION} | saveHtmlCodeBlocksAsAttachments: ${codeBlocksEnabled} | usePreviousQaForHtml: ${previousQaEnabled} | content script VERSION: ${CONTENT_SCRIPT_VERSION}`;
  console.info("[GPT->Obsidian] options diagnostic", {
    buildVersion: BUILD_VERSION,
    saveHtmlCodeBlocksAsAttachments: codeBlocksEnabled,
    usePreviousQaForHtml: previousQaEnabled,
    contentScriptVersion: CONTENT_SCRIPT_VERSION
  });
}

function migrateHtmlSaveDir(syncState, localState, callback) {
  const legacyHtmlSaveDir = syncState.htmlSaveDir || "";
  const hasLocalValue = !!localState.htmlSaveDir;
  const alreadyMigrated = !!localState.htmlSaveDirMigratedFromSync;

  if (!hasLocalValue && legacyHtmlSaveDir && !alreadyMigrated) {
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

function load() {
  chrome.storage.sync.get(LEGACY_SYNC_KEYS, (syncState) => {
    chrome.storage.local.get(LOCAL_KEYS, (localState) => {
      migrateHtmlSaveDir(syncState, localState, () => {
        currentLanguage = normalizeLanguage(syncState.uiLanguage);
        $("uiLanguage").value = currentLanguage;
        renderI18n(currentLanguage);
        $("vaultName").value = syncState.vaultName || "";
        $("folderPath").value = syncState.folderPath || "ChatGPT";
        $("vaultPath").value = localState.vaultPath || "";
        $("htmlSaveDir").value = localState.htmlSaveDir || "";
        $("prefixDate").checked = (syncState.prefixDate === undefined) ? true : !!syncState.prefixDate;
        $("includeTime").checked = !!syncState.includeTime;
        $("keepQM").checked = !!syncState.keepQM;
        $("bodyTitle").checked = (syncState.bodyTitle === undefined) ? (navigator.userAgent.includes("Windows")) : !!syncState.bodyTitle;
        $("saveHtmlCodeBlocks").checked = !!syncState.saveHtmlCodeBlocks;
        $("usePreviousQaForHtml").checked = !!syncState.usePreviousQaForHtml;
        renderBuildDiagnostic(!!syncState.saveHtmlCodeBlocks, !!syncState.usePreviousQaForHtml);
      });
    });
  });
}

function save() {
  const uiLanguage = normalizeLanguage($("uiLanguage").value);
  const vaultName = $("vaultName").value.trim();
  const folderPath = $("folderPath").value.trim();
  const vaultPath = $("vaultPath").value.trim();
  const htmlSaveDir = $("htmlSaveDir").value.trim();
  const prefixDate = $("prefixDate").checked;
  const includeTime = $("includeTime").checked;
  const keepQM = $("keepQM").checked;
  const bodyTitle = $("bodyTitle").checked;
  const saveHtmlCodeBlocks = $("saveHtmlCodeBlocks").checked;
  const usePreviousQaForHtml = $("usePreviousQaForHtml").checked;

  let pending = 2;
  const done = () => {
    pending -= 1;
    if (pending === 0) {
      currentLanguage = uiLanguage;
      renderI18n(currentLanguage);
      renderBuildDiagnostic(saveHtmlCodeBlocks, usePreviousQaForHtml);
      $("status").textContent = t("savedStatus");
      setTimeout(()=> $("status").textContent = "", 1500);
    }
  };

  chrome.storage.sync.set({ uiLanguage, vaultName, folderPath, prefixDate, includeTime, keepQM, bodyTitle, saveHtmlCodeBlocks, usePreviousQaForHtml }, done);
  chrome.storage.local.set({ vaultPath, htmlSaveDir, htmlSaveDirMigratedFromSync: true }, done);
  chrome.storage.sync.remove("htmlSaveDir", () => {
    // Best-effort cleanup of the legacy machine-specific sync value.
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderI18n(DEFAULT_LANGUAGE);
  renderBuildDiagnostic(false, false);
  load();
  $("uiLanguage").addEventListener("change", () => renderI18n($("uiLanguage").value));
  const renderCurrentDiagnostic = () => renderBuildDiagnostic($("saveHtmlCodeBlocks").checked, $("usePreviousQaForHtml").checked);
  $("saveHtmlCodeBlocks").addEventListener("change", renderCurrentDiagnostic);
  $("usePreviousQaForHtml").addEventListener("change", renderCurrentDiagnostic);
  $("saveBtn").addEventListener("click", save);
});
