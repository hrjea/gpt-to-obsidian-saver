#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

class FakeMessageNode {
  constructor(role, text) {
    this.role = role;
    this.fixtureText = text;
    this.textContent = text;
  }

  getAttribute(name) {
    return name === "data-message-author-role" ? this.role : "";
  }

  matches(selector) {
    return selector === "article" && !this.role;
  }

  contains(node) {
    return node === this;
  }
}

class FakeInteractiveNode {
  constructor(tagName, text, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.innerText = text;
    this.textContent = text;
    this.attrs = attrs;
    this.clickCount = 0;
    this.classList = { contains: () => false };
  }

  getAttribute(name) {
    return this.attrs[name] || "";
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  matches(selector) {
    return selector === "a[href]" && this.tagName === "A" && !!this.attrs.href;
  }

  querySelector() {
    return null;
  }

  closest() {
    return this.closestRoot || null;
  }

  click() {
    this.clickCount += 1;
  }
}

function loadContentHooks() {
  const noop = () => {};
  const effects = { alerts: 0, messages: [] };
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
    location: { href: "https://chatgpt.example/conversation" },
    document: {
      body: fakeElement,
      documentElement: fakeElement,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ ...fakeElement })
    },
    chrome: {
      storage: {
        sync: { get: (_keys, cb) => cb({}) },
        local: { get: (_keys, cb) => cb({}) },
        onChanged: { addListener: noop }
      },
      runtime: {
        sendMessage: (message, callback) => {
          effects.messages.push(message);
          callback?.({ ok: true, watchId: "test-watch" });
        }
      }
    },
    setTimeout,
    clearTimeout,
    URL,
    fetch: async () => ({ ok: false, text: async () => "" }),
    alert: () => { effects.alerts += 1; },
    window: { getSelection: () => "" },
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;
  const contentPath = path.join(__dirname, "..", "content.js");
  vm.runInNewContext(fs.readFileSync(contentPath, "utf8"), sandbox, { filename: contentPath });
  assert(sandbox.__GPT_OBSIDIAN_TEST_HOOKS__, "content hooks were not exposed");
  sandbox.__GPT_OBSIDIAN_TEST_HOOKS__.testEffects = effects;
  return sandbox.__GPT_OBSIDIAN_TEST_HOOKS__;
}

