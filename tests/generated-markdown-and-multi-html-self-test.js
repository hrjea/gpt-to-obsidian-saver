#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadHooks({ syncState = {} } = {}) {
  const noop = () => {};
  const fakeElement = {
    querySelectorAll: () => [],
    querySelector: () => null,
    appendChild: noop,
    remove: noop,
    matches: () => false,
    contains: () => false,
    cloneNode() { return this; },
    getAttribute: () => "",
    setAttribute: noop,
    style: {},
    textContent: "",
    innerText: "",
    innerHTML: ""
  };
  const sandbox = {
    console,
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MutationObserver: class { observe() {} },
    navigator: { userAgent: "", clipboard: { readText: async () => "" } },
    location: { href: "https://chatgpt.example/c/generated-artifacts" },
    document: {
      body: fakeElement,
      documentElement: fakeElement,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ ...fakeElement })
    },
    chrome: {
      storage: {
        sync: { get: (_keys, callback) => callback({ ...syncState }) },
        local: { get: (_keys, callback) => callback({}) },
        onChanged: { addListener: noop }
      },
      runtime: {
        id: "generated-artifact-self-test",
        lastError: null,
        sendMessage: (message, callback) => callback?.(
          message?.type === "gpt2obs-runtime-ping"
            ? { ok: true, pong: true, version: "1.5.47" }
            : { ok: true }
        )
      }
    },
    setTimeout,
    clearTimeout,
    URL,
    fetch: async () => ({ ok: false, status: 404, text: async () => "" }),
    alert: noop,
    window: { getSelection: () => "" },
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;
  const sourcePath = path.join(__dirname, "..", "content.js");
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), sandbox, { filename: sourcePath });
  const hooks = sandbox.__GPT_OBSIDIAN_TEST_HOOKS__;
  hooks.__sandbox = sandbox;
  return hooks;
}

function loadBackgroundMessageHarness() {
  let messageListener = null;
  const nativeMessages = [];
  const noop = () => {};
  const runtime = {
    lastError: null,
    onInstalled: { addListener: noop },
    onMessage: { addListener(listener) { messageListener = listener; } },
    sendNativeMessage(host, message, callback) {
      nativeMessages.push({ host, message });
      callback({ ok: true, pong: true });
    }
  };
  const event = { addListener: noop, removeListener: noop };
  const sandbox = {
    console,
    URL,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    chrome: {
      runtime,
      storage: { sync: { get: (_keys, callback) => callback({}), set: noop } },
      downloads: { onCreated: event, onChanged: event, search: (_query, callback) => callback([]) }
    },
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: false
  };
  sandbox.globalThis = sandbox;
  const sourcePath = path.join(__dirname, "..", "background.js");
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), sandbox, { filename: sourcePath });
  assert.strictEqual(typeof messageListener, "function", "background message listener must be registered");
  return { messageListener, nativeMessages, runtime };
}

function count(text, pattern) {
  return (String(text).match(pattern) || []).length;
}

function textNode(value) {
  return { nodeType: 3, nodeValue: String(value) };
}

function elementNode(tagName, { attrs = {}, children = [], closest = () => null } = {}) {
  return {
    nodeType: 1,
    tagName: String(tagName).toUpperCase(),
    childNodes: children,
    style: {},
    getAttribute: name => attrs[name] || "",
    closest
  };
}

function renderMarkdownTree(hooks, children) {
  const sandbox = hooks.__sandbox;
  const originalCreateElement = sandbox.document.createElement;
  sandbox.document.createElement = tagName => {
    if (String(tagName).toLowerCase() !== "div") return originalCreateElement(tagName);
    return {
      nodeType: 1,
      tagName: "DIV",
      childNodes: children,
      style: {},
      set innerHTML(_value) {},
      get innerHTML() { return ""; }
    };
  };
  try {
    return hooks.htmlToMarkdown("fixture");
  } finally {
    sandbox.document.createElement = originalCreateElement;
  }
}

function htmlDocument(name, heading, body, links = "") {
  return `<!doctype html>\n<html><head><title>${name}</title></head><body><h1>${heading}</h1>${links}<p>${body}</p></body></html>`;
}

function makeArtifactViewer(name, source) {
  let sourceVisible = false;
  let previewRestored = false;
  const sourceNode = {
    value: "",
    innerText: source,
    textContent: source,
    getAttribute: () => ""
  };
  const root = {
    parentElement: null,
    className: "artifact-viewer",
    innerText: name,
    textContent: name,
    getAttribute: attr => attr === "aria-label" ? name : "",
    querySelector: selector => selector.includes("iframe") ? {} : null,
    querySelectorAll: selector => {
      if (selector.includes(".cm-content") && sourceVisible) return [sourceNode];
      return [];
    }
  };
  const group = {
    parentElement: root,
    querySelector: () => null,
    querySelectorAll: selector => selector === "button" ? [codeToggle, previewToggle] : []
  };
  const codeToggle = {
    parentElement: group,
    innerText: "코딩",
    textContent: "코딩",
    getAttribute: attr => attr === "aria-label" ? "코딩" : (attr === "aria-pressed" ? "false" : ""),
    closest: selector => selector === "[role=\"group\"]" ? group : null,
    querySelector: () => null,
    click: () => { sourceVisible = true; }
  };
  const previewToggle = {
    parentElement: group,
    innerText: "미리 보기",
    textContent: "미리 보기",
    getAttribute: attr => attr === "aria-label" ? "미리 보기" : "",
    closest: selector => selector === "[role=\"group\"]" ? group : null,
    querySelector: () => null,
    click: () => { previewRestored = true; }
  };
  return { name, root, codeToggle, previewToggle, source, wasPreviewRestored: () => previewRestored };
}

function makeVisibilityNode({ connected = true, width = 160, height = 32, display = "", visibility = "" } = {}) {
  return {
    isConnected: connected,
    className: "group/artifact-row",
    style: { display, visibility },
    innerText: "",
    textContent: "",
    getAttribute: () => "",
    getBoundingClientRect: () => ({ width, height }),
    querySelectorAll: () => [],
    closest: () => null
  };
}

function makeFlyoutRegion({
  testId = "screen-threadFlyOut",
  name = "nested-summary.md",
  parent = null,
  canonicalChildren = []
} = {}) {
  const region = {
    isConnected: true,
    parentElement: parent,
    style: {},
    innerText: name,
    textContent: name,
    getAttribute: attr => {
      if (attr === "data-testid") return testId;
      if (attr === "aria-label") return "";
      return "";
    },
    getBoundingClientRect: () => ({ width: 1152, height: 1084 }),
    matches: selector => {
      if (selector === "[data-testid='screen-threadFlyOut']") return testId === "screen-threadFlyOut";
      if (selector.includes("[data-testid*='flyout' i]")) return /flyout/i.test(testId);
      return false;
    },
    closest: selector => {
      if (selector === "[data-testid='screen-threadFlyOut']") {
        let current = region;
        while (current) {
          if (current.getAttribute?.("data-testid") === "screen-threadFlyOut") return current;
          current = current.parentElement;
        }
      }
      return null;
    },
    querySelectorAll: selector => {
      if (selector === "[data-testid='screen-threadFlyOut']") return canonicalChildren;
      return [];
    },
    contains: candidate => {
      let current = candidate;
      while (current) {
        if (current === region) return true;
        current = current.parentElement;
      }
      return false;
    }
  };
  return region;
}

let handleFixtureSequence = 0;

