// options.js
const $ = (id) => document.getElementById(id);
const BUILD_VERSION = "1.5.52";
const CONTENT_SCRIPT_VERSION = "1.5.52";
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
    resolvedPathsHeading: "Resolved save paths",
    resolvedPathPreview: "Current form preview",
    resolvedPathStored: "Stored values verified",
    resolvedNotePathLabel: "Markdown note folder",
    resolvedHtmlPathLabel: "HTML attachment folder",
    pathMismatchWarning: "Warning: the note folder root “{noteRoot}” differs from the HTML folder root “{htmlRoot}”. Saving is allowed, but verify that this split is intentional.",
    resetHtmlFolderButton: "Set HTML folder to {path}",
    resetHtmlFolderPreparedStatus: "HTML folder field updated. Click Save to persist it.",
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
    savingStatus: "Saving…",
    savedStatus: "Saved and storage verified ✓",
    saveFailedStatus: "Save failed: {error}",
    notConfiguredPath: "(vault path not configured)"
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
    resolvedPathsHeading: "실제 저장 경로",
    resolvedPathPreview: "현재 입력값 미리보기",
    resolvedPathStored: "저장소 값 재확인 완료",
    resolvedNotePathLabel: "Markdown 노트 폴더",
    resolvedHtmlPathLabel: "HTML 첨부파일 폴더",
    pathMismatchWarning: "주의: 노트 폴더의 첫 경로 “{noteRoot}”와 HTML 폴더의 첫 경로 “{htmlRoot}”가 다릅니다. 저장은 가능하지만 의도한 분리인지 확인하세요.",
    resetHtmlFolderButton: "HTML 폴더를 {path}(으)로 설정",
    resetHtmlFolderPreparedStatus: "HTML 폴더 입력값을 바꿨습니다. 저장 버튼을 눌러 반영하세요.",
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
    savingStatus: "저장 중…",
    savedStatus: "저장 후 실제 저장값 확인 완료 ✓",
    saveFailedStatus: "저장 실패: {error}",
    notConfiguredPath: "(vault 경로가 설정되지 않음)"
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

function formatTemplate(template, values = {}) {
  return String(template || "").replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => String(values[key] ?? ""));
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

function normalizeDisplayPath(value) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  const unc = raw.startsWith("//");
  const normalized = raw.replace(/\/{2,}/g, "/");
  return unc ? `/${normalized}` : normalized;
}

function trimTrailingPathSeparators(value) {
  const normalized = normalizeDisplayPath(value);
  if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)) return normalized;
  return normalized.replace(/\/+$/g, "");
}

function normalizeRelativePath(value) {
  return normalizeDisplayPath(value).replace(/^\/+|\/+$/g, "");
}

function isAbsoluteDisplayPath(value) {
  const normalized = normalizeDisplayPath(value);
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}

function joinVaultDisplayPath(vaultPath, childPath) {
  const vault = trimTrailingPathSeparators(vaultPath);
  const child = normalizeDisplayPath(childPath);
  if (child && isAbsoluteDisplayPath(child)) return trimTrailingPathSeparators(child);
  const relative = normalizeRelativePath(child);
  if (!vault) return relative;
  if (!relative) return vault;
  return `${vault}/${relative}`;
}

function defaultHtmlSaveDir(folderPath) {
  const folder = normalizeRelativePath(folderPath);
  return folder ? `${folder}/Attachments` : "Attachments";
}

function relativePathForRootComparison(pathValue, vaultPath) {
  const path = normalizeDisplayPath(pathValue);
  if (!path) return "";
  if (!isAbsoluteDisplayPath(path)) return normalizeRelativePath(path);

  const vault = trimTrailingPathSeparators(vaultPath);
  if (!vault) return null;
  const insensitive = /^[A-Za-z]:\//.test(vault);
  const comparablePath = insensitive ? path.toLowerCase() : path;
  const comparableVault = insensitive ? vault.toLowerCase() : vault;
  if (comparablePath === comparableVault) return "";
  if (!comparablePath.startsWith(`${comparableVault}/`)) return null;
  return normalizeRelativePath(path.slice(vault.length + 1));
}

