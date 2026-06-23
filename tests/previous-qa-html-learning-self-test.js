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

function loadContentHooks() {
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
      runtime: { sendMessage: noop }
    },
    setTimeout,
    clearTimeout,
    URL,
    fetch: async () => ({ ok: false, text: async () => "" }),
    alert: noop,
    window: { getSelection: () => "" },
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;
  const contentPath = path.join(__dirname, "..", "content.js");
  vm.runInNewContext(fs.readFileSync(contentPath, "utf8"), sandbox, { filename: contentPath });
  assert(sandbox.__GPT_OBSIDIAN_TEST_HOOKS__, "content hooks were not exposed");
  return sandbox.__GPT_OBSIDIAN_TEST_HOOKS__;
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
assert.strictEqual(hooks.VERSION, "1.5.20");

const a = new FakeMessageNode("user", "What is retrieval augmented generation?");
const b = new FakeMessageNode("assistant", "Retrieval augmented generation combines retrieval with generation.");
const c = new FakeMessageNode("user", "Turn the previous answer into a self-contained HTML learning file.");
const d = new FakeMessageNode("assistant", "Here is the downloadable HTML learning artifact.");
const nodes = [a, b, c, d];

const learning = buildScenarioNote(hooks, nodes, d, true, true);
assert(learning.pair, "previous Q&A pair should be found");
assert(learning.content.includes("## HTML Learning Material"));
assert(learning.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));
assert.strictEqual((learning.content.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1);
assert(learning.content.indexOf("%%GPT_OBSIDIAN_ATTACHMENTS%%") < learning.content.indexOf("## Original Question"));
assert(learning.content.indexOf("## HTML Learning Material") < learning.content.indexOf("## Original Question"));
assert(learning.content.indexOf("## Original Question") < learning.content.indexOf("## Original Answer"));
assert(learning.content.includes(a.fixtureText));
assert(learning.content.includes(b.fixtureText));
assert(!learning.content.includes(c.fixtureText));
assert(!learning.content.includes(d.fixtureText));
assert.strictEqual(learning.title, "What is retrieval augmented generation");

const fallbackHtml = buildScenarioNote(hooks, [c, d], d, true, true);
assert(!fallbackHtml.pair, "missing previous Q&A should use current c/d");
assert(fallbackHtml.content.includes("## HTML Learning Material"));
assert(fallbackHtml.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));
assert.strictEqual((fallbackHtml.content.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1);
assert(fallbackHtml.content.indexOf("## HTML Learning Material") < fallbackHtml.content.indexOf("## Question"));
assert(fallbackHtml.content.indexOf("## Question") < fallbackHtml.content.indexOf("## Answer"));
assert(!fallbackHtml.content.includes("## Original Question"));
assert(!fallbackHtml.content.includes("## Original Answer"));
assert(fallbackHtml.content.includes(c.fixtureText));
assert(fallbackHtml.content.includes(d.fixtureText));

const normal = buildScenarioNote(hooks, nodes, d, false, true);
assert(!normal.pair, "normal non-HTML save should not use previous Q&A");
assert(normal.content.includes("## Question"));
assert(normal.content.includes(c.fixtureText));
assert(normal.content.includes(d.fixtureText));
assert(!normal.content.includes("## HTML Learning Material"));
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
assert(!plainFilenameOnly.content.includes("## HTML Learning Material"));
assert(!plainFilenameOnly.content.includes("%%GPT_OBSIDIAN_ATTACHMENTS%%"));

const missingOriginalQuestion = buildScenarioNote(hooks, [b, c, d], d, true, true);
assert(!missingOriginalQuestion.pair, "missing original question should fall back safely");
assert(missingOriginalQuestion.content.includes("## HTML Learning Material"));
assert(missingOriginalQuestion.content.includes("## Question"));
assert(missingOriginalQuestion.content.includes("## Answer"));
assert(missingOriginalQuestion.content.includes(c.fixtureText));
assert(missingOriginalQuestion.content.includes(d.fixtureText));

hooks.setTestLanguage("ko");
const koreanPrevious = buildScenarioNote(hooks, nodes, d, true, true);
assert(koreanPrevious.content.includes("## HTML 학습자료"));
assert(koreanPrevious.content.includes("## 원본 질문"));
assert(koreanPrevious.content.includes("## 원본 답변"));
assert(koreanPrevious.content.indexOf("## HTML 학습자료") < koreanPrevious.content.indexOf("## 원본 질문"));

const koreanFallback = buildScenarioNote(hooks, [c, d], d, true, true);
assert(koreanFallback.content.includes("## HTML 학습자료"));
assert(koreanFallback.content.includes("## 질문"));
assert(koreanFallback.content.includes("## 답변"));
assert(!koreanFallback.content.includes("## 원본 질문"));
assert(!koreanFallback.content.includes("## 원본 답변"));

console.log("previous-qa-html-learning self-test ok");