function makeHandleCopyFixture(hooks, { rich = true, html = false, outer = "outer explanation" } = {}) {
  const sandbox = hooks.__sandbox;
  const original = {
    sendMessage: sandbox.chrome.runtime.sendMessage,
    confirm: sandbox.confirm,
    selection: sandbox.window.getSelection,
    href: sandbox.location.href
  };
  const events = { confirms: 0, opens: [], saves: [] };
  let approve = false;
  const richSelector = '[data-app-block-preview="true"]';
  const actualHtml = htmlDocument("Actual", "Real file", "complete body");
  const appBlock = { remove() {}, closest: selector => selector === richSelector ? appBlock : null };
  const appFrame = {
    src: "https://app-block-test.web-sandbox.oaiusercontent.com/",
    parentElement: null,
    getAttribute: () => "",
    closest: selector => selector === richSelector ? appBlock : null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const realFrame = {
    src: "",
    parentElement: null,
    getAttribute: name => name === "srcdoc" ? actualHtml : "",
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const htmlRoot = {
    parentElement: null,
    innerText: "actual.html",
    textContent: "actual.html",
    getAttribute: () => "",
    querySelector: selector => selector.includes("iframe") ? realFrame : null,
    querySelectorAll: () => []
  };
  const answerText = outer;
  const makeClone = () => {
    const clonedBlock = { remove() {}, closest: selector => selector === richSelector ? clonedBlock : null };
    return {
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: selector => selector === richSelector && rich ? [clonedBlock] : [],
      cloneNode: makeClone,
      getAttribute: () => "",
      innerHTML: "",
      innerText: answerText,
      textContent: answerText,
      contains: () => false
    };
  };
  const container = {
    parentElement: null,
    matches: () => false,
    getAttribute: name => name === "data-message-author-role" ? "assistant" : "",
    innerHTML: "",
    innerText: answerText,
    textContent: answerText,
    contains: node => node === container,
    cloneNode: makeClone,
    querySelector(selector) {
      return html && selector.includes("iframe") ? realFrame : null;
    },
    querySelectorAll(selector) {
      if (selector === richSelector) return rich ? [appBlock] : [];
      if (selector === "iframe") return html ? (rich ? [appFrame, realFrame] : [realFrame]) : (rich ? [appFrame] : []);
      return [];
    }
  };
  appFrame.parentElement = container;
  htmlRoot.parentElement = container;
  realFrame.parentElement = htmlRoot;
  const button = {
    closest: selector => (
      selector === "[data-message-author-role]" ||
      selector === "[data-testid^='conversation-turn-']"
    ) ? container : null
  };

  sandbox.location.href = `https://chatgpt.example/c/handle-rich-${++handleFixtureSequence}`;
  sandbox.window.getSelection = () => "Visualize this";
  sandbox.confirm = () => {
    events.confirms += 1;
    return approve;
  };
  sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message?.type === "gpt2obs-runtime-ping") {
      callback?.({ ok: true, pong: true, version: hooks.VERSION });
      return;
    }
    if (message?.type === "open-obsidian-uri") {
      events.opens.push(message);
      callback?.({ ok: true });
      return;
    }
    if (message?.type === "save-obsidian-note") {
      events.saves.push(message);
      const names = message.payload?.attachmentNames || [];
      callback?.({
        ok: true,
        attachments: names.map(name => ({ name, requestedName: name })),
        attachmentAudit: { writtenRequestedNames: names, missingNames: [] },
        warnings: []
      });
      return;
    }
    callback?.({ ok: true });
  };

  return {
    events,
    setApprove(value) { approve = value; },
    run() { return hooks.handleCopyClick(button, { delayMs: 0 }); },
    restore() {
      sandbox.chrome.runtime.sendMessage = original.sendMessage;
      sandbox.confirm = original.confirm;
      sandbox.window.getSelection = original.selection;
      sandbox.location.href = original.href;
    }
  };
}