function loadBackgroundHooks() {
  const noop = () => {};
  const fakeEvent = { addListener: noop, removeListener: noop };
  const sandbox = {
    console,
    chrome: {
      downloads: {
        onCreated: fakeEvent,
        onChanged: fakeEvent,
        search: (_query, callback) => callback([])
      },
      runtime: {
        onInstalled: fakeEvent,
        onMessage: fakeEvent,
        sendNativeMessage: noop
      },
      storage: {
        sync: { get: (_keys, callback) => callback({}), set: noop }
      }
    },
    setTimeout,
    clearTimeout,
    URL,
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;
  const backgroundPath = path.join(__dirname, "..", "background.js");
  vm.runInNewContext(fs.readFileSync(backgroundPath, "utf8"), sandbox, { filename: backgroundPath });
  assert(sandbox.__GPT_OBSIDIAN_BACKGROUND_TEST_HOOKS__, "background hooks were not exposed");
  return sandbox.__GPT_OBSIDIAN_BACKGROUND_TEST_HOOKS__;
}

function buildScenarioNote(hooks, nodes, currentNode, hasRealHtmlAttachment, usePreviousQaForHtml) {
  const pair = usePreviousQaForHtml && hasRealHtmlAttachment
    ? hooks.findPreviousQaPair(currentNode, nodes, {
      extractQuestion: node => node.fixtureText,
      extractAnswer: node => node.fixtureText
    })
    : null;
  const fallbackQuestion = nodes[nodes.length - 2]?.fixtureText || "";
  const fallbackAnswer = currentNode.fixtureText || "";
  const questionText = pair?.questionText || fallbackQuestion;
  const answerText = pair?.answerText || fallbackAnswer;
  const title = hooks.makeTitle(questionText || answerText);
  const marker = hasRealHtmlAttachment ? "%%GPT_OBSIDIAN_ATTACHMENTS%%" : "";
  const content = hasRealHtmlAttachment
    ? hooks.buildHtmlLearningMarkdown({
      title,
      questionText,
      answerText,
      url: "https://chatgpt.example/conversation",
      attachmentMarker: marker,
      useOriginalHeadings: !!pair
    })
    : hooks.buildMarkdown({ title, questionText, answerText, url: "https://chatgpt.example/conversation", attachmentMarker: marker });
  return { pair, title, content };
}

const hooks = loadContentHooks();
const backgroundHooks = loadBackgroundHooks();
assert.strictEqual(hooks.VERSION, "1.5.50");
assert.strictEqual(
  backgroundHooks.DOWNLOAD_WATCH_TIMEOUT_MS,
  90000,
  "slow generated HTML downloads should remain inside the current Save watch"
);
assert.strictEqual(backgroundHooks.MARKDOWN_DOWNLOAD_WATCH_TIMEOUT_MS, 90000);

const markdownWatchStartedAt = Date.parse("2026-08-25T05:00:00.000Z");
const markdownWatch = {
  kind: "markdown",
  startedAt: markdownWatchStartedAt,
  timeoutMs: backgroundHooks.MARKDOWN_DOWNLOAD_WATCH_TIMEOUT_MS,
  expectedNames: backgroundHooks.sanitizeExpectedDownloadNames(
    ["code-for-all-detailed-summary-ko.md"],
    "markdown"
  )
};
const currentMarkdownDownload = {
  id: 51,
  filename: "/Users/example/Downloads/code-for-all-detailed-summary-ko (1).md",
  state: "complete",
  exists: true,
  startTime: "2026-08-25T05:00:01.000Z"
};
assert.strictEqual(
  backgroundHooks.chooseMatchingDownload([
    {
      ...currentMarkdownDownload,
      id: 49,
      filename: "/Users/example/Downloads/unrelated.md"
    },
    currentMarkdownDownload
  ], markdownWatch).id,
  51,
  "Chrome duplicate suffixes should still match the exact current Markdown card"
);
assert.strictEqual(
  backgroundHooks.chooseMatchingDownload([{
    ...currentMarkdownDownload,
    id: 52,
    filename: "/Users/example/Downloads/unrelated.md"
  }], markdownWatch),
  null,
  "a recent arbitrary Markdown download must never be selected"
);
assert.strictEqual(
  backgroundHooks.chooseMatchingDownload([{
    ...currentMarkdownDownload,
    id: 53,
    startTime: "2026-08-25T04:50:00.000Z"
  }], markdownWatch),
  null,
  "an old exact-name Markdown download must never be selected"
);

const completeArtifactHtml = "<!doctype html>\n<html lang=\"ko\"><head><title>학습자료</title></head><body>내용</body></html>";
assert.strictEqual(
  hooks.extractCompleteHtmlSource({
    querySelectorAll: () => [{ value: "", innerText: completeArtifactHtml, textContent: completeArtifactHtml }]
  }),
  completeArtifactHtml,
  "a complete ChatGPT artifact source should be captured from the code view"
);
assert.strictEqual(
  hooks.extractCompleteHtmlSource({
    querySelectorAll: () => [{ value: "", innerText: "const example = true;", textContent: "const example = true;" }]
  }),
  "",
  "ordinary code blocks must not be treated as HTML artifacts"
);
assert.strictEqual(
  hooks.extractCompleteHtmlSource({
    querySelectorAll: () => [{ value: "", innerText: "<!doctype html><html><body>incomplete", textContent: "<!doctype html><html><body>incomplete" }]
  }),
  "",
  "incomplete HTML must not be attached"
);

const gpt56FileCard = new FakeInteractiveNode("button", [
  "%EB%8C%80%ED%95%9C%EC%88%98%EC%9D%98%EC%82%AC%ED%9A%8C_%ED%95%99%EC%8A%B5%EC%9E%90%EB%A3%8C.html",
  "대한수의사회_학습자료.html",
  "Today 3:00 PM •",
  "74,582 문자 • 6,642 단어"
].join("\n"));
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(gpt56FileCard),
  true,
  "GPT 5.6 clickable file card should be recognized without a download label"
);
const filenameOnlyCodeToggle = new FakeInteractiveNode("button", "코딩", { "aria-label": "코딩" });
const filenameOnlyPreviewToggle = new FakeInteractiveNode("button", "미리 보기", { "aria-label": "미리 보기" });
const filenameOnlyArtifactRoot = {
  querySelectorAll: (selector) => selector === "button" ? [filenameOnlyCodeToggle, filenameOnlyPreviewToggle] : [],
  querySelector: (selector) => selector.includes("iframe") ? {} : null
};
const filenameOnlyFileCard = new FakeInteractiveNode("button", "gpt_5_6_sol_pro_ultra_medical_legal_workflow.html");
filenameOnlyFileCard.closestRoot = filenameOnlyArtifactRoot;
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(filenameOnlyFileCard),
  true,
  "a filename-only button should be recognized when its assistant response has a real artifact viewer"
);
const isolatedFilenameButton = new FakeInteractiveNode("button", "example 1.html");
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(isolatedFilenameButton),
  false,
  "an isolated filename-only button without an artifact viewer must not become an attachment"
);
const openAiHostedFileCard = new FakeInteractiveNode("a", "learning_material.html\n12,000 chars • 1,500 words", {
  href: "https://files.oaiusercontent.com/file-learning_material.html"
});
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(openAiHostedFileCard, openAiHostedFileCard.getAttribute("href")),
  true,
  "OpenAI-hosted HTML file cards should be recognized while ordinary external links remain excluded"
);
assert.strictEqual(
  hooks.filenameFromText("learning_%EC%9E%90%EB%A3%8C.html"),
  "learning_자료.html",
  "percent-encoded filename segments should be decoded"
);
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(new FakeInteractiveNode("p", "options 2.html and example 1.html")),
  false,
  "plain filename text must not be treated as a file card"
);
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(
    new FakeInteractiveNode("a", "example.html", { href: "https://example.com/example.html" }),
    "https://example.com/example.html"
  ),
  false,
  "ordinary external HTML links must not be treated as downloadable ChatGPT file cards"
);
assert.strictEqual(
  hooks.isLikelyInteractiveHtmlFileCard(new FakeInteractiveNode("button", "Copy")),
  false,
  "toolbar buttons near filename text must not become file-card candidates"
);