function firstPathSegment(value) {
  return normalizeRelativePath(value).split("/").filter(Boolean)[0] || "";
}

function analyzePathSettings({ vaultPath = "", folderPath = "", htmlSaveDir = "" } = {}) {
  const normalizedVaultPath = trimTrailingPathSeparators(vaultPath);
  const noteRelativePath = normalizeRelativePath(folderPath);
  const effectiveHtmlPath = normalizeDisplayPath(htmlSaveDir) || "Attachments";
  const htmlRelativeForComparison = relativePathForRootComparison(effectiveHtmlPath, normalizedVaultPath);
  const noteRoot = firstPathSegment(noteRelativePath);
  const htmlRoot = htmlRelativeForComparison === null ? "" : firstPathSegment(htmlRelativeForComparison);
  const rootsDiffer = !!noteRoot && !!htmlRoot && noteRoot.toLocaleLowerCase() !== htmlRoot.toLocaleLowerCase();

  return {
    noteFinalPath: joinVaultDisplayPath(normalizedVaultPath, noteRelativePath),
    htmlFinalPath: joinVaultDisplayPath(normalizedVaultPath, effectiveHtmlPath),
    noteRoot,
    htmlRoot,
    rootsDiffer,
    resetHtmlSaveDir: defaultHtmlSaveDir(noteRelativePath)
  };
}

function currentFormSettings() {
  return {
    uiLanguage: normalizeLanguage($("uiLanguage")?.value),
    vaultName: $("vaultName")?.value.trim() || "",
    folderPath: $("folderPath")?.value.trim() || "",
    vaultPath: $("vaultPath")?.value.trim() || "",
    htmlSaveDir: $("htmlSaveDir")?.value.trim() || "",
    prefixDate: !!$("prefixDate")?.checked,
    includeTime: !!$("includeTime")?.checked,
    keepQM: !!$("keepQM")?.checked,
    bodyTitle: !!$("bodyTitle")?.checked,
    saveHtmlCodeBlocks: !!$("saveHtmlCodeBlocks")?.checked,
    usePreviousQaForHtml: !!$("usePreviousQaForHtml")?.checked
  };
}

function renderPathDiagnostic(values = currentFormSettings(), { stored = false } = {}) {
  const analysis = analyzePathSettings(values);
  const notePathNode = $("resolvedNotePath");
  const htmlPathNode = $("resolvedHtmlPath");
  const sourceNode = $("pathDiagnosticSource");
  const warningNode = $("pathMismatchWarning");
  const resetButton = $("resetHtmlDirBtn");

  if (notePathNode) notePathNode.textContent = analysis.noteFinalPath || t("notConfiguredPath");
  if (htmlPathNode) htmlPathNode.textContent = analysis.htmlFinalPath || t("notConfiguredPath");
  if (sourceNode) sourceNode.textContent = stored ? t("resolvedPathStored") : t("resolvedPathPreview");
  if (warningNode) {
    warningNode.hidden = !analysis.rootsDiffer;
    warningNode.textContent = analysis.rootsDiffer
      ? formatTemplate(t("pathMismatchWarning"), { noteRoot: analysis.noteRoot, htmlRoot: analysis.htmlRoot })
      : "";
  }
  if (resetButton) {
    resetButton.textContent = formatTemplate(t("resetHtmlFolderButton"), { path: analysis.resetHtmlSaveDir });
    resetButton.dataset.targetPath = analysis.resetHtmlSaveDir;
  }
  return analysis;
}