async function main() {
  const hooks = loadHooks();
  assert.strictEqual(hooks.VERSION, "1.5.47");

  const missingFolderHooks = loadHooks({ syncState: { prefixDate: false } });
  const rootFolderHooks = loadHooks({ syncState: { folderPath: "", prefixDate: false } });
  const explicitFolderHooks = loadHooks({ syncState: { folderPath: "Notes/ChatGPT", prefixDate: false } });
  assert.strictEqual(typeof rootFolderHooks.buildFilePath, "function", "content test hooks must expose the final note-path builder");
  assert.strictEqual(missingFolderHooks.buildFilePath("Folder contract"), "ChatGPT/Folder contract.md", "a missing folderPath key keeps the first-install ChatGPT default");
  assert.strictEqual(rootFolderHooks.buildFilePath("Folder contract"), "Folder contract.md", "an explicitly stored empty folderPath must target the Vault root");
  assert.strictEqual(explicitFolderHooks.buildFilePath("Folder contract"), "Notes/ChatGPT/Folder contract.md");

  const fileLink = (name, href = "") => ({
    innerText: name,
    textContent: name,
    getAttribute: attribute => attribute === "href" ? href : ""
  });
  const unresolvedContainer = {
    querySelectorAll: selector => selector === "a, [role='link']"
      ? [fileLink("HTML 목록 index.html"), fileLink("00-overview.html"), fileLink("study-package.zip")]
      : []
  };
  const fileLinks = hooks.collectFileLikeLinks(unresolvedContainer);
  assert.strictEqual(fileLinks.length, 3);
  assert.strictEqual(fileLinks[0].name, "index.html", "a descriptive link label must resolve to the actual trailing filename token");
  assert(fileLinks.every(item => item.unresolved), "file-like anchors without href must be classified as unresolved");
  const ordinaryExternalFileLinks = hooks.collectFileLikeLinks({
    querySelectorAll: selector => selector === "a, [role='link']"
      ? [fileLink("schema.json", "https://example.com/schema.json"), fileLink("manual.html", "https://example.com/manual.html")]
      : []
  });
  assert.strictEqual(
    ordinaryExternalFileLinks.length,
    0,
    "ordinary external links whose labels look like filenames must not become expected deliverables"
  );
  const incompleteIntegrity = hooks.assessArtifactIntegrity({
    fileLinks,
    attachments: [
      { name: "index.html", content: htmlDocument("Index", "Index", "captured") },
      { name: "00-overview.html", content: htmlDocument("Overview", "Overview", "captured") }
    ]
  });
  assert.strictEqual(incompleteIntegrity.complete, false);
  assert.deepStrictEqual(Array.from(incompleteIntegrity.missingNames), ["study-package.zip"]);
  let partialPrompt = "";
  assert.strictEqual(hooks.confirmPartialArtifactSave(incompleteIntegrity, message => {
    partialPrompt = String(message);
    return false;
  }), false, "Cancel must stop an incomplete artifact save by default");
  assert(partialPrompt.includes("study-package.zip"));
  assert.strictEqual(
    hooks.confirmPartialArtifactSave(incompleteIntegrity, () => true),
    true,
    "an explicit OK may authorize body-only or partial saving"
  );
  assert.strictEqual(
    hooks.removeEmptyMarkdownLinkTargets("[00-overview.html]() and [valid](https://example.com)"),
    "00-overview.html and [valid](https://example.com)",
    "empty Markdown targets must be preserved only as plain labels"
  );
  assert.strictEqual(
    hooks.removeEmptyMarkdownLinkTargets([
      "outside [missing.html]()",
      "",
      "```md",
      "[literal-inside-fence.html]()",
      "```not-a-closing-fence",
      "[still-literal-inside-fence.html]()",
      "```",
      "inline `[literal-inline.html]()`"
    ].join("\n")),
    [
      "outside missing.html",
      "",
      "```md",
      "[literal-inside-fence.html]()",
      "```not-a-closing-fence",
      "[still-literal-inside-fence.html]()",
      "```",
      "inline `[literal-inline.html]()`"
    ].join("\n"),
    "empty-link cleanup must not rewrite literal Markdown examples inside fenced or inline code"
  );

  assert.strictEqual(
    renderMarkdownTree(hooks, [elementNode("a", { children: [textNode("00-overview.html")] })]),
    "00-overview.html",
    "an href-less file anchor must convert directly to plain text"
  );
  assert.strictEqual(
    renderMarkdownTree(hooks, [elementNode("a", {
      attrs: { href: "https://example.com/reference" },
      children: [textNode("normal reference")]
    })]),
    "[normal reference](https://example.com/reference)",
    "an ordinary external link must remain a Markdown link"
  );
  assert.strictEqual(
    renderMarkdownTree(hooks, [textNode("본문의 피드백 보내기 문구는 실제 내용입니다.")]),
    "본문의 피드백 보내기 문구는 실제 내용입니다.",
    "ordinary answer text containing feedback wording must be preserved"
  );

  const richBlockA = { id: "block-a" };
  const richBlockB = { id: "block-b" };
  const oneRichRoot = {
    matches: () => false,
    querySelectorAll: selector => selector === '[data-app-block-preview="true"]' ? [richBlockA] : []
  };
  const twoRichRoot = {
    matches: () => false,
    querySelectorAll: selector => selector === '[data-app-block-preview="true"]' ? [richBlockA, richBlockB] : []
  };
  const generalIframeRoot = {
    matches: () => false,
    querySelectorAll: selector => selector === "iframe" ? [{ src: "https://web-sandbox.oaiusercontent.com.evil.example/app" }] : []
  };
  const expectedRichOne = hooks.collectRichAppBlockCandidates(oneRichRoot);
  assert.strictEqual(expectedRichOne.length, 1, "one app container and any nested iframe count as one rich artifact");
  assert.strictEqual(hooks.collectRichAppBlockCandidates(twoRichRoot).length, 2);
  assert.strictEqual(
    hooks.collectRichAppBlockCandidates(generalIframeRoot).length,
    0,
    "an ordinary iframe or lookalike sandbox hostname must not be treated as a rich app block"
  );

  const richIncomplete = hooks.assessRichArtifactIntegrity({ expected: expectedRichOne, captures: [] });
  const richComplete = hooks.assessRichArtifactIntegrity({
    expected: expectedRichOne,
    captures: [{ expectedId: expectedRichOne[0].id, representation: "static-markdown-complete" }]
  });
  const richPartial = hooks.assessRichArtifactIntegrity({
    expected: expectedRichOne,
    captures: [{ expectedId: expectedRichOne[0].id, representation: "static-markdown-partial" }]
  });
  const fileComplete = hooks.assessArtifactIntegrity();
  assert.strictEqual(richIncomplete.complete, false);
  assert.strictEqual(richPartial.complete, false, "a partial static representation must not satisfy rich completeness");
  assert.strictEqual(richComplete.complete, true);
  assert.strictEqual(hooks.combineCaptureIntegrity(fileComplete, richIncomplete).complete, false);
  assert.strictEqual(hooks.combineCaptureIntegrity(incompleteIntegrity, richComplete).complete, false);
  assert.strictEqual(hooks.combineCaptureIntegrity(fileComplete, richComplete).complete, true);

  let richPrompt = "";
  const richOverall = hooks.combineCaptureIntegrity(fileComplete, richIncomplete);
  assert.strictEqual(hooks.confirmIncompleteCaptureSave(richOverall, message => {
    richPrompt = String(message);
    return false;
  }), false, "rich-app loss must cancel by default");
  assert(richPrompt.includes("1") && /app block/i.test(richPrompt));
  assert.strictEqual(hooks.confirmIncompleteCaptureSave(richOverall, () => true), true);

  hooks.setTestLanguage("ko");
  const partialWarning = hooks.buildMissingRichArtifactWarning(richIncomplete);
  const partialNote = hooks.buildMarkdown({
    title: "부분 저장 테스트",
    questionText: "질문",
    answerText: `${partialWarning}\n\n바깥 설명문`,
    url: "https://chatgpt.example/c/rich-test",
    captureMetadata: {
      captureStatus: "partial",
      richArtifactsExpected: 1,
      richArtifactsComplete: 0
    }
  });
  assert(partialNote.includes("capture_status: partial"));
  assert(partialNote.includes("rich_artifacts_expected: 1"));
  assert(partialNote.includes("rich_artifacts_complete: 0"));
  assert(partialNote.includes("interactive_behavior_preserved: false"));
  assert(partialNote.includes("> [!warning] 상호작용형 앱 블록 미저장"));
  ["피드백 보내기", "Obsidian 저장", "web-sandbox.oaiusercontent.com", "/images/visualize/app-blocks-visualize.svg", "]()"]
    .forEach(forbidden => assert(!partialNote.includes(forbidden), `partial note must not contain ${forbidden}`));

  let removedRichBlocks = 0;
  const removableRichBlock = { remove: () => { removedRichBlocks += 1; } };
  assert.strictEqual(hooks.removeUnsupportedRichAppBlocks({
    matches: () => false,
    querySelectorAll: selector => selector === '[data-app-block-preview="true"]' ? [removableRichBlock] : []
  }), 1);
  assert.strictEqual(removedRichBlocks, 1, "the cloned app block shell must be removed exactly once");

  let citationReplacement = null;
  const truncatedCitation = {
    innerText: "screencapture-x-Aqui-mi-casa-st…",
    textContent: "screencapture-x-Aqui-mi-casa-st…",
    replaceWith: node => { citationReplacement = node; }
  };
  hooks.normalizeFileCitationChips({
    matches: () => false,
    querySelectorAll: selector => selector === "[data-file-citation-primary-source]" ? [truncatedCitation] : []
  });
  assert.strictEqual(citationReplacement.textContent, "출처 파일 표시명: screencapture-x-Aqui-mi-casa-st…");
  assert(!citationReplacement.textContent.includes("]("), "a citation display chip must not become a link");

  const pluginIcon = elementNode("img", {
    attrs: { src: "https://chatgpt.com/images/visualize/app-blocks-visualize.svg" },
    closest: selector => selector.includes("data-plugin-id") ? { id: "visualize-mention" } : null
  });
  const ordinarySameUrlImage = elementNode("img", {
    attrs: { src: "https://chatgpt.com/images/visualize/app-blocks-visualize.svg", alt: "diagram" }
  });
  const ordinaryRemoteImage = elementNode("img", {
    attrs: { src: "https://example.com/diagram.svg", alt: "diagram" }
  });
  assert.strictEqual(hooks.isDecorativeContentImage(pluginIcon), true);
  assert.strictEqual(hooks.isDecorativeContentImage(ordinarySameUrlImage), false, "path alone is not enough to remove an image");
  assert.strictEqual(hooks.isDecorativeContentImage(ordinaryRemoteImage), false);
  assert.strictEqual(
    renderMarkdownTree(hooks, [ordinaryRemoteImage]),
    "![diagram](https://example.com/diagram.svg)",
    "ordinary content images must survive Markdown conversion"
  );

  const appFrame = {
    src: "https://web-sandbox.oaiusercontent.com/visualize",
    getAttribute: name => name === "srcdoc" ? htmlDocument("Wrong", "Feedback", "피드백 보내기") : "",
    closest: selector => selector === '[data-app-block-preview="true"]' ? richBlockA : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    parentElement: null
  };
  const realHtml = htmlDocument("Actual", "Real file", "complete body");
  const realFrame = {
    src: "",
    getAttribute: name => name === "srcdoc" ? realHtml : "",
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    parentElement: null
  };
  const mixedFrameContainer = {
    innerText: "actual.html",
    textContent: "actual.html",
    getAttribute: () => "",
    querySelector: selector => selector.includes("iframe") ? realFrame : null,
    querySelectorAll: selector => selector === "iframe" ? [appFrame, realFrame] : []
  };
  appFrame.parentElement = mixedFrameContainer;
  realFrame.parentElement = mixedFrameContainer;
  const previewFiles = await hooks.readHtmlPreviews(mixedFrameContainer, ["actual.html"], []);
  assert.strictEqual(previewFiles.length, 1, "an app iframe must not consume the fallback filename of a real HTML preview");
  assert.strictEqual(previewFiles[0].name, "actual.html");
  assert.strictEqual(previewFiles[0].content, realHtml);

  const reservationKey = `cancel-retry-${Date.now()}`;
  assert.strictEqual(hooks.isDuplicateContentSave(reservationKey), false);
  assert.strictEqual(hooks.isDuplicateContentSave(reservationKey), true);
  hooks.clearContentSaveReservation(reservationKey);
  assert.strictEqual(hooks.isDuplicateContentSave(reservationKey), false, "cancelling must allow an immediate retry");
  hooks.clearContentSaveReservation(reservationKey);
  hooks.setTestLanguage("en");

  {
    const fixture = makeHandleCopyFixture(hooks);
    try {
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 1);
      assert.strictEqual(fixture.events.opens.length, 0, "Cancel must not issue an Obsidian URI request");
      assert.strictEqual(fixture.events.saves.length, 0, "Cancel must not issue a Native save request");

      fixture.setApprove(true);
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 2, "the same response must be immediately retryable after cancellation");
      assert.strictEqual(fixture.events.opens.length, 1);
      assert.strictEqual(fixture.events.saves.length, 0);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes("capture_status: partial"));
      assert(markdown.includes("rich_artifacts_expected: 1"));
      assert(markdown.includes("rich_artifacts_complete: 0"));
      assert(markdown.includes("> [!warning]"));
      assert(!markdown.includes("visualize_share_url:"), "an explicitly approved generic partial note must not invent a share URL");
      assert(!markdown.includes("capture_mode:"), "an explicitly approved generic partial note must not claim a remote-share mode");
      ["web-sandbox.oaiusercontent.com", "피드백 보내기", "]()"]
        .forEach(forbidden => assert(!markdown.includes(forbidden), `orchestrated partial note must not contain ${forbidden}`));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 0, "an ordinary response must not show a rich-app warning");
      assert.strictEqual(fixture.events.opens.length, 1);
      assert.strictEqual(fixture.events.saves.length, 0);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(!markdown.includes("capture_status: partial"));
      assert(!markdown.includes("> [!warning]"));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: true, html: true });
    fixture.setApprove(true);
    try {
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 1);
      assert.strictEqual(fixture.events.opens.length, 0);
      assert.strictEqual(fixture.events.saves.length, 1);
      const payload = fixture.events.saves[0].payload;
      assert.deepStrictEqual(Array.from(payload.attachmentNames), ["actual.html"]);
      assert.strictEqual(
        payload.allowPartialAttachments,
        false,
        "rich-only consent must not weaken strict Native verification for a complete HTML file"
      );
      assert(payload.content.includes("capture_status: partial"));
      assert(payload.content.includes("> [!warning]"));
    } finally {
      fixture.restore();
    }
  }

  const sandbox = hooks.__sandbox;
  const originalRuntimeId = sandbox.chrome.runtime.id;
  const originalAlert = sandbox.alert;
  let staleTabAlerts = 0;
  sandbox.chrome.runtime.id = "";
  sandbox.alert = message => {
    staleTabAlerts += 1;
    assert(String(message).includes("Refresh this tab"));
  };
  const staleTabStartedAt = Date.now();
  await hooks.handleCopyClick({
    closest: () => { throw new Error("a stale-tab Save must stop before inspecting or clicking the response DOM"); }
  }, { delayMs: 0 });
  assert(Date.now() - staleTabStartedAt < 1000, "runtime-unavailable Save must stop immediately instead of entering a 90-second artifact wait");
  assert.strictEqual(staleTabAlerts, 1, "the stale-tab refresh instruction must be shown once");
  sandbox.chrome.runtime.id = originalRuntimeId;
  sandbox.alert = originalAlert;

  const splitMessage = {
    parentElement: null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const splitHtml = htmlDocument("Split artifact", "분리된 파일", "complete body");
  const splitFrame = {
    parentElement: null,
    src: "",
    getAttribute: name => name === "srcdoc" ? splitHtml : "",
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const splitTurn = {
    parentElement: null,
    innerText: "split-artifact.html",
    textContent: "split-artifact.html",
    getAttribute: () => "",
    querySelector: selector => selector.includes("iframe") ? splitFrame : null,
    querySelectorAll: selector => selector === "iframe" ? [splitFrame] : []
  };
  splitMessage.parentElement = splitTurn;
  splitFrame.parentElement = splitTurn;
  const splitSaveButton = {
    closest: selector => {
      if (selector === "[data-testid^='conversation-turn-']") return splitTurn;
      if (selector === "[data-message-author-role]") return splitMessage;
      return null;
    }
  };
  assert.strictEqual(
    hooks.closestArtifactContainer(splitSaveButton),
    splitTurn,
    "GPT 5.6 sibling file cards must be searched in the complete conversation turn"
  );
  const splitExtraction = await hooks.extractDownloadFiles(
    splitSaveButton,
    ["split-artifact.html"],
    ""
  );
  assert.strictEqual(splitExtraction.files.length, 1);
  assert.strictEqual(splitExtraction.files[0].name, "split-artifact.html");
  assert.strictEqual(splitExtraction.files[0].content, splitHtml);

  const ordinaryMessage = {
    parentElement: null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const ordinarySaveButton = {
    closest: selector => selector === "[data-message-author-role]" ? ordinaryMessage : null
  };
  assert.strictEqual(
    hooks.closestArtifactContainer(ordinarySaveButton),
    ordinaryMessage,
    "ordinary unsplit responses must keep their existing message scope"
  );

  const fixtureRows = [
    { name: "readme.md", row: { id: "readme" }, openButton: {} },
    { name: "code-for-all-detailed-summary-ko.md", row: { id: "detail" }, openButton: {} }
  ];
  const selected = hooks.selectGeneratedMarkdownArtifact(fixtureRows);
  assert.strictEqual(selected.row.name, "code-for-all-detailed-summary-ko.md");

  const detailed = [
    "## 연구 질문",
    "",
    "| 항목 | 내용 |",
    "| --- | --- |",
    "| 목적 | 모두를 위한 코드 |",
    "",
    "```js",
    "const preserved = true;",
    "```"
  ].join("\n");

  const hiddenDuplicate = {
    name: "duplicate-detailed-summary.md",
    row: makeVisibilityNode({ display: "none" }),
    openButton: makeVisibilityNode({ display: "none" }),
    downloadButton: null,
    href: ""
  };
  const visibleDuplicate = {
    name: "duplicate-detailed-summary.md",
    row: makeVisibilityNode(),
    openButton: makeVisibilityNode(),
    downloadButton: makeVisibilityNode(),
    href: ""
  };
  assert.strictEqual(
    hooks.choosePreferredArtifactRow([hiddenDuplicate, visibleDuplicate]),
    visibleDuplicate,
    "a visible duplicate row must win over a hidden duplicate with the same filename"
  );
  assert.strictEqual(
    hooks.selectGeneratedMarkdownArtifact([hiddenDuplicate, visibleDuplicate]).row.row,
    visibleDuplicate.row,
    "same-name duplicate rows must not create a false filename ambiguity"
  );

  const previousFlyout = {
    innerText: "",
    textContent: "",
    getAttribute: () => ""
  };
  const filenameLessFlyout = {
    innerText: "generated document",
    textContent: "generated document",
    getAttribute: () => ""
  };
  const filenameLessCandidate = hooks.findGeneratedMarkdownRegionCandidate("filename-less-summary.md", {
    regions: [previousFlyout, filenameLessFlyout],
    beforeRegions: [previousFlyout],
    readCandidates: region => region === filenameLessFlyout ? [{ markdown: detailed }] : []
  });
  assert.strictEqual(filenameLessCandidate.region, filenameLessFlyout);
  assert.strictEqual(filenameLessCandidate.markdown, detailed);
  assert.strictEqual(filenameLessCandidate.matchKind, "single-new-flyout");
  assert.strictEqual(filenameLessCandidate.ambiguous, false);

  const secondFilenameLessFlyout = {
    innerText: "another generated document",
    textContent: "another generated document",
    getAttribute: () => ""
  };
  const ambiguousFlyouts = hooks.findGeneratedMarkdownRegionCandidate("filename-less-summary.md", {
    regions: [previousFlyout, filenameLessFlyout, secondFilenameLessFlyout],
    beforeRegions: [previousFlyout],
    readCandidates: region => region === previousFlyout ? [] : [{ markdown: detailed }]
  });
  assert.strictEqual(ambiguousFlyouts.markdown, "");
  assert.strictEqual(ambiguousFlyouts.ambiguous, true);
  assert.strictEqual(ambiguousFlyouts.matchKind, "multiple-new-flyouts");

  const exactNamedFlyout = {
    innerText: "filename-less-summary.md",
    textContent: "filename-less-summary.md",
    getAttribute: () => ""
  };
  const exactBeatsNewFlyout = hooks.findGeneratedMarkdownRegionCandidate("filename-less-summary.md", {
    regions: [exactNamedFlyout, filenameLessFlyout],
    beforeRegions: [],
    readCandidates: region => region === exactNamedFlyout
      ? [{ markdown: `${detailed}\n\nexact` }, { markdown: detailed }]
      : [{ markdown: "unrelated new flyout body" }]
  });
  assert.strictEqual(exactBeatsNewFlyout.region, exactNamedFlyout);
  assert.strictEqual(exactBeatsNewFlyout.markdown, `${detailed}\n\nexact`);
  assert.strictEqual(exactBeatsNewFlyout.matchKind, "exact-name-best-readable-node");
  assert.strictEqual(exactBeatsNewFlyout.ambiguous, false, "one exact filename region remains the strongest mapping signal");

  const nestedInner = makeFlyoutRegion({ testId: "screen-threadFlyOut", name: "nested-summary.md" });
  const nestedOuter = makeFlyoutRegion({
    testId: "stage-thread-flyout",
    name: "nested-summary.md",
    canonicalChildren: [nestedInner]
  });
  nestedInner.parentElement = nestedOuter;
  const canonicalNestedRegions = hooks.collectGeneratedMarkdownRegions({ nodes: [nestedOuter, nestedInner] });
  assert.strictEqual(canonicalNestedRegions.length, 1);
  assert.strictEqual(
    canonicalNestedRegions[0],
    nestedInner,
    "the outer stage-thread-flyout and inner screen-threadFlyOut must canonicalize to one viewer"
  );

  const sharedReadableNode = { id: "shared-prosemirror" };
  const sharedNestedCandidate = hooks.findGeneratedMarkdownRegionCandidate("nested-summary.md", {
    regions: [nestedOuter, nestedInner],
    readCandidates: () => [{ node: sharedReadableNode, markdown: detailed }]
  });
  assert.strictEqual(sharedNestedCandidate.region, nestedInner);
  assert.strictEqual(sharedNestedCandidate.markdown, detailed);
  assert.strictEqual(sharedNestedCandidate.ambiguous, false, "ancestor and descendant wrappers sharing one readable node are one viewer");

  const hashInner = makeFlyoutRegion({ testId: "screen-threadFlyOut", name: "hash-equivalent.md" });
  const hashOuter = makeFlyoutRegion({
    testId: "stage-thread-flyout",
    name: "hash-equivalent.md",
    canonicalChildren: [hashInner]
  });
  hashInner.parentElement = hashOuter;
  const hashEquivalent = hooks.collapseEquivalentGeneratedMarkdownRegions(
    [hashOuter, hashInner],
    region => [{ node: { region }, markdown: `  ${detailed}\n\n` }]
  );
  assert.strictEqual(hashEquivalent.length, 1);
  assert.strictEqual(hashEquivalent[0], hashInner, "nested wrappers with the same normalized Markdown body must collapse");

  const independentViewerA = makeFlyoutRegion({ testId: "screen-threadFlyOut", name: "genuine-ambiguity.md" });
  const independentViewerB = makeFlyoutRegion({ testId: "screen-threadFlyOut", name: "genuine-ambiguity.md" });
  const genuineAmbiguity = hooks.findGeneratedMarkdownRegionCandidate("genuine-ambiguity.md", {
    regions: [independentViewerA, independentViewerB],
    readCandidates: region => [{ node: { region }, markdown: region === independentViewerA ? `${detailed}\nA` : `${detailed}\nB` }]
  });
  assert.strictEqual(genuineAmbiguity.ambiguous, true, "independent visible viewers must remain ambiguous");
  assert.strictEqual(genuineAmbiguity.matchKind, "multiple-exact-name-regions");

  let ambiguityVirtualNow = 0;
  const stableAmbiguity = await hooks.waitForGeneratedMarkdownRegion("genuine-ambiguity.md", {
    timeoutMs: 90000,
    pollMs: 200,
    ambiguityStabilityMs: 1000,
    now: () => ambiguityVirtualNow,
    sleepFn: async ms => { ambiguityVirtualNow += ms; },
    findCandidate: () => ({
      region: null,
      markdown: "",
      ambiguous: true,
      matchKind: "multiple-exact-name-regions",
      regionCount: 2,
      newRegionCount: 0,
      readableNodeCount: 2
    })
  });
  assert.strictEqual(stableAmbiguity.ambiguous, true);
  assert.strictEqual(stableAmbiguity.stabilizedAmbiguity, true);
  assert(
    stableAmbiguity.elapsedMs >= 1000 && stableAmbiguity.elapsedMs < 5000,
    "a structurally stable genuine ambiguity must stop after a short stabilization window instead of waiting 90 seconds"
  );

  let viewerRuntimePingCount = 0;
  const viewerRuntimeGuard = hooks.createRuntimeGuard({
    syncCheck: phase => ({ ok: true, phase }),
    ping: async phase => {
      viewerRuntimePingCount += 1;
      return viewerRuntimePingCount === 1
        ? { ok: true, pong: true, phase }
        : hooks.classifyExtensionRuntimeFailure("Extension context invalidated", { source: "context-invalidated", phase });
    },
    notifyUser: () => {}
  });
  let runtimeWaitNow = 0;
  const invalidatedViewerWait = await hooks.waitForGeneratedMarkdownRegion("runtime-invalidated.md", {
    timeoutMs: 90000,
    pollMs: 100,
    runtimeCheckIntervalMs: 500,
    now: () => runtimeWaitNow,
    sleepFn: async ms => { runtimeWaitNow += ms; },
    runtimeGuard: viewerRuntimeGuard,
    findCandidate: () => ({
      region: null,
      markdown: "",
      ambiguous: false,
      matchKind: "no-new-flyout",
      regionCount: 0,
      newRegionCount: 0,
      readableNodeCount: 0
    })
  });
  assert.strictEqual(invalidatedViewerWait.runtimeUnavailable, true);
  assert.strictEqual(invalidatedViewerWait.matchKind, "runtime-unavailable");
  assert(invalidatedViewerWait.elapsedMs >= 500 && invalidatedViewerWait.elapsedMs < 2000);
  assert.strictEqual(viewerRuntimeGuard.isAborted(), true);

  const pingTimeoutResult = await hooks.pingExtensionRuntime("ping-timeout-self-test", {
    timeoutMs: 2,
    sendMessage: async () => new Promise(() => {})
  });
  assert.strictEqual(pingTimeoutResult.runtimeUnavailable, true);
  assert.strictEqual(pingTimeoutResult.runtimeFailureKind, "runtime-ping-timeout");

  const versionMismatchResult = await hooks.pingExtensionRuntime("version-mismatch-self-test", {
    timeoutMs: 20,
    sendMessage: async () => ({ ok: true, pong: true, version: "1.5.41" })
  });
  assert.strictEqual(versionMismatchResult.runtimeUnavailable, true);
  assert.strictEqual(versionMismatchResult.runtimeFailureKind, "runtime-version-mismatch");

  let slowVirtualNow = 0;
  const slowViewer = { id: "slow-manual-viewer" };
  const slowManualResult = await hooks.waitForGeneratedMarkdownRegion("slow-manual-summary.md", {
    timeoutMs: 90000,
    pollMs: 1000,
    now: () => slowVirtualNow,
    sleepFn: async ms => { slowVirtualNow += ms; },
    findRegion: () => slowViewer,
    readRegion: region => slowVirtualNow >= 60000 && region === slowViewer ? detailed : ""
  });
  assert.strictEqual(slowManualResult.markdown, detailed, "manual viewer opening after 30 seconds must still succeed inside the 90 second window");
  assert(slowManualResult.elapsedMs >= 60000 && slowManualResult.elapsedMs < 90000);

  let viewerOpened = false;
  const extracted = await hooks.extractGeneratedMarkdownArtifact({}, {
    rows: [fixtureRows[1]],
    skipReveal: true,
    openAndRead: async row => {
      viewerOpened = true;
      assert.strictEqual(row.name, fixtureRows[1].name);
      return detailed;
    }
  });
  assert.strictEqual(viewerOpened, true, "Markdown viewer should be opened programmatically");
  assert.strictEqual(extracted.markdown, detailed);

  let virtualNow = 0;
  const delayedViewer = { id: "delayed-markdown-viewer" };
  const delayedResult = await hooks.waitForGeneratedMarkdownRegion("delayed-summary.md", {
    timeoutMs: 30000,
    pollMs: 200,
    now: () => virtualNow,
    sleepFn: async ms => { virtualNow += ms; },
    findRegion: () => delayedViewer,
    readRegion: region => virtualNow >= 7600 && region === delayedViewer ? detailed : ""
  });
  assert.strictEqual(delayedResult.markdown, detailed, "Markdown viewer must tolerate a load longer than the old 5 second limit");
  assert(delayedResult.elapsedMs >= 7600);

  let delayedCardOpened = false;
  let delayedViewerClosed = false;
  let rowVirtualNow = 0;
  const closeButton = {
    innerText: "닫기",
    textContent: "닫기",
    getAttribute: () => "",
    click: () => { delayedViewerClosed = true; }
  };
  const delayedRegion = {
    querySelectorAll: selector => selector === "button" ? [closeButton] : []
  };
  const delayedRowResult = await hooks.readGeneratedMarkdownArtifactRow({
    name: "delayed-summary.md",
    href: "",
    openButton: { click: () => { delayedCardOpened = true; } }
  }, {
    viewerWaitOptions: {
      timeoutMs: 30000,
      pollMs: 200,
      now: () => rowVirtualNow,
      sleepFn: async ms => { rowVirtualNow += ms; },
      findRegion: () => delayedRegion,
      readRegion: region => rowVirtualNow >= 7600 && region === delayedRegion ? detailed : ""
    }
  });
  assert.strictEqual(delayedCardOpened, true);
  assert.strictEqual(delayedRowResult.markdown, detailed);
  assert.strictEqual(delayedViewerClosed, true, "Markdown viewer should close after extraction");

  let openedBeforeFirstWait = false;
  let firstWaitStarted = false;
  let earlyOpenVirtualNow = 0;
  const earlyOpenRegion = {
    querySelectorAll: selector => selector === "button" ? [closeButton] : []
  };
  const earlyOpenPromise = hooks.extractGeneratedMarkdownArtifact({
    querySelectorAll: () => []
  }, {
    rows: [{
      name: "early-open-summary.md",
      href: "",
      row: { id: "early-open" },
      openButton: {
        click: () => {
          assert.strictEqual(firstWaitStarted, false, "Markdown card must open before the first async wait");
          openedBeforeFirstWait = true;
        }
      }
    }],
    viewerWaitOptions: {
      timeoutMs: 30000,
      pollMs: 200,
      now: () => earlyOpenVirtualNow,
      sleepFn: async ms => {
        firstWaitStarted = true;
        earlyOpenVirtualNow += ms;
      },
      findRegion: () => earlyOpenRegion,
      readRegion: () => earlyOpenVirtualNow >= 7600 ? detailed : ""
    }
  });
  assert.strictEqual(openedBeforeFirstWait, true, "visible Markdown card should open synchronously");
  const earlyOpenResult = await earlyOpenPromise;
  assert.strictEqual(earlyOpenResult.markdown, detailed);

  let markdownDownloadClicked = 0;
  const downloadedFallback = await hooks.extractGeneratedMarkdownArtifact({}, {
    rows: [{
      name: "code-for-all-detailed-summary-ko.md",
      href: "",
      row: { id: "downloaded-detail" },
      openButton: { click: () => {} },
      downloadButton: { click: () => { markdownDownloadClicked += 1; } }
    }],
    skipReveal: true,
    viewerWaitOptions: {
      timeoutMs: 0,
      sleepFn: async () => {},
      findRegion: () => null,
      readRegion: () => ""
    },
    downloadCaptureOptions: {
      promptDelayMs: 100000,
      beginWatch: async (name) => {
        assert.strictEqual(name, "code-for-all-detailed-summary-ko.md");
        return { ok: true, watchId: "markdown-watch" };
      },
      awaitWatch: async (watchId) => {
        assert.strictEqual(watchId, "markdown-watch");
        return {
          ok: true,
          download: {
            id: 741,
            name: "code-for-all-detailed-summary-ko (1).md",
            sourcePath: "/tmp/code-for-all-detailed-summary-ko (1).md",
            startTime: "2026-08-25T05:00:00.000Z",
            endTime: "2026-08-25T05:00:00.500Z"
          }
        };
      }
    }
  });
  assert.strictEqual(markdownDownloadClicked, 1, "the exact Markdown row download control should be clicked once");
  assert.strictEqual(downloadedFallback.markdown, "");
  assert.strictEqual(downloadedFallback.downloadedMarkdown.downloadId, 741);
  assert.strictEqual(downloadedFallback.downloadedMarkdown.name, "code-for-all-detailed-summary-ko_(1).md");

  let staleDownloadClicks = 0;
  let rerenderedDownloadClicks = 0;
  let staleOpenClicks = 0;
  let rerenderedOpenClicks = 0;
  const staleRowNode = makeVisibilityNode({ connected: false });
  const rerenderedRowNode = makeVisibilityNode();
  const staleDescriptor = {
    name: "rerendered-summary.md",
    href: "",
    row: staleRowNode,
    openButton: { ...makeVisibilityNode({ connected: false }), click: () => { staleOpenClicks += 1; } },
    downloadButton: { ...makeVisibilityNode({ connected: false }), click: () => { staleDownloadClicks += 1; } }
  };
  const rerenderedDescriptor = {
    name: "rerendered-summary.md",
    href: "",
    row: rerenderedRowNode,
    openButton: { ...makeVisibilityNode(), click: () => { rerenderedOpenClicks += 1; } },
    downloadButton: { ...makeVisibilityNode(), click: () => { rerenderedDownloadClicks += 1; } }
  };
  const rerenderedFallback = await hooks.extractGeneratedMarkdownArtifact({}, {
    rows: [staleDescriptor],
    resolveRows: () => [rerenderedDescriptor],
    skipReveal: true,
    viewerWaitOptions: {
      timeoutMs: 0,
      sleepFn: async () => {},
      findRegion: () => null,
      readRegion: () => ""
    },
    downloadCaptureOptions: {
      promptDelayMs: 100000,
      beginWatch: async () => ({ ok: true, watchId: "rerender-watch" }),
      awaitWatch: async () => ({
        ok: true,
        download: {
          id: 743,
          name: "rerendered-summary.md",
          sourcePath: "/tmp/rerendered-summary.md",
          startTime: "2026-08-25T05:00:03.000Z",
          endTime: "2026-08-25T05:00:03.500Z"
        }
      })
    }
  });
  assert.strictEqual(staleDownloadClicks, 0, "a disconnected pre-render row must never receive the download click");
  assert.strictEqual(rerenderedDownloadClicks, 1, "the current visible row must be resolved immediately before download activation");
  assert.strictEqual(staleOpenClicks, 0, "a disconnected pre-render row must never receive the open click");
  assert.strictEqual(rerenderedOpenClicks, 1, "the current visible row must be resolved immediately before viewer opening");
  assert.strictEqual(rerenderedFallback.downloadedMarkdown.downloadId, 743);

  let lateResolverCalls = 0;
  let lateDownloadClicks = 0;
  const lateButton = { ...makeVisibilityNode(), click: () => { lateDownloadClicks += 1; } };
  const lateCapture = hooks.startGeneratedMarkdownDownloadCapture({ name: "late-control-summary.md" }, {
    resolveRow: () => {
      lateResolverCalls += 1;
      return {
        name: "late-control-summary.md",
        row: makeVisibilityNode(),
        openButton: null,
        downloadButton: lateResolverCalls >= 2 ? lateButton : null,
        href: ""
      };
    },
    controlPollMs: 1,
    promptDelayMs: 100000,
    beginWatch: async () => ({ ok: true, watchId: "late-control-watch" }),
    awaitWatch: async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return {
        ok: true,
        download: {
          id: 744,
          name: "late-control-summary.md",
          sourcePath: "/tmp/late-control-summary.md",
          startTime: "2026-08-25T05:00:04.000Z",
          endTime: "2026-08-25T05:00:04.500Z"
        }
      };
    }
  });
  const lateCaptureResult = await lateCapture.result;
  assert(lateResolverCalls >= 2, "the row must be re-resolved after the first missing-control snapshot");
  assert.strictEqual(lateDownloadClicks, 1, "a download control that appears after render must be clicked once");
  assert.strictEqual(lateCaptureResult.downloadedMarkdown.downloadId, 744);

  let invalidatedDownloadPingCount = 0;
  let invalidatedDownloadClicks = 0;
  let invalidatedDownloadCancels = 0;
  let invalidatedDownloadPrompts = 0;
  const invalidatedDownloadGuard = hooks.createRuntimeGuard({
    syncCheck: phase => ({ ok: true, phase }),
    ping: async phase => {
      invalidatedDownloadPingCount += 1;
      return invalidatedDownloadPingCount === 1
        ? { ok: true, pong: true, phase }
        : hooks.classifyExtensionRuntimeFailure("Extension context invalidated", { source: "context-invalidated", phase });
    },
    notifyUser: () => {}
  });
  const invalidatedDownloadCapture = hooks.startGeneratedMarkdownDownloadCapture({
    name: "runtime-invalidated-download.md",
    downloadButton: { ...makeVisibilityNode(), click: () => { invalidatedDownloadClicks += 1; } }
  }, {
    runtimeGuard: invalidatedDownloadGuard,
    runtimePollIntervalMs: 1,
    promptDelayMs: 25,
    promptUser: () => { invalidatedDownloadPrompts += 1; },
    beginWatch: async () => ({ ok: true, watchId: "runtime-invalidated-watch" }),
    awaitWatch: async () => new Promise(() => {}),
    cancelWatch: async watchId => {
      assert.strictEqual(watchId, "runtime-invalidated-watch");
      invalidatedDownloadCancels += 1;
      return { ok: true };
    }
  });
  const invalidatedDownloadResult = await invalidatedDownloadCapture.result;
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.strictEqual(invalidatedDownloadResult.runtimeUnavailable, true);
  assert.strictEqual(invalidatedDownloadGuard.isAborted(), true);
  assert.strictEqual(invalidatedDownloadClicks, 1, "the exact control may be activated only after the initial ping and watch start");
  assert(invalidatedDownloadCancels >= 1, "runtime invalidation must cancel the current exact-name download watch");
  assert.strictEqual(invalidatedDownloadPrompts, 0, "runtime invalidation must clear delayed user prompts and stale callbacks");

  let classifiedFailureClicks = 0;
  const classifiedFailure = await hooks.extractGeneratedMarkdownArtifact({}, {
    rows: [{
      name: "classified-failure-summary.md",
      href: "",
      row: makeVisibilityNode(),
      openButton: { ...makeVisibilityNode(), click: () => {} },
      downloadButton: { ...makeVisibilityNode(), click: () => { classifiedFailureClicks += 1; } }
    }],
    skipReveal: true,
    viewerWaitOptions: {
      timeoutMs: 0,
      sleepFn: async () => {},
      findRegion: () => null,
      readRegion: () => ""
    },
    downloadCaptureOptions: {
      promptDelayMs: 100000,
      beginWatch: async () => ({ ok: true, watchId: "classified-failure-watch" }),
      awaitWatch: async () => ({ ok: false, error: "markdown-download-watch-timeout" })
    }
  });
  assert.strictEqual(classifiedFailureClicks, 1);
  assert(
    classifiedFailure.warnings.some(message => message.includes("was found and activation was attempted, but the current download could not be tracked")),
    "a present exact download control must distinguish activation from download tracking failure"
  );
  assert(
    !classifiedFailure.warnings.some(message => message.includes("was not found")),
    "post-render presence of the exact control must suppress the stale not-found warning"
  );
  assert(
    !classifiedFailure.warnings.some(message => message.includes("activation/download failed")),
    "a completed Chrome download that cannot be tracked must not be mislabeled as an activation/download failure"
  );

  hooks.setTestLanguage("ko");
  let uriFallbackAttempts = 0;
  const nativeFailureAlerts = [];
  const healthyRuntimeGuard = hooks.createRuntimeGuard({
    syncCheck: phase => ({ ok: true, phase }),
    ping: async phase => ({ ok: true, pong: true, phase }),
    notifyUser: () => { throw new Error("healthy runtime must not show a refresh warning"); }
  });
  const nativeFailureResult = await hooks.saveObsidianNote({
    vaultName: "Test",
    vaultPath: "/tmp/Test",
    filePath: "ChatGPT/test.md",
    content: "# test",
    attachments: [{ name: "test.html", content: "<!doctype html><html><body>test</body></html>" }],
    downloadedAttachments: [],
    downloadedMarkdown: null,
    attachmentNames: [],
    htmlSaveDir: "ChatGPT/Attachments",
    fallbackUri: "obsidian://new?vault=Test&name=test"
  }, {
    runtimeGuard: healthyRuntimeGuard,
    sendMessage: async () => ({ ok: false, error: "native helper test failure" }),
    openUri: () => { uriFallbackAttempts += 1; },
    showAlert: message => { nativeFailureAlerts.push(String(message)); }
  });
  assert.strictEqual(nativeFailureResult.fallbackAttempted, true);
  assert.strictEqual(uriFallbackAttempts, 1);
  assert(nativeFailureAlerts[0].includes("열도록 시도했지만"));
  assert(!nativeFailureAlerts[0].includes("다시 열었지만"), "unverified URI fallback must never be described as a successful open");

  const auditAlerts = [];
  const incompleteAuditResult = await hooks.saveObsidianNote({
    vaultName: "Test",
    vaultPath: "/tmp/Test",
    filePath: "ChatGPT/incomplete-audit.md",
    content: "# incomplete audit",
    attachments: [{ name: "required.html", content: "<!doctype html><html><body>required</body></html>" }],
    downloadedAttachments: [],
    downloadedMarkdown: null,
    attachmentNames: ["required.html"],
    allowPartialAttachments: false,
    htmlSaveDir: "ChatGPT/Attachments",
    fallbackUri: ""
  }, {
    runtimeGuard: healthyRuntimeGuard,
    sendMessage: async () => ({
      ok: true,
      attachments: [],
      attachmentAudit: { writtenRequestedNames: [], missingNames: ["required.html"] },
      warnings: []
    }),
    showAlert: message => { auditAlerts.push(String(message)); }
  });
  assert.strictEqual(incompleteAuditResult.ok, false);
  assert.strictEqual(incompleteAuditResult.error, "native-attachment-audit-incomplete");
  assert(auditAlerts.some(message => message.includes("required.html")));

  let disconnectedUriAttempts = 0;
  let disconnectedNotices = 0;
  let disconnectedNativeMessages = 0;
  const disconnectedRuntimeGuard = hooks.createRuntimeGuard({
    syncCheck: phase => ({ ok: true, phase }),
    ping: async phase => hooks.classifyExtensionRuntimeFailure("Extension context invalidated", { source: "context-invalidated", phase }),
    notifyUser: () => { disconnectedNotices += 1; }
  });
  const disconnectedSaveResult = await hooks.saveObsidianNote({
    vaultName: "Test",
    vaultPath: "/tmp/Test",
    filePath: "ChatGPT/runtime-disconnected.md",
    content: "# runtime disconnected",
    attachments: [{ name: "runtime.html", content: "<!doctype html><html><body>runtime</body></html>" }],
    downloadedAttachments: [],
    downloadedMarkdown: null,
    attachmentNames: [],
    htmlSaveDir: "ChatGPT/Attachments",
    fallbackUri: "obsidian://new?vault=Test&name=runtime-disconnected"
  }, {
    runtimeGuard: disconnectedRuntimeGuard,
    sendMessage: async () => {
      disconnectedNativeMessages += 1;
      return { ok: true };
    },
    openUri: () => { disconnectedUriAttempts += 1; },
    showAlert: () => { throw new Error("runtime disconnect must use only the refresh notice"); }
  });
  assert.strictEqual(disconnectedSaveResult.runtimeUnavailable, true);
  assert.strictEqual(disconnectedNativeMessages, 0, "native save must not be attempted after runtime ping failure");
  assert.strictEqual(disconnectedUriAttempts, 0, "artifact notes must not use unverifiable URI fallback after runtime disconnect");
  assert.strictEqual(disconnectedNotices, 1);
  disconnectedRuntimeGuard.notify();
  assert.strictEqual(disconnectedNotices, 1, "runtime refresh guidance must be shown at most once per Save action");
  hooks.setTestLanguage("en");

  let failedHrefDownloadClicked = 0;
  const failedHrefFallback = await hooks.extractGeneratedMarkdownArtifact({}, {
    rows: [{
      name: "fetch-failure-summary.md",
      href: "https://chatgpt.example/backend-api/files/fetch-failure-summary.md",
      row: { id: "fetch-failure" },
      openButton: { click: () => {} },
      downloadButton: { click: () => { failedHrefDownloadClicked += 1; } }
    }],
    skipReveal: true,
    readHref: async () => { throw new Error("403"); },
    viewerWaitOptions: {
      timeoutMs: 0,
      sleepFn: async () => {},
      findRegion: () => null,
      readRegion: () => ""
    },
    downloadCaptureOptions: {
      promptDelayMs: 100000,
      beginWatch: async () => ({ ok: true, watchId: "failed-href-watch" }),
      awaitWatch: async () => ({
        ok: true,
        download: {
          id: 742,
          name: "fetch-failure-summary.md",
          sourcePath: "/tmp/fetch-failure-summary.md",
          startTime: "2026-08-25T05:00:02.000Z",
          endTime: "2026-08-25T05:00:02.500Z"
        }
      })
    }
  });
  assert.strictEqual(failedHrefDownloadClicked, 1, "a failed page fetch must start the exact Markdown download fallback");
  assert.strictEqual(failedHrefFallback.downloadedMarkdown.downloadId, 742);

  let trustedOpenPrompted = 0;
  let trustedViewerOpened = false;
  const trustedRegion = {
    querySelectorAll: selector => selector === "button" ? [closeButton] : []
  };
  const trustedOpenFallback = await hooks.extractGeneratedMarkdownArtifact({}, {
    rows: [{
      name: "trusted-open-summary.md",
      href: "",
      row: { id: "trusted-open" },
      openButton: { click: () => {} },
      downloadButton: null
    }],
    skipReveal: true,
    openPromptDelayMs: 0,
    promptOpenUser: () => {
      trustedOpenPrompted += 1;
      trustedViewerOpened = true;
    },
    viewerWaitOptions: {
      timeoutMs: 100,
      pollMs: 1,
      findRegion: () => trustedViewerOpened ? trustedRegion : null,
      readRegion: region => region === trustedRegion ? detailed : ""
    }
  });
  assert.strictEqual(trustedOpenPrompted, 1, "an unreadable Markdown card should request one real open click");
  assert.strictEqual(trustedOpenFallback.markdown, detailed);
  assert.strictEqual(trustedOpenFallback.warnings.length, 0);

  const baseNote = "---\ntitle: test\n---\n\n# 질문\n\n질문\n\n# 답변\n\n답변";
  const merged = hooks.mergeDetailedMarkdownSection(baseNote, detailed);
  assert.strictEqual(count(merged, /^# 장별 상세 한국어 요약$/gm), 1);
  assert(merged.endsWith(detailed + "\n"));
  assert(merged.includes("| 목적 | 모두를 위한 코드 |"));
  assert(merged.includes("```js\nconst preserved = true;\n```"));

  const alreadyInAnswer = `${baseNote}\n\n${detailed}`;
  const deduplicated = hooks.mergeDetailedMarkdownSection(alreadyInAnswer, detailed);
  assert.strictEqual(count(deduplicated, /^# 장별 상세 한국어 요약$/gm), 1);
  assert.strictEqual(count(deduplicated, /const preserved = true;/g), 1);

  const longMarkdown = `## 긴 상세 요약\n\n${"보존해야 하는 긴 한국어 문장과 표 데이터입니다.\n".repeat(20000)}`;
  assert(longMarkdown.length > 400000, "fixture must exceed 400 KB of characters");
  const longMerged = hooks.mergeDetailedMarkdownSection(baseNote, longMarkdown);
  assert.strictEqual(count(longMerged, /^# 장별 상세 한국어 요약$/gm), 1);
  assert(longMerged.endsWith(longMarkdown), "long Markdown body must remain intact at the end of the note");

  const markerNote = hooks.mergeDownloadedDetailedMarkdownMarker(baseNote);
  assert.strictEqual(count(markerNote, /^# 장별 상세 한국어 요약$/gm), 1);
  assert.strictEqual(count(markerNote, /%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%/g), 1);
  assert(markerNote.indexOf("# 질문") < markerNote.indexOf("# 장별 상세 한국어 요약"));

  const plainFilenameNode = {
    tagName: "P",
    innerText: "options 2.html, example 1.html, detailed-summary.md",
    textContent: "options 2.html, example 1.html, detailed-summary.md",
    getAttribute: () => "",
    hasAttribute: () => false,
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    parentElement: null
  };
  const plainContainer = { querySelectorAll: () => [plainFilenameNode] };
  assert.strictEqual(hooks.collectArtifactFileRows(plainContainer, ["md"]).length, 0);
  assert.strictEqual(hooks.collectArtifactFileRows(plainContainer, ["html", "htm"]).length, 0);

  assert.strictEqual(
    hooks.filenameFromArtifactText("%EC%9E%A5%EB%B3%84_%EC%83%81%EC%84%B8_%EC%9A%94%EC%95%BD.md", ["md"]),
    "장별_상세_요약.md"
  );

  const viewers = [
    makeArtifactViewer("index.html", htmlDocument("Index", "목록", "index body", '<a href="chapters/00-overview.html">첫 장</a>')),
    makeArtifactViewer("00-overview.html", htmlDocument("Overview", "개요", "overview body")),
    makeArtifactViewer("09-references.html", htmlDocument("References", "참고문헌", "references body"))
  ];
  const multiContainer = {
    innerText: viewers.map(item => item.name).join("\n"),
    textContent: viewers.map(item => item.name).join("\n"),
    querySelector: selector => selector.includes("iframe") ? {} : null,
    querySelectorAll: selector => selector === "button"
      ? viewers.flatMap(item => [item.codeToggle, item.previewToggle])
      : []
  };
  const mapped = await hooks.readInteractiveHtmlArtifacts(
    multiContainer,
    ["09-references.html", "index.html", "00-overview.html"],
    []
  );
  assert.strictEqual(mapped.length, 3);
  const mappedByName = Object.fromEntries(mapped.map(item => [item.name, item.content]));
  viewers.forEach(viewer => {
    assert.strictEqual(mappedByName[viewer.name], viewer.source, `${viewer.name} must keep its own root source`);
    assert.strictEqual(viewer.wasPreviewRestored(), true);
  });
  assert.notStrictEqual(mappedByName["index.html"], mappedByName["00-overview.html"]);
  assert.notStrictEqual(mappedByName["00-overview.html"], mappedByName["09-references.html"]);

  const uniqueValidation = hooks.validateCapturedHtmlFiles(mapped);
  assert.strictEqual(uniqueValidation.files.length, 3);
  assert.strictEqual(uniqueValidation.warnings.length, 0);

  const duplicateSource = htmlDocument("Duplicated", "Duplicated", "same body");
  const rejected = hooks.validateCapturedHtmlFiles([
    { name: "first.html", content: duplicateSource },
    { name: "second.html", content: duplicateSource }
  ]);
  assert.strictEqual(rejected.files.length, 0);
  assert(rejected.warnings.some(message => message.includes("different filenames")));

  const conflictingName = hooks.validateCapturedHtmlFiles([
    { name: "same.html", content: htmlDocument("One", "One", "one") },
    { name: "same.html", content: htmlDocument("Two", "Two", "two") }
  ]);
  assert.strictEqual(conflictingName.files.length, 0);
  assert(conflictingName.warnings.some(message => message.includes("same filename")));

  const backgroundSource = fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8");
  assert(backgroundSource.includes('const RUNTIME_PING_TYPE = "gpt2obs-runtime-ping";'));
  assert(
    /msg\.type === RUNTIME_PING_TYPE[\s\S]{0,200}pong:\s*true/.test(backgroundSource),
    "the background service worker must expose a side-effect-free runtime ping response"
  );

  const backgroundHarness = loadBackgroundMessageHarness();
  let nativePreflightResponse = null;
  const nativePreflightAsync = backgroundHarness.messageListener(
    { type: "gpt2obs-native-preflight" },
    {},
    response => { nativePreflightResponse = response; }
  );
  assert.strictEqual(nativePreflightAsync, true, "Native preflight must keep the response channel open");
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(backgroundHarness.nativeMessages)),
    [{ host: "com.gpt_obsidian_saver.open_direct", message: { action: "ping" } }]
  );
  assert.deepStrictEqual(JSON.parse(JSON.stringify(nativePreflightResponse)), { ok: true, pong: true, native: true });

  console.log("generated Markdown and multi-HTML artifact self-test ok");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