const rowFileButton = new FakeInteractiveNode("button", "learning_material.html\n12,000 chars • 1,500 words", {
  "aria-label": "learning_material.html"
});
const rowDownloadButton = new FakeInteractiveNode("button", "", {
  "aria-label": "\uD30C\uC77C \uB2E4\uC6B4\uB85C\uB4DC",
  "data-file-name": "learning_material.html"
});
const misleadingPreviewButton = new FakeInteractiveNode("button", "HTML 학습자료 다운로드");
const currentArtifactCandidates = hooks.getDownloadCandidates({
  querySelectorAll: () => [misleadingPreviewButton, rowFileButton, rowDownloadButton]
}, ["learning_material.html"]);
assert.strictEqual(currentArtifactCandidates.length, 1, "same-row HTML controls should be deduplicated");
assert.strictEqual(
  currentArtifactCandidates[0].node,
  rowDownloadButton,
  "the explicit ChatGPT download control must win over the open-file control"
);
assert(
  hooks.downloadCandidateClickPriority(currentArtifactCandidates[0]) > hooks.downloadCandidateClickPriority({
    node: rowFileButton,
    href: ""
  }),
  "explicit download controls should have the highest fallback click priority"
);
assert.strictEqual(hooks.isExactDownloadControl(rowDownloadButton), true);
assert.strictEqual(
  hooks.isExactDownloadControl(misleadingPreviewButton),
  false,
  "the HTML learning-material preview button must not be treated as the native file download control"
);
assert.strictEqual(
  hooks.getDownloadCandidates({ querySelectorAll: () => [misleadingPreviewButton] }).length,
  0,
  "generic download wording without an actual HTML filename must not create a fallback candidate"
);

const clickOnlyContainer = {
  querySelector: () => null,
  querySelectorAll: () => [misleadingPreviewButton, rowFileButton, rowDownloadButton]
};
const fakeSaveButton = {
  closest: (selector) => selector === "[data-message-author-role]" ? clickOnlyContainer : null
};
const manualDownloadCandidate = hooks.findUserActivatedDownloadCandidate(fakeSaveButton);
assert.strictEqual(
  manualDownloadCandidate?.node,
  rowDownloadButton,
  "only the exact file-download button should be offered for the last-resort manual fallback"
);
assert.strictEqual(rowDownloadButton.clickCount, 0, "candidate discovery must not trigger a synthetic download click");

const a = new FakeMessageNode("user", "What is retrieval augmented generation?");
const b = new FakeMessageNode("assistant", "Retrieval augmented generation combines retrieval with generation.");
const c = new FakeMessageNode("user", "Turn the previous answer into a self-contained HTML learning file.");
const d = new FakeMessageNode("assistant", "Here is the downloadable HTML learning artifact.");
const nodes = [a, b, c, d];