function storageGet(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].get(keys, (state) => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve(state || {});
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageSet(area, values) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].set(values, () => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageRemove(area, keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage[area].remove(keys, () => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(new Error(error.message || String(error)));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function migrateHtmlSaveDir(syncState, localState) {
  const legacyHtmlSaveDir = syncState.htmlSaveDir || "";
  const hasLocalValue = !!localState.htmlSaveDir;
  const alreadyMigrated = !!localState.htmlSaveDirMigratedFromSync;

  if (!hasLocalValue && legacyHtmlSaveDir && !alreadyMigrated) {
    await storageSet("local", {
      htmlSaveDir: legacyHtmlSaveDir,
      htmlSaveDirMigratedFromSync: true
    });
    localState.htmlSaveDir = legacyHtmlSaveDir;
    localState.htmlSaveDirMigratedFromSync = true;
  }
}

async function readStoredSettings() {
  const [syncState, localState] = await Promise.all([
    storageGet("sync", LEGACY_SYNC_KEYS),
    storageGet("local", LOCAL_KEYS)
  ]);
  await migrateHtmlSaveDir(syncState, localState);
  return { syncState, localState };
}

function applyStoredSettings(syncState, localState) {
  currentLanguage = normalizeLanguage(syncState.uiLanguage);
  $("uiLanguage").value = currentLanguage;
  $("vaultName").value = syncState.vaultName || "";
  $("folderPath").value = syncState.folderPath === undefined ? "ChatGPT" : syncState.folderPath;
  $("vaultPath").value = localState.vaultPath || "";
  $("htmlSaveDir").value = localState.htmlSaveDir || "";
  $("prefixDate").checked = (syncState.prefixDate === undefined) ? true : !!syncState.prefixDate;
  $("includeTime").checked = !!syncState.includeTime;
  $("keepQM").checked = !!syncState.keepQM;
  $("bodyTitle").checked = (syncState.bodyTitle === undefined) ? navigator.userAgent.includes("Windows") : !!syncState.bodyTitle;
  $("saveHtmlCodeBlocks").checked = !!syncState.saveHtmlCodeBlocks;
  $("usePreviousQaForHtml").checked = !!syncState.usePreviousQaForHtml;
}

function storedSettingsAsValues(syncState, localState) {
  return {
    ...syncState,
    vaultPath: localState.vaultPath || "",
    htmlSaveDir: localState.htmlSaveDir || ""
  };
}

function setStatus(message, clearAfterMs = 0) {
  const node = $("status");
  if (!node) return;
  node.textContent = message;
  if (clearAfterMs > 0) {
    setTimeout(() => {
      if (node.textContent === message) node.textContent = "";
    }, clearAfterMs);
  }
}

async function load() {
  try {
    const { syncState, localState } = await readStoredSettings();
    applyStoredSettings(syncState, localState);
    renderI18n(currentLanguage);
    renderBuildDiagnostic(!!syncState.saveHtmlCodeBlocks, !!syncState.usePreviousQaForHtml);
    renderPathDiagnostic(storedSettingsAsValues(syncState, localState), { stored: true });
  } catch (error) {
    setStatus(formatTemplate(t("saveFailedStatus"), { error: error?.message || String(error) }));
  }
}

function assertStorageMatches(expected, syncState, localState) {
  const comparisons = [
    ["uiLanguage", expected.uiLanguage, normalizeLanguage(syncState.uiLanguage)],
    ["vaultName", expected.vaultName, syncState.vaultName || ""],
    ["folderPath", expected.folderPath, syncState.folderPath || ""],
    ["vaultPath", expected.vaultPath, localState.vaultPath || ""],
    ["htmlSaveDir", expected.htmlSaveDir, localState.htmlSaveDir || ""],
    ["prefixDate", expected.prefixDate, !!syncState.prefixDate],
    ["includeTime", expected.includeTime, !!syncState.includeTime],
    ["keepQM", expected.keepQM, !!syncState.keepQM],
    ["bodyTitle", expected.bodyTitle, !!syncState.bodyTitle],
    ["saveHtmlCodeBlocks", expected.saveHtmlCodeBlocks, !!syncState.saveHtmlCodeBlocks],
    ["usePreviousQaForHtml", expected.usePreviousQaForHtml, !!syncState.usePreviousQaForHtml]
  ];
  const mismatch = comparisons.find(([_key, expectedValue, actualValue]) => expectedValue !== actualValue);
  if (mismatch) {
    throw new Error(`storage verification mismatch for ${mismatch[0]}`);
  }
}

async function save() {
  const values = currentFormSettings();
  const saveButton = $("saveBtn");
  if (saveButton) saveButton.disabled = true;
  setStatus(t("savingStatus"));

  try {
    await Promise.all([
      storageSet("sync", {
        uiLanguage: values.uiLanguage,
        vaultName: values.vaultName,
        folderPath: values.folderPath,
        prefixDate: values.prefixDate,
        includeTime: values.includeTime,
        keepQM: values.keepQM,
        bodyTitle: values.bodyTitle,
        saveHtmlCodeBlocks: values.saveHtmlCodeBlocks,
        usePreviousQaForHtml: values.usePreviousQaForHtml
      }),
      storageSet("local", {
        vaultPath: values.vaultPath,
        htmlSaveDir: values.htmlSaveDir,
        htmlSaveDirMigratedFromSync: true
      })
    ]);
    await storageRemove("sync", "htmlSaveDir");

    const { syncState, localState } = await readStoredSettings();
    assertStorageMatches(values, syncState, localState);
    applyStoredSettings(syncState, localState);
    renderI18n(currentLanguage);
    renderBuildDiagnostic(!!syncState.saveHtmlCodeBlocks, !!syncState.usePreviousQaForHtml);
    renderPathDiagnostic(storedSettingsAsValues(syncState, localState), { stored: true });
    setStatus(t("savedStatus"), 2500);
  } catch (error) {
    setStatus(formatTemplate(t("saveFailedStatus"), { error: error?.message || String(error) }));
    throw error;
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

function resetHtmlFolderInput() {
  const analysis = analyzePathSettings(currentFormSettings());
  $("htmlSaveDir").value = analysis.resetHtmlSaveDir;
  renderPathDiagnostic(currentFormSettings(), { stored: false });
  setStatus(t("resetHtmlFolderPreparedStatus"));
  try { $("htmlSaveDir").focus(); } catch {}
}

function handleAsyncAction(action) {
  Promise.resolve(action()).catch((error) => {
    console.warn("GPT → Obsidian options action failed.", error);
  });
}

if (globalThis.__GPT_OBSIDIAN_ENABLE_TEST_HOOKS__) {
  globalThis.__GPT_OBSIDIAN_OPTIONS_TEST_HOOKS__ = {
    BUILD_VERSION,
    CONTENT_SCRIPT_VERSION,
    normalizeDisplayPath,
    joinVaultDisplayPath,
    defaultHtmlSaveDir,
    analyzePathSettings,
    readStoredSettings,
    renderPathDiagnostic,
    currentFormSettings,
    load,
    save,
    resetHtmlFolderInput
  };
}

document.addEventListener("DOMContentLoaded", () => {
  renderI18n(DEFAULT_LANGUAGE);
  renderBuildDiagnostic(false, false);
  renderPathDiagnostic(currentFormSettings(), { stored: false });
  handleAsyncAction(load);
  $("uiLanguage").addEventListener("change", () => {
    renderI18n($("uiLanguage").value);
    renderPathDiagnostic(currentFormSettings(), { stored: false });
  });
  const renderCurrentDiagnostic = () => renderBuildDiagnostic($("saveHtmlCodeBlocks").checked, $("usePreviousQaForHtml").checked);
  $("saveHtmlCodeBlocks").addEventListener("change", renderCurrentDiagnostic);
  $("usePreviousQaForHtml").addEventListener("change", renderCurrentDiagnostic);
  ["vaultPath", "folderPath", "htmlSaveDir"].forEach((id) => {
    $(id).addEventListener("input", () => renderPathDiagnostic(currentFormSettings(), { stored: false }));
  });
  $("resetHtmlDirBtn").addEventListener("click", resetHtmlFolderInput);
  $("saveBtn").addEventListener("click", () => handleAsyncAction(save));
});
