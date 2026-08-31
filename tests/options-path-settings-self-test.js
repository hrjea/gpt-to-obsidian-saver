#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeNode(initial = {}) {
  return {
    value: "",
    checked: false,
    textContent: "",
    hidden: false,
    disabled: false,
    dataset: {},
    style: {},
    attributes: {},
    focus() {},
    addEventListener() {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] || "";
    },
    ...initial
  };
}

function selectKeys(state, keys) {
  if (keys == null) return clone(state);
  const requested = Array.isArray(keys) ? keys : [keys];
  return Object.fromEntries(requested.filter(key => Object.prototype.hasOwnProperty.call(state, key)).map(key => [key, clone(state[key])]));
}

function loadHarness({ syncState, localState }) {
  const ids = [
    "uiLanguage", "vaultName", "folderPath", "vaultPath", "htmlSaveDir",
    "prefixDate", "includeTime", "keepQM", "bodyTitle", "saveHtmlCodeBlocks",
    "usePreviousQaForHtml", "buildDiagnostic", "resolvedNotePath", "resolvedHtmlPath",
    "pathDiagnosticSource", "pathMismatchWarning", "resetHtmlDirBtn", "saveBtn", "status"
  ];
  const nodes = Object.fromEntries(ids.map(id => [id, makeNode()]));
  nodes.uiLanguage.value = "en";

  const storage = {
    sync: clone(syncState),
    local: clone(localState)
  };
  const makeArea = (areaName) => ({
    get(keys, callback) {
      callback(selectKeys(storage[areaName], keys));
    },
    set(values, callback) {
      Object.assign(storage[areaName], clone(values));
      callback?.();
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[areaName][key];
      callback?.();
    }
  });

  const documentElement = { lang: "en" };
  const sandbox = {
    console,
    navigator: { userAgent: "Macintosh" },
    document: {
      title: "",
      documentElement,
      getElementById: id => nodes[id] || null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    chrome: {
      runtime: {},
      storage: {
        sync: makeArea("sync"),
        local: makeArea("local")
      }
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;

  const sourcePath = path.join(__dirname, "..", "options.js");
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), sandbox, { filename: sourcePath });
  return {
    hooks: sandbox.__GPT_OBSIDIAN_OPTIONS_TEST_HOOKS__,
    nodes,
    storage,
    document: sandbox.document
  };
}

async function main() {
  const harness = loadHarness({
    syncState: {
      uiLanguage: "ko",
      vaultName: "Obsidian Vault",
      folderPath: "ChatGPT",
      prefixDate: true,
      includeTime: false,
      keepQM: false,
      bodyTitle: false,
      saveHtmlCodeBlocks: false,
      usePreviousQaForHtml: false,
      htmlSaveDir: "Old_Sync/Attachments"
    },
    localState: {
      vaultPath: "/Users/test/Documents/Obsidian Vault",
      htmlSaveDir: "ChatGPT_Test/Attachments",
      htmlSaveDirMigratedFromSync: true
    }
  });
  const { hooks, nodes, storage } = harness;

  assert.strictEqual(hooks.BUILD_VERSION, "1.5.50");
  assert.strictEqual(hooks.CONTENT_SCRIPT_VERSION, "1.5.50");
  assert.strictEqual(hooks.defaultHtmlSaveDir("ChatGPT"), "ChatGPT/Attachments");
  assert.strictEqual(hooks.defaultHtmlSaveDir(""), "Attachments");
  assert.strictEqual(
    hooks.joinVaultDisplayPath("/Users/test/Documents/Vault/", "/Users/test/Documents/Vault/ChatGPT"),
    "/Users/test/Documents/Vault/ChatGPT"
  );

  const mismatch = hooks.analyzePathSettings({
    vaultPath: "/Users/test/Documents/Obsidian Vault",
    folderPath: "ChatGPT",
    htmlSaveDir: "ChatGPT_Test/Attachments"
  });
  assert.strictEqual(mismatch.noteFinalPath, "/Users/test/Documents/Obsidian Vault/ChatGPT");
  assert.strictEqual(mismatch.htmlFinalPath, "/Users/test/Documents/Obsidian Vault/ChatGPT_Test/Attachments");
  assert.strictEqual(mismatch.noteRoot, "ChatGPT");
  assert.strictEqual(mismatch.htmlRoot, "ChatGPT_Test");
  assert.strictEqual(mismatch.rootsDiffer, true);
  assert.strictEqual(mismatch.resetHtmlSaveDir, "ChatGPT/Attachments");

  await hooks.load();
  assert.strictEqual(nodes.uiLanguage.value, "ko");
  assert.strictEqual(nodes.folderPath.value, "ChatGPT");
  assert.strictEqual(nodes.htmlSaveDir.value, "ChatGPT_Test/Attachments");
  assert.strictEqual(nodes.resolvedNotePath.textContent, "/Users/test/Documents/Obsidian Vault/ChatGPT");
  assert.strictEqual(nodes.resolvedHtmlPath.textContent, "/Users/test/Documents/Obsidian Vault/ChatGPT_Test/Attachments");
  assert.strictEqual(nodes.pathMismatchWarning.hidden, false, "a stale test HTML path must be visible in diagnostics");
  assert(nodes.pathMismatchWarning.textContent.includes("ChatGPT_Test"));
  assert.strictEqual(nodes.resetHtmlDirBtn.dataset.targetPath, "ChatGPT/Attachments");
  assert.strictEqual(
    storage.local.htmlSaveDir,
    "ChatGPT_Test/Attachments",
    "a pre-existing local value must not be overwritten by the stale legacy sync value"
  );

  hooks.resetHtmlFolderInput();
  assert.strictEqual(nodes.htmlSaveDir.value, "ChatGPT/Attachments");
  assert.strictEqual(nodes.pathMismatchWarning.hidden, true);
  assert(nodes.status.textContent.includes("저장 버튼"));

  await hooks.save();
  assert.strictEqual(storage.local.vaultPath, "/Users/test/Documents/Obsidian Vault");
  assert.strictEqual(storage.local.htmlSaveDir, "ChatGPT/Attachments");
  assert.strictEqual(storage.local.htmlSaveDirMigratedFromSync, true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(storage.sync, "htmlSaveDir"), false, "legacy sync htmlSaveDir must be removed after a verified save");
  assert.strictEqual(nodes.resolvedHtmlPath.textContent, "/Users/test/Documents/Obsidian Vault/ChatGPT/Attachments");
  assert.strictEqual(nodes.pathMismatchWarning.hidden, true);
  assert(nodes.pathDiagnosticSource.textContent.includes("재확인"));
  assert(nodes.status.textContent.includes("확인 완료"));
  assert.strictEqual(nodes.saveBtn.disabled, false);

  nodes.folderPath.value = "";
  nodes.htmlSaveDir.value = "Attachments";
  await hooks.save();
  assert.strictEqual(storage.sync.folderPath, "");
  assert.strictEqual(nodes.folderPath.value, "", "an explicitly saved vault-root note folder must not be replaced by the ChatGPT default");
  assert.strictEqual(nodes.resolvedNotePath.textContent, "/Users/test/Documents/Obsidian Vault");

  console.log("options path settings and persistence self-test ok");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