const learning = buildScenarioNote(hooks, nodes, d, true, true);
assert(learning.pair, "previous Q&A pair should be found");
assert(learning.content.includes("\n# HTML Learning Material\n"));
assert(learning.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));
assert.strictEqual((learning.content.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1);
assert(learning.content.indexOf("%%GPT_OBSIDIAN_ATTACHMENTS%%") < learning.content.indexOf("\n# Original Question\n"));
assert(learning.content.indexOf("\n# HTML Learning Material\n") < learning.content.indexOf("\n# Original Question\n"));
assert(learning.content.indexOf("\n# Original Question\n") < learning.content.indexOf("\n# Original Answer\n"));
assert(learning.content.includes(a.fixtureText));
assert(learning.content.includes(b.fixtureText));
assert(!learning.content.includes(c.fixtureText));
assert(!learning.content.includes(d.fixtureText));
assert.strictEqual(learning.title, "What is retrieval augmented generation");

const fallbackHtml = buildScenarioNote(hooks, [c, d], d, true, true);
assert(!fallbackHtml.pair, "missing previous Q&A should use current c/d");
assert(fallbackHtml.content.includes("\n# HTML Learning Material\n"));
assert(fallbackHtml.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));
assert.strictEqual((fallbackHtml.content.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1);
assert(fallbackHtml.content.indexOf("\n# HTML Learning Material\n") < fallbackHtml.content.indexOf("\n# Question\n"));
assert(fallbackHtml.content.indexOf("\n# Question\n") < fallbackHtml.content.indexOf("\n# Answer\n"));
assert(!fallbackHtml.content.includes("\n# Original Question\n"));
assert(!fallbackHtml.content.includes("\n# Original Answer\n"));
assert(fallbackHtml.content.includes(c.fixtureText));
assert(fallbackHtml.content.includes(d.fixtureText));

const normal = buildScenarioNote(hooks, nodes, d, false, true);
assert(!normal.pair, "normal non-HTML save should not use previous Q&A");
assert(normal.content.includes("\n# Question\n"));
assert(normal.content.includes(c.fixtureText));
assert(normal.content.includes(d.fixtureText));
assert(!normal.content.includes("\n# HTML Learning Material\n"));
assert(!normal.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));

const plainD = new FakeMessageNode("assistant", "The literal filenames options 2.html and example 1.html are plain text.");
const plainFilenameOnly = buildScenarioNote(hooks, [
  a,
  b,
  c,
  plainD
], plainD, false, true);
assert(!plainFilenameOnly.pair, "plain filename text without attachment must not activate previous-Q&A mode");
assert(plainFilenameOnly.content.includes("options 2.html"));
assert(plainFilenameOnly.content.includes("example 1.html"));
assert(!plainFilenameOnly.content.includes("\n# HTML Learning Material\n"));
assert(!plainFilenameOnly.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));

const missingOriginalQuestion = buildScenarioNote(hooks, [b, c, d], d, true, true);
assert(!missingOriginalQuestion.pair, "missing original question should fall back safely");
assert(missingOriginalQuestion.content.includes("\n# HTML Learning Material\n"));
assert(missingOriginalQuestion.content.includes("\n# Question\n"));
assert(missingOriginalQuestion.content.includes("\n# Answer\n"));
assert(missingOriginalQuestion.content.includes(c.fixtureText));
assert(missingOriginalQuestion.content.includes(d.fixtureText));

hooks.setTestLanguage("ko");
const koreanPrevious = buildScenarioNote(hooks, nodes, d, true, true);
assert(koreanPrevious.content.includes("\n# HTML 학습자료\n"));
assert(koreanPrevious.content.includes("\n# 원본 질문\n"));
assert(koreanPrevious.content.includes("\n# 원본 답변\n"));
assert(koreanPrevious.content.indexOf("\n# HTML 학습자료\n") < koreanPrevious.content.indexOf("\n# 원본 질문\n"));

const koreanFallback = buildScenarioNote(hooks, [c, d], d, true, true);
assert(koreanFallback.content.includes("\n# HTML 학습자료\n"));
assert(koreanFallback.content.includes("\n# 질문\n"));
assert(koreanFallback.content.includes("\n# 답변\n"));
assert(!koreanFallback.content.includes("\n# 원본 질문\n"));
assert(!koreanFallback.content.includes("\n# 원본 답변\n"));

async function testInteractiveArtifactExtraction() {
  let sourceVisible = false;
  let previewRestored = false;
  const sourceNode = {
    value: "",
    innerText: completeArtifactHtml,
    textContent: completeArtifactHtml,
    getAttribute: () => ""
  };
  const root = {
    parentElement: null,
    querySelector: () => ({}),
    querySelectorAll: (selector) => selector.includes(".cm-content") && sourceVisible ? [sourceNode] : []
  };
  const group = {
    parentElement: root,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const codeWrapper = {
    parentElement: group,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const previewWrapper = {
    parentElement: group,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const codeToggle = {
    parentElement: codeWrapper,
    getAttribute: (name) => name === "aria-label" ? "코딩" : (name === "aria-pressed" ? "false" : ""),
    closest: () => null,
    querySelector: () => null,
    click: () => { sourceVisible = true; }
  };
  const previewToggle = {
    parentElement: previewWrapper,
    getAttribute: (name) => name === "aria-label" ? "미리 보기" : "",
    closest: () => null,
    querySelector: () => null,
    click: () => { previewRestored = true; }
  };
  codeWrapper.querySelectorAll = (selector) => selector === "button" ? [codeToggle] : [];
  previewWrapper.querySelectorAll = (selector) => selector === "button" ? [previewToggle] : [];
  group.querySelectorAll = (selector) => selector === "button" ? [codeToggle, previewToggle] : [];
  const container = {
    innerText: "HTML 학습자료 다운로드\nunity_ai_game_development_learning.html",
    textContent: "HTML 학습자료 다운로드\nunity_ai_game_development_learning.html",
    querySelector: (selector) => selector.includes("iframe") ? {} : null,
    querySelectorAll: (selector) => {
      if (selector === "button") return [codeToggle, previewToggle];
      if (selector.includes("a[href]") && selector.includes("button")) {
        return [misleadingPreviewButton, codeToggle, previewToggle];
      }
      if (selector.includes(".cm-content") && sourceVisible) return [sourceNode];
      return [];
    }
  };
  misleadingPreviewButton.closestRoot = container;

  assert.strictEqual(
    hooks.hasInteractiveHtmlArtifactCandidate(
      container,
      [{ name: "unity_ai_game_development_learning.html", node: misleadingPreviewButton, href: "" }],
      ["unity_ai_game_development_learning.html"]
    ),
    true,
    "a filename-less HTML learning-material button must activate source extraction when the same message has a real Code/Preview viewer"
  );

  const files = await hooks.readInteractiveHtmlArtifacts(
    container,
    ["unity_ai_game_development_learning.html"],
    [{ name: "unity_ai_game_development_learning.html", node: misleadingPreviewButton, href: "" }]
  );
  assert.strictEqual(files.length, 1, "interactive artifact should produce one attachment");
  assert.strictEqual(files[0].name, "unity_ai_game_development_learning.html");
  assert.strictEqual(files[0].content, completeArtifactHtml);
  assert.strictEqual(sourceVisible, true, "branch-style artifact toggle should open without role=group");
  assert.strictEqual(
    hooks.extractCompleteHtmlSource(container),
    completeArtifactHtml,
    "the current CodeMirror contenteditable source should be readable after ChatGPT replaces the preview DOM"
  );
  assert.strictEqual(previewRestored, true, "preview mode should be restored after extraction");

  const alertsBeforeSaveExtraction = hooks.testEffects.alerts;
  const messagesBeforeSaveExtraction = hooks.testEffects.messages.length;
  const extractedWithoutDownload = await hooks.extractDownloadFiles(
    { closest: (selector) => selector === "[data-message-author-role]" ? container : null },
    ["unity_ai_game_development_learning.html"],
    ""
  );
  assert.strictEqual(extractedWithoutDownload.files.length, 1);
  assert.strictEqual(extractedWithoutDownload.downloadedFiles.length, 0);
  assert.strictEqual(
    hooks.testEffects.alerts,
    alertsBeforeSaveExtraction,
    "page-accessible artifact source must not show a manual download prompt"
  );
  assert.strictEqual(
    hooks.testEffects.messages.length,
    messagesBeforeSaveExtraction,
    "page-accessible artifact source must not start a chrome.downloads watch"
  );
}

testInteractiveArtifactExtraction()
  .then(() => console.log("previous-qa-html-learning and GPT 5.6 artifact self-test ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
