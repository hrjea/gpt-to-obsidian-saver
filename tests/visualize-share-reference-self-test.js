#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { userAgent: "", clipboard: { readText: async () => "" } },
    location: { href: "https://chatgpt.com/c/synthetic-test-conversation" },
    document: {
      body: fakeElement,
      documentElement: fakeElement,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ ...fakeElement })
    },
    chrome: {
      storage: {
        sync: { get: (_keys, callback) => callback({}) },
        local: { get: (_keys, callback) => callback({}) },
        onChanged: { addListener: noop }
      },
      runtime: {
        id: "visualize-share-self-test",
        lastError: null,
        sendMessage: (message, callback) => callback?.(
          message?.type === "gpt2obs-runtime-ping"
            ? { ok: true, pong: true, version: "1.5.50" }
            : message?.type === "gpt2obs-native-preflight"
              ? { ok: true, pong: true, native: true }
              : { ok: true }
        )
      }
    },
    setTimeout,
    clearTimeout,
    URL,
    fetch: async () => ({ ok: false, status: 404, text: async () => "" }),
    alert: noop,
    confirm: () => false,
    window: { getSelection: () => "" },
    __GPT_OBSIDIAN_ENABLE_TEST_HOOKS__: true
  };
  sandbox.globalThis = sandbox;
  const contentPath = path.join(__dirname, "..", "content.js");
  vm.runInNewContext(fs.readFileSync(contentPath, "utf8"), sandbox, { filename: contentPath });
  assert(sandbox.__GPT_OBSIDIAN_TEST_HOOKS__, "content hooks were not exposed");
  sandbox.__GPT_OBSIDIAN_TEST_HOOKS__.__sandbox = sandbox;
  return sandbox.__GPT_OBSIDIAN_TEST_HOOKS__;
}

function matchesSelector(node, selector) {
  return String(selector || "").split(",").some(part => {
    const s = part.trim();
    if (s === "*") return true;
    if (s === "dialog") return node.tagName === "DIALOG";
    if (s === "img") return node.tagName === "IMG";
    if (s === "svg") return node.tagName === "SVG";
    if (s === "button") return node.tagName === "BUTTON";
    if (s === "iframe") return node.tagName === "IFRAME";
    if (s === "input") return node.tagName === "INPUT";
    if (s === "textarea") return node.tagName === "TEXTAREA";
    if (s === "a[href]") return node.tagName === "A" && node.getAttribute("href") !== "";
    const simpleClass = s.match(/^\.([A-Za-z0-9_-]+)$/);
    if (simpleClass) return node.classList?.contains?.(simpleClass[1]) === true;
    const attribute = s.match(/^\[([^\]=~*^$|\s]+)(?:([*^$]?=)["']?([^\]"']*)["']?\s*(i)?)?\]$/i);
    if (attribute) {
      const [, name, operator = "", expected = "", insensitive = ""] = attribute;
      if (!node.hasAttribute(name)) return false;
      if (!operator) return true;
      const actualValue = String(node.getAttribute(name));
      const expectedValue = String(expected);
      const actual = insensitive ? actualValue.toLowerCase() : actualValue;
      const wanted = insensitive ? expectedValue.toLowerCase() : expectedValue;
      if (operator === "=") return actual === wanted;
      if (operator === "*=") return actual.includes(wanted);
      if (operator === "^=") return actual.startsWith(wanted);
      if (operator === "$=") return actual.endsWith(wanted);
    }
    return false;
  });
}

function makeNode({tagName = "div", attrs = {}, text = "", children = [], width = 120, height = 28, x = 0, y = 0, onClick = null} = {}) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    attrs: { ...attrs },
    textContent: text,
    innerText: text,
    childNodes: children,
    parentElement: null,
    ownerDocument: {
      defaultView: { getComputedStyle: () => ({ display: "", visibility: "" }) },
      createTextNode: value => makeCloneCapableTextNode(value)
    },
    style: {},
    className: attrs.class || "",
    classList: { contains: name => String(attrs.class || "").split(/\s+/).includes(name) },
    isConnected: true,
    disabled: false,
    value: attrs.value || "",
    href: attrs.href || "",
    clickCount: 0,
    hidden: Object.prototype.hasOwnProperty.call(attrs, "hidden"),
    rect: { width, height, x, y },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : ""; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    matches(selector) { return matchesSelector(this, selector); },
    querySelectorAll(selector) {
      const result = [];
      const visit = current => {
        for (const child of current.childNodes || []) {
          if (child?.nodeType === 1) {
            if (matchesSelector(child, selector)) result.push(child);
            visit(child);
          }
        }
      };
      visit(this);
      return result;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    closest(selector) {
      let current = this;
      while (current) {
        if (matchesSelector(current, selector)) return current;
        current = current.parentElement;
      }
      return null;
    },
    contains(candidate) {
      let current = candidate;
      while (current) {
        if (current === this) return true;
        current = current.parentElement;
      }
      return false;
    },
    getBoundingClientRect() { return { ...this.rect }; },
    setRect(next) { Object.assign(this.rect, next || {}); },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = this;
      child.isConnected = this.isConnected;
      child.ownerDocument = this.ownerDocument;
      this.childNodes.push(child);
      return child;
    },
    remove() {
      if (this.parentElement) {
        this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this);
      }
      this.parentElement = null;
      this.isConnected = false;
    },
    click() {
      this.clickCount += 1;
      if (typeof onClick === "function") onClick(this);
    },
    cloneNode() { return this; }
  };
  (children || []).forEach(child => {
    if (child) child.parentElement = node;
  });
  return node;
}

// Dedicated DOM fixture for question-text normalization. The broad test fake
// above deliberately returns itself from cloneNode(), so changing it would
// alter the meaning of many unrelated regression tests. This smaller fake
// models the live, cloneable three-child user-message structure instead.
function makeCloneCapableTextNode(value) {
  return {
    nodeType: 3,
    nodeValue: String(value || ""),
    parentElement: null,
    get textContent() { return this.nodeValue; },
    get innerText() { return this.nodeValue; },
    cloneNode() { return makeCloneCapableTextNode(this.nodeValue); }
  };
}

function makeCloneCapableElement({ tagName = "div", attrs = {}, children = [] } = {}) {
  const node = {
    nodeType: 1,
    tagName: String(tagName || "div").toUpperCase(),
    attrs: { ...attrs },
    childNodes: [],
    parentElement: null,
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: "", visibility: "" }) } },
    style: {},
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : ""; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
    matches(selector) { return matchesSelector(this, selector); },
    querySelectorAll(selector) {
      const result = [];
      const visit = current => {
        for (const child of current.childNodes || []) {
          if (child?.nodeType !== 1) continue;
          if (matchesSelector(child, selector)) result.push(child);
          visit(child);
        }
      };
      visit(this);
      return result;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    appendChild(child) {
      if (!child) return child;
      child.parentElement = this;
      child.ownerDocument = this.ownerDocument;
      this.childNodes.push(child);
      return child;
    },
    remove() {
      if (this.parentElement) {
        this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this);
      }
      this.parentElement = null;
    },
    replaceWith(...replacements) {
      const parent = this.parentElement;
      const index = parent?.childNodes?.indexOf(this) ?? -1;
      if (!parent || index < 0) return;
      const nextNodes = replacements.map(value => typeof value === "string"
        ? makeCloneCapableTextNode(value)
        : value
      ).filter(Boolean);
      nextNodes.forEach(child => {
        child.parentElement = parent;
        child.ownerDocument = parent.ownerDocument;
      });
      parent.childNodes.splice(index, 1, ...nextNodes);
      this.parentElement = null;
    },
    cloneNode(deep = false) {
      return makeCloneCapableElement({
        tagName: this.tagName,
        attrs: this.attrs,
        children: deep ? this.childNodes.map(child => child.cloneNode(true)) : []
      });
    }
  };
  Object.defineProperties(node, {
    textContent: {
      get() { return this.childNodes.map(child => child.textContent || "").join(""); }
    },
    innerText: {
      get() { return this.childNodes.map(child => child.innerText || child.textContent || "").join(""); }
    },
    // messageNodeToPlainText intentionally falls back to innerText for this
    // structural fixture; HTML conversion is covered separately.
    innerHTML: { get() { return ""; } }
  });
  children.forEach(child => node.appendChild(child));
  return node;
}

function makeLiveVisualizeQuestionFixture({
  markerAttrs,
  markerText = "Visualize",
  beforeText = "\n바로 위 답변을 ",
  afterText = "\nVisualize \n",
  beforeNode = null,
  afterNode = null,
  includeVisualizeIcon = true
} = {}) {
  const marker = makeCloneCapableElement({
    tagName: "span",
    attrs: markerAttrs || {
      "data-id": "plugin:visualize",
      "data-inline-selection-pill": "",
      "data-keyword": "Visualize",
      "data-symbol": "ecosystemMention",
      dir: "auto"
    },
    children: [
      ...(includeVisualizeIcon ? [makeCloneCapableElement({
        attrs: { "data-testid": "plugin-icon-wrapper" },
        children: [makeCloneCapableElement({
          tagName: "img",
          attrs: { src: "https://chatgpt.com/images/visualize/app-blocks-visualize.svg" }
        })]
      })] : []),
      makeCloneCapableElement({ tagName: "span", children: [makeCloneCapableTextNode(markerText)] })
    ]
  });
  return makeCloneCapableElement({
    attrs: { "data-message-author-role": "user" },
    children: [
      beforeNode || makeCloneCapableTextNode(beforeText),
      marker,
      afterNode || makeCloneCapableTextNode(afterText)
    ]
  });
}

function makeDocument(children = []) {
  const body = makeNode({ tagName: "body", children });
  const documentElement = makeNode({ tagName: "html", children: [body] });
  const view = {
    getComputedStyle(node) {
      return {
        display: node?.style?.display || "",
        visibility: node?.style?.visibility || "",
        opacity: node?.style?.opacity || ""
      };
    }
  };
  const doc = {
    body,
    documentElement,
    defaultView: view,
    querySelectorAll(selector) {
      const matches = [];
      if (documentElement.matches(selector)) matches.push(documentElement);
      matches.push(...documentElement.querySelectorAll(selector));
      return matches;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  };
  const connect = node => {
    node.ownerDocument = doc;
    node.isConnected = true;
    (node.childNodes || []).forEach(child => {
      child.parentElement = node;
      connect(child);
    });
  };
  connect(documentElement);
  return doc;
}

function installDocument(hooks, doc) {
  const target = hooks.__sandbox.document;
  target.body = doc.body;
  target.documentElement = doc.documentElement;
  target.defaultView = doc.defaultView;
  target.querySelectorAll = doc.querySelectorAll.bind(doc);
  target.querySelector = doc.querySelector.bind(doc);
  return target;
}

function mountConversationWindow(doc, turns) {
  const setConnected = (node, connected, parent = null) => {
    if (!node) return;
    node.parentElement = parent;
    node.ownerDocument = doc;
    node.isConnected = connected;
    (node.childNodes || []).forEach(child => setConnected(child, connected, connected ? node : null));
  };
  (doc.body.childNodes || []).forEach(node => setConnected(node, false));
  doc.body.childNodes = Array.from(turns || []);
  doc.body.childNodes.forEach(node => setConnected(node, true, doc.body));
  return doc;
}

function makeConversationTurn(role, text = "", children = [], id = role) {
  const roleNode = makeNode({
    attrs: { "data-message-author-role": role },
    text,
    children
  });
  return makeNode({
    tagName: "section",
    attrs: {
      "data-testid": `conversation-turn-${id}`,
      "data-turn": role,
      "data-turn-id": id
    },
    children: [roleNode]
  });
}

function appendProviderNeutralRichApp(node, {
  blockVisible = true,
  iframeVisible = true,
  iframeUrl = "https://app-block-test.web-sandbox.oaiusercontent.com/runtime",
  blockCount = 1,
  iframeCount = 1
} = {}) {
  const blocks = [];
  const iframes = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const blockIframes = [];
    for (let iframeIndex = 0; iframeIndex < iframeCount; iframeIndex += 1) {
      const iframe = makeNode({
        tagName: "iframe",
        attrs: { src: iframeUrl },
        width: iframeVisible ? 640 : 0,
        height: iframeVisible ? 360 : 0
      });
      blockIframes.push(iframe);
      iframes.push(iframe);
    }
    const block = makeNode({
      attrs: { "data-app-block-preview": "true" },
      children: blockIframes,
      width: blockVisible ? 640 : 0,
      height: blockVisible ? 360 : 0
    });
    node.appendChild(block);
    blocks.push(block);
  }
  return { blocks, iframes };
}

const PREVIOUS_ANSWER_VISUALIZE_REQUEST = "바로 위 답변을 시각화해 주세요";

function makeVisualizeConversationFixture({
  includePreviousQa = false,
  intermediateTurns = [],
  q1Text = "Q1 원본 질문",
  q2Text = "Q2에서 시각화해 주세요",
  a1Text = "A1 원본 답변",
  a2Text = "A2 바깥 설명",
  appBlock = true,
  duplicateRoleNodes = false,
  idPrefix = ""
} = {}) {
  const turnId = suffix => idPrefix ? `${idPrefix}-${suffix}` : suffix;
  const turns = [];
  let q1Turn = null;
  let a1Turn = null;
  if (includePreviousQa) {
    q1Turn = makeConversationTurn("user", q1Text, [], turnId("q1"));
    a1Turn = makeConversationTurn("assistant", a1Text, [], turnId("a1"));
    turns.push(q1Turn, a1Turn);
  }
  const pluginMention = makeNode({
    attrs: {
      "data-id": "plugin:visualize",
      "data-inline-selection-pill": "true"
    },
    text: "Visualize"
  });
  const q2RoleNode = makeNode({
    attrs: { "data-message-author-role": "user" },
    text: q2Text,
    children: [pluginMention]
  });
  const q2Turn = makeNode({
    tagName: "section",
    attrs: {
      "data-testid": `conversation-turn-${turnId("q2")}`,
      "data-turn": "user",
      "data-turn-id": turnId("q2")
    },
    children: duplicateRoleNodes
      ? [q2RoleNode, makeNode({ attrs: { "data-message-author-role": "user" }, text: "duplicate" })]
      : [q2RoleNode]
  });
  turns.push(...intermediateTurns, q2Turn);
  const app = appBlock
    ? makeNode({
      attrs: { "data-app-block-preview": "true" },
      children: [makeNode({ tagName: "iframe", attrs: { src: "https://app-block-test.web-sandbox.oaiusercontent.com/" } })]
    })
    : null;
  const a2Children = app ? [app] : [];
  const a2Turn = makeConversationTurn("assistant", a2Text, a2Children, turnId("a2"));
  turns.push(a2Turn);
  return {
    document: makeDocument(turns),
    q1: q1Turn?.querySelector("[data-message-author-role]") || null,
    a1: a1Turn?.querySelector("[data-message-author-role]") || null,
    q2: q2RoleNode,
    a2: a2Turn.querySelector("[data-message-author-role]"),
    q1Turn,
    a1Turn,
    q2Turn,
    a2Turn,
    turns
  };
}

function makeRichAppContinuationFixture({
  a0App = true,
  a2App = true,
  betweenA0Q2 = [],
  betweenQ2A2 = [],
  q2Text = "Please show the next section with an interactive example"
} = {}) {
  const a0Block = a0App
    ? makeNode({
      attrs: { "data-app-block-preview": "true" },
      children: [makeNode({ tagName: "iframe", attrs: { src: "https://app-block-a0.web-sandbox.oaiusercontent.com/" } })]
    })
    : null;
  const a0Turn = makeConversationTurn("assistant", "A0 app explanation", a0Block ? [a0Block] : [], "a0");
  const q2Turn = makeConversationTurn("user", q2Text, [], "q2");
  const a2Block = a2App
    ? makeNode({
      attrs: { "data-app-block-preview": "true" },
      children: [makeNode({ tagName: "iframe", attrs: { src: "https://app-block-a2.web-sandbox.oaiusercontent.com/" } })]
    })
    : null;
  const a2Turn = makeConversationTurn("assistant", "A2 app explanation", a2Block ? [a2Block] : [], "a2");
  const turns = [a0Turn, ...betweenA0Q2, q2Turn, ...betweenQ2A2, a2Turn];
  return {
    document: makeDocument(turns),
    a0: a0Turn.querySelector("[data-message-author-role]"),
    q2: q2Turn.querySelector("[data-message-author-role]"),
    a2: a2Turn.querySelector("[data-message-author-role]"),
    a0Turn,
    q2Turn,
    a2Turn,
    turns
  };
}

function makePreviousQaRichAppFixture({
  q1Text = "Q1 원본 질문",
  a1Text = "A1 원본 답변",
  q2Text = "다음 결과를 상호작용형으로 보여 주세요",
  includeApp = true,
  betweenQ1A1 = [],
  betweenA1Q2 = [],
  betweenQ2A2 = [],
  duplicateQ2Role = false,
  structuredProvider = false
} = {}) {
  const q1Turn = makeConversationTurn("user", q1Text, [], "generic-q1");
  const a1Turn = makeConversationTurn("assistant", a1Text, [], "generic-a1");
  const q2Children = structuredProvider
    ? [makeNode({ attrs: { "data-id": "plugin:visualize", "data-inline-selection-pill": "true" }, text: "Visualize" })]
    : [];
  const q2Role = makeNode({ attrs: { "data-message-author-role": "user" }, text: q2Text, children: q2Children });
  const q2Turn = makeNode({
    tagName: "section",
    attrs: {
      "data-testid": "conversation-turn-generic-q2",
      "data-turn": "user",
      "data-turn-id": "generic-q2"
    },
    children: duplicateQ2Role
      ? [q2Role, makeNode({ attrs: { "data-message-author-role": "user" }, text: "ambiguous duplicate" })]
      : [q2Role]
  });
  const a2Turn = makeConversationTurn("assistant", "A2 앱 바깥 설명", [], "generic-a2");
  const a2 = a2Turn.querySelector("[data-message-author-role]");
  const app = includeApp ? appendProviderNeutralRichApp(a2) : { blocks: [], iframes: [] };
  const turns = [
    q1Turn,
    ...betweenQ1A1,
    a1Turn,
    ...betweenA1Q2,
    q2Turn,
    ...betweenQ2A2,
    a2Turn
  ];
  return {
    document: makeDocument(turns),
    q1: q1Turn.querySelector("[data-message-author-role]"),
    a1: a1Turn.querySelector("[data-message-author-role]"),
    q2: q2Role,
    a2,
    q1Turn,
    a1Turn,
    q2Turn,
    a2Turn,
    turns,
    ...app
  };
}

function makeTimerTracker() {
  const pending = new Set();
  return {
    pending,
    setTimeout(callback, delay) {
      let timer = null;
      timer = setTimeout(() => {
        pending.delete(timer);
        callback();
      }, delay);
      pending.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      pending.delete(timer);
      clearTimeout(timer);
    }
  };
}

 (async () => {
const hooks = loadContentHooks();
assert.strictEqual(hooks.VERSION, "1.5.50");
hooks.setTestLanguage("ko");

// Direct Visualize topology must be resolved independently from the legacy
// findPreviousQaPair() contract. These assertions are intentionally placed
// before the integration-flow checks so a missing resolver is a clear RED
// failure during TDD.
assert.strictEqual(typeof hooks.resolveVisualizeSaveContext, "function");
assert.strictEqual(typeof hooks.buildDirectVisualizeShareMarkdown, "function");
// The live regression topology is A0(app) -> Q2(plain follow-up) -> A2(app).
// This must be handled by a separate provider-neutral continuation resolver;
// the existing Visualize resolver/gate must remain strict.
assert.strictEqual(typeof hooks.resolveRichAppContinuationContext, "function");
assert.strictEqual(typeof hooks.buildRichAppContinuationShareMarkdown, "function");

// Provider-neutral rich-app classification must come from one exact live app
// runtime structure, never from provider-like strings or a permissive URL
// substring. These hooks are intentionally asserted before production changes
// so this block is the first focused RED for the marker-loss regression.
assert.strictEqual(typeof hooks.isStrictRichAppRuntimeIframeUrl, "function");
assert.strictEqual(typeof hooks.resolveProviderNeutralRichAppEvidence, "function");

// Pronouns and negated references can describe the new Q2 payload rather than
// request reuse of A1. Classification and the real resolver must agree: only
// an affirmative, explicit previous-answer reference may select previous-qa.
{
  const classifier = hooks.isPreviousAnswerVisualizationRequestText;
  const referenceBoundaryCases = [
    {
      label: "Korean pronoun refers to new Q2 data",
      q2Text: "이 내용은 새 Q2 데이터입니다. 이를 시각화해 주세요",
      expectedReference: false,
      expectedMode: "direct-visualize",
      expectedQuestionText: "이 내용은 새 Q2 데이터입니다. 이를 시각화해 주세요",
      expectedAnswerText: ""
    },
    {
      label: "English previous-answer phrase is explicitly negated",
      q2Text: "Do not use this answer; visualize the dataset below",
      expectedReference: false,
      expectedMode: "direct-visualize",
      expectedQuestionText: "Do not use this answer; visualize the dataset below",
      expectedAnswerText: ""
    },
    {
      label: "Korean previous-answer phrase is excluded with malgo",
      q2Text: "위 답변 말고 아래 데이터를 시각화해 주세요",
      expectedReference: false,
      expectedMode: "direct-visualize",
      expectedQuestionText: "위 답변 말고 아래 데이터를 시각화해 주세요",
      expectedAnswerText: ""
    },
    {
      label: "Korean previous-answer phrase is explicitly contrasted",
      q2Text: "바로 위 답변이 아니라 아래 데이터를 시각화해 주세요",
      expectedReference: false,
      expectedMode: "direct-visualize",
      expectedQuestionText: "바로 위 답변이 아니라 아래 데이터를 시각화해 주세요",
      expectedAnswerText: ""
    },
    {
      label: "Korean demonstrative refers to content introduced inside Q2",
      q2Text: "새 Q2 답변은 다음과 같습니다. 이 답변을 시각화해 주세요",
      expectedReference: false,
      expectedMode: "direct-visualize",
      expectedQuestionText: "새 Q2 답변은 다음과 같습니다. 이 답변을 시각화해 주세요",
      expectedAnswerText: ""
    },
    {
      label: "English demonstrative refers to content introduced inside Q2",
      q2Text: "Here is a new response; visualize this response",
      expectedReference: false,
      expectedMode: "direct-visualize",
      expectedQuestionText: "Here is a new response; visualize this response",
      expectedAnswerText: ""
    },
    {
      label: "Korean affirmative previous-answer request",
      q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST,
      expectedReference: true,
      expectedMode: "previous-qa",
      expectedQuestionText: "Q1 원본 질문",
      expectedAnswerText: "A1 원본 답변"
    },
    {
      label: "English affirmative previous-answer request",
      q2Text: "Visualize the previous answer",
      expectedReference: true,
      expectedMode: "previous-qa",
      expectedQuestionText: "Q1 원본 질문",
      expectedAnswerText: "A1 원본 답변"
    },
    {
      label: "Short English imperative demonstrative",
      q2Text: "Visualize this answer",
      expectedReference: true,
      expectedMode: "previous-qa",
      expectedQuestionText: "Q1 원본 질문",
      expectedAnswerText: "A1 원본 답변"
    }
  ];
  const actualCases = referenceBoundaryCases.map(({ label, q2Text }) => {
    const fixture = makeVisualizeConversationFixture({ includePreviousQa: true, q2Text });
    installDocument(hooks, fixture.document);
    const context = hooks.resolveVisualizeSaveContext(fixture.a2);
    return {
      label,
      reference: typeof classifier === "function" ? classifier(q2Text) : "classifier hook unavailable",
      mode: context.mode,
      questionText: context.questionText || "",
      answerText: context.answerText || ""
    };
  });
  assert.deepStrictEqual(
    {
      classifierType: typeof classifier,
      cases: actualCases
    },
    {
      classifierType: "function",
      cases: referenceBoundaryCases.map(({
        label,
        expectedReference,
        expectedMode,
        expectedQuestionText,
        expectedAnswerText
      }) => ({
        label,
        reference: expectedReference,
        mode: expectedMode,
        questionText: expectedQuestionText,
        answerText: expectedAnswerText
      }))
    },
    "previous-answer wording classification must reject pronoun-only and explicitly negated independent Q2 requests"
  );
}

// Observed title regression: the user message has exactly three children —
// authored text, one structural Visualize mention, then authored text which may
// itself contain the word "Visualize". Only the verified structural marker may
// be removed. Text equality or a generic pill/plugin attribute is insufficient.
{
  const liveQuestion = makeLiveVisualizeQuestionFixture();
  const compact = value => String(value || "").replace(/\s+/g, " ").trim();
  assert.strictEqual(
    compact(liveQuestion.innerText),
    "바로 위 답변을 Visualize Visualize",
    "the clone-capable fixture must reproduce the observed raw live DOM text"
  );

  const preservationCases = [
    {
      label: "marker-less authored duplicate",
      node: makeCloneCapableElement({
        attrs: { "data-message-author-role": "user" },
        children: [makeCloneCapableTextNode("바로 위 답변을 Visualize Visualize")]
      }),
      expected: "바로 위 답변을 Visualize Visualize"
    },
    {
      label: "ordinary inline-selection pill",
      node: makeLiveVisualizeQuestionFixture({
        markerAttrs: { "data-inline-selection-pill": "", "data-id": "mention:topic" },
        includeVisualizeIcon: false
      }),
      expected: "바로 위 답변을 Visualize\nVisualize"
    },
    {
      label: "different plugin marker",
      node: makeLiveVisualizeQuestionFixture({
        markerAttrs: { "data-id": "plugin:other", "data-inline-selection-pill": "" },
        includeVisualizeIcon: false
      }),
      expected: "바로 위 답변을 Visualize\nVisualize"
    }
  ];
  preservationCases.forEach(({ label, node, expected }) => {
    assert.strictEqual(compact(node.innerText), compact(expected), `${label} fixture must preserve its raw text`);
  });

  assert.strictEqual(
    typeof hooks.questionNodeToPlainText,
    "function",
    "a common question extractor must normalize verified Visualize markers across strict and generic save paths"
  );
  const normalized = hooks.questionNodeToPlainText(liveQuestion);
  assert.strictEqual(normalized, "바로 위 답변을 Visualize");
  assert.strictEqual(hooks.makeTitle(normalized), "바로 위 답변을 Visualize");

  const idLessIconQuestion = makeLiveVisualizeQuestionFixture({
    markerAttrs: { "data-testid": "plugin-mention-pill" }
  });
  assert.deepStrictEqual(
    {
      raw: compact(idLessIconQuestion.innerText),
      routed: hooks.isVisualizeRequestNode(idLessIconQuestion),
      explicit: hooks.isExplicitVisualizeRequestNode(idLessIconQuestion),
      extracted: hooks.questionNodeToPlainText(idLessIconQuestion)
    },
    {
      raw: "바로 위 답변을 Visualize Visualize",
      routed: true,
      explicit: true,
      extracted: "바로 위 답변을 Visualize"
    },
    "an exact Visualize icon in an ID-less plugin mention must use the same marker boundary for routing and extraction"
  );

  const authoredOfficialIcon = makeCloneCapableElement({
    attrs: { "data-message-author-role": "user" },
    children: [
      makeCloneCapableTextNode("아이콘 설명: "),
      makeCloneCapableElement({
        tagName: "span",
        children: [
          makeCloneCapableElement({
            tagName: "img",
            attrs: { src: "https://chatgpt.com/images/visualize/app-blocks-visualize.svg" }
          }),
          makeCloneCapableTextNode("Visualize")
        ]
      })
    ]
  });
  assert.deepStrictEqual(
    {
      routed: hooks.isVisualizeRequestNode(authoredOfficialIcon),
      explicit: hooks.isExplicitVisualizeRequestNode(authoredOfficialIcon),
      extracted: hooks.questionNodeToPlainText(authoredOfficialIcon)
    },
    {
      routed: false,
      explicit: false,
      extracted: "아이콘 설명: Visualize"
    },
    "an authored official-icon image without a plugin mention structure must remain user content"
  );

  preservationCases.forEach(({ label, node, expected }) => {
    assert.strictEqual(hooks.questionNodeToPlainText(node), expected, `${label} must not be stripped`);
  });
}

// Marker removal is a local structural edit, not permission to flatten the
// user's entire prompt. Preserve authored line breaks on both sides and replace
// only the verified live marker position with one separating space.
{
  const multilineCases = [
    {
      label: "exact live Visualize marker",
      node: makeLiveVisualizeQuestionFixture({
        beforeText: "첫째 줄\n둘째 줄",
        afterText: "셋째 줄\n넷째 줄"
      }),
      expected: "첫째 줄\n둘째 줄 셋째 줄\n넷째 줄"
    },
    {
      label: "exact marker on its own authored line",
      node: makeLiveVisualizeQuestionFixture({
        beforeText: "첫째 줄\n",
        afterText: "\n둘째 줄"
      }),
      expected: "첫째 줄\n둘째 줄"
    },
    {
      label: "exact marker between authored element wrappers",
      node: makeLiveVisualizeQuestionFixture({
        beforeNode: makeCloneCapableElement({
          tagName: "span",
          children: [makeCloneCapableTextNode("앞")]
        }),
        afterNode: makeCloneCapableElement({
          tagName: "span",
          children: [makeCloneCapableTextNode("뒤")]
        })
      }),
      expected: "앞 뒤"
    },
    {
      label: "plugin:other",
      node: makeLiveVisualizeQuestionFixture({
        markerAttrs: { "data-plugin-id": "plugin:other" },
        markerText: "Other",
        beforeText: "첫째 줄\n둘째 줄 ",
        afterText: "\n셋째 줄",
        includeVisualizeIcon: false
      }),
      expected: "첫째 줄\n둘째 줄 Other\n셋째 줄"
    },
    {
      label: "ordinary inline-selection pill",
      node: makeLiveVisualizeQuestionFixture({
        markerAttrs: { "data-inline-selection-pill": "" },
        markerText: "일반 태그",
        beforeText: "첫째 줄\n둘째 줄 ",
        afterText: "\n셋째 줄",
        includeVisualizeIcon: false
      }),
      expected: "첫째 줄\n둘째 줄 일반 태그\n셋째 줄"
    },
    {
      label: "arbitrary data-id",
      node: makeLiveVisualizeQuestionFixture({
        markerAttrs: { "data-id": "unrelated-user-content" },
        markerText: "사용자 본문",
        beforeText: "첫째 줄\n둘째 줄 ",
        afterText: "\n셋째 줄",
        includeVisualizeIcon: false
      }),
      expected: "첫째 줄\n둘째 줄 사용자 본문\n셋째 줄"
    },
    {
      label: "Visualize-like but unverified plugin id",
      node: makeLiveVisualizeQuestionFixture({
        markerAttrs: { "data-plugin-id": "vendor-visualize-beta" },
        markerText: "Visualize",
        beforeText: "첫째 줄\n둘째 줄 ",
        afterText: "\n셋째 줄",
        includeVisualizeIcon: false
      }),
      expected: "첫째 줄\n둘째 줄 Visualize\n셋째 줄"
    }
  ];
  const vendorLikeNode = multilineCases.find(({ label }) => label === "Visualize-like but unverified plugin id").node;
  assert.deepStrictEqual(
    {
      extracted: multilineCases.map(({ label, node }) => [label, hooks.questionNodeToPlainText(node)]),
      vendorLikeClassification: {
        request: hooks.isVisualizeRequestNode(vendorLikeNode),
        explicit: hooks.isExplicitVisualizeRequestNode(vendorLikeNode)
      }
    },
    {
      extracted: multilineCases.map(({ label, expected }) => [label, expected]),
      vendorLikeClassification: { request: false, explicit: false }
    },
    "question extraction and routing must recognize only the exact live Visualize marker"
  );
}

{
  const acceptedRuntimeUrls = [
    "https://app-block-test.web-sandbox.oaiusercontent.com/runtime",
    "https://app-block-70825813905e0ff5a8b9c6dbc7627285.web-sandbox.oaiusercontent.com/"
  ];
  acceptedRuntimeUrls.forEach(value => {
    assert.strictEqual(hooks.isStrictRichAppRuntimeIframeUrl(value), true, `strict runtime URL must accept ${value}`);
  });

  const rejectedRuntimeUrls = [
    "http://app-block-test.web-sandbox.oaiusercontent.com/runtime",
    "https://user@app-block-test.web-sandbox.oaiusercontent.com/runtime",
    "https://user:secret@app-block-test.web-sandbox.oaiusercontent.com/runtime",
    "https://app-block-test.web-sandbox.oaiusercontent.com:443/runtime",
    "https://app-block-test.web-sandbox.oaiusercontent.com:444/runtime",
    "/relative-app-runtime",
    "not a URL",
    "https://app-block-test.web-sandbox.oaiusercontent.com.evil.example/runtime",
    "https://app-block-test.evil-oaiusercontent.com/runtime",
    "https://web-sandbox.oaiusercontent.com/runtime",
    "https://not-app-block.web-sandbox.oaiusercontent.com/runtime"
  ];
  rejectedRuntimeUrls.forEach(value => {
    assert.strictEqual(hooks.isStrictRichAppRuntimeIframeUrl(value), false, `strict runtime URL must reject ${value}`);
  });

  let evidenceFixtureIndex = 0;
  const makeEvidenceFixture = (options = {}) => {
    evidenceFixtureIndex += 1;
    const turn = makeConversationTurn("assistant", "ordinary assistant text", [], `evidence-${evidenceFixtureIndex}`);
    const assistant = turn.querySelector("[data-message-author-role]");
    const app = appendProviderNeutralRichApp(assistant, options);
    const document = makeDocument([turn]);
    installDocument(hooks, document);
    return { document, turn, assistant, ...app };
  };

  const valid = makeEvidenceFixture();
  const validEvidence = hooks.resolveProviderNeutralRichAppEvidence(valid.assistant);
  assert.strictEqual(validEvidence.ok, true);
  assert.strictEqual(validEvidence.block, valid.blocks[0]);
  assert.strictEqual(validEvidence.iframe, valid.iframes[0]);
  assert.strictEqual(validEvidence.blockCount, 1);
  assert.strictEqual(validEvidence.iframeCount, 1);

  const plainTextOnlyTurn = makeConversationTurn("assistant", "This paragraph says Visualize but has no app runtime.", [], "plain-visualize-text");
  const plainTextOnlyDocument = makeDocument([plainTextOnlyTurn]);
  installDocument(hooks, plainTextOnlyDocument);
  assert.strictEqual(
    hooks.resolveProviderNeutralRichAppEvidence(plainTextOnlyTurn.querySelector("[data-message-author-role]")).ok,
    false,
    "ordinary text containing Visualize is not structural rich-app evidence"
  );

  const hiddenBlock = makeEvidenceFixture({ blockVisible: false });
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(hiddenBlock.assistant).ok, false, "a hidden app block must fail closed");

  const detachedBlock = makeEvidenceFixture();
  detachedBlock.blocks[0].isConnected = false;
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(detachedBlock.assistant).ok, false, "a detached app block must fail closed");

  const multipleBlocks = makeEvidenceFixture({ blockCount: 2 });
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(multipleBlocks.assistant).ok, false, "multiple app blocks must fail closed");

  const noIframe = makeEvidenceFixture({ iframeCount: 0 });
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(noIframe.assistant).ok, false, "a block without an iframe must fail closed");

  const multipleIframes = makeEvidenceFixture({ iframeCount: 2 });
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(multipleIframes.assistant).ok, false, "multiple iframes must fail closed");

  const hiddenIframe = makeEvidenceFixture({ iframeVisible: false });
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(hiddenIframe.assistant).ok, false, "a hidden iframe must fail closed");

  const lookalikeIframe = makeEvidenceFixture({
    iframeUrl: "https://app-block-test.web-sandbox.oaiusercontent.com.evil.example/runtime"
  });
  assert.strictEqual(hooks.resolveProviderNeutralRichAppEvidence(lookalikeIframe.assistant).ok, false, "a lookalike hostname must fail closed");
}

// The second TDD cycle fixes routing, preflight, capture schema, and terminal
// provenance. The generic mode is deliberately named without Visualize and
// all positive fixtures remain valid if their neutral Q2 text changes.
assert.strictEqual(typeof hooks.resolvePreviousQaRichAppSaveContext, "function");
assert.strictEqual(typeof hooks.buildPreviousQaRichAppShareMarkdownDraft, "function");
assert.strictEqual(typeof hooks.buildPreviousQaRichAppShareMarkdown, "function");

{
  const genericFixture = makePreviousQaRichAppFixture({ q2Text: "중립적인 후속 요청" });
  installDocument(hooks, genericFixture.document);
  const genericContext = hooks.resolvePreviousQaRichAppSaveContext(genericFixture.a2);
  assert.strictEqual(genericContext.mode, "previous-qa-rich-app");
  assert.strictEqual(genericContext.questionNode, genericFixture.q1);
  assert.strictEqual(genericContext.answerNode, genericFixture.a1);
  assert.strictEqual(genericContext.requestNode, genericFixture.q2);
  assert.strictEqual(genericContext.currentAppAnswerNode, genericFixture.a2);
  assert.strictEqual(genericContext.questionText, "Q1 원본 질문");
  assert.strictEqual(genericContext.answerText, "A1 원본 답변");
  assert.strictEqual(genericContext.provider, "unknown");
  assert.strictEqual(genericContext.richAppEvidence.ok, true);

  const genericMarkdown = hooks.buildPreviousQaRichAppShareMarkdown({
    title: "공급자 중립 앱",
    sourceUrl: "https://chatgpt.com/c/synthetic-provider-neutral",
    shareUrl: "https://chatgpt.com/share/synthetic-00000000-0000-4000-8000-000000000000",
    questionText: genericContext.questionText,
    answerText: genericContext.answerText,
    richArtifactsExpected: 1,
    richArtifactsRemoteReferenced: 1,
    appProvider: "visualize"
  });
  [
    'rich_app_share_url: "https://chatgpt.com/share/synthetic-00000000-0000-4000-8000-000000000000"',
    "app_provider: unknown",
    "app_provenance: unverified",
    "capture_status: remote-reference",
    "capture_mode: previous-qa-rich-app-share-link",
    "rich_artifacts_expected: 1",
    "rich_artifacts_remote_referenced: 1",
    "# 원본 질문",
    "Q1 원본 질문",
    "# 원본 답변",
    "A1 원본 답변"
  ].forEach(fragment => assert(genericMarkdown.includes(fragment), `provider-neutral previous-Q&A note must contain ${fragment}`));
  [
    "app_provider: visualize",
    "visualize_share_url:",
    "previous-qa-visualize-share-link",
    "tags: [chatgpt, visualize"
  ].forEach(fragment => assert(!genericMarkdown.includes(fragment), `provider-neutral Markdown must not contain ${fragment}`));

  const genericDraft = hooks.buildPreviousQaRichAppShareMarkdownDraft({
    title: "공급자 중립 앱",
    sourceUrl: "https://chatgpt.com/c/synthetic-provider-neutral",
    questionText: genericContext.questionText,
    answerText: genericContext.answerText,
    richArtifactsExpected: 1
  });
  assert(genericDraft.includes('rich_app_share_url: "{{validatedChatGptShareUrl}}"'));
  assert(genericDraft.includes("app_provider: unknown"));
  assert(!genericDraft.includes("app_provider: visualize"));

  const genericConversationMarkdown = hooks.buildConversationShareMarkdown({
    title: "공급자 중립 전체 대화",
    sourceUrl: "https://chatgpt.com/c/synthetic-provider-neutral-conversation",
    shareUrl: "https://chatgpt.com/s/synthetic-t_provider_neutral_conversation",
    bodyMode: "previous-qa-rich-app",
    questionText: genericContext.questionText,
    answerText: genericContext.answerText,
    targetTurnId: "generic-a2",
    richArtifactsExpected: 1,
    richArtifactsRemoteReferenced: 1,
    appProvider: "visualize"
  });
  assert(genericConversationMarkdown.includes("capture_mode: previous-qa-rich-app-conversation-share-link"));
  assert(genericConversationMarkdown.includes("app_provider: unknown"));
  assert(genericConversationMarkdown.includes("app_provenance: unverified"));
  assert(genericConversationMarkdown.includes('conversation_share_url: "https://chatgpt.com/s/synthetic-t_provider_neutral_conversation"'));
  assert(!genericConversationMarkdown.includes("app_provider: visualize"));
  assert(!genericConversationMarkdown.includes("visualize_share_url:"));

  const structuredFixture = makeVisualizeConversationFixture({
    includePreviousQa: true,
    q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
  });
  installDocument(hooks, structuredFixture.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(structuredFixture.a2).mode, "previous-qa");
  assert.strictEqual(
    hooks.resolvePreviousQaRichAppSaveContext(structuredFixture.a2).mode,
    "unresolved",
    "structured Visualize provenance must remain owned by the existing first-precedence path"
  );
  const structuredMarkdown = hooks.buildVisualizeShareMarkdown({
    title: "구조화된 Visualize",
    sourceUrl: "https://chatgpt.com/c/synthetic-structured-visualize",
    shareUrl: "https://chatgpt.com/s/synthetic-t_structured_visualize",
    questionText: "Q1 원본 질문",
    answerText: "A1 원본 답변",
    richArtifactsExpected: 1
  });
  assert(structuredMarkdown.includes("capture_mode: previous-qa-visualize-share-link"));
  assert(structuredMarkdown.includes("app_provider: visualize"));
  assert(structuredMarkdown.includes("app_provenance: verified"));

  const noStructure = makePreviousQaRichAppFixture({ includeApp: false, q2Text: "중립적인 후속 요청" });
  installDocument(hooks, noStructure.document);
  assert.strictEqual(hooks.resolvePreviousQaRichAppSaveContext(noStructure.a2).mode, "unresolved");

  const visualizeWordOnly = makePreviousQaRichAppFixture({ includeApp: false, q2Text: "바로 위 답변을 Visualize" });
  installDocument(hooks, visualizeWordOnly.document);
  assert.strictEqual(
    hooks.resolvePreviousQaRichAppSaveContext(visualizeWordOnly.a2).mode,
    "unresolved",
    "Visualize-like request text without rich-app structure must not be promoted"
  );

  const duplicateRole = makePreviousQaRichAppFixture({ duplicateQ2Role: true });
  installDocument(hooks, duplicateRole.document);
  assert.strictEqual(hooks.resolvePreviousQaRichAppSaveContext(duplicateRole.a2).mode, "unresolved");

  const interveningAssistant = makePreviousQaRichAppFixture({
    betweenQ2A2: [makeConversationTurn("assistant", "conflicting assistant", [], "generic-conflict")]
  });
  installDocument(hooks, interveningAssistant.document);
  assert.strictEqual(hooks.resolvePreviousQaRichAppSaveContext(interveningAssistant.a2).mode, "unresolved");

  const genericSaveFixture = makePreviousQaRichAppFixture({
    q1Text: "공급자 중립 저장용 Q1",
    q2Text: "텍스트와 무관한 후속 요청"
  });
  installDocument(hooks, genericSaveFixture.document);
  const genericSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  genericSaveFixture.a2.appendChild(genericSaveButton);
  let genericConsentMode = "";
  let genericShareCalls = 0;
  let genericSavedPayload = null;
  const genericSaveResult = await hooks.handleCopyClick(genericSaveButton, {
    delayMs: 0,
    runtimeGuard: {
      checkSync: () => ({ ok: true }),
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null,
      fail: () => ({ ok: false }),
      notify: () => {}
    },
    confirmFn: () => false,
    alertFn: () => {},
    requestShareConsentFn: async ({ consentMode }) => {
      genericConsentMode = consentMode;
      return { approved: true, permissionGranted: false };
    },
    requestClipboardReadPermissionFn: () => Promise.resolve(false),
    createShareLinkFn: async currentAssistantNode => {
      genericShareCalls += 1;
      assert.strictEqual(currentAssistantNode, genericSaveFixture.a2);
      return { ok: true, url: "https://chatgpt.com/s/synthetic-t_provider_neutral_response", source: "existing", dialogClosed: true };
    },
    saveObsidianNoteFn: async payload => {
      genericSavedPayload = payload;
      return { ok: true };
    }
  });
  assert.strictEqual(genericSaveResult.ok, true);
  assert.strictEqual(genericSaveResult.mode, "previous-qa-rich-app");
  assert.strictEqual(genericConsentMode, "previous-qa-rich-app");
  assert.strictEqual(genericShareCalls, 1);
  assert(genericSavedPayload.content.includes("capture_mode: previous-qa-rich-app-share-link"));
  assert(genericSavedPayload.content.includes("app_provider: unknown"));
  assert(genericSavedPayload.content.includes("app_provenance: unverified"));
  assert(genericSavedPayload.content.includes("공급자 중립 저장용 Q1"));
  assert(genericSavedPayload.content.includes("A1 원본 답변"));
  assert(!genericSavedPayload.content.includes("app_provider: visualize"));
  assert(!genericSavedPayload.content.includes("visualize_share_url:"));
  assert.strictEqual(genericSavedPayload.fallbackUri, "");

  const genericConversationFixture = makePreviousQaRichAppFixture({
    q1Text: "공급자 중립 전체 대화용 Q1",
    q2Text: "전체 대화 fallback 검증"
  });
  installDocument(hooks, genericConversationFixture.document);
  const genericConversationContext = hooks.resolvePreviousQaRichAppSaveContext(genericConversationFixture.a2);
  const genericConversationButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  genericConversationFixture.a2.appendChild(genericConversationButton);
  let genericConversationPayload = null;
  const genericConversationResult = await hooks.handleVisualizeShareSave({
    btn: genericConversationButton,
    currentAssistantNode: genericConversationFixture.a2,
    previousQa: {
      questionNode: genericConversationContext.questionNode,
      answerNode: genericConversationContext.answerNode,
      requestNode: genericConversationContext.requestNode,
      questionText: genericConversationContext.questionText,
      answerText: genericConversationContext.answerText
    },
    visualizeContext: genericConversationContext,
    runtimeGuard: {
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null
    },
    sourceUrl: "https://chatgpt.com/c/synthetic-provider-neutral-conversation-flow",
    confirmFn: () => false,
    alertFn: () => {},
    sharePlan: { status: "found", kind: "conversation", control: makeNode({ tagName: "button", text: "Share" }) },
    requestShareConsentFn: async ({ consentMode }) => {
      assert.strictEqual(consentMode, "conversation");
      return { approved: true, permissionGranted: false };
    },
    createShareLinkFn: async () => ({
      ok: true,
      url: "https://chatgpt.com/s/synthetic-t_provider_neutral_conversation_flow",
      source: "existing",
      shareInteraction: "dialog",
      dialogClosed: true
    }),
    saveObsidianNoteFn: async payload => {
      genericConversationPayload = payload;
      return { ok: true };
    }
  });
  assert.strictEqual(genericConversationResult.ok, true);
  assert.strictEqual(genericConversationResult.mode, "previous-qa-rich-app");
  assert.strictEqual(genericConversationResult.shareKind, "conversation");
  assert(genericConversationPayload.content.includes("capture_mode: previous-qa-rich-app-conversation-share-link"));
  assert(genericConversationPayload.content.includes("app_provider: unknown"));
  assert(genericConversationPayload.content.includes("app_provenance: unverified"));
  assert(!genericConversationPayload.content.includes("app_provider: visualize"));
  assert(!genericConversationPayload.content.includes("visualize_share_url:"));
  assert.strictEqual(genericConversationPayload.fallbackUri, "");

  const disappearingFixture = makePreviousQaRichAppFixture({ q2Text: "preflight 재검증" });
  installDocument(hooks, disappearingFixture.document);
  const disappearingContext = hooks.resolvePreviousQaRichAppSaveContext(disappearingFixture.a2);
  assert.strictEqual(disappearingContext.mode, "previous-qa-rich-app");
  disappearingFixture.blocks[0].remove();
  let disappearingNativePreflightCalls = 0;
  const disappearingPreflight = await hooks.prepareVisualizeSharePreflight({
    currentAssistantNode: disappearingFixture.a2,
    visualizeContext: disappearingContext,
    sourceUrl: "https://chatgpt.com/c/synthetic-disappearing-evidence",
    nativePreflightFn: async () => {
      disappearingNativePreflightCalls += 1;
      return { ok: true };
    }
  });
  assert.strictEqual(disappearingPreflight.ok, false);
  assert.strictEqual(disappearingPreflight.stage, "preflight");
  assert.strictEqual(disappearingNativePreflightCalls, 0, "lost evidence must fail before Native preflight");

  const mutationCases = [
    {
      name: "hidden app block",
      mutate: fixture => fixture.blocks[0].setRect({ width: 0, height: 0 })
    },
    {
      name: "multiple app blocks",
      mutate: fixture => appendProviderNeutralRichApp(fixture.a2)
    },
    {
      name: "multiple iframes",
      mutate: fixture => fixture.blocks[0].appendChild(makeNode({
        tagName: "iframe",
        attrs: { src: "https://app-block-second.web-sandbox.oaiusercontent.com/runtime" },
        width: 640,
        height: 360
      }))
    },
    {
      name: "lookalike runtime hostname",
      mutate: fixture => fixture.iframes[0].setAttribute("src", "https://app-block-test.web-sandbox.oaiusercontent.com.evil.example/runtime")
    }
  ];
  for (const mutationCase of mutationCases) {
    const fixture = makePreviousQaRichAppFixture({ q2Text: `preflight ${mutationCase.name}` });
    installDocument(hooks, fixture.document);
    const context = hooks.resolvePreviousQaRichAppSaveContext(fixture.a2);
    assert.strictEqual(context.mode, "previous-qa-rich-app");
    mutationCase.mutate(fixture);
    let nativeCalls = 0;
    const result = await hooks.prepareVisualizeSharePreflight({
      currentAssistantNode: fixture.a2,
      visualizeContext: context,
      sourceUrl: "https://chatgpt.com/c/synthetic-provider-neutral-preflight-negative",
      nativePreflightFn: async () => {
        nativeCalls += 1;
        return { ok: true };
      }
    });
    assert.strictEqual(result.ok, false, `${mutationCase.name} must fail closed at preflight`);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(nativeCalls, 0, `${mutationCase.name} must stop before Native preflight`);
  }

  const beforeShareFixture = makePreviousQaRichAppFixture({
    q1Text: "Share 직전 증거 소실용 Q1",
    q2Text: "Share 직전 증거 소실"
  });
  installDocument(hooks, beforeShareFixture.document);
  const beforeShareButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  beforeShareFixture.a2.appendChild(beforeShareButton);
  let beforeShareClicks = 0;
  let beforeShareNativeSaves = 0;
  const beforeShareResult = await hooks.handleCopyClick(beforeShareButton, {
    delayMs: 0,
    runtimeGuard: {
      checkSync: () => ({ ok: true }),
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null,
      fail: () => ({ ok: false }),
      notify: () => {}
    },
    confirmFn: () => false,
    alertFn: () => {},
    requestShareConsentFn: async () => {
      beforeShareFixture.blocks[0].remove();
      return { approved: true, permissionGranted: false };
    },
    createShareLinkFn: async () => {
      beforeShareClicks += 1;
      return { ok: true, url: "https://chatgpt.com/s/synthetic-t_must_not_be_used", source: "created" };
    },
    saveObsidianNoteFn: async () => {
      beforeShareNativeSaves += 1;
      return { ok: true };
    }
  });
  assert.strictEqual(beforeShareResult.ok, false);
  assert.strictEqual(beforeShareResult.stage, "preflight");
  assert.strictEqual(beforeShareClicks, 0, "evidence lost during consent must stop before Share click");
  assert.strictEqual(beforeShareNativeSaves, 0, "evidence lost during consent must stop before Native save");
}

{
  const continuationFixture = makeRichAppContinuationFixture();
  installDocument(hooks, continuationFixture.document);
  const continuationContext = hooks.resolveRichAppContinuationContext(continuationFixture.a2);
  assert.strictEqual(continuationContext.mode, "rich-app-continuation");
  assert.strictEqual(continuationContext.previousAppAnswerNode, continuationFixture.a0);
  assert.strictEqual(continuationContext.requestNode, continuationFixture.q2);
  assert.strictEqual(continuationContext.currentAppAnswerNode, continuationFixture.a2);
  assert.strictEqual(continuationContext.provider, "unknown");

  const continuationMarkdown = hooks.buildRichAppContinuationShareMarkdown({
    title: "다음 섹션",
    sourceUrl: "https://chatgpt.com/c/synthetic-rich-app-continuation",
    shareUrl: "https://chatgpt.com/s/synthetic-t_continuation",
    questionText: continuationContext.questionText,
    explanationText: "A2 바깥 설명",
    richArtifactsExpected: 1,
    richArtifactsRemoteReferenced: 1
  });
  [
    "capture_status: remote-reference",
    "capture_mode: rich-app-continuation-share-link",
    'rich_app_share_url: "https://chatgpt.com/s/synthetic-t_continuation"',
    "app_provider: unknown",
    "app_provenance: unverified",
    "rich_artifacts_expected: 1",
    "rich_artifacts_local_complete: 0",
    "rich_artifacts_remote_referenced: 1",
    "interactive_behavior_preserved: remote-only",
    "offline_available: false",
    "# 상호작용형 앱",
    "# 요청",
    continuationContext.questionText,
    "# 앱 설명",
    "A2 바깥 설명",
    "https://chatgpt.com/s/synthetic-t_continuation"
  ].forEach(fragment => assert(continuationMarkdown.includes(fragment), `continuation note must contain ${fragment}`));
  assert(!continuationMarkdown.includes("visualize_share_url:"), "provider-neutral continuation must not claim a Visualize URL field");
  assert(!continuationMarkdown.includes("# 원본 답변"), "continuation mode must not store A0 as the original answer");
  assert(!hooks.buildRichAppContinuationShareMarkdown({
    title: "invalid",
    sourceUrl: "https://chatgpt.com/c/synthetic-rich-app-invalid",
    shareUrl: "https://chatgpt.com/c/synthetic-not-a-share",
    questionText: "Q2"
  }), "an invalid share URL must not assemble continuation Markdown");

  const continuationButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  continuationFixture.a2.appendChild(continuationButton);
  let continuationShareCalls = 0;
  let continuationSaveCalls = 0;
  let continuationSavedPayload = null;
  const continuationSaveResult = await hooks.handleCopyClick(continuationButton, {
    delayMs: 0,
    runtimeGuard: {
      checkSync: () => ({ ok: true }),
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null,
      fail: () => ({ ok: false }),
      notify: () => {}
    },
    confirmFn: () => true,
    alertFn: () => {},
    preflightFn: async ({ visualizeContext: context }) => {
      assert.strictEqual(context.mode, "rich-app-continuation");
      assert.strictEqual(context.currentAppAnswerNode, continuationFixture.a2);
      assert.strictEqual(context.requestNode, continuationFixture.q2);
      return {
        ok: true,
        mode: "rich-app-continuation",
        title: "다음 섹션",
        filePath: "ChatGPT/rich-app-continuation.md",
        questionText: continuationContext.questionText,
        answerText: "",
        explanationText: "A2 바깥 설명",
        fileLinks: [],
        artifactRows: [],
        readableFiles: [],
        fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
        localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
        richArtifactsExpected: 1
      };
    },
    requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
    requestClipboardReadPermissionFn: () => Promise.resolve(false),
    createShareLinkFn: async currentAssistant => {
      continuationShareCalls += 1;
      assert.strictEqual(currentAssistant, continuationFixture.a2);
      return { ok: true, url: "https://chatgpt.com/s/synthetic-t_continuation_current", source: "existing", dialogClosed: true };
    },
    saveObsidianNoteFn: async payload => {
      continuationSaveCalls += 1;
      continuationSavedPayload = payload;
      return { ok: true };
    }
  });
  assert.strictEqual(continuationSaveResult.ok, true, "the current app follow-up must enter the continuation share path");
  assert.strictEqual(continuationSaveResult.mode, "rich-app-continuation");
  assert.strictEqual(continuationShareCalls, 1);
  assert.strictEqual(continuationSaveCalls, 1);
  [
    'rich_app_share_url: "https://chatgpt.com/s/synthetic-t_continuation_current"',
    "capture_status: remote-reference",
    "capture_mode: rich-app-continuation-share-link",
    "rich_artifacts_expected: 1",
    "rich_artifacts_local_complete: 0",
    "rich_artifacts_remote_referenced: 1",
    "# 요청",
    continuationContext.questionText,
    "# 앱 설명",
    "A2 바깥 설명"
  ].forEach(fragment => assert(continuationSavedPayload.content.includes(fragment), `continuation saved Markdown must contain ${fragment}`));
  assert(!continuationSavedPayload.content.includes("visualize_share_url:"));
  assert(!continuationSavedPayload.content.includes("https://chatgpt.com/s/synthetic-t_continuation\""), "the previous A0 URL must not be reused");
  assert(!continuationSavedPayload.content.includes("A0 app explanation"), "A0 must not become the saved original answer");
  assert.strictEqual(continuationSavedPayload.fallbackUri, "", "continuation share mode must prohibit URI fallback");

  installDocument(hooks, continuationFixture.document);
  const continuationPreflight = await hooks.prepareVisualizeSharePreflight({
    currentAssistantNode: continuationFixture.a2,
    visualizeContext: continuationContext,
    sourceUrl: "https://chatgpt.com/c/synthetic-rich-app-preflight",
    nativePreflightFn: async () => ({ ok: true })
  });
  assert.strictEqual(continuationPreflight.ok, true);
  assert.strictEqual(continuationPreflight.mode, "rich-app-continuation");
  assert.strictEqual(continuationPreflight.remoteRichIntegrity.expectedCount, 1);
  assert(continuationPreflight.markdown.includes("capture_mode: rich-app-continuation-share-link"));
  assert(continuationPreflight.markdown.includes("rich_app_share_url: \"{{validatedChatGptShareUrl}}\""));
  assert(!continuationPreflight.markdown.includes("visualize_share_url:"));

  let continuationInvalidSaveCalls = 0;
  const continuationInvalidShare = await hooks.handleVisualizeShareSave({
    btn: { closest: () => continuationFixture.a2 },
    currentAssistantNode: continuationFixture.a2,
    visualizeContext: continuationContext,
    previousQa: null,
    runtimeGuard: {
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null
    },
    sourceUrl: "https://chatgpt.com/c/synthetic-rich-app-invalid-share",
    preflightFn: async () => ({
      ok: true,
      mode: "rich-app-continuation",
      title: "잘못된 후속 앱 URL",
      filePath: "ChatGPT/rich-app-invalid-share.md",
      questionText: continuationContext.questionText,
      answerText: "",
      explanationText: "",
      fileLinks: [],
      artifactRows: [],
      readableFiles: [],
      fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
      localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
      richArtifactsExpected: 1
    }),
    requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
    requestClipboardReadPermissionFn: () => Promise.resolve(false),
    createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/c/synthetic-not-a-share", source: "existing" }),
    saveObsidianNoteFn: async () => {
      continuationInvalidSaveCalls += 1;
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(continuationInvalidShare.ok, false);
  assert.strictEqual(continuationInvalidShare.stage, "share-url");
  assert.strictEqual(continuationInvalidSaveCalls, 0, "an invalid continuation URL must not save remote-reference metadata");

  const noPreviousApp = makeRichAppContinuationFixture({ a0App: false });
  installDocument(hooks, noPreviousApp.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(noPreviousApp.a2).mode,
    "unresolved",
    "a previous assistant without an app block must not qualify as continuation"
  );

  const noCurrentApp = makeRichAppContinuationFixture({ a2App: false });
  installDocument(hooks, noCurrentApp.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(noCurrentApp.a2).mode,
    "unresolved",
    "an assistant without the current app block must not qualify as continuation"
  );

  const interveningUser = makeConversationTurn("user", "unexpected user", [], "unexpected-user");
  const brokenBeforeQ2 = makeRichAppContinuationFixture({ betweenA0Q2: [interveningUser] });
  installDocument(hooks, brokenBeforeQ2.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(brokenBeforeQ2.a2).mode,
    "unresolved",
    "an extra user turn before Q2 must make continuation ambiguous"
  );

  const interveningAssistant = makeConversationTurn("assistant", "unexpected assistant", [], "unexpected-assistant");
  const brokenAfterQ2 = makeRichAppContinuationFixture({ betweenQ2A2: [interveningAssistant] });
  installDocument(hooks, brokenAfterQ2.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(brokenAfterQ2.a2).mode,
    "unresolved",
    "an extra assistant turn after Q2 must make continuation ambiguous"
  );

  const ambiguousTurn = makeNode({
    tagName: "section",
    attrs: { "data-testid": "conversation-turn-ambiguous", "data-turn": "user", "data-turn-id": "ambiguous" },
    children: [
      makeNode({ attrs: { "data-message-author-role": "user" }, text: "ambiguous one" }),
      makeNode({ attrs: { "data-message-author-role": "assistant" }, text: "ambiguous two" })
    ]
  });
  const brokenAmbiguous = makeRichAppContinuationFixture({ betweenA0Q2: [ambiguousTurn] });
  installDocument(hooks, brokenAmbiguous.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(brokenAmbiguous.a2).mode,
    "unresolved",
    "an ambiguous conversation turn must stop continuation safely"
  );

  const toolBetween = makeNode({ tagName: "section", attrs: { "data-testid": "conversation-turn-tool", "data-turn": "tool" }, text: "tool output" });
  const continuationWithTool = makeRichAppContinuationFixture({ betweenA0Q2: [toolBetween] });
  installDocument(hooks, continuationWithTool.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(continuationWithTool.a2).mode,
    "rich-app-continuation",
    "a declared tool turn is not a user/assistant correspondence candidate"
  );

  const directOnly = makeVisualizeConversationFixture({});
  installDocument(hooks, directOnly.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(directOnly.a2).mode,
    "unresolved",
    "direct Q2 -> A2 must remain owned by the strict direct Visualize resolver"
  );
  assert.strictEqual(
    hooks.isVisualizeShareCandidate(directOnly.a2, { requestNode: directOnly.q2 }),
    true,
    "the explicit Visualize candidate remains strict and unchanged"
  );

  const explicitInContinuation = makeRichAppContinuationFixture();
  explicitInContinuation.q2.appendChild(makeNode({ attrs: { "data-id": "plugin:visualize" }, text: "Visualize" }));
  installDocument(hooks, explicitInContinuation.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(explicitInContinuation.a2).mode,
    "unresolved",
    "explicit Visualize provenance must stay on the strict resolver path"
  );

  const otherPluginInContinuation = makeRichAppContinuationFixture();
  otherPluginInContinuation.q2.appendChild(makeNode({ attrs: { "data-plugin-id": "plugin:other" }, text: "Other" }));
  installDocument(hooks, otherPluginInContinuation.document);
  assert.strictEqual(
    hooks.resolveRichAppContinuationContext(otherPluginInContinuation.a2).mode,
    "unresolved",
    "another plugin marker must not be relabeled as an unknown continuation provider"
  );

  const previousFixture = makeVisualizeConversationFixture({
    includePreviousQa: true,
    q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
  });
  installDocument(hooks, previousFixture.document);
  const previousContext = hooks.resolveVisualizeSaveContext(previousFixture.a2);
  assert.strictEqual(previousContext.mode, "previous-qa");
  assert.strictEqual(previousContext.questionNode.getAttribute("data-message-author-role"), "user");
  assert.strictEqual(previousContext.answerNode.getAttribute("data-message-author-role"), "assistant");
  assert.strictEqual(previousContext.visualizeRequestNode, previousFixture.q2);
  assert.strictEqual(previousContext.visualizeAnswerNode, previousFixture.a2);
  assert.strictEqual(previousContext.questionText, "Q1 원본 질문");
  assert.strictEqual(previousContext.answerText, "A1 원본 답변");

  const previousAnswerReferenceRequests = [
    PREVIOUS_ANSWER_VISUALIZE_REQUEST,
    "이전 응답을 시각화해 줘",
    "방금 설명한 내용을 시각화해 주세요",
    "이 답변을 인터랙티브하게 보여 주세요",
    "Visualize the previous answer",
    "Turn your last response into a visualization",
    "Visualize the answer above",
    "Visualize what you just explained"
  ];
  previousAnswerReferenceRequests.forEach((q2Text, index) => {
    const fixture = makeVisualizeConversationFixture({ includePreviousQa: true, q2Text });
    installDocument(hooks, fixture.document);
    const context = hooks.resolveVisualizeSaveContext(fixture.a2);
    assert.strictEqual(context.mode, "previous-qa", `previous-answer request ${index + 1} must preserve Q1/A1`);
    assert.strictEqual(context.questionText, "Q1 원본 질문");
    assert.strictEqual(context.answerText, "A1 원본 답변");
  });

  const currentRequestCases = [
    "서주공방전의 전개를 지도와 타임라인으로 시각화해 주세요",
    "이전 시대와 현재 시대의 병력 구성을 비교해 시각화해 주세요",
    "Visualize previous-quarter revenue against the current quarter"
  ];
  currentRequestCases.forEach((q2Text, index) => {
    const fixture = makeVisualizeConversationFixture({ includePreviousQa: true, q2Text });
    installDocument(hooks, fixture.document);
    const context = hooks.resolveVisualizeSaveContext(fixture.a2);
    assert.strictEqual(context.mode, "direct-visualize", `independent Q2 request ${index + 1} must use Q2/A2 despite earlier history`);
    assert.strictEqual(context.questionNode, null);
    assert.strictEqual(context.answerNode, null);
    assert.strictEqual(context.visualizeRequestNode, fixture.q2);
    assert.strictEqual(context.visualizeAnswerNode, fixture.a2);
    assert.strictEqual(context.questionText, q2Text);
    assert.strictEqual(context.answerText, "");
  });

  const historyDirectFixture = makeVisualizeConversationFixture({
    includePreviousQa: true,
    q2Text: "B 질문의 내용을 독립적인 지도로 시각화해 주세요"
  });
  installDocument(hooks, historyDirectFixture.document);
  const historyDirectContext = hooks.resolveVisualizeSaveContext(historyDirectFixture.a2);
  assert.strictEqual(historyDirectContext.mode, "direct-visualize");
  assert.strictEqual(historyDirectContext.questionText, "B 질문의 내용을 독립적인 지도로 시각화해 주세요");
  assert.strictEqual(historyDirectContext.answerText, "");

  const directFixture = makeVisualizeConversationFixture({});
  installDocument(hooks, directFixture.document);
  const directContext = hooks.resolveVisualizeSaveContext(directFixture.a2);
  assert.strictEqual(directContext.mode, "direct-visualize");
  assert.strictEqual(directContext.questionNode, null);
  assert.strictEqual(directContext.answerNode, null);
  assert.strictEqual(directContext.visualizeRequestNode, directFixture.q2);
  assert.strictEqual(directContext.visualizeAnswerNode, directFixture.a2);
  assert.strictEqual(directContext.questionText, "Q2에서 시각화해 주세요");
  assert.strictEqual(directContext.answerText, "");

  const directPreflight = await hooks.prepareVisualizeSharePreflight({
    currentAssistantNode: directFixture.a2,
    visualizeContext: directContext,
    sourceUrl: "https://chatgpt.com/c/synthetic-direct-preflight",
    nativePreflightFn: async () => ({ ok: true })
  });
  assert.strictEqual(directPreflight.ok, true);
  assert.strictEqual(directPreflight.mode, "direct-visualize");
  assert.strictEqual(directPreflight.localRichIntegrity.expectedCount, 0);
  assert.strictEqual(directPreflight.remoteRichIntegrity.expectedCount, 1);
  assert(directPreflight.markdown.includes("capture_mode: direct-visualize-share-link"));
  assert(directPreflight.markdown.includes("{{validatedChatGptShareUrl}}"));

  const directMarkdown = hooks.buildDirectVisualizeShareMarkdown({
    title: "직접 시각화",
    sourceUrl: "https://chatgpt.com/c/synthetic-direct",
    shareUrl: "https://chatgpt.com/s/synthetic-t_direct",
    questionText: directContext.questionText,
    explanationText: "A2 바깥 설명",
    richArtifactsExpected: 1
  });
  [
    "capture_status: remote-reference",
    "capture_mode: direct-visualize-share-link",
    "app_provider: visualize",
    "app_provenance: verified",
    "rich_artifacts_expected: 1",
    "rich_artifacts_local_complete: 0",
    "rich_artifacts_remote_referenced: 1",
    "interactive_behavior_preserved: remote-only",
    "offline_available: false",
    "# 시각화 요청",
    "Q2에서 시각화해 주세요",
    "# 시각화 설명",
    "A2 바깥 설명",
    "https://chatgpt.com/s/synthetic-t_direct"
  ].forEach(fragment => assert(directMarkdown.includes(fragment), `direct note must contain ${fragment}`));
  assert(!directMarkdown.includes("# 원본 답변"), "direct mode must not label A2 as A1");

  let directShareCalls = 0;
  let directNativeSaveCalls = 0;
  let directSavedPayload = null;
  const directSaveResult = await hooks.handleVisualizeShareSave({
    btn: { closest: () => directFixture.a2 },
    currentAssistantNode: directFixture.a2,
    visualizeContext: directContext,
    previousQa: null,
    runtimeGuard: {
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null
    },
    sourceUrl: "https://chatgpt.com/c/synthetic-direct-save",
    preflightFn: async ({ visualizeContext: context }) => {
      assert.strictEqual(context.mode, "direct-visualize");
      return {
        ok: true,
        mode: "direct-visualize",
        title: "직접 시각화",
        filePath: "ChatGPT/direct-visualize.md",
        questionText: directContext.questionText,
        answerText: "",
        explanationText: "A2 바깥 설명",
        fileLinks: [],
        artifactRows: [],
        readableFiles: [],
        fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
        localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
        richArtifactsExpected: 1
      };
    },
    requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
    requestClipboardReadPermissionFn: () => Promise.resolve(false),
    createShareLinkFn: async () => {
      directShareCalls += 1;
      return { ok: true, url: "https://chatgpt.com/s/synthetic-t_direct_save", source: "existing", dialogClosed: true };
    },
    saveObsidianNoteFn: async payload => {
      directNativeSaveCalls += 1;
      directSavedPayload = payload;
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(directSaveResult.ok, true);
  assert.strictEqual(directShareCalls, 1);
  assert.strictEqual(directNativeSaveCalls, 1);
  assert(directSavedPayload.content.includes("# 시각화 요청"));
  assert(directSavedPayload.content.includes("Q2에서 시각화해 주세요"));
  assert(directSavedPayload.content.includes("A2 바깥 설명"));
  assert(directSavedPayload.content.includes("https://chatgpt.com/s/synthetic-t_direct_save"));
  [
    'visualize_share_url: "https://chatgpt.com/s/synthetic-t_direct_save"',
    "capture_status: remote-reference",
    "capture_mode: direct-visualize-share-link",
    "app_provider: visualize",
    "app_provenance: verified",
    "rich_artifacts_expected: 1",
    "rich_artifacts_local_complete: 0",
    "rich_artifacts_remote_referenced: 1",
    "interactive_behavior_preserved: remote-only",
    "offline_available: false"
  ].forEach(fragment => assert(directSavedPayload.content.includes(fragment), `direct saved Markdown must contain ${fragment}`));
  assert(!directSavedPayload.content.includes("# 원본 답변"), "direct save must not store A2 as an original answer");
  assert(!directSavedPayload.content.includes("capture_status: partial"), "direct remote save must not reuse partial metadata");
  assert(!directSavedPayload.content.includes("validatedChatGptShareUrl"), "direct saved Markdown must not contain the preflight URL placeholder");
  assert.strictEqual(directSavedPayload.fallbackUri, "", "direct share mode must prohibit URI fallback");

  let invalidShareNativeSaveCalls = 0;
  const invalidShareResult = await hooks.handleVisualizeShareSave({
    btn: { closest: () => directFixture.a2 },
    currentAssistantNode: directFixture.a2,
    visualizeContext: directContext,
    previousQa: null,
    runtimeGuard: {
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null
    },
    sourceUrl: "https://chatgpt.com/c/synthetic-direct-invalid-share",
    preflightFn: async () => ({
      ok: true,
      mode: "direct-visualize",
      title: "잘못된 공유 URL",
      filePath: "ChatGPT/invalid-share.md",
      questionText: directContext.questionText,
      answerText: "",
      explanationText: "",
      fileLinks: [],
      artifactRows: [],
      readableFiles: [],
      fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
      localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
      richArtifactsExpected: 1
    }),
    requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
    createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/c/synthetic-not-a-share", source: "existing" }),
    saveObsidianNoteFn: async () => {
      invalidShareNativeSaveCalls += 1;
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(invalidShareResult.ok, false);
  assert.strictEqual(invalidShareResult.stage, "share-url", "an unvalidated URL must stop before Markdown assembly");
  assert.strictEqual(invalidShareNativeSaveCalls, 0, "an unvalidated URL must not save any remote-reference metadata");

  // A caller-provided share result is not trusted merely because it looks like
  // a valid path. The final Markdown path must receive the absolute URL that
  // passed the strict validator, never a relative/raw share value.
  let relativeShareNativeSaveCalls = 0;
  const relativeShareResult = await hooks.handleVisualizeShareSave({
    btn: { closest: () => directFixture.a2 },
    currentAssistantNode: directFixture.a2,
    visualizeContext: directContext,
    previousQa: null,
    runtimeGuard: {
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null
    },
    sourceUrl: "https://chatgpt.com/c/synthetic-direct-relative-share",
    preflightFn: async () => ({
      ok: true,
      mode: "direct-visualize",
      title: "상대 경로 공유 URL",
      filePath: "ChatGPT/direct-relative-share.md",
      questionText: directContext.questionText,
      answerText: "",
      explanationText: "",
      fileLinks: [],
      artifactRows: [],
      readableFiles: [],
      fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
      localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
      remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
      richArtifactsExpected: 1
    }),
    requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
    createShareLinkFn: async () => ({ ok: true, url: "/s/raw-relative-value", source: "existing" }),
    saveObsidianNoteFn: async () => {
      relativeShareNativeSaveCalls += 1;
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(relativeShareResult.ok, false, "a relative/raw share result must fail strict URL validation");
  assert.strictEqual(relativeShareResult.stage, "share-url");
  assert.strictEqual(relativeShareNativeSaveCalls, 0, "an unvalidated relative URL must not reach Native save");

  installDocument(hooks, historyDirectFixture.document);
  const directClickButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  historyDirectFixture.a2.appendChild(directClickButton);
  let directClickSaveCalls = 0;
  const directClickResult = await hooks.handleCopyClick(directClickButton, {
    delayMs: 0,
    runtimeGuard: {
      checkSync: () => ({ ok: true }),
      check: async () => ({ ok: true }),
      isAborted: () => false,
      getFailure: () => null,
      fail: () => ({ ok: false }),
      notify: () => {}
    },
    confirmFn: () => true,
    alertFn: () => {},
    preflightFn: async ({ visualizeContext: context }) => ({
      ok: true,
      mode: context.mode,
      title: "직접 클릭 시각화",
      filePath: "ChatGPT/direct-click-visualize.md",
      questionText: context.questionText,
      answerText: "",
      explanationText: "A2 바깥 설명",
      fileLinks: [],
      artifactRows: [],
      readableFiles: [],
      fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
      localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
      richArtifactsExpected: 1
    }),
    requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
    requestClipboardReadPermissionFn: () => Promise.resolve(false),
    createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/s/synthetic-t_direct_click", source: "existing", dialogClosed: true }),
    saveObsidianNoteFn: async payload => {
      directClickSaveCalls += 1;
      assert(payload.content.includes("# 시각화 요청"));
      assert(payload.content.includes("B 질문의 내용을 독립적인 지도로 시각화해 주세요"));
      assert(payload.content.includes("A2 바깥 설명"));
      assert(!payload.content.includes("Q1 원본 질문"));
      assert(!payload.content.includes("A1 원본 답변"));
      assert(!payload.content.includes("# 원본 답변"));
      return { ok: true };
    }
  });
  assert.strictEqual(directClickResult.ok, true, "the real handleCopyClick path must select direct mode");
  assert.strictEqual(directClickResult.mode, "direct-visualize");
  assert.strictEqual(directClickSaveCalls, 1);
}

{
  const plainFixture = makeVisualizeConversationFixture({ q2Text: "Visualize" });
  plainFixture.q2.childNodes = [];
  installDocument(hooks, plainFixture.document);
  const plainContext = hooks.resolveVisualizeSaveContext(plainFixture.a2);
  assert.strictEqual(plainContext.mode, "unresolved", "plain Visualize text is not a direct plugin request");

  const noAppFixture = makeVisualizeConversationFixture({ appBlock: false });
  installDocument(hooks, noAppFixture.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(noAppFixture.a2).mode, "unresolved");

  const priorUserOnly = makeVisualizeConversationFixture({
    intermediateTurns: [makeConversationTurn("user", "이전 사용자 후보", [], "prior-user")]
  });
  installDocument(hooks, priorUserOnly.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(priorUserOnly.a2).mode, "unresolved", "an earlier user without A1 must not be mistaken for direct mode");

  const duplicateFixture = makeVisualizeConversationFixture({ duplicateRoleNodes: true });
  installDocument(hooks, duplicateFixture.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(duplicateFixture.a2).mode, "unresolved", "duplicate role candidates must stop safely");

  const toolTurn = makeNode({ tagName: "section", attrs: { "data-testid": "conversation-turn-tool", "data-turn": "tool" }, text: "tool output" });
  const directWithTool = makeVisualizeConversationFixture({ intermediateTurns: [toolTurn] });
  installDocument(hooks, directWithTool.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(directWithTool.a2).mode, "direct-visualize", "non-Q/A tool turns may be skipped");

  const strayAssistant = makeConversationTurn("assistant", "stray assistant", [], "stray-assistant");
  const ambiguousAfterQ2 = makeVisualizeConversationFixture();
  ambiguousAfterQ2.document = makeDocument([
    ambiguousAfterQ2.q2Turn,
    strayAssistant,
    ambiguousAfterQ2.a2Turn
  ]);
  installDocument(hooks, ambiguousAfterQ2.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(ambiguousAfterQ2.a2).mode, "unresolved", "an extra assistant between Q2 and A2 must stop safely");

  const olderQ1 = makeConversationTurn("user", "더 오래된 질문", [], "older-q1");
  const olderA1 = makeConversationTurn("assistant", "더 오래된 답변", [], "older-a1");
  const longHistory = makeVisualizeConversationFixture({
    includePreviousQa: true,
    q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
  });
  longHistory.document = makeDocument([
    olderQ1,
    olderA1,
    ...longHistory.turns
  ]);
  installDocument(hooks, longHistory.document);
  const longContext = hooks.resolveVisualizeSaveContext(longHistory.a2);
  assert.strictEqual(longContext.mode, "previous-qa");
  assert.strictEqual(longContext.questionText, "Q1 원본 질문", "the nearest complete previous Q/A must win in a long history");
  assert.strictEqual(longContext.answerText, "A1 원본 답변");

  const previousWithTool = makeVisualizeConversationFixture({
    includePreviousQa: true,
    q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST,
    intermediateTurns: [makeNode({ tagName: "section", attrs: { "data-testid": "conversation-turn-tool-2", "data-turn": "tool" }, text: "tool output" })]
  });
  installDocument(hooks, previousWithTool.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(previousWithTool.a2).mode, "previous-qa");

  const emptyA1 = makeVisualizeConversationFixture({
    includePreviousQa: true,
    q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST,
    a1Text: ""
  });
  installDocument(hooks, emptyA1.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(emptyA1.a2).mode, "unresolved", "an empty A1 must not fall through to direct mode");
}

// ChatGPT virtualizes long conversations. At the clicked A2 position the live
// DOM can contain only A1/Q2/A2; scrolling upward replaces that window with
// Q1/A1, and restoring the position mounts fresh A1/Q2/A2 node objects. The
// save path must join only verified overlapping windows, restore/reacquire the
// target, and remain read-only until the complete pair is proven.
{
  const virtualizationRequest = "바로 위 답변을 Visualize";
  const makeVirtualizedCase = ({
    idPrefix,
    upperIdPrefix = idPrefix,
    upperA1Text = "가상화 A1 원본 답변",
    deferUpperMount = false,
    duplicateUpperQ1Identity = false,
    duplicateUpperQ1AuxiliaryIds = false,
    resolveDuplicateUpperQ1OnNextScroll = false,
    varyAuxiliaryIdsAcrossWindows = false,
    scrollHeightAfterUpper = null,
    restoreAtBottomOffset = false,
    clampScrollTopToMax = false,
    reuseInitialA2OnRestore = false,
    q2A2OnlyInitialWindow = false,
    skipQ2A1Overlap = false,
    restoreTailNeedsProbe = false,
    restoreProbeMountsTarget = true,
    deferRestoreProbeTargetUntilPoll = false,
    settleRestoredProbeLayoutOnPoll = false,
    dropRestoredTargetOnLogicalRestore = false,
    failLogicalRestoreAfterProbe = false,
    initialScrollTop = 900,
    conversationClientHeight = 400,
    conversationScrollHeight = 1800,
    restoreProbeRequiredDeltaPx = 0,
    followingAnchorInitialTop = null,
    followingAnchorTailTop = null,
    dropFollowingAnchorAfterBottomOffset = false,
    restoreTailTargetAfterPolls = 0,
    consentRecoveryMountsQ2 = true,
    consentRecoveryMountsA1 = true,
    consentRecoveryUsesFreshA1 = false,
    onPhase = () => {}
  }) => {
    const fixtureOptions = {
      includePreviousQa: true,
      idPrefix,
      q1Text: "가상화 Q1 원본 질문",
      a1Text: "가상화 A1 원본 답변",
      q2Text: virtualizationRequest,
      a2Text: "가상화 A2 바깥 설명"
    };
    const initial = makeVisualizeConversationFixture(fixtureOptions);
    const overlap = makeVisualizeConversationFixture(fixtureOptions);
    const upper = makeVisualizeConversationFixture({
      ...fixtureOptions,
      idPrefix: upperIdPrefix,
      a1Text: upperA1Text
    });
    const applyAuxiliaryTurnIds = (turn, label) => {
      if (!turn) return;
      const stableTurnId = String(turn.getAttribute("data-turn-id") || "turn");
      turn.setAttribute("data-testid", `conversation-turn-${stableTurnId}-${label}`);
      turn.setAttribute("id", `${stableTurnId}-${label}-element`);
    };
    const duplicateUpperQ1Turn = duplicateUpperQ1Identity
      ? makeConversationTurn("user", fixtureOptions.q1Text, [], `${upperIdPrefix}-q1`)
      : null;
    const restored = makeVisualizeConversationFixture(fixtureOptions);
    const consentReacquired = makeVisualizeConversationFixture(fixtureOptions);
    const consentDuplicate = makeVisualizeConversationFixture(fixtureOptions);
    if (varyAuxiliaryIdsAcrossWindows) {
      [initial.q1Turn, initial.a1Turn, initial.q2Turn, initial.a2Turn]
        .forEach(turn => applyAuxiliaryTurnIds(turn, "initial"));
      [overlap.q1Turn, overlap.a1Turn, overlap.q2Turn, overlap.a2Turn]
        .forEach(turn => applyAuxiliaryTurnIds(turn, "overlap"));
      [upper.q1Turn, upper.a1Turn, upper.q2Turn, upper.a2Turn]
        .forEach(turn => applyAuxiliaryTurnIds(turn, "upper"));
      [restored.q1Turn, restored.a1Turn, restored.q2Turn, restored.a2Turn]
        .forEach(turn => applyAuxiliaryTurnIds(turn, "restored"));
    }
    if (duplicateUpperQ1Turn && duplicateUpperQ1AuxiliaryIds) {
      applyAuxiliaryTurnIds(duplicateUpperQ1Turn, "duplicate-q1");
    }
    const makeFollowingTurns = () => [
      makeConversationTurn("user", "가상화 Q3 후속 질문", [], `${idPrefix}-q3`),
      makeConversationTurn("assistant", "가상화 A3 후속 답변", [], `${idPrefix}-a3`),
      makeConversationTurn("user", "가상화 Q4 후속 질문", [], `${idPrefix}-q4`),
      makeConversationTurn("assistant", "가상화 A4 후속 답변", [], `${idPrefix}-a4`),
      makeConversationTurn("user", "가상화 Q5 후속 질문", [], `${idPrefix}-q5`),
      makeConversationTurn("assistant", "가상화 A5 후속 답변", [], `${idPrefix}-a5`)
    ];
    const initialFollowingTurns = restoreTailNeedsProbe ? makeFollowingTurns() : [];
    const restoredFollowingTurns = restoreTailNeedsProbe ? makeFollowingTurns() : [];
    const postConsentFollowingTurns = makeFollowingTurns();
    const consentUnknownPredecessorTurn = makeConversationTurn(
      "assistant",
      "검증되지 않은 consent-time 선행 답변",
      [],
      `${idPrefix}-consent-unknown-predecessor`
    );
    const upperTurns = duplicateUpperQ1Turn
      ? [upper.q1Turn, duplicateUpperQ1Turn, upper.a1Turn]
      : [upper.q1Turn, upper.a1Turn];
    const document = makeDocument([]);
    const restoredTurns = () => [
      ...(!q2A2OnlyInitialWindow ? [restored.a1Turn] : []),
      restored.q2Turn,
      reuseInitialA2OnRestore ? initial.a2Turn : restored.a2Turn,
      ...restoredFollowingTurns
    ];
    const transitions = [];
    let phase = "";
    let upperMountPending = false;
    let duplicateUpperResolved = false;
    let replaceA2DuringConsentRecovery = false;
    let duplicateQ2DuringConsentRecovery = false;
    const setFollowingAnchorTop = (turns, top) => {
      if (top === null || top === undefined || !Number.isFinite(Number(top))) return;
      const followingTurn = Array.from(turns || [])[0] || null;
      followingTurn?.setRect?.({ top: Number(top), y: Number(top) });
    };
    const mount = (nextPhase, turns) => {
      phase = nextPhase;
      transitions.push(nextPhase);
      if (nextPhase === "initial") {
        setFollowingAnchorTop(initialFollowingTurns, followingAnchorInitialTop);
      } else if (nextPhase === "restore-tail") {
        setFollowingAnchorTop(restoredFollowingTurns, followingAnchorTailTop);
      } else if (nextPhase === "restored-probe" || nextPhase === "restored") {
        setFollowingAnchorTop(restoredFollowingTurns, followingAnchorInitialTop);
      }
      mountConversationWindow(document, turns);
      onPhase(nextPhase, { document, initial, overlap, upper, restored });
    };
    mount("initial", [
      ...(!q2A2OnlyInitialWindow ? [initial.a1Turn] : []),
      initial.q2Turn,
      initial.a2Turn,
      ...initialFollowingTurns
    ]);

    const originalScrollTop = Number(initialScrollTop);
    const scrollContainer = makeNode({ attrs: { "data-testid": "conversation-scroll" } });
    scrollContainer.clientHeight = Number(conversationClientHeight);
    scrollContainer.scrollHeight = Number(conversationScrollHeight);
    scrollContainer.setRect?.({ top: 0, y: 0, height: scrollContainer.clientHeight });
    const originalBottomOffset = scrollContainer.scrollHeight - scrollContainer.clientHeight - originalScrollTop;
    let currentScrollTop = originalScrollTop;
    let restoreProbeIssued = false;
    let restoreProbeTargetPending = false;
    let restoredProbeLayoutReady = !settleRestoredProbeLayoutOnPoll;
    let followingAnchorDroppedAfterBottomOffset = false;
    let restoreTailPollCount = 0;
    const scrollWrites = [];
    const mountUpperWindow = () => {
      if (scrollHeightAfterUpper !== null && Number.isFinite(Number(scrollHeightAfterUpper))) {
        scrollContainer.scrollHeight = Number(scrollHeightAfterUpper);
      }
      mount("upper", upperTurns);
    };
    const expectedRestoredScrollTop = () => restoreAtBottomOffset
      ? Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight - originalBottomOffset)
      : originalScrollTop;
    const updateWindowForScroll = value => {
      const requested = Number(value);
      if (!Number.isFinite(requested)) return;
      const next = clampScrollTopToMax
        ? Math.min(requested, Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight))
        : requested;
      const previousScrollTop = currentScrollTop;
      const blocksLogicalRestore = failLogicalRestoreAfterProbe && restoreProbeIssued &&
        phase === "restore-tail" && previousScrollTop < originalScrollTop && next >= originalScrollTop;
      scrollWrites.push({
        phase,
        from: previousScrollTop,
        requested,
        to: next,
        blocked: blocksLogicalRestore
      });
      if (blocksLogicalRestore) return;
      currentScrollTop = next;
      if (phase === "upper" && resolveDuplicateUpperQ1OnNextScroll && duplicateUpperQ1Turn &&
          !duplicateUpperResolved && next < previousScrollTop) {
        duplicateUpperResolved = true;
        mount("upper", [upper.q1Turn, upper.a1Turn]);
      } else if (q2A2OnlyInitialWindow && phase === "initial" && next < originalScrollTop) {
        if (skipQ2A1Overlap) mountUpperWindow();
        else mount("overlap", [overlap.a1Turn, overlap.q2Turn]);
      } else if (q2A2OnlyInitialWindow && phase === "overlap" && next < previousScrollTop) {
        mountUpperWindow();
      } else if (restoreTailNeedsProbe && dropFollowingAnchorAfterBottomOffset &&
          phase === "restore-tail" && next >= originalScrollTop &&
          !followingAnchorDroppedAfterBottomOffset) {
        followingAnchorDroppedAfterBottomOffset = true;
        mount("restore-tail", restoredFollowingTurns.slice(1));
      } else if (restoreTailNeedsProbe && phase === "restore-tail" && next < originalScrollTop) {
        restoreProbeIssued = true;
        const restoreProbeDelta = originalScrollTop - next;
        if (restoreProbeMountsTarget && restoreProbeDelta >= Math.max(0, Number(restoreProbeRequiredDeltaPx) || 0)) {
          if (deferRestoreProbeTargetUntilPoll) restoreProbeTargetPending = true;
          else mount("restored-probe", restoredTurns());
        }
      } else if (settleRestoredProbeLayoutOnPoll && phase === "restored-probe" &&
          next >= originalScrollTop && !restoredProbeLayoutReady) {
        mount("restore-tail", restoredFollowingTurns);
      } else if (dropRestoredTargetOnLogicalRestore && phase === "restored-probe" &&
          next >= originalScrollTop) {
        mount("restore-tail", restoredFollowingTurns);
      } else if (phase === "consent-drift" && next <= originalScrollTop) {
        if (consentRecoveryMountsQ2) {
          mount("consent-reacquired", [
            ...(!q2A2OnlyInitialWindow && consentRecoveryMountsA1
              ? [consentRecoveryUsesFreshA1 ? consentReacquired.a1Turn : restored.a1Turn]
              : []),
            consentReacquired.q2Turn,
            ...(duplicateQ2DuringConsentRecovery ? [consentDuplicate.q2Turn] : []),
            replaceA2DuringConsentRecovery ? consentReacquired.a2Turn : restored.a2Turn,
            ...postConsentFollowingTurns
          ]);
        }
      } else if (next < originalScrollTop && phase !== "upper") {
        if (deferUpperMount) upperMountPending = true;
        else mountUpperWindow();
      } else if ((phase === "upper" || (q2A2OnlyInitialWindow && phase === "overlap")) && (
        restoreAtBottomOffset
          ? Math.abs(next - expectedRestoredScrollTop()) <= 1
          : next >= originalScrollTop
      )) {
        if (restoreTailNeedsProbe) mount("restore-tail", restoredFollowingTurns);
        else mount("restored", restoredTurns());
      }
    };
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: updateWindowForScroll
    });
    scrollContainer.scrollTo = (first, second) => {
      const top = typeof first === "object" ? first?.top : second;
      updateWindowForScroll(top);
    };
    scrollContainer.scrollBy = (first, second) => {
      const delta = typeof first === "object" ? first?.top : second;
      updateWindowForScroll(currentScrollTop + Number(delta || 0));
    };
    return {
      document,
      initial,
      overlap,
      upper,
      restored,
      consentReacquired,
      consentDuplicate,
      consentUnknownPredecessorTurn,
      initialFollowingTurns,
      restoredFollowingTurns,
      duplicateUpperQ1Turn,
      scrollContainer,
      originalScrollTop,
      originalBottomOffset,
      scrollWrites,
      transitions,
      releaseUpperWindow() {
        if (!upperMountPending) return false;
        upperMountPending = false;
        mountUpperWindow();
        return true;
      },
      simulateOriginalRouteReload() {
        upperMountPending = false;
        currentScrollTop = originalScrollTop;
        mount("route-reloaded", restoredTurns());
      },
      simulatePostConsentLayoutDrift({
        changedQ2Text = "",
        replaceA2 = false,
        duplicateQ2 = false,
        addUnknownPredecessor = false
      } = {}) {
        scrollContainer.scrollHeight += scrollContainer.clientHeight;
        currentScrollTop = originalScrollTop + scrollContainer.clientHeight;
        replaceA2DuringConsentRecovery = replaceA2 === true;
        duplicateQ2DuringConsentRecovery = duplicateQ2 === true;
        if (changedQ2Text) {
          consentReacquired.q2.innerText = changedQ2Text;
          consentReacquired.q2.textContent = changedQ2Text;
        }
        mount("consent-drift", [
          ...(addUnknownPredecessor ? [consentUnknownPredecessorTurn] : []),
          replaceA2DuringConsentRecovery ? consentReacquired.a2Turn : restored.a2Turn,
          ...postConsentFollowingTurns
        ]);
      },
      settleRestoredProbeLayout() {
        if (phase !== "restored-probe" || restoredProbeLayoutReady) return false;
        scrollContainer.scrollHeight += 17;
        restoredProbeLayoutReady = true;
        return true;
      },
      mountDeferredRestoredProbeTarget() {
        if (!restoreProbeTargetPending) return false;
        restoreProbeTargetPending = false;
        mount("restored-probe", restoredTurns());
        return true;
      },
      advanceRestoreTailPoll() {
        if (phase !== "restore-tail" || Number(restoreTailTargetAfterPolls) <= 0) return false;
        restoreTailPollCount += 1;
        if (restoreTailPollCount < Number(restoreTailTargetAfterPolls)) return false;
        mount("restored", restoredTurns());
        return true;
      },
      get expectedRestoredScrollTop() { return expectedRestoredScrollTop(); },
      get phase() { return phase; }
    };
  };

  const runtimeGuard = {
    checkSync: () => ({ ok: true }),
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null,
    fail: () => ({ ok: false }),
    notify: () => {}
  };
  const hydrationOptions = driver => ({
    root: driver.document,
    scrollContainer: driver.scrollContainer,
    maxScrollSteps: 2,
    scrollStepPx: 500,
    timeoutMs: 80,
    pollMs: 1
  });

  const focusedBoundaryStatuses = [];
  const focusedBoundaryFailures = [];
  const verifyFocusedBoundary = async (name, check) => {
    try {
      await check();
      focusedBoundaryStatuses.push(`PASS ${name}`);
    } catch (error) {
      focusedBoundaryStatuses.push(`RED ${name}: ${error?.message || String(error)}`);
      focusedBoundaryFailures.push(error);
    }
  };
  const makeBoundaryCounts = () => ({
    preflight: 0,
    consent: 0,
    permission: 0,
    share: 0,
    clipboard: 0,
    save: 0,
    uri: 0
  });
  const noExternalBoundaryOptions = counts => ({
    confirmFn: () => false,
    alertFn: () => {},
    requestShareConsentFn: async () => {
      counts.consent += 1;
      return { approved: true, permissionGranted: false };
    },
    requestClipboardReadPermissionFn: async () => {
      counts.permission += 1;
      return false;
    },
    createShareLinkFn: async () => {
      counts.share += 1;
      return { ok: true, url: "https://chatgpt.com/s/synthetic-t_boundary_must_not_share", source: "existing" };
    },
    shareOptions: {
      readClipboardText: async () => {
        counts.clipboard += 1;
        return "https://chatgpt.com/s/synthetic-t_boundary_must_not_read";
      }
    },
    saveObsidianNoteFn: async () => {
      counts.save += 1;
      return { ok: true };
    }
  });
  const runOnBoundaryRoute = async (route, counts, operation) => {
    const originalSourceUrl = hooks.__sandbox.location.href;
    const originalRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
    hooks.__sandbox.location.href = route;
    hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
      if (message?.type === "open-obsidian-uri") counts.uri += 1;
      if (message?.type === "gpt2obs-native-preflight" && "nativePreflight" in counts) counts.nativePreflight += 1;
      if (message?.type === "save-obsidian-note" && "nativeSave" in counts) counts.nativeSave += 1;
      return originalRuntimeSender(message, callback);
    };
    try {
      return await operation();
    } finally {
      hooks.__sandbox.location.href = originalSourceUrl;
      hooks.__sandbox.chrome.runtime.sendMessage = originalRuntimeSender;
    }
  };
  const completePreviousQaBoundaryPreflight = ({ visualizeContext, title, targetTurnId }) => ({
    ok: true,
    mode: "previous-qa",
    title,
    filePath: `ChatGPT/${title}.md`,
    questionText: visualizeContext.questionText,
    answerText: visualizeContext.answerText,
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1,
    targetTurnId
  });
  const isolateRestoredAssistantHydrationClone = (assistantNode, {
    iframeUrl = "https://app-block-test.web-sandbox.oaiusercontent.com/runtime"
  } = {}) => {
    assistantNode.cloneNode = () => {
      const clone = makeNode({
        attrs: { "data-message-author-role": "assistant" },
        text: "가상화 A2 바깥 설명"
      });
      appendProviderNeutralRichApp(clone, { iframeUrl });
      return clone;
    };
  };
  const isolateVirtualizedA1Clone = assistantNode => {
    const answerText = String(assistantNode?.innerText || assistantNode?.textContent || "");
    const makeIndependentClone = () => {
      const clone = makeNode({
        attrs: { "data-message-author-role": "assistant" },
        text: answerText
      });
      clone.cloneNode = makeIndependentClone;
      return clone;
    };
    assistantNode.cloneNode = makeIndependentClone;
  };

  await verifyFocusedBoundary("Q2/A2 hydration waits for one delayed strict app runtime before freezing A2", async () => {
    const delayedRuntime = makeVirtualizedCase({
      idPrefix: "virtual-delayed-initial-app-runtime",
      q2A2OnlyInitialWindow: true
    });
    isolateRestoredAssistantHydrationClone(delayedRuntime.initial.a2);
    isolateRestoredAssistantHydrationClone(delayedRuntime.restored.a2);
    isolateVirtualizedA1Clone(delayedRuntime.overlap.a1);
    isolateVirtualizedA1Clone(delayedRuntime.upper.a1);
    const initialAppBlock = delayedRuntime.initial.a2.querySelector('[data-app-block-preview="true"]');
    const delayedIframe = initialAppBlock?.querySelector("iframe") || null;
    assert(initialAppBlock && delayedIframe, "the fixture must start with one detachable app runtime iframe");
    delayedIframe.remove();
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "delayed initial runtime 저장"
    });
    delayedRuntime.initial.a2.appendChild(saveButton);
    installDocument(hooks, delayedRuntime.document);

    const counts = makeBoundaryCounts();
    const sentinelReason = "delayed strict app runtime reached verified preflight";
    let virtualNow = 0;
    let runtimeMounts = 0;
    let postMountReadyPollWaits = 0;
    let postMountGeometryChanges = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-delayed-initial-app-runtime",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(delayedRuntime),
          maxScrollSteps: 3,
          timeoutMs: 140,
          pollMs: 10,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (delayedRuntime.phase === "initial" && runtimeMounts === 0) {
              initialAppBlock.appendChild(delayedIframe);
              delayedRuntime.scrollContainer.scrollHeight += 17;
              runtimeMounts += 1;
            } else if (delayedRuntime.phase === "initial" && runtimeMounts === 1) {
              postMountReadyPollWaits += 1;
              if (postMountGeometryChanges === 0) {
                delayedRuntime.scrollContainer.scrollHeight += 11;
                postMountGeometryChanges += 1;
              }
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          assert.strictEqual(args.currentAssistantNode, delayedRuntime.restored.a2);
          assert.strictEqual(args.visualizeContext.mode, "previous-qa");
          assert.strictEqual(args.visualizeContext.visualizeRequestNode, delayedRuntime.restored.q2);
          assert.strictEqual(args.visualizeContext.visualizeAnswerNode, delayedRuntime.restored.a2);
          return { ok: false, stage: "preflight", reason: sentinelReason };
        }
      })
    );

    assert.strictEqual(runtimeMounts, 1, "the strict runtime must mount exactly once before hydration scrolls");
    assert.strictEqual(postMountGeometryChanges, 1, "the first ready sample must be invalidated by one later geometry change");
    assert.strictEqual(
      postMountReadyPollWaits,
      2,
      "hydration may start only after one unchanged poll separates the final geometry sample from acceptance"
    );
    assert.strictEqual(result?.reason, sentinelReason);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
  });

  const readinessRetargetCases = [
    {
      label: "A2 turn identity",
      q2A2OnlyInitialWindow: true,
      mutate: fixture => fixture.initial.a2Turn.setAttribute(
        "data-turn-id",
        `${fixture.initial.a2Turn.getAttribute("data-turn-id")}-retargeted`
      )
    },
    {
      label: "A2 authored core",
      q2A2OnlyInitialWindow: true,
      mutate: fixture => {
        fixture.initial.a2.innerText = "readiness 대기 중 바뀐 A2 설명";
        fixture.initial.a2.textContent = "readiness 대기 중 바뀐 A2 설명";
      }
    },
    {
      label: "Q2 fingerprint",
      q2A2OnlyInitialWindow: true,
      mutate: fixture => {
        fixture.initial.q2.innerText = "바로 위 답변 전체를 Visualize해줘";
        fixture.initial.q2.textContent = "바로 위 답변 전체를 Visualize해줘";
      }
    },
    {
      label: "A1 fingerprint",
      q2A2OnlyInitialWindow: false,
      mutate: fixture => {
        fixture.initial.a1.innerText = "readiness 대기 중 바뀐 A1 답변";
        fixture.initial.a1.textContent = "readiness 대기 중 바뀐 A1 답변";
      }
    }
  ];
  for (const [caseIndex, testCase] of readinessRetargetCases.entries()) {
    await verifyFocusedBoundary(`runtime readiness rejects click-time ${testCase.label} retargeting`, async () => {
      const fixture = makeVirtualizedCase({
        idPrefix: `virtual-readiness-retarget-${caseIndex}`,
        q2A2OnlyInitialWindow: testCase.q2A2OnlyInitialWindow
      });
      isolateRestoredAssistantHydrationClone(fixture.initial.a2);
      isolateRestoredAssistantHydrationClone(fixture.restored.a2);
      isolateVirtualizedA1Clone(fixture.overlap.a1);
      isolateVirtualizedA1Clone(fixture.upper.a1);
      const initialAppBlock = fixture.initial.a2.querySelector('[data-app-block-preview="true"]');
      const delayedIframe = initialAppBlock?.querySelector("iframe") || null;
      assert(initialAppBlock && delayedIframe);
      delayedIframe.remove();
      const saveButton = makeNode({
        tagName: "button",
        attrs: { class: "gpt2obs-btn" },
        text: `${testCase.label} retarget 저장`
      });
      fixture.initial.a2.appendChild(saveButton);
      installDocument(hooks, fixture.document);

      const counts = makeBoundaryCounts();
      let virtualNow = 0;
      let mutationCount = 0;
      const result = await runOnBoundaryRoute(
        `https://chatgpt.com/c/synthetic-virtual-readiness-retarget-${caseIndex}`,
        counts,
        () => hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: {
            ...hydrationOptions(fixture),
            appReadinessTimeoutMs: 80,
            timeoutMs: 120,
            pollMs: 10,
            nowFn: () => virtualNow,
            waitForHydrationPollFn: async delayMs => {
              if (mutationCount === 0) {
                testCase.mutate(fixture);
                initialAppBlock.appendChild(delayedIframe);
                fixture.scrollContainer.scrollHeight += 13;
                mutationCount += 1;
              }
              virtualNow += Number(delayMs) || 0;
            }
          },
          ...noExternalBoundaryOptions(counts),
          preflightFn: async () => {
            counts.preflight += 1;
            return { ok: false, stage: "preflight", reason: "retargeted readiness must not reach verified preflight" };
          }
        })
      );

      assert.strictEqual(mutationCount, 1);
      assert.strictEqual(result?.ok, false);
      assert.strictEqual(result.stage, "preflight");
      assert.strictEqual(result.reason, "Visualize click window proof changed before hydration");
      assert.deepStrictEqual(fixture.transitions, ["initial"], "click-time proof changes must stop before hydration scrolling");
      assert.strictEqual(fixture.scrollContainer.scrollTop, fixture.originalScrollTop);
      assert.deepStrictEqual(
        counts,
        { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      );
    });
  }

  const readinessTopologyCases = [
    {
      label: "A1 moved after A2",
      q2A2OnlyInitialWindow: false,
      mutate: fixture => mountConversationWindow(fixture.document, [
        fixture.initial.q2Turn,
        fixture.initial.a2Turn,
        fixture.initial.a1Turn
      ])
    },
    {
      label: "new role inserted between A1 and Q2",
      q2A2OnlyInitialWindow: false,
      mutate: fixture => mountConversationWindow(fixture.document, [
        fixture.initial.a1Turn,
        makeConversationTurn("user", "readiness 사이에 삽입된 turn", [], "readiness-inserted-between-a1-q2"),
        fixture.initial.q2Turn,
        fixture.initial.a2Turn
      ])
    },
    {
      label: "new predecessor inserted before Q2/A2-only window",
      q2A2OnlyInitialWindow: true,
      mutate: fixture => mountConversationWindow(fixture.document, [
        makeConversationTurn("assistant", "readiness 앞에 삽입된 turn", [], "readiness-inserted-before-q2"),
        fixture.initial.q2Turn,
        fixture.initial.a2Turn
      ])
    },
    {
      label: "duplicate Q2 stable identity",
      q2A2OnlyInitialWindow: true,
      mutate: fixture => mountConversationWindow(fixture.document, [
        fixture.initial.q2Turn,
        fixture.initial.a2Turn,
        makeConversationTurn(
          "user",
          "중복된 Q2 identity",
          [],
          fixture.initial.q2Turn.getAttribute("data-turn-id")
        )
      ])
    }
  ];
  for (const [caseIndex, testCase] of readinessTopologyCases.entries()) {
    await verifyFocusedBoundary(`runtime readiness rejects ${testCase.label} before scrolling`, async () => {
      const fixture = makeVirtualizedCase({
        idPrefix: `virtual-readiness-topology-${caseIndex}`,
        q2A2OnlyInitialWindow: testCase.q2A2OnlyInitialWindow
      });
      isolateRestoredAssistantHydrationClone(fixture.initial.a2);
      isolateRestoredAssistantHydrationClone(fixture.restored.a2);
      isolateVirtualizedA1Clone(fixture.overlap.a1);
      isolateVirtualizedA1Clone(fixture.upper.a1);
      const appBlock = fixture.initial.a2.querySelector('[data-app-block-preview="true"]');
      const delayedIframe = appBlock?.querySelector("iframe") || null;
      assert(appBlock && delayedIframe);
      delayedIframe.remove();
      const saveButton = makeNode({
        tagName: "button",
        attrs: { class: "gpt2obs-btn" },
        text: `${testCase.label} 저장`
      });
      fixture.initial.a2.appendChild(saveButton);
      installDocument(hooks, fixture.document);
      const counts = makeBoundaryCounts();
      let virtualNow = 0;
      let mutationCount = 0;
      const result = await runOnBoundaryRoute(
        `https://chatgpt.com/c/synthetic-virtual-readiness-topology-${caseIndex}`,
        counts,
        () => hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: {
            ...hydrationOptions(fixture),
            appReadinessTimeoutMs: 80,
            timeoutMs: 120,
            pollMs: 10,
            nowFn: () => virtualNow,
            waitForHydrationPollFn: async delayMs => {
              if (mutationCount === 0) {
                testCase.mutate(fixture);
                appBlock.appendChild(delayedIframe);
                mutationCount += 1;
              }
              virtualNow += Number(delayMs) || 0;
            }
          },
          ...noExternalBoundaryOptions(counts),
          preflightFn: async () => {
            counts.preflight += 1;
            return { ok: false, stage: "preflight", reason: "changed topology must not reach verified preflight" };
          }
        })
      );

      assert.strictEqual(mutationCount, 1);
      assert.strictEqual(result?.ok, false);
      assert.strictEqual(result.stage, "preflight");
      assert.strictEqual(result.reason, "Visualize click window topology changed before hydration");
      assert.deepStrictEqual(fixture.transitions, ["initial"]);
      assert.strictEqual(fixture.scrollContainer.scrollTop, fixture.originalScrollTop);
      assert.deepStrictEqual(
        counts,
        { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      );
    });
  }

  const readinessPostSampleCases = [
    {
      label: "Q2 proof changes after the first valid runtime sample",
      expectedReason: "Visualize click window proof changed before hydration",
      mutate: fixture => {
        fixture.initial.q2.innerText = "첫 valid runtime sample 뒤 바뀐 바로 위 답변 Visualize 요청";
        fixture.initial.q2.textContent = "첫 valid runtime sample 뒤 바뀐 바로 위 답변 Visualize 요청";
      }
    },
    {
      label: "runtime source changes after the first valid sample",
      expectedReason: "Visualize app runtime changed while becoming ready",
      mutate: (_fixture, iframe) => iframe.setAttribute(
        "src",
        "https://app-block-post-sample-change.web-sandbox.oaiusercontent.com/runtime"
      )
    }
  ];
  for (const [caseIndex, testCase] of readinessPostSampleCases.entries()) {
    await verifyFocusedBoundary(`runtime readiness rejects ${testCase.label}`, async () => {
      const fixture = makeVirtualizedCase({
        idPrefix: `virtual-readiness-post-sample-${caseIndex}`,
        q2A2OnlyInitialWindow: true
      });
      isolateRestoredAssistantHydrationClone(fixture.initial.a2);
      isolateRestoredAssistantHydrationClone(fixture.restored.a2);
      isolateVirtualizedA1Clone(fixture.overlap.a1);
      isolateVirtualizedA1Clone(fixture.upper.a1);
      const appBlock = fixture.initial.a2.querySelector('[data-app-block-preview="true"]');
      const delayedIframe = appBlock?.querySelector("iframe") || null;
      assert(appBlock && delayedIframe);
      delayedIframe.remove();
      const saveButton = makeNode({
        tagName: "button",
        attrs: { class: "gpt2obs-btn" },
        text: `${testCase.label} 저장`
      });
      fixture.initial.a2.appendChild(saveButton);
      installDocument(hooks, fixture.document);
      const counts = makeBoundaryCounts();
      let virtualNow = 0;
      let waitCount = 0;
      const result = await runOnBoundaryRoute(
        `https://chatgpt.com/c/synthetic-virtual-readiness-post-sample-${caseIndex}`,
        counts,
        () => hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: {
            ...hydrationOptions(fixture),
            appReadinessTimeoutMs: 100,
            timeoutMs: 140,
            pollMs: 10,
            nowFn: () => virtualNow,
            waitForHydrationPollFn: async delayMs => {
              if (waitCount === 0) appBlock.appendChild(delayedIframe);
              if (waitCount === 1) testCase.mutate(fixture, delayedIframe);
              waitCount += 1;
              virtualNow += Number(delayMs) || 0;
            }
          },
          ...noExternalBoundaryOptions(counts),
          preflightFn: async () => {
            counts.preflight += 1;
            return { ok: false, stage: "preflight", reason: "post-sample change must not reach verified preflight" };
          }
        })
      );

      assert.strictEqual(waitCount, 2, "the mutation must occur only after one valid runtime sample");
      assert.strictEqual(result?.ok, false);
      assert.strictEqual(result.reason, testCase.expectedReason);
      assert.deepStrictEqual(fixture.transitions, ["initial"]);
      assert.strictEqual(fixture.scrollContainer.scrollTop, fixture.originalScrollTop);
      assert.deepStrictEqual(
        counts,
        { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      );
    });
  }

  await verifyFocusedBoundary("Q2/A2 hydration stops before scrolling when the strict app runtime never mounts", async () => {
    const missingRuntime = makeVirtualizedCase({
      idPrefix: "virtual-missing-initial-app-runtime",
      q2A2OnlyInitialWindow: true
    });
    const initialAppBlock = missingRuntime.initial.a2.querySelector('[data-app-block-preview="true"]');
    const missingIframe = initialAppBlock?.querySelector("iframe") || null;
    assert(initialAppBlock && missingIframe, "the fixture must start with one removable app runtime iframe");
    missingIframe.remove();
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "missing initial runtime 저장"
    });
    missingRuntime.initial.a2.appendChild(saveButton);
    installDocument(hooks, missingRuntime.document);

    const counts = makeBoundaryCounts();
    let virtualNow = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-missing-initial-app-runtime",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(missingRuntime),
          appReadinessTimeoutMs: 40,
          timeoutMs: 80,
          pollMs: 10,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "missing runtime must not reach verified preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "Visualize app runtime did not become stable before hydration");
    assert.deepStrictEqual(missingRuntime.transitions, ["initial"], "readiness failure must not move the conversation scroll window");
    assert.strictEqual(missingRuntime.scrollContainer.scrollTop, missingRuntime.originalScrollTop);
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "an unmounted runtime must cross no preflight, consent, Share, clipboard, Native, or URI boundary"
    );
  });

  const readinessRuntimeConflictCases = [
    {
      label: "duplicated runtime",
      expectedReason: "Visualize app runtime iframe is duplicated before hydration",
      mount: (block, iframe) => {
        block.appendChild(iframe);
        block.appendChild(makeNode({
          tagName: "iframe",
          attrs: { src: "https://app-block-duplicate.web-sandbox.oaiusercontent.com/runtime" }
        }));
      }
    },
    {
      label: "wrong-source runtime",
      expectedReason: "Visualize app runtime iframe URL is not allowed before hydration",
      mount: (block, iframe) => {
        iframe.setAttribute("src", "https://example.com/not-chatgpt-app-runtime");
        block.appendChild(iframe);
      }
    }
  ];
  for (const [caseIndex, testCase] of readinessRuntimeConflictCases.entries()) {
    await verifyFocusedBoundary(`runtime readiness rejects a ${testCase.label} before scrolling`, async () => {
      const fixture = makeVirtualizedCase({
        idPrefix: `virtual-readiness-runtime-conflict-${caseIndex}`,
        q2A2OnlyInitialWindow: true
      });
      const appBlock = fixture.initial.a2.querySelector('[data-app-block-preview="true"]');
      const iframe = appBlock?.querySelector("iframe") || null;
      assert(appBlock && iframe);
      iframe.remove();
      const saveButton = makeNode({
        tagName: "button",
        attrs: { class: "gpt2obs-btn" },
        text: `${testCase.label} 저장`
      });
      fixture.initial.a2.appendChild(saveButton);
      installDocument(hooks, fixture.document);
      const counts = makeBoundaryCounts();
      let virtualNow = 0;
      let mounts = 0;
      const result = await runOnBoundaryRoute(
        `https://chatgpt.com/c/synthetic-virtual-readiness-runtime-conflict-${caseIndex}`,
        counts,
        () => hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: {
            ...hydrationOptions(fixture),
            appReadinessTimeoutMs: 60,
            timeoutMs: 100,
            pollMs: 10,
            nowFn: () => virtualNow,
            waitForHydrationPollFn: async delayMs => {
              if (mounts === 0) {
                testCase.mount(appBlock, iframe);
                mounts += 1;
              }
              virtualNow += Number(delayMs) || 0;
            }
          },
          ...noExternalBoundaryOptions(counts),
          preflightFn: async () => {
            counts.preflight += 1;
            return { ok: false, stage: "preflight", reason: "runtime conflict must not reach verified preflight" };
          }
        })
      );

      assert.strictEqual(mounts, 1);
      assert.strictEqual(result?.ok, false);
      assert.strictEqual(result.reason, testCase.expectedReason);
      assert.deepStrictEqual(fixture.transitions, ["initial"]);
      assert.strictEqual(fixture.scrollContainer.scrollTop, fixture.originalScrollTop);
      assert.deepStrictEqual(
        counts,
        { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      );
    });
  }

  await verifyFocusedBoundary("Q2/A2-only click hydrates through sequential overlap and restores fresh Q2/A2", async () => {
    const q2A2Only = makeVirtualizedCase({
      idPrefix: "virtual-q2-a2-only",
      q2A2OnlyInitialWindow: true
    });
    isolateRestoredAssistantHydrationClone(q2A2Only.initial.a2);
    isolateRestoredAssistantHydrationClone(q2A2Only.restored.a2);
    isolateVirtualizedA1Clone(q2A2Only.overlap.a1);
    isolateVirtualizedA1Clone(q2A2Only.upper.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "Q2/A2-only 가상화 저장"
    });
    q2A2Only.initial.a2.appendChild(saveButton);
    installDocument(hooks, q2A2Only.document);

    assert.strictEqual(q2A2Only.document.body.childNodes.length, 2, "the click window must mount only Q2/A2");
    assert.strictEqual(q2A2Only.document.body.childNodes[0], q2A2Only.initial.q2Turn);
    assert.strictEqual(q2A2Only.document.body.childNodes[1], q2A2Only.initial.a2Turn);
    assert.strictEqual(
      q2A2Only.initial.q2Turn.getAttribute("data-turn-id"),
      q2A2Only.overlap.q2Turn.getAttribute("data-turn-id"),
      "the first upward window must overlap the clicked window through Q2"
    );
    assert.notStrictEqual(q2A2Only.initial.q2Turn, q2A2Only.overlap.q2Turn);
    assert.strictEqual(
      q2A2Only.overlap.a1Turn.getAttribute("data-turn-id"),
      q2A2Only.upper.a1Turn.getAttribute("data-turn-id"),
      "the next upward window must carry the stable A1 chronology identity"
    );
    assert.notStrictEqual(q2A2Only.overlap.a1Turn, q2A2Only.upper.a1Turn);

    const counts = makeBoundaryCounts();
    const sentinelReason = "Q2/A2-only virtualization reached verified previous-qa preflight";
    let observedPreflight = null;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-only",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(q2A2Only),
          maxScrollSteps: 3
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          observedPreflight = args;
          assert.strictEqual(q2A2Only.phase, "restored", "preflight must wait for scroll restoration");
          assert.deepStrictEqual(
            q2A2Only.transitions,
            ["initial", "overlap", "upper", "restored"],
            "Q2/A2 must join A1/Q2, then Q1/A1, before restoring"
          );
          assert.strictEqual(q2A2Only.scrollContainer.scrollTop, q2A2Only.originalScrollTop);
          assert.strictEqual(q2A2Only.document.body.childNodes.length, 2, "restoration may leave A1 unmounted");
          assert.strictEqual(q2A2Only.document.body.childNodes[0], q2A2Only.restored.q2Turn);
          assert.strictEqual(q2A2Only.document.body.childNodes[1], q2A2Only.restored.a2Turn);
          assert.strictEqual(args.currentAssistantNode, q2A2Only.restored.a2);
          assert.notStrictEqual(args.currentAssistantNode, q2A2Only.initial.a2);
          assert.strictEqual(args.visualizeContext.mode, "previous-qa");
          assert.strictEqual(args.visualizeContext.questionText, "가상화 Q1 원본 질문");
          assert.strictEqual(args.visualizeContext.answerText, "가상화 A1 원본 답변");
          assert.strictEqual(args.visualizeContext.visualizeRequestNode, q2A2Only.restored.q2);
          assert.strictEqual(args.visualizeContext.visualizeAnswerNode, q2A2Only.restored.a2);
          return { ok: false, stage: "preflight", reason: sentinelReason };
        }
      })
    );

    assert.strictEqual(
      result?.reason,
      sentinelReason,
      "a Q2/A2-only click must hydrate instead of stopping at the synchronous missing-pair error"
    );
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(observedPreflight?.visualizeContext?.mode, "previous-qa");
    assert.deepStrictEqual(q2A2Only.transitions, ["initial", "overlap", "upper", "restored"]);
    assert.strictEqual(q2A2Only.scrollContainer.scrollTop, q2A2Only.originalScrollTop);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "the sentinel preflight must stop Share, clipboard, Native, and URI side effects"
    );
  });

  await verifyFocusedBoundary("tail-only restoration probes upward and reacquires fresh Q2/A2", async () => {
    const idPrefix = "virtual-restore-tail-probe";
    const restoreTailProbe = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "후속 turn 가상화 저장"
    });
    restoreTailProbe.initial.a2.appendChild(saveButton);
    installDocument(hooks, restoreTailProbe.document);

    assert.strictEqual(restoreTailProbe.scrollContainer.scrollTop, 900);
    assert.deepStrictEqual(
      restoreTailProbe.document.body.childNodes.map(turn => turn.getAttribute("data-turn-id")),
      [
        `${idPrefix}-a1`,
        `${idPrefix}-q2`,
        `${idPrefix}-a2`,
        `${idPrefix}-q3`,
        `${idPrefix}-a3`,
        `${idPrefix}-q4`,
        `${idPrefix}-a4`,
        `${idPrefix}-q5`,
        `${idPrefix}-a5`
      ],
      "the click window must preserve the target A1/Q2/A2 ahead of later turns"
    );

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    const sentinelReason = "tail-bearing restoration reached verified previous-qa preflight";
    const configuredRestoreProbeStepPx = 275;
    let virtualNow = 0;
    let logicalPositionPollWaits = 0;
    let observedPreflight = null;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-restore-tail-probe",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(restoreTailProbe),
          scrollStepPx: configuredRestoreProbeStepPx,
          timeoutMs: 100,
          pollMs: 10,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (restoreTailProbe.phase === "restored-probe" &&
                restoreTailProbe.scrollContainer.scrollTop === restoreTailProbe.originalScrollTop) {
              logicalPositionPollWaits += 1;
              assert.strictEqual(counts.preflight, 0, "preflight must wait for stable restored geometry");
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          observedPreflight = args;
          assert.strictEqual(restoreTailProbe.phase, "restored-probe");
          assert.deepStrictEqual(
            restoreTailProbe.transitions,
            ["initial", "upper", "restore-tail", "restored-probe"],
            "absolute restoration must probe above the tail-only window before returning to the original position"
          );
          assert.strictEqual(restoreTailProbe.scrollContainer.scrollTop, 900);
          assert.strictEqual(
            logicalPositionPollWaits,
            2,
            "preflight requires two consecutive proof/geometry polls at the restored logical position"
          );
          assert.deepStrictEqual(
            restoreTailProbe.document.body.childNodes.map(turn => turn.getAttribute("data-turn-id")),
            [
              `${idPrefix}-a1`,
              `${idPrefix}-q2`,
              `${idPrefix}-a2`,
              `${idPrefix}-q3`,
              `${idPrefix}-a3`,
              `${idPrefix}-q4`,
              `${idPrefix}-a4`,
              `${idPrefix}-q5`,
              `${idPrefix}-a5`
            ]
          );
          assert.strictEqual(args.currentAssistantNode, restoreTailProbe.restored.a2);
          assert.notStrictEqual(args.currentAssistantNode, restoreTailProbe.initial.a2);
          assert.strictEqual(args.visualizeContext.mode, "previous-qa");
          assert.strictEqual(args.visualizeContext.questionText, "가상화 Q1 원본 질문");
          assert.strictEqual(args.visualizeContext.answerText, "가상화 A1 원본 답변");
          assert.strictEqual(args.visualizeContext.visualizeRequestNode, restoreTailProbe.restored.q2);
          assert.strictEqual(args.visualizeContext.visualizeAnswerNode, restoreTailProbe.restored.a2);
          return { ok: false, stage: "preflight", reason: sentinelReason };
        }
      })
    );

    assert.strictEqual(
      result?.reason,
      sentinelReason,
      `tail-only restoration must reacquire the exact target before preflight; received: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(observedPreflight?.visualizeContext?.visualizeRequestNode, restoreTailProbe.restored.q2);
    assert.strictEqual(observedPreflight?.visualizeContext?.visualizeAnswerNode, restoreTailProbe.restored.a2);
    assert.strictEqual(restoreTailProbe.scrollContainer.scrollTop, 900);
    const restoreProbeWrites = restoreTailProbe.scrollWrites.filter(write =>
      write.phase === "restore-tail" && !write.blocked && write.to < write.from
    );
    assert.strictEqual(restoreProbeWrites.length, 1, "restoration may issue exactly one bounded upward probe");
    const restoreProbeDelta = restoreProbeWrites[0].from - restoreProbeWrites[0].to;
    assert(restoreProbeDelta <= restoreTailProbe.scrollContainer.clientHeight);
    assert(restoreProbeDelta <= configuredRestoreProbeStepPx);
    assert.deepStrictEqual(
      counts,
      {
        preflight: 1,
        consent: 0,
        permission: 0,
        share: 0,
        clipboard: 0,
        save: 0,
        uri: 0,
        nativePreflight: 0,
        nativeSave: 0
      },
      "the verified preflight sentinel must stop every external effect"
    );
  });

  await verifyFocusedBoundary("live-shaped later-turn tail uses one verified following-turn geometry correction", async () => {
    const idPrefix = "virtual-restore-live-shaped-tail";
    const liveShapedTail = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      restoreProbeRequiredDeltaPx: 4664,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop: -3284
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "실제 후속 turn 형상 저장"
    });
    liveShapedTail.initial.a2.appendChild(saveButton);
    installDocument(hooks, liveShapedTail.document);
    liveShapedTail.document.scrollingElement = liveShapedTail.scrollContainer;

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    const sentinelReason = "live-shaped anchored restoration reached verified preflight";
    let virtualNow = 0;
    let correctionObservedAt = null;
    const productionHydrationOptions = hydrationOptions(liveShapedTail);
    delete productionHydrationOptions.scrollContainer;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-restore-live-shaped-tail",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...productionHydrationOptions,
          maxScrollSteps: 16,
          scrollStepPx: 1028,
          timeoutMs: 3000,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (correctionObservedAt === null && liveShapedTail.scrollWrites.some(write =>
              write.phase === "restore-tail" && !write.blocked && write.from - write.to === 4664
            )) {
              correctionObservedAt = virtualNow;
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          assert.strictEqual(liveShapedTail.phase, "restored-probe");
          assert.strictEqual(liveShapedTail.scrollContainer.scrollTop, 6274);
          assert.strictEqual(args.currentAssistantNode, liveShapedTail.restored.a2);
          return { ok: false, stage: "preflight", reason: sentinelReason };
        }
      })
    );

    assert.strictEqual(
      result?.reason,
      sentinelReason,
      `the 4,664px tail must be navigated by its verified following-turn geometry; received: ${result?.reason || "no reason"}`
    );
    const restorationWrites = liveShapedTail.scrollWrites.filter(write =>
      write.phase === "restore-tail" && !write.blocked && write.to < write.from
    );
    assert.strictEqual(restorationWrites.length, 1, "the geometry anchor must produce one upward correction only");
    assert.strictEqual(
      restorationWrites[0].from - restorationWrites[0].to,
      4664,
      "the correction must use the frozen/current following-turn offset delta instead of the one-viewport blind probe"
    );
    assert(
      correctionObservedAt !== null && correctionObservedAt < 1500,
      `the verified anchor must start correction before half of the restore timeout is spent; observed at ${correctionObservedAt}`
    );
    assert.deepStrictEqual(
      counts,
      {
        preflight: 1,
        consent: 0,
        permission: 0,
        share: 0,
        clipboard: 0,
        save: 0,
        uri: 0,
        nativePreflight: 0,
        nativeSave: 0
      },
      "the verified preflight sentinel must stop every external effect"
    );
  });

  await verifyFocusedBoundary("aligned following anchor waits for a lazy target remount without scrolling", async () => {
    const idPrefix = "virtual-restore-anchor-aligned-lazy-target";
    const alignedLazyTarget = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      restoreProbeMountsTarget: false,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop: 1380,
      restoreTailTargetAfterPolls: 18
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "aligned anchor lazy target 저장"
    });
    alignedLazyTarget.initial.a2.appendChild(saveButton);
    installDocument(hooks, alignedLazyTarget.document);
    alignedLazyTarget.document.scrollingElement = alignedLazyTarget.scrollContainer;

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    const sentinelReason = "aligned following anchor waited for the exact lazy target";
    let virtualNow = 0;
    const productionHydrationOptions = hydrationOptions(alignedLazyTarget);
    delete productionHydrationOptions.scrollContainer;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...productionHydrationOptions,
          maxScrollSteps: 16,
          scrollStepPx: 1028,
          timeoutMs: 3000,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            alignedLazyTarget.advanceRestoreTailPoll();
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          assert.strictEqual(alignedLazyTarget.phase, "restored");
          assert.strictEqual(alignedLazyTarget.scrollContainer.scrollTop, 6274);
          assert.strictEqual(args.currentAssistantNode, alignedLazyTarget.restored.a2);
          return { ok: false, stage: "preflight", reason: sentinelReason };
        }
      })
    );

    assert.strictEqual(
      result?.reason,
      sentinelReason,
      `zero-distance anchor geometry must wait for the lazy exact target; received: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(
      alignedLazyTarget.scrollWrites.filter(write =>
        write.phase === "restore-tail" && !write.blocked && write.to < write.from
      ).length,
      0,
      "aligned anchor geometry must not authorize a correction or blind fallback"
    );
    assert.deepStrictEqual(counts, {
      preflight: 1,
      consent: 0,
      permission: 0,
      share: 0,
      clipboard: 0,
      save: 0,
      uri: 0,
      nativePreflight: 0,
      nativeSave: 0
    });
  });

  await verifyFocusedBoundary("aligned following anchor times out without a correction or blind fallback", async () => {
    const idPrefix = "virtual-restore-anchor-aligned-timeout";
    const alignedTimeout = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      restoreProbeMountsTarget: false,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop: 1380
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "aligned anchor timeout 저장"
    });
    alignedTimeout.initial.a2.appendChild(saveButton);
    installDocument(hooks, alignedTimeout.document);
    alignedTimeout.document.scrollingElement = alignedTimeout.scrollContainer;

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    let virtualNow = 0;
    const productionHydrationOptions = hydrationOptions(alignedTimeout);
    delete productionHydrationOptions.scrollContainer;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...productionHydrationOptions,
          maxScrollSteps: 16,
          scrollStepPx: 1028,
          timeoutMs: 600,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => { virtualNow += Number(delayMs) || 0; }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "aligned timeout reached preflight" };
        }
      })
    );

    assert.strictEqual(result?.reason, "restored Visualize target could not be reacquired");
    assert.strictEqual(
      alignedTimeout.scrollWrites.filter(write =>
        write.phase === "restore-tail" && !write.blocked && write.to < write.from
      ).length,
      0,
      "aligned geometry may wait only; it must not spend a correction or blind fallback before timeout"
    );
    assert.deepStrictEqual(counts, {
      preflight: 0,
      consent: 0,
      permission: 0,
      share: 0,
      clipboard: 0,
      save: 0,
      uri: 0,
      nativePreflight: 0,
      nativeSave: 0
    });
  });

  await verifyFocusedBoundary("following anchor subpixel tolerance stays aligned in both directions", async () => {
    for (const [label, tailTop] of [["positive", 1379.5], ["negative", 1380.5]]) {
      const idPrefix = `virtual-restore-anchor-aligned-${label}-subpixel`;
      const subpixelAligned = makeVirtualizedCase({
        idPrefix,
        restoreTailNeedsProbe: true,
        restoreProbeMountsTarget: false,
        initialScrollTop: 6274,
        conversationClientHeight: 1028,
        conversationScrollHeight: 12454,
        followingAnchorInitialTop: 1380,
        followingAnchorTailTop: tailTop,
        restoreTailTargetAfterPolls: 2
      });
      const saveButton = makeNode({
        tagName: "button",
        attrs: { class: "gpt2obs-btn" },
        text: `${label} subpixel aligned 저장`
      });
      subpixelAligned.initial.a2.appendChild(saveButton);
      installDocument(hooks, subpixelAligned.document);
      subpixelAligned.document.scrollingElement = subpixelAligned.scrollContainer;

      const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
      const sentinelReason = `${label} subpixel aligned target reached preflight`;
      let virtualNow = 0;
      const productionHydrationOptions = hydrationOptions(subpixelAligned);
      delete productionHydrationOptions.scrollContainer;
      const result = await runOnBoundaryRoute(
        `https://chatgpt.com/c/synthetic-${idPrefix}`,
        counts,
        () => hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: {
            ...productionHydrationOptions,
            maxScrollSteps: 16,
            scrollStepPx: 1028,
            timeoutMs: 3000,
            pollMs: 100,
            nowFn: () => virtualNow,
            waitForHydrationPollFn: async delayMs => {
              subpixelAligned.advanceRestoreTailPoll();
              virtualNow += Number(delayMs) || 0;
            }
          },
          ...noExternalBoundaryOptions(counts),
          preflightFn: async args => {
            counts.preflight += 1;
            assert.strictEqual(args.currentAssistantNode, subpixelAligned.restored.a2);
            return { ok: false, stage: "preflight", reason: sentinelReason };
          }
        })
      );

      assert.strictEqual(result?.reason, sentinelReason);
      assert.strictEqual(
        subpixelAligned.scrollWrites.filter(write =>
          write.phase === "restore-tail" && !write.blocked && write.to < write.from
        ).length,
        0,
        `${label} subpixel aligned geometry must not authorize any navigation write`
      );
      assert.deepStrictEqual(counts, {
        preflight: 1,
        consent: 0,
        permission: 0,
        share: 0,
        clipboard: 0,
        save: 0,
        uri: 0,
        nativePreflight: 0,
        nativeSave: 0
      });
    }
  });

  await verifyFocusedBoundary("following anchor unmounted after bottom-offset keeps the delayed blind fallback", async () => {
    const idPrefix = "virtual-restore-anchor-unmounted-after-bottom-offset";
    const transientAnchor = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      restoreProbeMountsTarget: false,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop: -3284,
      dropFollowingAnchorAfterBottomOffset: true
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "bottom-offset 뒤 사라진 anchor 저장"
    });
    transientAnchor.initial.a2.appendChild(saveButton);
    installDocument(hooks, transientAnchor.document);

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    let virtualNow = 0;
    let blindProbeObservedAt = null;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(transientAnchor),
          maxScrollSteps: 16,
          scrollStepPx: 1028,
          timeoutMs: 3000,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (blindProbeObservedAt === null && transientAnchor.scrollWrites.some(write =>
              write.phase === "restore-tail" && !write.blocked && write.to < write.from
            )) {
              blindProbeObservedAt = virtualNow;
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "transient anchor reached preflight" };
        }
      })
    );

    const upwardRestorationWrites = transientAnchor.scrollWrites.filter(write =>
      write.phase === "restore-tail" && !write.blocked && write.to < write.from
    );
    assert.strictEqual(result?.reason, "restored Visualize target could not be reacquired");
    assert.strictEqual(upwardRestorationWrites.length, 1, "the unmounted anchor may spend one blind fallback only");
    assert.strictEqual(
      upwardRestorationWrites[0].from - upwardRestorationWrites[0].to,
      transientAnchor.scrollContainer.clientHeight,
      "the unmounted anchor must not authorize a multi-viewport geometry correction"
    );
    assert(
      blindProbeObservedAt !== null && blindProbeObservedAt >= 1500,
      `the anchor-absent blind fallback must keep the existing half-window delay; observed at ${blindProbeObservedAt}`
    );
    assert.deepStrictEqual(counts, {
      preflight: 0,
      consent: 0,
      permission: 0,
      share: 0,
      clipboard: 0,
      save: 0,
      uri: 0,
      nativePreflight: 0,
      nativeSave: 0
    });
  });

  await verifyFocusedBoundary("live-shaped correction rejects a production auto-scroller replacement before writing", async () => {
    const idPrefix = "virtual-restore-anchor-production-reparent";
    const productionReparent = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      restoreProbeRequiredDeltaPx: 4664,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop: -3284
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "production scroller 교체 저장"
    });
    productionReparent.initial.a2.appendChild(saveButton);
    installDocument(hooks, productionReparent.document);
    productionReparent.document.scrollingElement = productionReparent.scrollContainer;
    const productionHydrationOptions = hydrationOptions(productionReparent);
    delete productionHydrationOptions.scrollContainer;
    const replacementScroller = makeNode({ attrs: { "data-testid": "replacement-scrolling-element" } });
    replacementScroller.clientHeight = 1028;
    replacementScroller.scrollHeight = 12454;
    replacementScroller.scrollTop = 6274;

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    let virtualNow = 0;
    let scrollerReplaced = false;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-restore-anchor-production-reparent",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...productionHydrationOptions,
          maxScrollSteps: 16,
          scrollStepPx: 1028,
          timeoutMs: 3000,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (!scrollerReplaced && productionReparent.phase === "restore-tail") {
              scrollerReplaced = true;
              productionReparent.document.scrollingElement = replacementScroller;
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "replacement scroller reached preflight" };
        }
      })
    );

    assert.strictEqual(scrollerReplaced, true, "the fixture must replace the production scroller during restoration");
    assert.strictEqual(result?.reason, "conversation scroll container changed during Visualize hydration");
    assert.strictEqual(
      productionReparent.scrollWrites.filter(write =>
        write.phase === "restore-tail" && !write.blocked && write.to < write.from
      ).length,
      0,
      "the stale production scroller must receive no anchor correction or blind probe"
    );
    assert.deepStrictEqual(
      counts,
      {
        preflight: 0,
        consent: 0,
        permission: 0,
        share: 0,
        clipboard: 0,
        save: 0,
        uri: 0,
        nativePreflight: 0,
        nativeSave: 0
      }
    );
  });

  await verifyFocusedBoundary("node-only following-turn identity is not admitted as a geometry anchor", async () => {
    const idPrefix = "virtual-restore-anchor-node-only-identity";
    const nodeOnlyAnchor = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      restoreProbeRequiredDeltaPx: 4664,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop: -3284
    });
    for (const turn of [nodeOnlyAnchor.initialFollowingTurns[0], nodeOnlyAnchor.restoredFollowingTurns[0]]) {
      turn.removeAttribute?.("data-turn-id");
      turn.querySelector?.("[data-message-author-role]")
        ?.setAttribute?.("data-message-id", "node-only-following-message");
    }
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "node-only anchor 저장"
    });
    nodeOnlyAnchor.initial.a2.appendChild(saveButton);
    installDocument(hooks, nodeOnlyAnchor.document);
    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    let virtualNow = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-restore-anchor-node-only-identity",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(nodeOnlyAnchor),
          maxScrollSteps: 16,
          scrollStepPx: 1028,
          timeoutMs: 3000,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => { virtualNow += Number(delayMs) || 0; }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "node-only anchor reached preflight" };
        }
      })
    );
    const upwardRestorationWrites = nodeOnlyAnchor.scrollWrites.filter(write =>
      write.phase === "restore-tail" && !write.blocked && write.to < write.from
    );
    assert.strictEqual(result?.reason, "restored Visualize target could not be reacquired");
    assert.strictEqual(upwardRestorationWrites.length, 1, "an ineligible anchor must retain one blind fallback only");
    assert.strictEqual(
      upwardRestorationWrites[0].from - upwardRestorationWrites[0].to,
      nodeOnlyAnchor.scrollContainer.clientHeight,
      "the node-only identity must not authorize the multi-viewport geometry correction"
    );
    assert.deepStrictEqual(
      counts,
      {
        preflight: 0,
        consent: 0,
        permission: 0,
        share: 0,
        clipboard: 0,
        save: 0,
        uri: 0,
        nativePreflight: 0,
        nativeSave: 0
      }
    );
  });

  const runFollowingAnchorFailureCase = async ({
    idPrefix,
    followingAnchorTailTop = -3284,
    maxScrollSteps = 16,
    mutateTail = null,
    prepareFixture = null,
    fixtureOptions = {}
  }) => {
    const fixture = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      initialScrollTop: 6274,
      conversationClientHeight: 1028,
      conversationScrollHeight: 12454,
      restoreProbeRequiredDeltaPx: 4664,
      followingAnchorInitialTop: 1380,
      followingAnchorTailTop,
      ...fixtureOptions
    });
    if (typeof prepareFixture === "function") prepareFixture(fixture);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: `${idPrefix} 저장`
    });
    fixture.initial.a2.appendChild(saveButton);
    installDocument(hooks, fixture.document);
    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    let virtualNow = 0;
    let tailMutated = false;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(fixture),
          maxScrollSteps,
          scrollStepPx: 1028,
          timeoutMs: 3000,
          pollMs: 100,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (!tailMutated && fixture.phase === "restore-tail" && typeof mutateTail === "function") {
              tailMutated = true;
              mutateTail(fixture);
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "unsafe following anchor reached preflight" };
        }
      })
    );
    const upwardRestorationWrites = fixture.scrollWrites.filter(write =>
      write.phase === "restore-tail" && !write.blocked && write.to < write.from
    );
    return { fixture, result, counts, upwardRestorationWrites };
  };
  const zeroFollowingAnchorBoundaries = {
    preflight: 0,
    consent: 0,
    permission: 0,
    share: 0,
    clipboard: 0,
    save: 0,
    uri: 0,
    nativePreflight: 0,
    nativeSave: 0
  };

  await verifyFocusedBoundary("click-time ambiguous duplicate turn-container identity disables the geometry anchor", async () => {
    const idPrefix = "virtual-restore-anchor-click-duplicate";
    const { fixture, result, counts, upwardRestorationWrites } = await runFollowingAnchorFailureCase({
      idPrefix,
      prepareFixture: current => {
        const duplicate = makeConversationTurn(
          "user",
          "가상화 Q3 후속 질문",
          [],
          `${idPrefix}-q3`
        );
        duplicate.appendChild(makeNode({
          attrs: { "data-message-author-role": "assistant" },
          text: "클릭 시점 모호한 중복 역할"
        }));
        mountConversationWindow(current.document, [...current.document.body.childNodes, duplicate]);
      }
    });
    assert.strictEqual(result?.reason, "restored Visualize target could not be reacquired");
    assert.strictEqual(upwardRestorationWrites.length, 1, "an ambiguous click-time duplicate must leave only the blind fallback");
    assert.strictEqual(
      upwardRestorationWrites[0].from - upwardRestorationWrites[0].to,
      fixture.scrollContainer.clientHeight
    );
    assert.deepStrictEqual(counts, zeroFollowingAnchorBoundaries);
  });

  for (const anchorMutation of [
    {
      name: "changed",
      mutateTail: fixture => {
        const roleNode = fixture.restoredFollowingTurns[0]?.querySelector?.("[data-message-author-role]");
        roleNode.innerText = "변경된 후속 질문";
        roleNode.textContent = "변경된 후속 질문";
      }
    },
    {
      name: "duplicate",
      mutateTail: fixture => {
        const duplicate = makeConversationTurn(
          "user",
          "가상화 Q3 후속 질문",
          [],
          `${fixture.restoredFollowingTurns[0].getAttribute("data-turn-id")}`
        );
        duplicate.setRect?.({ top: -3284, y: -3284 });
        mountConversationWindow(fixture.document, [...fixture.document.body.childNodes, duplicate]);
      }
    },
    {
      name: "ambiguous",
      mutateTail: fixture => {
        fixture.restoredFollowingTurns[0]?.appendChild?.(makeNode({
          attrs: { "data-message-author-role": "assistant" },
          text: "모호한 중첩 역할"
        }));
      }
    },
    {
      name: "container-retargeted",
      mutateTail: fixture => {
        const turn = fixture.restoredFollowingTurns[0];
        const frozenTurnId = turn.getAttribute("data-turn-id");
        turn.removeAttribute("data-turn-id");
        turn.querySelector?.("[data-message-author-role]")
          ?.setAttribute?.("data-message-id", frozenTurnId);
      }
    }
  ]) {
    await verifyFocusedBoundary(`following-turn geometry anchor ${anchorMutation.name} conflict stops before correction`, async () => {
      const { result, counts, upwardRestorationWrites } = await runFollowingAnchorFailureCase({
        idPrefix: `virtual-restore-anchor-${anchorMutation.name}`,
        mutateTail: anchorMutation.mutateTail
      });
      assert.strictEqual(result?.ok, false);
      assert.strictEqual(result?.reason, "following Visualize turn navigation anchor changed during hydration");
      assert.strictEqual(upwardRestorationWrites.length, 0, "a conflicting anchor must not issue a correction or blind probe");
      assert.deepStrictEqual(counts, zeroFollowingAnchorBoundaries);
    });
  }

  await verifyFocusedBoundary("following-turn geometry correction rejects a downward move", async () => {
    const { result, counts, upwardRestorationWrites } = await runFollowingAnchorFailureCase({
      idPrefix: "virtual-restore-anchor-downward",
      followingAnchorTailTop: 1800
    });
    assert.strictEqual(result?.reason, "following Visualize turn navigation geometry could not be safely restored");
    assert.strictEqual(upwardRestorationWrites.length, 0);
    assert.deepStrictEqual(counts, zeroFollowingAnchorBoundaries);
  });

  await verifyFocusedBoundary("following-turn geometry correction rejects movement beyond the hydration budget", async () => {
    const { result, counts, upwardRestorationWrites } = await runFollowingAnchorFailureCase({
      idPrefix: "virtual-restore-anchor-oversized",
      followingAnchorTailTop: -4000,
      maxScrollSteps: 5
    });
    assert.strictEqual(result?.reason, "following Visualize turn navigation geometry could not be safely restored");
    assert.strictEqual(upwardRestorationWrites.length, 0);
    assert.deepStrictEqual(counts, zeroFollowingAnchorBoundaries);
  });

  await verifyFocusedBoundary("following-turn geometry correction rejects a negative target position", async () => {
    const { result, counts, upwardRestorationWrites } = await runFollowingAnchorFailureCase({
      idPrefix: "virtual-restore-anchor-negative-target",
      followingAnchorTailTop: -5000
    });
    assert.strictEqual(result?.reason, "following Visualize turn navigation geometry could not be safely restored");
    assert.strictEqual(upwardRestorationWrites.length, 0);
    assert.deepStrictEqual(counts, zeroFollowingAnchorBoundaries);
  });

  await verifyFocusedBoundary("following-turn target seen at correction but lost at logical position is terminal", async () => {
    const { result, counts, upwardRestorationWrites } = await runFollowingAnchorFailureCase({
      idPrefix: "virtual-restore-anchor-unsettled",
      fixtureOptions: { dropRestoredTargetOnLogicalRestore: true }
    });
    assert.strictEqual(result?.reason, "restored Visualize target did not settle at the original scroll position");
    assert.strictEqual(upwardRestorationWrites.length, 1, "an unsettled anchored target must not trigger another search");
    assert.strictEqual(upwardRestorationWrites[0].from - upwardRestorationWrites[0].to, 4664);
    assert.deepStrictEqual(counts, zeroFollowingAnchorBoundaries);
  });

  await verifyFocusedBoundary("restore probe waits for one lazy app layout change before logical restoration", async () => {
    const lazyProbe = makeVirtualizedCase({
      idPrefix: "virtual-restore-lazy-probe-layout",
      restoreTailNeedsProbe: true,
      deferRestoreProbeTargetUntilPoll: true,
      settleRestoredProbeLayoutOnPoll: true
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "lazy probe layout 저장"
    });
    lazyProbe.initial.a2.appendChild(saveButton);
    installDocument(hooks, lazyProbe.document);

    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    const sentinelReason = "lazy probe layout reached verified preflight";
    let virtualNow = 0;
    let deferredTargetMounts = 0;
    let lazyLayoutSettles = 0;
    let unchangedProbePollWaits = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-restore-lazy-probe-layout",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(lazyProbe),
          scrollStepPx: 275,
          timeoutMs: 140,
          pollMs: 10,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (lazyProbe.mountDeferredRestoredProbeTarget()) deferredTargetMounts += 1;
            else if (lazyProbe.settleRestoredProbeLayout()) lazyLayoutSettles += 1;
            else if (lazyProbe.phase === "restored-probe") {
              const probeWrite = lazyProbe.scrollWrites.find(write =>
                write.phase === "restore-tail" && !write.blocked && write.to < write.from
              );
              if (probeWrite && lazyProbe.scrollContainer.scrollTop === probeWrite.to) {
                unchangedProbePollWaits += 1;
              }
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: sentinelReason };
        }
      })
    );

    assert.strictEqual(deferredTargetMounts, 1, "the exact probe target must mount on one delayed poll");
    assert.strictEqual(lazyLayoutSettles, 1, "the fixture must apply exactly one lazy layout change at the probe");
    assert.strictEqual(
      unchangedProbePollWaits,
      1,
      "the final changed probe geometry must survive one unchanged poll before logical restoration"
    );
    assert.strictEqual(
      result?.reason,
      sentinelReason,
      `the exact target must settle at the probe before logical restoration; received: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(
      lazyProbe.scrollContainer.scrollHeight - lazyProbe.scrollContainer.clientHeight - lazyProbe.scrollContainer.scrollTop,
      lazyProbe.originalBottomOffset,
      "logical restoration must preserve the original bottom offset against current geometry"
    );
    assert.deepStrictEqual(
      lazyProbe.transitions,
      ["initial", "upper", "restore-tail", "restored-probe"],
      "the settled probe target must remain mounted through logical restoration"
    );
    assert.deepStrictEqual(
      counts,
      {
        preflight: 1,
        consent: 0,
        permission: 0,
        share: 0,
        clipboard: 0,
        save: 0,
        uri: 0,
        nativePreflight: 0,
        nativeSave: 0
      }
    );
  });

  const runRestoreProbeFailureCase = async ({ idPrefix, fixtureOptions = {}, scrollStepPx = 275 }) => {
    const fixture = makeVirtualizedCase({
      idPrefix,
      restoreTailNeedsProbe: true,
      ...fixtureOptions
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: `${idPrefix} 저장`
    });
    fixture.initial.a2.appendChild(saveButton);
    installDocument(hooks, fixture.document);
    const counts = { ...makeBoundaryCounts(), nativePreflight: 0, nativeSave: 0 };
    let virtualNow = 0;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(fixture),
          scrollStepPx,
          pollMs: 10,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => { virtualNow += Number(delayMs) || 0; }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "restore failure must not reach preflight" };
        }
      })
    );
    const probeWrites = fixture.scrollWrites.filter(write =>
      write.phase === "restore-tail" && !write.blocked && write.to < write.from
    );
    return { fixture, result, counts, probeWrites };
  };
  const zeroRestoreFailureBoundaries = {
    preflight: 0,
    consent: 0,
    permission: 0,
    share: 0,
    clipboard: 0,
    save: 0,
    uri: 0,
    nativePreflight: 0,
    nativeSave: 0
  };

  await verifyFocusedBoundary("persistent restored target miss stops before every external boundary", async () => {
    const { fixture, result, counts, probeWrites } = await runRestoreProbeFailureCase({
      idPrefix: "virtual-restore-target-missing",
      fixtureOptions: { restoreProbeMountsTarget: false }
    });

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "restored Visualize target could not be reacquired");
    assert.strictEqual(probeWrites.length, 1, "a persistent miss must not trigger a second upward probe");
    assert.strictEqual(fixture.scrollContainer.scrollTop, fixture.originalScrollTop);
    assert.deepStrictEqual(
      counts,
      zeroRestoreFailureBoundaries,
      "target-missing restoration must cross zero preflight, consent, permission, Share, clipboard, Native, or URI boundaries"
    );
  });

  await verifyFocusedBoundary("restore probe is capped to one viewport when configured step is larger", async () => {
    const { fixture, result, counts, probeWrites } = await runRestoreProbeFailureCase({
      idPrefix: "virtual-restore-probe-viewport-cap",
      fixtureOptions: { restoreProbeMountsTarget: false },
      scrollStepPx: 500
    });

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.reason, "restored Visualize target could not be reacquired");
    assert.strictEqual(probeWrites.length, 1);
    assert.strictEqual(
      probeWrites[0].from - probeWrites[0].to,
      fixture.scrollContainer.clientHeight,
      "a configured restore step larger than the viewport must be capped to exactly one viewport"
    );
    assert.deepStrictEqual(counts, zeroRestoreFailureBoundaries);
  });

  await verifyFocusedBoundary("restored target seen at probe but never settled reports settlement failure", async () => {
    const { fixture, result, counts, probeWrites } = await runRestoreProbeFailureCase({
      idPrefix: "virtual-restore-target-unsettled",
      fixtureOptions: { dropRestoredTargetOnLogicalRestore: true }
    });

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "restored Visualize target did not settle at the original scroll position");
    assert.strictEqual(probeWrites.length, 1, "an unsettled target must not trigger a second upward probe");
    assert.deepStrictEqual(
      fixture.transitions,
      ["initial", "upper", "restore-tail", "restored-probe", "restore-tail"],
      "the target must be observed at the probe before disappearing at the logical position"
    );
    assert.strictEqual(fixture.scrollContainer.scrollTop, fixture.originalScrollTop);
    assert.deepStrictEqual(counts, zeroRestoreFailureBoundaries);
  });

  await verifyFocusedBoundary("same-route probe timeout reports failed logical-position cleanup", async () => {
    const { fixture, result, counts, probeWrites } = await runRestoreProbeFailureCase({
      idPrefix: "virtual-restore-cleanup-failure",
      fixtureOptions: {
        restoreProbeMountsTarget: false,
        failLogicalRestoreAfterProbe: true
      }
    });
    const blockedLogicalRestores = fixture.scrollWrites.filter(write => write.blocked);

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(probeWrites.length, 1, "cleanup failure must follow exactly one upward probe");
    assert(blockedLogicalRestores.length > 0, "the fixture must reject the same-route logical-position cleanup write");
    assert.strictEqual(fixture.scrollContainer.scrollTop, probeWrites[0].to);
    assert.deepStrictEqual(counts, zeroRestoreFailureBoundaries);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
    assert.strictEqual(
      result.reason,
      "conversation scroll position could not be restored",
      "a failed same-route timeout cleanup must not be mislabeled as a missing target"
    );
  });

  await verifyFocusedBoundary("negated Korean answer reference stays direct without hydration or external effects", async () => {
    const requestText = "이 답변 말고 아래 데이터를 시각화해 주세요";
    const negatedReference = makeVirtualizedCase({
      idPrefix: "virtual-negated-current-data"
    });
    [negatedReference.initial.q2, negatedReference.upper.q2, negatedReference.restored.q2]
      .forEach(node => {
        node.innerText = requestText;
        node.textContent = requestText;
      });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "부정 참조 저장"
    });
    negatedReference.initial.a2.appendChild(saveButton);
    installDocument(hooks, negatedReference.document);
    const counts = makeBoundaryCounts();
    let scrollWrites = 0;
    const originalScrollTo = negatedReference.scrollContainer.scrollTo;
    const originalScrollBy = negatedReference.scrollContainer.scrollBy;
    negatedReference.scrollContainer.scrollTo = (...args) => {
      scrollWrites += 1;
      return originalScrollTo(...args);
    };
    negatedReference.scrollContainer.scrollBy = (...args) => {
      scrollWrites += 1;
      return originalScrollBy(...args);
    };
    const classifiedAsPrevious = hooks.isPreviousAnswerVisualizationRequestText(requestText);
    const synchronousContext = hooks.resolveVisualizeSaveContext(negatedReference.initial.a2);
    let preflightMode = "";
    let preflightQuestionText = "";
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-negated-current-data",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(negatedReference),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async ({ visualizeContext }) => {
          counts.preflight += 1;
          preflightMode = visualizeContext.mode;
          preflightQuestionText = visualizeContext.questionText;
          return { ok: false, stage: "preflight", reason: "negated direct request reached preflight" };
        }
      })
    );

    assert.deepStrictEqual(
      {
        classifiedAsPrevious,
        synchronousMode: synchronousContext.mode,
        synchronousQuestionText: synchronousContext.questionText,
        preflightMode,
        preflightQuestionText,
        resultStage: result?.stage,
        resultReason: result?.reason,
        transitions: negatedReference.transitions,
        scrollWrites,
        preflight: counts.preflight,
        externalEffects: {
          consent: counts.consent,
          permission: counts.permission,
          share: counts.share,
          clipboard: counts.clipboard,
          save: counts.save,
          uri: counts.uri
        }
      },
      {
        classifiedAsPrevious: false,
        synchronousMode: "direct-visualize",
        synchronousQuestionText: requestText,
        preflightMode: "direct-visualize",
        preflightQuestionText: requestText,
        resultStage: "preflight",
        resultReason: "negated direct request reached preflight",
        transitions: ["initial"],
        scrollWrites: 0,
        preflight: 1,
        externalEffects: {
          consent: 0,
          permission: 0,
          share: 0,
          clipboard: 0,
          save: 0,
          uri: 0
        }
      },
      "a negated Korean answer reference must remain direct without hydration or external effects"
    );
  });

  await verifyFocusedBoundary("independent Q2 stays direct with virtualized Q1 and zero scroll", async () => {
    const independent = makeVisualizeConversationFixture({
      includePreviousQa: true,
      idPrefix: "virtual-independent-direct",
      q1Text: "언마운트된 과거 Q1",
      a1Text: "현재 보이는 과거 A1",
      q2Text: "독립적인 병력 배치를 새 지도로 시각화해 주세요",
      a2Text: "독립 Q2의 A2 설명"
    });
    const independentDocument = makeDocument([
      independent.a1Turn,
      independent.q2Turn,
      independent.a2Turn
    ]);
    const independentSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "독립 시각화 저장"
    });
    independent.a2.appendChild(independentSaveButton);
    installDocument(hooks, independentDocument);
    const counts = makeBoundaryCounts();
    let scrollTop = 900;
    let scrollWrites = 0;
    const scrollContainer = makeNode({ attrs: { "data-testid": "independent-direct-scroll" } });
    scrollContainer.clientHeight = 400;
    scrollContainer.scrollHeight = 1800;
    const writeScrollTop = value => {
      scrollWrites += 1;
      scrollTop = Number(value);
    };
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: writeScrollTop
    });
    scrollContainer.scrollTo = (first, second) => writeScrollTop(typeof first === "object" ? first?.top : second);
    scrollContainer.scrollBy = (first, second) => {
      const delta = typeof first === "object" ? first?.top : second;
      writeScrollTop(scrollTop + Number(delta || 0));
    };

    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-independent-direct",
      counts,
      () => hooks.handleCopyClick(independentSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          root: independentDocument,
          scrollContainer,
          maxScrollSteps: 2,
          scrollStepPx: 500,
          timeoutMs: 80,
          pollMs: 1
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          assert.strictEqual(currentAssistantNode, independent.a2);
          assert.strictEqual(visualizeContext.mode, "direct-visualize");
          assert.strictEqual(visualizeContext.questionText, "독립적인 병력 배치를 새 지도로 시각화해 주세요");
          assert.strictEqual(visualizeContext.answerText, "", "direct mode keeps A2 outside the Q/A answer body");
          assert.strictEqual(scrollWrites, 0, "direct mode must not hydrate or move the conversation");
          return { ok: false, stage: "preflight", reason: "independent direct context reached preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "independent direct context reached preflight");
    assert.strictEqual(scrollWrites, 0, "a virtualized Q1 is irrelevant to independent direct Visualize");
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "direct classification may reach local preflight but no Share, URL, clipboard, Native, or URI boundary"
    );
  });

  await verifyFocusedBoundary("scrollHeight growth restores by bottom offset", async () => {
    const bottomOffset = makeVirtualizedCase({
      idPrefix: "virtual-bottom-offset",
      scrollHeightAfterUpper: 2200,
      restoreAtBottomOffset: true
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "bottom offset 저장" });
    bottomOffset.initial.a2.appendChild(saveButton);
    installDocument(hooks, bottomOffset.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-bottom-offset",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: { ...hydrationOptions(bottomOffset), timeoutMs: 100 },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          assert.strictEqual(bottomOffset.phase, "restored");
          assert.strictEqual(bottomOffset.scrollContainer.scrollTop, 1300);
          assert.strictEqual(bottomOffset.scrollContainer.scrollTop, bottomOffset.expectedRestoredScrollTop);
          assert.strictEqual(currentAssistantNode, bottomOffset.restored.a2);
          assert.strictEqual(visualizeContext.mode, "previous-qa");
          return { ok: false, stage: "preflight", reason: "bottom-offset restoration reached preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "bottom-offset restoration reached preflight");
    assert.deepStrictEqual(bottomOffset.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(bottomOffset.scrollContainer.scrollTop, 1300);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "bottom-offset recovery must finish before every external boundary"
    );
  });

  await verifyFocusedBoundary("shrinking scrollHeight falls back after absolute restore clamps", async () => {
    const shrinking = makeVirtualizedCase({
      idPrefix: "virtual-shrinking-bottom-offset",
      scrollHeightAfterUpper: 1200,
      restoreAtBottomOffset: true,
      clampScrollTopToMax: true
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "shrink offset 저장" });
    shrinking.initial.a2.appendChild(saveButton);
    installDocument(hooks, shrinking.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-shrinking-bottom-offset",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: { ...hydrationOptions(shrinking), timeoutMs: 100 },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          assert.strictEqual(shrinking.phase, "restored");
          assert.strictEqual(shrinking.scrollContainer.scrollTop, 300);
          assert.strictEqual(shrinking.scrollContainer.scrollTop, shrinking.expectedRestoredScrollTop);
          assert.strictEqual(currentAssistantNode, shrinking.restored.a2);
          assert.strictEqual(visualizeContext.mode, "previous-qa");
          return { ok: false, stage: "preflight", reason: "shrinking bottom-offset restoration reached preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "shrinking bottom-offset restoration reached preflight");
    assert.deepStrictEqual(shrinking.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(shrinking.scrollContainer.scrollTop, 300);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "clamped absolute restoration must use the safe logical offset before external boundaries"
    );
  });

  await verifyFocusedBoundary("top window can hydrate later than 180ms through injected clock", async () => {
    const slowMount = makeVirtualizedCase({
      idPrefix: "virtual-slow-top-mount",
      deferUpperMount: true
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "느린 가상화 저장" });
    slowMount.initial.a2.appendChild(saveButton);
    installDocument(hooks, slowMount.document);
    const counts = makeBoundaryCounts();
    let virtualNow = 0;
    let virtualWaitCalls = 0;
    const waitForHydrationPollFn = async delayMs => {
      virtualWaitCalls += 1;
      virtualNow += Number(delayMs) || 0;
      if (virtualNow > 180 && slowMount.phase === "initial") {
        assert.strictEqual(slowMount.releaseUpperWindow(), true);
      }
    };
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-slow-top-mount",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          root: slowMount.document,
          scrollContainer: slowMount.scrollContainer,
          maxScrollSteps: 1,
          scrollStepPx: 900,
          timeoutMs: 400,
          pollMs: 60,
          nowFn: () => virtualNow,
          waitForHydrationPollFn
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          assert(virtualNow > 180, "Q1 must mount only after the former per-step cutoff");
          assert(virtualWaitCalls >= 4, "the deterministic 60ms poll schedule must pass 180ms");
          assert.strictEqual(currentAssistantNode, slowMount.restored.a2);
          assert.strictEqual(visualizeContext.mode, "previous-qa");
          return { ok: false, stage: "preflight", reason: "slow top hydration reached preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "slow top hydration reached preflight");
    assert(virtualNow > 180);
    assert(virtualWaitCalls >= 4);
    assert.deepStrictEqual(slowMount.transitions, ["initial", "upper", "restored"]);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "slow hydration must still complete before every external boundary"
    );
  });

  await verifyFocusedBoundary("duplicate Q1 identity fails closed", async () => {
    const duplicateQ1 = makeVirtualizedCase({
      idPrefix: "virtual-duplicate-q1",
      duplicateUpperQ1Identity: true
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "중복 Q1 저장" });
    duplicateQ1.initial.a2.appendChild(saveButton);
    installDocument(hooks, duplicateQ1.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-duplicate-q1",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(duplicateQ1),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "unexpected downstream preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /duplicate|identity|ambiguous/i);
    assert.deepStrictEqual(duplicateQ1.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(duplicateQ1.scrollContainer.scrollTop, duplicateQ1.originalScrollTop);
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "ambiguous Q1 identity must stop before preflight and every external boundary"
    );
  });

  await verifyFocusedBoundary("stable data-turn-id survives remount auxiliary ID changes", async () => {
    const stableRemount = makeVirtualizedCase({
      idPrefix: "virtual-stable-turn-id",
      varyAuxiliaryIdsAcrossWindows: true
    });
    assert.strictEqual(
      stableRemount.initial.a1Turn.getAttribute("data-turn-id"),
      stableRemount.upper.a1Turn.getAttribute("data-turn-id")
    );
    assert.notStrictEqual(
      stableRemount.initial.a1Turn.getAttribute("data-testid"),
      stableRemount.upper.a1Turn.getAttribute("data-testid"),
      "the overlap fixture must remount A1 with different auxiliary IDs"
    );
    assert.notStrictEqual(
      stableRemount.initial.a2Turn.getAttribute("id"),
      stableRemount.restored.a2Turn.getAttribute("id"),
      "the restored target must also replace its element ID"
    );
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "stable turn 저장" });
    stableRemount.initial.a2.appendChild(saveButton);
    installDocument(hooks, stableRemount.document);
    const counts = makeBoundaryCounts();
    let initialAttemptKey = "";
    let observedPreflight = null;
    let restoredAttemptKey = "";
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-stable-turn-id",
      counts,
      async () => {
        initialAttemptKey = hooks.visualizeAttemptKeyForNode(stableRemount.initial.a2);
        return hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: hydrationOptions(stableRemount),
          ...noExternalBoundaryOptions(counts),
          preflightFn: async args => {
            counts.preflight += 1;
            observedPreflight = args;
            restoredAttemptKey = hooks.visualizeAttemptKeyForNode(args.currentAssistantNode);
            return { ok: false, stage: "preflight", reason: "stable turn remount reached verified preflight" };
          }
        });
      }
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "stable turn remount reached verified preflight");
    assert.deepStrictEqual(stableRemount.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(observedPreflight?.currentAssistantNode, stableRemount.restored.a2);
    assert.strictEqual(observedPreflight?.visualizeContext?.mode, "previous-qa");
    assert.strictEqual(observedPreflight?.visualizeContext?.hydratedFromVirtualizedTurns, true);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "stable-ID recovery must complete before every external boundary"
    );
    assert(initialAttemptKey, "the clicked A2 must have an attempt key");
    assert.strictEqual(restoredAttemptKey, initialAttemptKey, "auxiliary DOM IDs must not change the attempt-lock key");
  });

  await verifyFocusedBoundary("restored same-ID A2 runtime change fails closed before downstream boundaries", async () => {
    const restoredRuntimeUrl = "https://app-block-restored.web-sandbox.oaiusercontent.com/remounted-runtime-v2";
    let runtimeChangedOnRestore = false;
    const changedRuntime = makeVirtualizedCase({
      idPrefix: "virtual-restored-a2-runtime-change",
      varyAuxiliaryIdsAcrossWindows: true,
      onPhase: (nextPhase, { restored }) => {
        if (nextPhase !== "restored") return;
        const iframe = restored.a2.querySelector("iframe");
        iframe?.setAttribute("src", restoredRuntimeUrl);
        runtimeChangedOnRestore = iframe?.getAttribute("src") === restoredRuntimeUrl;
      }
    });
    const initialIframe = changedRuntime.initial.a2.querySelector("iframe");
    const restoredIframe = changedRuntime.restored.a2.querySelector("iframe");
    const initialRuntimeUrl = initialIframe?.getAttribute("src") || "";
    assert.strictEqual(
      restoredIframe?.getAttribute("src"),
      initialRuntimeUrl,
      "the restored fixture must change runtime only when the restored window mounts"
    );
    isolateRestoredAssistantHydrationClone(changedRuntime.initial.a2, { iframeUrl: initialRuntimeUrl });
    isolateRestoredAssistantHydrationClone(changedRuntime.restored.a2, { iframeUrl: restoredRuntimeUrl });
    assert.strictEqual(
      changedRuntime.initial.a2Turn.getAttribute("data-turn-id"),
      changedRuntime.restored.a2Turn.getAttribute("data-turn-id"),
      "the restored A2 must keep the frozen stable turn identity"
    );
    assert.strictEqual(
      changedRuntime.initial.a2.innerText,
      changedRuntime.restored.a2.innerText,
      "the restored A2 must keep the same outer explanation"
    );
    assert.strictEqual(
      changedRuntime.initial.a2.querySelectorAll('[data-app-block-preview="true"]').length,
      1,
      "the lower A2 must contain exactly one app block"
    );
    assert.strictEqual(
      changedRuntime.restored.a2.querySelectorAll('[data-app-block-preview="true"]').length,
      1,
      "the restored A2 must still contain exactly one app block"
    );
    assert.strictEqual(hooks.isStrictRichAppRuntimeIframeUrl(initialRuntimeUrl), true);
    assert.strictEqual(hooks.isStrictRichAppRuntimeIframeUrl(restoredRuntimeUrl), true);
    assert.notStrictEqual(
      restoredRuntimeUrl,
      initialRuntimeUrl,
      "the restored runtime must change to a different strict allowed host/path"
    );
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "복원 런타임 변경 저장"
    });
    changedRuntime.initial.a2.appendChild(saveButton);
    installDocument(hooks, changedRuntime.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-restored-a2-runtime-change",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(changedRuntime),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return {
            ok: false,
            stage: "preflight",
            reason: "restored mutation unexpectedly reached downstream preflight"
          };
        }
      })
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        richAppStructureFailure: /rich.?app|iframe|runtime|structure|fingerprint|changed|mismatch/i
          .test(String(result?.reason || "")),
        transitions: changedRuntime.transitions,
        restoredScrollTop: changedRuntime.scrollContainer.scrollTop,
        sameStableA2Id: changedRuntime.initial.a2Turn.getAttribute("data-turn-id") ===
          changedRuntime.restored.a2Turn.getAttribute("data-turn-id"),
        sameOuterExplanation: changedRuntime.initial.a2.innerText === changedRuntime.restored.a2.innerText,
        restoredAppBlockCount: changedRuntime.restored.a2
          .querySelectorAll('[data-app-block-preview="true"]').length,
        runtimeChangedOnRestore,
        changedStrictRuntime: initialRuntimeUrl !== restoredIframe?.getAttribute("src") &&
          hooks.isStrictRichAppRuntimeIframeUrl(restoredIframe?.getAttribute("src")),
        counts
      },
      {
        ok: false,
        stage: "preflight",
        richAppStructureFailure: true,
        transitions: ["initial", "upper", "restored"],
        restoredScrollTop: changedRuntime.originalScrollTop,
        sameStableA2Id: true,
        sameOuterExplanation: true,
        restoredAppBlockCount: 1,
        runtimeChangedOnRestore: true,
        changedStrictRuntime: true,
        counts: { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      },
      `a remounted A2 runtime change must fail closed: ${result?.reason || "no reason"}`
    );
  });

  await verifyFocusedBoundary("duplicate Q1 stable ID fails closed despite auxiliary ID differences", async () => {
    const duplicateStableQ1 = makeVirtualizedCase({
      idPrefix: "virtual-duplicate-stable-q1",
      duplicateUpperQ1Identity: true,
      duplicateUpperQ1AuxiliaryIds: true
    });
    assert.strictEqual(
      duplicateStableQ1.upper.q1Turn.getAttribute("data-turn-id"),
      duplicateStableQ1.duplicateUpperQ1Turn.getAttribute("data-turn-id")
    );
    assert.notStrictEqual(
      duplicateStableQ1.upper.q1Turn.getAttribute("data-testid"),
      duplicateStableQ1.duplicateUpperQ1Turn.getAttribute("data-testid")
    );
    assert.notStrictEqual(
      duplicateStableQ1.upper.q1Turn.getAttribute("id"),
      duplicateStableQ1.duplicateUpperQ1Turn.getAttribute("id")
    );
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "stable 중복 Q1 저장" });
    duplicateStableQ1.initial.a2.appendChild(saveButton);
    installDocument(hooks, duplicateStableQ1.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-duplicate-stable-q1",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(duplicateStableQ1),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "stable duplicate Q1 must not reach preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /duplicate|identity|ambiguous/i);
    assert.deepStrictEqual(duplicateStableQ1.transitions, ["initial", "upper", "restored"]);
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "a duplicate stable Q1 ID must stop before preflight and every external boundary"
    );
  });

  await verifyFocusedBoundary("recovered Q1 reusing frozen Q2 stable ID fails closed across windows", async () => {
    let upperMountedTurns = [];
    const crossWindowAlias = makeVirtualizedCase({
      idPrefix: "virtual-cross-window-q1-q2-alias",
      varyAuxiliaryIdsAcrossWindows: true,
      onPhase: (nextPhase, { document }) => {
        if (nextPhase === "upper") {
          upperMountedTurns = Array.from(document.querySelectorAll("[data-testid^='conversation-turn-']"));
        }
      }
    });
    const frozenLowerQ2TurnId = crossWindowAlias.initial.q2Turn.getAttribute("data-turn-id");
    crossWindowAlias.upper.q1Turn.setAttribute("data-turn-id", frozenLowerQ2TurnId);
    assert.strictEqual(
      crossWindowAlias.upper.q1Turn.getAttribute("data-turn-id"),
      crossWindowAlias.initial.q2Turn.getAttribute("data-turn-id"),
      "the recovered upper Q1 must reuse the frozen lower Q2's strongest stable identity"
    );
    assert.notStrictEqual(
      crossWindowAlias.upper.q1Turn.getAttribute("data-testid"),
      crossWindowAlias.initial.q2Turn.getAttribute("data-testid"),
      "auxiliary IDs must differ so data-turn-id remains the strongest colliding key"
    );
    assert.strictEqual(
      crossWindowAlias.upper.a1Turn.getAttribute("data-turn-id"),
      crossWindowAlias.initial.a1Turn.getAttribute("data-turn-id"),
      "A1 must remain the valid overlap between the lower and upper windows"
    );
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "교차 창 식별자 충돌 저장"
    });
    crossWindowAlias.initial.a2.appendChild(saveButton);
    installDocument(hooks, crossWindowAlias.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-cross-window-q1-q2-alias",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(crossWindowAlias),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return {
            ok: false,
            stage: "preflight",
            reason: "cross-window alias unexpectedly reached downstream preflight"
          };
        }
      })
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        identityFailure: /identity|duplicate|ambiguous/i.test(String(result?.reason || "")),
        transitions: crossWindowAlias.transitions,
        restoredScrollTop: crossWindowAlias.scrollContainer.scrollTop,
        upperContainsRecoveredQ1: upperMountedTurns.includes(crossWindowAlias.upper.q1Turn),
        upperContainsOverlapA1: upperMountedTurns.includes(crossWindowAlias.upper.a1Turn),
        upperContainsQ2: upperMountedTurns.includes(crossWindowAlias.upper.q2Turn) ||
          upperMountedTurns.includes(crossWindowAlias.initial.q2Turn),
        restoredQ2TurnId: crossWindowAlias.restored.q2Turn.getAttribute("data-turn-id"),
        counts
      },
      {
        ok: false,
        stage: "preflight",
        identityFailure: true,
        transitions: ["initial", "upper", "restored"],
        restoredScrollTop: crossWindowAlias.originalScrollTop,
        upperContainsRecoveredQ1: true,
        upperContainsOverlapA1: true,
        upperContainsQ2: false,
        restoredQ2TurnId: frozenLowerQ2TurnId,
        counts: { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      },
      `a recovered Q1 must not reuse a frozen lower-window Q2 identity: ${result?.reason || "no reason"}`
    );
  });

  await verifyFocusedBoundary("transient duplicate Q1 conflict remains terminal", async () => {
    const transientDuplicate = makeVirtualizedCase({
      idPrefix: "virtual-transient-duplicate-q1",
      duplicateUpperQ1Identity: true,
      duplicateUpperQ1AuxiliaryIds: true,
      resolveDuplicateUpperQ1OnNextScroll: true
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "transient 중복 Q1 저장" });
    transientDuplicate.initial.a2.appendChild(saveButton);
    installDocument(hooks, transientDuplicate.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-transient-duplicate-q1",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(transientDuplicate),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "unexpected downstream preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /duplicate|identity|ambiguous/i);
    assert.deepStrictEqual(
      transientDuplicate.transitions,
      ["initial", "upper", "restored"],
      "a confirmed identity conflict must not be retried against a later unique window"
    );
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "transient identity conflict must stop before preflight and every external boundary"
    );
  });

  await verifyFocusedBoundary("same A2 object reacquires a replaced action toolbar", async () => {
    const oldSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "교체 전 저장" });
    const oldToolbar = makeNode({ attrs: { role: "toolbar" }, children: [oldSaveButton] });
    const newSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "교체 후 저장" });
    const newToolbar = makeNode({ attrs: { role: "toolbar" }, children: [newSaveButton] });
    const sameA2 = makeVirtualizedCase({
      idPrefix: "virtual-same-a2-toolbar",
      reuseInitialA2OnRestore: true,
      onPhase: (nextPhase, { initial }) => {
        if (nextPhase !== "restored") return;
        oldToolbar.remove();
        initial.a2.appendChild(newToolbar);
      }
    });
    sameA2.initial.a2.appendChild(oldToolbar);
    // The broad fake intentionally returns itself from cloneNode(). Give this
    // shared A2 an isolated clone so fingerprint cleanup cannot mutate the live
    // toolbar/app whose object-reuse behavior this boundary is exercising.
    sameA2.initial.a2.cloneNode = () => {
      const clone = makeNode({
        attrs: { "data-message-author-role": "assistant" },
        text: "가상화 A2 바깥 설명"
      });
      appendProviderNeutralRichApp(clone);
      return clone;
    };
    installDocument(hooks, sameA2.document);
    const counts = makeBoundaryCounts();
    let observedPreflight = null;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-same-a2-toolbar",
      counts,
      () => hooks.handleCopyClick(oldSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(sameA2),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          observedPreflight = args;
          return { ok: false, stage: "preflight", reason: "same A2 replacement toolbar reached verified preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "same A2 replacement toolbar reached verified preflight");
    assert.deepStrictEqual(sameA2.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(observedPreflight?.currentAssistantNode, sameA2.initial.a2);
    assert.strictEqual(observedPreflight?.visualizeContext?.visualizeAnswerNode, sameA2.initial.a2);
    assert.strictEqual(observedPreflight?.visualizeContext?.hydratedFromVirtualizedTurns, true);
    assert.strictEqual(sameA2.initial.a2.contains(oldSaveButton), false);
    assert.strictEqual(sameA2.initial.a2.contains(newSaveButton), true);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "toolbar reacquisition must happen before every external boundary"
    );
    assert.strictEqual(
      observedPreflight?.btn === newSaveButton,
      true,
      "hydration must reacquire the live replacement action button"
    );
    assert.strictEqual(observedPreflight?.btn === oldSaveButton, false);
  });

  await verifyFocusedBoundary("runtime abort after upper hydration restores before stopping", async () => {
    let runtimeAborted = false;
    let notifyCount = 0;
    const abortAfterUpper = makeVirtualizedCase({
      idPrefix: "virtual-runtime-abort",
      onPhase: nextPhase => {
        if (nextPhase === "upper") runtimeAborted = true;
      }
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "runtime abort 저장" });
    abortAfterUpper.initial.a2.appendChild(saveButton);
    installDocument(hooks, abortAfterUpper.document);
    const counts = makeBoundaryCounts();
    const abortingRuntimeGuard = {
      checkSync: () => ({ ok: true }),
      check: async () => ({ ok: true }),
      isAborted: () => runtimeAborted,
      getFailure: () => runtimeAborted
        ? { ok: false, stage: "runtime", reason: "extension runtime changed during Visualize hydration" }
        : null,
      fail: reason => ({ ok: false, stage: "runtime", reason }),
      notify: () => { notifyCount += 1; }
    };
    const route = "https://chatgpt.com/c/synthetic-virtual-runtime-abort";
    let observedRouteAfterAbort = "";
    const result = await runOnBoundaryRoute(
      route,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard: abortingRuntimeGuard,
          visualizeHydrationOptions: hydrationOptions(abortAfterUpper),
          ...noExternalBoundaryOptions(counts),
          preflightFn: async () => {
            counts.preflight += 1;
            return { ok: false, stage: "preflight", reason: "aborted hydration must not reach preflight" };
          }
        });
        observedRouteAfterAbort = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /runtime changed|runtime.*hydration/i);
    assert.strictEqual(observedRouteAfterAbort, route, "runtime abort must not navigate away from the conversation");
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "runtime abort must stop before preflight and every external boundary"
    );
    assert.deepStrictEqual(
      abortAfterUpper.transitions,
      ["initial", "upper", "restored"],
      "safe same-route restoration must still run after the runtime becomes stale"
    );
    assert.strictEqual(abortAfterUpper.scrollContainer.scrollTop, abortAfterUpper.originalScrollTop);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0, "runtime abort must release its attempt lock");
    assert(notifyCount >= 1, "runtimeGuard.notify must surface the stale-runtime stop");
  });

  await verifyFocusedBoundary("consent route change stops before Share and save", async () => {
    const consentRouteChange = makeVirtualizedCase({ idPrefix: "virtual-consent-route-change" });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "consent route 저장" });
    consentRouteChange.initial.a2.appendChild(saveButton);
    installDocument(hooks, consentRouteChange.document);
    const counts = makeBoundaryCounts();
    const sourceRoute = "https://chatgpt.com/c/synthetic-virtual-consent-route-source";
    const destinationRoute = "https://chatgpt.com/c/synthetic-virtual-consent-route-destination";
    let observedRouteAfterResult = "";
    const result = await runOnBoundaryRoute(
      sourceRoute,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: hydrationOptions(consentRouteChange),
          ...noExternalBoundaryOptions(counts),
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            assert.strictEqual(currentAssistantNode, consentRouteChange.restored.a2);
            assert.strictEqual(visualizeContext.hydratedFromVirtualizedTurns, true);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: "consent-route-change",
              targetTurnId: "virtual-consent-route-change-a2"
            });
          },
          requestShareConsentFn: async () => {
            counts.consent += 1;
            hooks.__sandbox.location.href = destinationRoute;
            return { approved: true, permissionGranted: false };
          }
        });
        observedRouteAfterResult = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.deepStrictEqual(consentRouteChange.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(observedRouteAfterResult, destinationRoute, "the extension must not navigate back after consent changes route");
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "a route change after consent must stop before every Share, URL, clipboard, Native, or URI boundary"
    );
    assert.strictEqual(result?.ok, false);
    assert(["preflight", "share-confirm"].includes(result.stage), "route-change stop must remain a pre-Share failure");
    assert.match(String(result.reason || ""), /route|conversation.*changed/i);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only sequential overlap completes production preflight through Native boundary", async () => {
    const productionPath = makeVirtualizedCase({
      idPrefix: "virtual-q2-a2-production",
      q2A2OnlyInitialWindow: true
    });
    isolateRestoredAssistantHydrationClone(productionPath.initial.a2);
    isolateRestoredAssistantHydrationClone(productionPath.restored.a2);
    isolateVirtualizedA1Clone(productionPath.overlap.a1);
    isolateVirtualizedA1Clone(productionPath.upper.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "Q2/A2-only production 저장"
    });
    productionPath.initial.a2.appendChild(saveButton);
    installDocument(hooks, productionPath.document);

    const counts = makeBoundaryCounts();
    let savedPayload = null;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-production",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(productionPath),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightOptions: {
          nativePreflightFn: async () => ({ ok: true, pong: true, native: true }),
          fileLinks: [],
          artifactRows: [],
          readableFiles: []
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          const permissionGranted = await requestPermission();
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        createShareLinkFn: async (_node, options) => {
          counts.share += 1;
          assert.strictEqual(options.clipboardPermissionGranted, true);
          return {
            ok: true,
            url: "https://chatgpt.com/s/synthetic-t_q2_a2_production",
            validatedShareUrl: "https://chatgpt.com/s/synthetic-t_q2_a2_production",
            source: "existing",
            dialogClosed: true
          };
        },
        extractDownloadFilesFn: async () => ({
          files: [],
          downloadedFiles: [],
          candidatesCount: 0,
          clickedFallback: 0,
          failures: [],
          warnings: []
        }),
        saveObsidianNoteFn: async (payload, options) => {
          counts.save += 1;
          savedPayload = payload;
          assert.strictEqual(options.validateContext().ok, true);
          return { ok: true };
        }
      })
    );

    assert.strictEqual(result?.ok, true);
    assert.strictEqual(result.mode, "previous-qa");
    assert.deepStrictEqual(productionPath.transitions, ["initial", "overlap", "upper", "restored"]);
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 1, permission: 1, share: 1, clipboard: 0, save: 1, uri: 0 }
    );
    assert(savedPayload, "the verified production path must reach Native save once");
    assert(savedPayload.content.includes("가상화 Q1 원본 질문"));
    assert(savedPayload.content.includes("가상화 A1 원본 답변"));
    assert(savedPayload.content.includes("https://chatgpt.com/s/synthetic-t_q2_a2_production"));
    assert(!savedPayload.content.includes("capture_status: partial"));
    assert.strictEqual(savedPayload.fallbackUri, "");
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  const makeQ2A2SharePortalBoundary = ({
    idPrefix,
    replaceA2OnShare = false,
    portalIframeUrl = "",
    retainA2Iframe = false,
    includePortalAppBlock = true,
    autoCloseOnCopy = false
  } = {}) => {
    const driver = makeVirtualizedCase({
      idPrefix,
      q2A2OnlyInitialWindow: true
    });
    isolateRestoredAssistantHydrationClone(driver.initial.a2);
    isolateRestoredAssistantHydrationClone(driver.restored.a2);
    isolateVirtualizedA1Clone(driver.overlap.a1);
    isolateVirtualizedA1Clone(driver.upper.a1);

    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "Share portal 저장"
    });
    driver.initial.a2.appendChild(clickedSaveButton);

    const restoredSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "Share portal 복원 저장"
    });
    const restoredAppBlock = driver.restored.a2.querySelector('[data-app-block-preview="true"]');
    const restoredIframe = restoredAppBlock?.querySelector("iframe") || null;
    assert(restoredAppBlock && restoredIframe, "the restored A2 fixture must start with one app iframe");
    restoredAppBlock.innerText = "합성 비교 카드";
    restoredAppBlock.textContent = "합성 비교 카드";

    const portalIframe = makeNode({
      tagName: "iframe",
      attrs: { src: portalIframeUrl || restoredIframe.getAttribute("src") },
      width: 640,
      height: 360
    });
    const portalAppBlock = makeNode({
      attrs: { "data-app-block-preview": "true" },
      text: "합성 비교 카드",
      children: [portalIframe],
      width: 640,
      height: 360
    });
    let shareDialog = null;
    const copyButton = makeNode({
      tagName: "button",
      text: "링크 복사",
      onClick: () => {
        if (autoCloseOnCopy && shareDialog) {
          const disconnectSubtree = node => {
            if (!node) return;
            node.isConnected = false;
            Array.from(node.childNodes || []).forEach(disconnectSubtree);
          };
          disconnectSubtree(shareDialog);
          shareDialog.remove();
        }
      }
    });
    const closeButton = makeNode({
      tagName: "button",
      attrs: { "aria-label": "닫기", "data-testid": "close-button" },
      onClick: () => {
        shareDialog?.remove();
      }
    });
    shareDialog = makeNode({
      attrs: { role: "dialog", "data-testid": "share-dialog", "data-state": "open" },
      children: [closeButton, ...(includePortalAppBlock ? [portalAppBlock] : []), copyButton],
      width: 720,
      height: 640
    });

    const counts = makeBoundaryCounts();
    const responseShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "공유하기" },
      text: "공유하기",
      onClick: () => {
        counts.share += 1;
        if (!retainA2Iframe) restoredIframe.remove();
        if (replaceA2OnShare) {
          const replacementAppBlock = makeNode({
            attrs: { "data-app-block-preview": "true" },
            text: "합성 비교 카드"
          });
          const replacementA2Turn = makeConversationTurn(
            "assistant",
            "Share 도중 교체된 A2 본문",
            [replacementAppBlock],
            `${idPrefix}-a2`
          );
          mountConversationWindow(driver.document, [driver.restored.q2Turn, replacementA2Turn]);
        }
        driver.document.body.appendChild(shareDialog);
      }
    });
    driver.restored.a2.appendChild(makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [restoredSaveButton, responseShareButton]
    }));
    installDocument(hooks, driver.document);

    return {
      driver,
      clickedSaveButton,
      restoredAppBlock,
      restoredIframe,
      portalAppBlock,
      portalIframe,
      shareDialog,
      copyButton,
      closeButton,
      responseShareButton,
      counts
    };
  };

  const runQ2A2SharePortalBoundary = async (
    portal,
    routeSlug,
    {
      copySignalOk = true,
      copySignalSurface = portal.shareDialog,
      runtimeGuardOverride = runtimeGuard,
      waitForRelevantShareDialogOverride = null,
      waitForCopySuccessOverride = null,
      readClipboardTextOverride = null,
      shareOptionsOverride = {}
    } = {}
  ) => {
    let copySuccessWaits = 0;
    let manualUrlCalls = 0;
    let savedPayload = null;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${routeSlug}`,
      portal.counts,
      () => hooks.handleCopyClick(portal.clickedSaveButton, {
        delayMs: 0,
        runtimeGuard: runtimeGuardOverride,
        visualizeHydrationOptions: {
          ...hydrationOptions(portal.driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightOptions: {
          nativePreflightFn: async () => ({ ok: true, pong: true, native: true }),
          fileLinks: [],
          artifactRows: [],
          readableFiles: []
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          portal.counts.consent += 1;
          const permissionGranted = await requestPermission();
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          portal.counts.permission += 1;
          return true;
        },
        shareOptions: {
          root: portal.driver.document,
          timeoutMs: 40,
          pollMs: 1,
          ...(typeof waitForRelevantShareDialogOverride === "function"
            ? { waitForRelevantShareDialog: waitForRelevantShareDialogOverride }
            : {}),
          waitForCopySuccess: async (...args) => {
            copySuccessWaits += 1;
            if (typeof waitForCopySuccessOverride === "function") {
              return waitForCopySuccessOverride(...args);
            }
            return { ok: copySignalOk, surface: copySignalSurface };
          },
          readClipboardText: async () => {
            portal.counts.clipboard += 1;
            if (typeof readClipboardTextOverride === "function") {
              return readClipboardTextOverride();
            }
            return `https://chatgpt.com/s/synthetic-t_${routeSlug}`;
          },
          requestManualShareUrl: async () => {
            manualUrlCalls += 1;
            return "";
          },
          ...shareOptionsOverride
        },
        extractDownloadFilesFn: async () => ({
          files: [],
          downloadedFiles: [],
          candidatesCount: 0,
          clickedFallback: 0,
          failures: [],
          warnings: []
        }),
        saveObsidianNoteFn: async payload => {
          portal.counts.save += 1;
          savedPayload = payload;
          return { ok: true };
        }
      })
    );
    return { result, copySuccessWaits, manualUrlCalls, savedPayload };
  };

  const makePortalReplacementSurface = (portal, {
    iframeUrl = portal.portalIframe.getAttribute("src"),
    nestedFinalControls = false,
    autoCloseOnCopy = false,
    testId = "replacement-share-dialog"
  } = {}) => {
    const iframe = makeNode({
      tagName: "iframe",
      attrs: { src: iframeUrl },
      width: 640,
      height: 360
    });
    const appBlock = makeNode({
      attrs: { "data-app-block-preview": "true" },
      text: "합성 비교 카드",
      children: [iframe],
      width: 640,
      height: 360
    });
    let dialog = null;
    const copyButton = makeNode({
      tagName: "button",
      text: "링크 복사",
      onClick: () => {
        if (!autoCloseOnCopy || !dialog) return;
        const disconnect = node => {
          if (!node) return;
          node.isConnected = false;
          Array.from(node.childNodes || []).forEach(disconnect);
        };
        dialog.remove();
        disconnect(dialog);
      }
    });
    const closeButton = makeNode({
      tagName: "button",
      attrs: { "aria-label": "닫기", "data-testid": "close-button" },
      onClick: () => dialog?.remove()
    });
    const controls = nestedFinalControls
      ? [makeNode({
        attrs: { role: "region", "data-testid": `${testId}-controls` },
        children: [closeButton, copyButton],
        width: 680,
        height: 120
      })]
      : [closeButton, copyButton];
    dialog = makeNode({
      attrs: { role: "dialog", "data-testid": testId, "data-state": "open" },
      children: nestedFinalControls
        ? [appBlock, ...controls]
        : [closeButton, appBlock, copyButton],
      width: 720,
      height: 640
    });
    return { dialog, appBlock, iframe, copyButton, closeButton, controls };
  };

  const setPortalSurfaceConnection = (portal, node, connected, parent = null) => {
    if (!node) return;
    node.parentElement = parent;
    node.ownerDocument = portal.driver.document;
    node.isConnected = connected;
    Array.from(node.childNodes || []).forEach(child => (
      setPortalSurfaceConnection(portal, child, connected, connected ? node : null)
    ));
  };

  const detachPortalSurface = (portal, surface) => {
    surface?.remove?.();
    setPortalSurfaceConnection(portal, surface, false, null);
  };

  const mountPortalSurface = (portal, surface) => {
    portal.driver.document.body.appendChild(surface);
    setPortalSurfaceConnection(portal, surface, true, portal.driver.document.body);
  };

  await verifyFocusedBoundary("Q2/A2-only response Share may portal its iframe during a copy-only dialog", async () => {
    const portal = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal"
    });
    let savedPayload = null;
    let manualUrlCalls = 0;
    let portalShapeObserved = false;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-share-portal",
      portal.counts,
      () => hooks.handleCopyClick(portal.clickedSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(portal.driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightOptions: {
          nativePreflightFn: async () => ({ ok: true, pong: true, native: true }),
          fileLinks: [],
          artifactRows: [],
          readableFiles: []
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          portal.counts.consent += 1;
          const permissionGranted = await requestPermission();
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          portal.counts.permission += 1;
          return true;
        },
        shareOptions: {
          root: portal.driver.document,
          timeoutMs: 40,
          pollMs: 1,
          waitForCopySuccess: async (_surface, _button) => {
            portalShapeObserved =
              portal.restoredAppBlock.querySelectorAll("iframe").length === 0 &&
              portal.portalAppBlock.querySelectorAll("iframe").length === 1 &&
              !portal.driver.restored.a2.contains(portal.shareDialog) &&
              portal.driver.document.body.contains(portal.shareDialog) &&
              portal.restoredAppBlock.innerText === portal.portalAppBlock.innerText;
            return { ok: true, surface: portal.shareDialog };
          },
          readClipboardText: async () => {
            portal.counts.clipboard += 1;
            return "https://chatgpt.com/s/synthetic-t_q2_a2_share_portal";
          },
          requestManualShareUrl: async () => {
            manualUrlCalls += 1;
            return "";
          }
        },
        extractDownloadFilesFn: async () => ({
          files: [],
          downloadedFiles: [],
          candidatesCount: 0,
          clickedFallback: 0,
          failures: [],
          warnings: []
        }),
        saveObsidianNoteFn: async (payload, options) => {
          portal.counts.save += 1;
          savedPayload = payload;
          assert.strictEqual(options.validateContext().ok, true);
          return { ok: true };
        }
      })
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        reason: result?.reason || "",
        mode: result?.mode || "",
        transitions: portal.driver.transitions,
        shareClicks: portal.responseShareButton.clickCount,
        copyClicks: portal.copyButton.clickCount,
        clipboardReads: portal.counts.clipboard,
        closeClicks: portal.closeButton.clickCount,
        nativeSaves: portal.counts.save,
        portalShapeObserved,
        postCloseA2IframeCount: portal.restoredAppBlock.querySelectorAll("iframe").length,
        dialogStillMounted: portal.driver.document.body.contains(portal.shareDialog),
        manualUrlCalls
      },
      {
        ok: true,
        stage: "",
        reason: "",
        mode: "previous-qa",
        transitions: ["initial", "overlap", "upper", "restored"],
        shareClicks: 1,
        copyClicks: 1,
        clipboardReads: 1,
        closeClicks: 1,
        nativeSaves: 1,
        portalShapeObserved: true,
        postCloseA2IframeCount: 0,
        dialogStillMounted: false,
        manualUrlCalls: 0
      },
      `a body-portal Share preview must not invalidate unchanged Q2/A2 provenance: ${result?.stage || "unknown"}/${result?.reason || "unknown"}`
    );
    assert(savedPayload, "the accepted share-dialog portal transition must reach Native save");
    assert(savedPayload.content.includes("가상화 Q1 원본 질문"));
    assert(savedPayload.content.includes("가상화 A1 원본 답변"));
    assert(savedPayload.content.includes("https://chatgpt.com/s/synthetic-t_q2_a2_share_portal"));
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share reacquires one fresh final surface after waiter remount", async () => {
    const waiterRemount = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-waiter-remount"
    });
    const replacement = makePortalReplacementSurface(waiterRemount, {
      testId: "waiter-remount-share-dialog"
    });
    let waiterRemountCount = 0;
    const waitForRelevantShareDialogOverride = async () => {
      waiterRemountCount += 1;
      detachPortalSurface(waiterRemount, waiterRemount.shareDialog);
      mountPortalSurface(waiterRemount, replacement.dialog);
      return { ok: true, kind: "final", dialog: waiterRemount.shareDialog };
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      waiterRemount,
      "q2_a2_share_portal_waiter_remount",
      {
        copySignalSurface: replacement.dialog,
        waitForRelevantShareDialogOverride
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        waiterRemountCount,
        staleCopyClicks: waiterRemount.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: waiterRemount.counts.clipboard,
        staleCloseClicks: waiterRemount.closeButton.clickCount,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: waiterRemount.counts.save,
        replacementDialogMounted: waiterRemount.driver.document.body.contains(replacement.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        waiterRemountCount: 1,
        staleCopyClicks: 0,
        replacementCopyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        staleCloseClicks: 0,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        replacementDialogMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `the final surface returned by the waiter may be replaced before hydrated validation: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share canonicalizes a connected inner final leaf returned by the waiter", async () => {
    const innerLeaf = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-waiter-inner-leaf"
    });
    const replacement = makePortalReplacementSurface(innerLeaf, {
      nestedFinalControls: true,
      testId: "waiter-inner-leaf-share-dialog"
    });
    let waiterCalls = 0;
    const waitForRelevantShareDialogOverride = async () => {
      waiterCalls += 1;
      detachPortalSurface(innerLeaf, innerLeaf.shareDialog);
      mountPortalSurface(innerLeaf, replacement.dialog);
      return { ok: true, kind: "final", dialog: replacement.controls[0] };
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      innerLeaf,
      "q2_a2_share_portal_waiter_inner_leaf",
      {
        copySignalSurface: replacement.controls[0],
        waitForRelevantShareDialogOverride
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        waiterCalls,
        staleCopyClicks: innerLeaf.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: innerLeaf.counts.clipboard,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: innerLeaf.counts.save,
        replacementDialogMounted: innerLeaf.driver.document.body.contains(replacement.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        waiterCalls: 1,
        staleCopyClicks: 0,
        replacementCopyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        replacementDialogMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a connected inner final leaf must canonicalize to its proof-carrying outer family member: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share reacquires one fresh equivalent final surface before Copy", async () => {
    const replaced = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-pre-copy-remount"
    });
    const replacementIframe = makeNode({
      tagName: "iframe",
      attrs: { src: replaced.portalIframe.getAttribute("src") },
      width: 640,
      height: 360
    });
    const replacementAppBlock = makeNode({
      attrs: { "data-app-block-preview": "true" },
      text: "합성 비교 카드",
      children: [replacementIframe],
      width: 640,
      height: 360
    });
    const replacementCopyButton = makeNode({ tagName: "button", text: "링크 복사" });
    const replacementCloseButton = makeNode({
      tagName: "button",
      attrs: { "aria-label": "닫기", "data-testid": "close-button" },
      onClick: () => replacementDialog.remove()
    });
    const replacementDialog = makeNode({
      attrs: { role: "dialog", "data-testid": "share-dialog", "data-state": "open" },
      children: [replacementCloseButton, replacementAppBlock, replacementCopyButton],
      width: 720,
      height: 640
    });
    let remountCount = 0;
    const setSubtreeConnection = (node, connected, parent = null) => {
      if (!node) return;
      node.parentElement = parent;
      node.ownerDocument = replaced.driver.document;
      node.isConnected = connected;
      Array.from(node.childNodes || []).forEach(child => (
        setSubtreeConnection(child, connected, connected ? node : null)
      ));
    };
    const remountingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && remountCount === 0) {
          remountCount += 1;
          replaced.shareDialog.remove();
          setSubtreeConnection(replaced.shareDialog, false, null);
          replaced.driver.document.body.appendChild(replacementDialog);
          setSubtreeConnection(replacementDialog, true, replaced.driver.document.body);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      replaced,
      "q2_a2_share_portal_pre_copy_remount",
      {
        copySignalSurface: replacementDialog,
        runtimeGuardOverride: remountingRuntimeGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        reason: result?.reason || "",
        mode: result?.mode || "",
        remountCount,
        shareClicks: replaced.responseShareButton.clickCount,
        staleCopyClicks: replaced.copyButton.clickCount,
        replacementCopyClicks: replacementCopyButton.clickCount,
        copySuccessWaits,
        clipboardReads: replaced.counts.clipboard,
        staleCloseClicks: replaced.closeButton.clickCount,
        replacementCloseClicks: replacementCloseButton.clickCount,
        nativeSaves: replaced.counts.save,
        staleDialogMounted: replaced.driver.document.body.contains(replaced.shareDialog),
        replacementDialogMounted: replaced.driver.document.body.contains(replacementDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        reason: "",
        mode: "previous-qa",
        remountCount: 1,
        shareClicks: 1,
        staleCopyClicks: 0,
        replacementCopyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        staleCloseClicks: 0,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        staleDialogMounted: false,
        replacementDialogMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a single fresh equivalent replacement must be reacquired before Copy: ${result?.stage || "unknown"}/${result?.reason || "unknown"}`
    );
    assert(savedPayload.content.includes("https://chatgpt.com/s/synthetic-t_q2_a2_share_portal_pre_copy_remount"));
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share waits through a one-tick remount gap before Copy", async () => {
    const delayed = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-delayed-pre-copy-remount"
    });
    const replacement = makePortalReplacementSurface(delayed, {
      testId: "delayed-pre-copy-replacement-share-dialog"
    });
    let remountScheduled = 0;
    let remountCompleted = 0;
    const delayedRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && remountScheduled === 0) {
          remountScheduled += 1;
          detachPortalSurface(delayed, delayed.shareDialog);
          setTimeout(() => {
            remountCompleted += 1;
            mountPortalSurface(delayed, replacement.dialog);
          }, 0);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      delayed,
      "q2_a2_share_portal_delayed_pre_copy_remount",
      {
        copySignalSurface: replacement.dialog,
        runtimeGuardOverride: delayedRuntimeGuard
      }
    );
    await new Promise(resolve => setTimeout(resolve, 5));

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        remountScheduled,
        remountCompleted,
        staleCopyClicks: delayed.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: delayed.counts.clipboard,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: delayed.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        remountScheduled: 1,
        remountCompleted: 1,
        staleCopyClicks: 0,
        replacementCopyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a single equivalent replacement mounted on the next tick must be reacquired: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share reacquires one nested final-surface family before Copy", async () => {
    const nested = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-nested-remount"
    });
    const replacement = makePortalReplacementSurface(nested, {
      nestedFinalControls: true,
      autoCloseOnCopy: true,
      testId: "nested-replacement-share-dialog"
    });
    let remountCount = 0;
    const remountingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && remountCount === 0) {
          remountCount += 1;
          detachPortalSurface(nested, nested.shareDialog);
          mountPortalSurface(nested, replacement.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      nested,
      "q2_a2_share_portal_nested_remount",
      {
        copySignalSurface: replacement.controls[0],
        runtimeGuardOverride: remountingRuntimeGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        remountCount,
        staleCopyClicks: nested.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: nested.counts.clipboard,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: nested.counts.save,
        replacementDialogMounted: nested.driver.document.body.contains(replacement.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        remountCount: 1,
        staleCopyClicks: 0,
        replacementCopyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        replacementCloseClicks: 0,
        nativeSaves: 1,
        replacementDialogMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `one linear nested final-surface family must resolve to its proof-carrying outer surface: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share canonicalizes a nested replacement returned after Copy", async () => {
    const copyRemount = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-copy-remount"
    });
    const replacement = makePortalReplacementSurface(copyRemount, {
      nestedFinalControls: true,
      testId: "copy-remount-share-dialog"
    });
    let remountCount = 0;
    copyRemount.copyButton.click = () => {
      copyRemount.copyButton.clickCount += 1;
      remountCount += 1;
      detachPortalSurface(copyRemount, copyRemount.shareDialog);
      mountPortalSurface(copyRemount, replacement.dialog);
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      copyRemount,
      "q2_a2_share_portal_copy_remount",
      { copySignalSurface: replacement.controls[0] }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        remountCount,
        staleCopyClicks: copyRemount.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: copyRemount.counts.clipboard,
        staleCloseClicks: copyRemount.closeButton.clickCount,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: copyRemount.counts.save,
        replacementDialogMounted: copyRemount.driver.document.body.contains(replacement.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        remountCount: 1,
        staleCopyClicks: 1,
        replacementCopyClicks: 0,
        copySuccessWaits: 1,
        clipboardReads: 1,
        staleCloseClicks: 0,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        replacementDialogMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a fresh nested replacement returned by Copy confirmation must canonicalize before hydrated validation: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share proves a remounted surface already in Copy-success state", async () => {
    const copiedReplacement = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-copy-remount-copied"
    });
    const replacement = makePortalReplacementSurface(copiedReplacement, {
      testId: "copy-remount-copied-share-surface"
    });
    replacement.copyButton.textContent = "복사됨";
    replacement.copyButton.innerText = "복사됨";
    replacement.copyButton.setAttribute("aria-label", "복사됨");
    let remountCount = 0;
    copiedReplacement.copyButton.click = () => {
      copiedReplacement.copyButton.clickCount += 1;
      remountCount += 1;
      detachPortalSurface(copiedReplacement, copiedReplacement.shareDialog);
      mountPortalSurface(copiedReplacement, replacement.dialog);
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      copiedReplacement,
      "q2_a2_share_portal_copy_remount_copied",
      {
        copySignalSurface: replacement.dialog,
        waitForCopySuccessOverride: (...args) => hooks.waitForCopySuccess(...args)
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        remountCount,
        staleCopyClicks: copiedReplacement.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: copiedReplacement.counts.clipboard,
        staleCloseClicks: copiedReplacement.closeButton.clickCount,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: copiedReplacement.counts.save,
        replacementDialogMounted: copiedReplacement.driver.document.body.contains(replacement.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        remountCount: 1,
        staleCopyClicks: 1,
        replacementCopyClicks: 0,
        copySuccessWaits: 1,
        clipboardReads: 1,
        staleCloseClicks: 0,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        replacementDialogMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a remounted Copied surface must pass the exact A2 source proof before clipboard/Native: ${result?.reason || "no reason"}`
    );
    assert(savedPayload.content.includes("https://chatgpt.com/s/synthetic-t_q2_a2_share_portal_copy_remount_copied"));
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a wrong-source remount already in Copy-success state", async () => {
    const wrongCopied = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-copy-remount-copied-wrong-source"
    });
    const replacement = makePortalReplacementSurface(wrongCopied, {
      iframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime",
      testId: "copy-remount-copied-wrong-source"
    });
    replacement.copyButton.textContent = "복사됨";
    replacement.copyButton.innerText = "복사됨";
    replacement.copyButton.setAttribute("aria-label", "복사됨");
    wrongCopied.copyButton.click = () => {
      wrongCopied.copyButton.clickCount += 1;
      detachPortalSurface(wrongCopied, wrongCopied.shareDialog);
      mountPortalSurface(wrongCopied, replacement.dialog);
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      wrongCopied,
      "q2_a2_copy_remount_copied_wrong_source",
      { copySignalSurface: replacement.dialog }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        staleCopyClicks: wrongCopied.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: wrongCopied.counts.clipboard,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: wrongCopied.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        staleCopyClicks: 1,
        replacementCopyClicks: 0,
        copySuccessWaits: 1,
        clipboardReads: 0,
        replacementCloseClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a remounted Copied surface with the wrong iframe source must fail before clipboard"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects Copy-success remount alongside another final surface", async () => {
    const copiedAmbiguity = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-copy-remount-copied-ambiguous"
    });
    const copiedSurface = makePortalReplacementSurface(copiedAmbiguity, {
      testId: "copy-remount-copied-primary"
    });
    copiedSurface.copyButton.textContent = "복사됨";
    copiedSurface.copyButton.innerText = "복사됨";
    copiedSurface.copyButton.setAttribute("aria-label", "복사됨");
    const competingSurface = makePortalReplacementSurface(copiedAmbiguity, {
      testId: "copy-remount-copied-competitor"
    });
    copiedAmbiguity.copyButton.click = () => {
      copiedAmbiguity.copyButton.clickCount += 1;
      detachPortalSurface(copiedAmbiguity, copiedAmbiguity.shareDialog);
      mountPortalSurface(copiedAmbiguity, copiedSurface.dialog);
      mountPortalSurface(copiedAmbiguity, competingSurface.dialog);
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      copiedAmbiguity,
      "q2_a2_copy_remount_copied_ambiguous",
      { copySignalSurface: copiedSurface.dialog }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        staleCopyClicks: copiedAmbiguity.copyButton.clickCount,
        copiedSurfaceCopyClicks: copiedSurface.copyButton.clickCount,
        competingCopyClicks: competingSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: copiedAmbiguity.counts.clipboard,
        copiedSurfaceCloseClicks: copiedSurface.closeButton.clickCount,
        nativeSaves: copiedAmbiguity.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        staleCopyClicks: 1,
        copiedSurfaceCopyClicks: 0,
        competingCopyClicks: 0,
        copySuccessWaits: 1,
        clipboardReads: 0,
        copiedSurfaceCloseClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a Copied replacement and an independent final surface must remain ambiguous"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share preserves a real Copy waiter ambiguity failure", async () => {
    const waiterAmbiguity = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-real-copy-waiter-ambiguous"
    });
    const copiedSurface = makePortalReplacementSurface(waiterAmbiguity, {
      testId: "real-copy-waiter-copied-primary"
    });
    copiedSurface.copyButton.textContent = "복사됨";
    copiedSurface.copyButton.innerText = "복사됨";
    copiedSurface.copyButton.setAttribute("aria-label", "복사됨");
    const competingSurface = makePortalReplacementSurface(waiterAmbiguity, {
      testId: "real-copy-waiter-final-competitor"
    });
    waiterAmbiguity.copyButton.click = () => {
      waiterAmbiguity.copyButton.clickCount += 1;
      detachPortalSurface(waiterAmbiguity, waiterAmbiguity.shareDialog);
      mountPortalSurface(waiterAmbiguity, copiedSurface.dialog);
      mountPortalSurface(waiterAmbiguity, competingSurface.dialog);
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      waiterAmbiguity,
      "q2_a2_real_copy_waiter_ambiguous",
      {
        waitForCopySuccessOverride: (...args) => hooks.waitForCopySuccess(...args),
        shareOptionsOverride: {
          requestManualShareUrl: async () => "https://chatgpt.com/s/synthetic-t_q2_a2_real_copy_waiter_ambiguous"
        }
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        staleCopyClicks: waiterAmbiguity.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: waiterAmbiguity.counts.clipboard,
        nativeSaves: waiterAmbiguity.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "multiple visible share surfaces during Copy link confirmation",
        staleCopyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "an operational Copy waiter ambiguity must fail closed instead of falling through to manual URL entry"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a fresh Copy-success-only sibling after the signal", async () => {
    const copiedSibling = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-copy-success-sibling"
    });
    const copiedSurface = makePortalReplacementSurface(copiedSibling, {
      testId: "copy-success-sibling-primary"
    });
    copiedSurface.copyButton.textContent = "복사됨";
    copiedSurface.copyButton.innerText = "복사됨";
    copiedSurface.copyButton.setAttribute("aria-label", "복사됨");
    const siblingSurface = makePortalReplacementSurface(copiedSibling, {
      testId: "copy-success-sibling-secondary"
    });
    siblingSurface.copyButton.textContent = "복사됨";
    siblingSurface.copyButton.innerText = "복사됨";
    siblingSurface.copyButton.setAttribute("aria-label", "복사됨");
    copiedSibling.copyButton.click = () => {
      copiedSibling.copyButton.clickCount += 1;
      detachPortalSurface(copiedSibling, copiedSibling.shareDialog);
      mountPortalSurface(copiedSibling, copiedSurface.dialog);
    };
    let siblingMounted = 0;
    const siblingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-after-signal" && siblingMounted === 0) {
          siblingMounted += 1;
          mountPortalSurface(copiedSibling, siblingSurface.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      copiedSibling,
      "q2_a2_copy_success_sibling",
      {
        copySignalSurface: copiedSurface.dialog,
        runtimeGuardOverride: siblingRuntimeGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        siblingMounted,
        staleCopyClicks: copiedSibling.copyButton.clickCount,
        primaryCopyClicks: copiedSurface.copyButton.clickCount,
        siblingCopyClicks: siblingSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: copiedSibling.counts.clipboard,
        primaryCloseClicks: copiedSurface.closeButton.clickCount,
        nativeSaves: copiedSibling.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        siblingMounted: 1,
        staleCopyClicks: 1,
        primaryCopyClicks: 0,
        siblingCopyClicks: 0,
        copySuccessWaits: 1,
        clipboardReads: 0,
        primaryCloseClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a baseline-fresh Copied-only sibling appearing after the signal must remain ambiguous"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects simultaneous old and replacement final surfaces", async () => {
    const simultaneous = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-simultaneous"
    });
    const replacement = makePortalReplacementSurface(simultaneous, {
      testId: "simultaneous-replacement-share-dialog"
    });
    let mountedReplacement = false;
    let emptyCandidateRetryWaits = 0;
    const simultaneousRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && !mountedReplacement) {
          mountedReplacement = true;
          mountPortalSurface(simultaneous, replacement.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      simultaneous,
      "q2_a2_share_portal_simultaneous",
      {
        copySignalSurface: replacement.dialog,
        runtimeGuardOverride: simultaneousRuntimeGuard,
        shareOptionsOverride: {
          waitForShareSurfaceRetry: async () => {
            emptyCandidateRetryWaits += 1;
          }
        }
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        emptyCandidateRetryWaits,
        staleCopyClicks: simultaneous.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: simultaneous.counts.clipboard,
        nativeSaves: simultaneous.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        emptyCandidateRetryWaits: 0,
        staleCopyClicks: 0,
        replacementCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "two simultaneously visible fresh final surfaces must fail closed before Copy"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects two sibling final leaves in one outer surface", async () => {
    const siblings = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-sibling-leaves"
    });
    const replacement = makePortalReplacementSurface(siblings, {
      nestedFinalControls: true,
      testId: "sibling-leaves-share-dialog"
    });
    const siblingCopyButton = makeNode({ tagName: "button", text: "링크 복사" });
    const siblingFinalRegion = makeNode({
      attrs: { role: "region", "data-testid": "sibling-final-region" },
      children: [
        makeNode({ tagName: "button", attrs: { "aria-label": "닫기" } }),
        siblingCopyButton,
        makeNode({ tagName: "button", text: "X" }),
        makeNode({ tagName: "button", text: "LinkedIn" })
      ],
      width: 680,
      height: 120
    });
    replacement.dialog.appendChild(siblingFinalRegion);
    let remountCount = 0;
    const siblingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && remountCount === 0) {
          remountCount += 1;
          detachPortalSurface(siblings, siblings.shareDialog);
          mountPortalSurface(siblings, replacement.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      siblings,
      "q2_a2_share_portal_sibling_leaves",
      {
        copySignalSurface: replacement.controls[0],
        runtimeGuardOverride: siblingRuntimeGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        remountCount,
        staleCopyClicks: siblings.copyButton.clickCount,
        firstSiblingCopyClicks: replacement.copyButton.clickCount,
        secondSiblingCopyClicks: siblingCopyButton.clickCount,
        copySuccessWaits,
        clipboardReads: siblings.counts.clipboard,
        nativeSaves: siblings.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        remountCount: 1,
        staleCopyClicks: 0,
        firstSiblingCopyClicks: 0,
        secondSiblingCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "two sibling final leaves under one outer candidate must fail closed before Copy"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects an unchanged pre-click final surface after remount loss", async () => {
    const staleBaseline = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-stale-baseline"
    });
    const preExisting = makePortalReplacementSurface(staleBaseline, {
      testId: "pre-existing-share-dialog"
    });
    let baselineMounted = false;
    let activeSurfaceRemoved = false;
    const staleBaselineRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-button" && !baselineMounted) {
          baselineMounted = true;
          mountPortalSurface(staleBaseline, preExisting.dialog);
        }
        if (phase === "share-copy-before-click" && !activeSurfaceRemoved) {
          activeSurfaceRemoved = true;
          detachPortalSurface(staleBaseline, staleBaseline.shareDialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      staleBaseline,
      "q2_a2_share_portal_stale_baseline",
      {
        copySignalSurface: preExisting.dialog,
        runtimeGuardOverride: staleBaselineRuntimeGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        baselineMounted,
        activeSurfaceRemoved,
        staleCopyClicks: staleBaseline.copyButton.clickCount,
        preExistingCopyClicks: preExisting.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: staleBaseline.counts.clipboard,
        nativeSaves: staleBaseline.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        baselineMounted: true,
        activeSurfaceRemoved: true,
        staleCopyClicks: 0,
        preExistingCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "an unchanged final surface that existed before this Share click must never be reacquired"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a replacement with a different iframe source proof", async () => {
    const mismatch = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-remount-source-mismatch"
    });
    const replacement = makePortalReplacementSurface(mismatch, {
      iframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime",
      testId: "source-mismatch-replacement-share-dialog"
    });
    let remountCount = 0;
    const mismatchRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && remountCount === 0) {
          remountCount += 1;
          detachPortalSurface(mismatch, mismatch.shareDialog);
          mountPortalSurface(mismatch, replacement.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      mismatch,
      "q2_a2_share_portal_remount_source_mismatch",
      {
        copySignalSurface: replacement.dialog,
        runtimeGuardOverride: mismatchRuntimeGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        remountCount,
        staleCopyClicks: mismatch.copyButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: mismatch.counts.clipboard,
        nativeSaves: mismatch.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        remountCount: 1,
        staleCopyClicks: 0,
        replacementCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      `a replacement with a different iframe source must fail closed: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share does not wait past an already observed wrong-source surface", async () => {
    const transientMismatch = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-wrong-source-before-retry"
    });
    const wrongSurface = makePortalReplacementSurface(transientMismatch, {
      iframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime",
      testId: "wrong-source-before-retry"
    });
    const laterGoodSurface = makePortalReplacementSurface(transientMismatch, {
      testId: "later-good-surface"
    });
    let wrongSurfaceMounted = 0;
    let retryGuardCalls = 0;
    const transientGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-before-click" && wrongSurfaceMounted === 0) {
          wrongSurfaceMounted += 1;
          detachPortalSurface(transientMismatch, transientMismatch.shareDialog);
          mountPortalSurface(transientMismatch, wrongSurface.dialog);
        } else if (/share-copy-before-click-retry/.test(phase)) {
          retryGuardCalls += 1;
          detachPortalSurface(transientMismatch, wrongSurface.dialog);
          mountPortalSurface(transientMismatch, laterGoodSurface.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      transientMismatch,
      "q2_a2_wrong_source_before_retry",
      {
        copySignalSurface: laterGoodSurface.dialog,
        runtimeGuardOverride: transientGuard
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        wrongSurfaceMounted,
        retryGuardCalls,
        staleCopyClicks: transientMismatch.copyButton.clickCount,
        wrongCopyClicks: wrongSurface.copyButton.clickCount,
        laterGoodCopyClicks: laterGoodSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: transientMismatch.counts.clipboard,
        nativeSaves: transientMismatch.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        wrongSurfaceMounted: 1,
        retryGuardCalls: 0,
        staleCopyClicks: 0,
        wrongCopyClicks: 0,
        laterGoodCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a wrong-source surface is terminal and cannot be replaced during an async retry"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share revalidates a Create-link replacement before accepting its URL", async () => {
    const createReplacement = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-create-source-mismatch"
    });
    const replacement = makePortalReplacementSurface(createReplacement, {
      iframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime",
      testId: "create-source-mismatch-replacement-share-dialog"
    });
    const replacementUrl = makeNode({
      tagName: "input",
      attrs: { value: "https://chatgpt.com/s/synthetic-t_q2_a2_share_portal_create_source_mismatch" },
      width: 480,
      height: 40
    });
    replacement.dialog.appendChild(replacementUrl);
    createReplacement.copyButton.remove();
    const createButton = makeNode({
      tagName: "button",
      text: "Create link",
      onClick: () => {
        detachPortalSurface(createReplacement, createReplacement.shareDialog);
        mountPortalSurface(createReplacement, replacement.dialog);
      }
    });
    createReplacement.shareDialog.appendChild(createButton);

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      createReplacement,
      "q2_a2_share_portal_create_source_mismatch"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        shareCreatedThisAttempt: result?.shareCreatedThisAttempt,
        shareSource: result?.shareSource,
        createClicks: createButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: createReplacement.counts.clipboard,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: createReplacement.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        shareCreatedThisAttempt: true,
        shareSource: "created",
        createClicks: 1,
        replacementCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        replacementCloseClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      `a Create-link replacement URL must not bypass the hydrated A2 source proof: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share never splices a Create URL from one surface with another surface proof", async () => {
    const spliceAttempt = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-create-url-surface-splice"
    });
    const urlSurface = makePortalReplacementSurface(spliceAttempt, {
      iframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime",
      testId: "create-url-source-surface"
    });
    const staleUrl = "https://chatgpt.com/s/synthetic-t_q2_a2_create_url_surface_splice";
    urlSurface.dialog.appendChild(makeNode({
      tagName: "input",
      attrs: { value: staleUrl },
      width: 480,
      height: 40
    }));
    const proofSurface = makePortalReplacementSurface(spliceAttempt, {
      testId: "create-proof-only-surface"
    });
    spliceAttempt.copyButton.remove();
    const createButton = makeNode({
      tagName: "button",
      text: "Create link",
      onClick: () => {
        detachPortalSurface(spliceAttempt, spliceAttempt.shareDialog);
        mountPortalSurface(spliceAttempt, urlSurface.dialog);
      }
    });
    spliceAttempt.shareDialog.appendChild(createButton);
    let urlWaitCalls = 0;
    const waitForValidatedShareUrlOverride = async () => {
      urlWaitCalls += 1;
      detachPortalSurface(spliceAttempt, urlSurface.dialog);
      mountPortalSurface(spliceAttempt, proofSurface.dialog);
      return { ok: true, url: staleUrl, surface: urlSurface.dialog };
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      spliceAttempt,
      "q2_a2_create_url_surface_splice",
      {
        shareOptionsOverride: {
          waitForValidatedShareUrl: waitForValidatedShareUrlOverride
        }
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        urlSurfaceMismatch: /url|surface|proof|belong/i.test(String(result?.reason || "")),
        shareCreatedThisAttempt: result?.shareCreatedThisAttempt,
        createClicks: createButton.clickCount,
        urlWaitCalls,
        urlSurfaceCopyClicks: urlSurface.copyButton.clickCount,
        proofSurfaceCopyClicks: proofSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: spliceAttempt.counts.clipboard,
        proofSurfaceCloseClicks: proofSurface.closeButton.clickCount,
        nativeSaves: spliceAttempt.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-url",
        urlSurfaceMismatch: true,
        shareCreatedThisAttempt: true,
        createClicks: 1,
        urlWaitCalls: 1,
        urlSurfaceCopyClicks: 0,
        proofSurfaceCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        proofSurfaceCloseClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a URL observed on S2 must not be combined with the iframe proof from unrelated S3"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a Create URL result with no bound surface", async () => {
    const missingUrlSurface = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-create-url-without-surface"
    });
    const proofSurface = makePortalReplacementSurface(missingUrlSurface, {
      testId: "create-url-without-surface-proof"
    });
    missingUrlSurface.copyButton.remove();
    const createButton = makeNode({
      tagName: "button",
      text: "Create link",
      onClick: () => {
        detachPortalSurface(missingUrlSurface, missingUrlSurface.shareDialog);
        mountPortalSurface(missingUrlSurface, proofSurface.dialog);
      }
    });
    missingUrlSurface.shareDialog.appendChild(createButton);
    const unboundUrl = "https://chatgpt.com/s/synthetic-t_q2_a2_create_url_without_surface";

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      missingUrlSurface,
      "q2_a2_create_url_without_surface",
      {
        shareOptionsOverride: {
          waitForValidatedShareUrl: async () => ({ ok: true, url: unboundUrl })
        }
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        urlSurfaceMismatch: /url|surface|proof|belong/i.test(String(result?.reason || "")),
        shareCreatedThisAttempt: result?.shareCreatedThisAttempt,
        createClicks: createButton.clickCount,
        proofSurfaceCopyClicks: proofSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: missingUrlSurface.counts.clipboard,
        proofSurfaceCloseClicks: proofSurface.closeButton.clickCount,
        nativeSaves: missingUrlSurface.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-url",
        urlSurfaceMismatch: true,
        shareCreatedThisAttempt: true,
        createClicks: 1,
        proofSurfaceCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        proofSurfaceCloseClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a URL without its observed response surface must not be combined with a later surface proof"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects same-node Create URL and source proof from different states", async () => {
    const temporalSplice = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-create-temporal-splice"
    });
    const changingSurface = makePortalReplacementSurface(temporalSplice, {
      iframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime",
      testId: "create-temporal-splice-surface"
    });
    const staleUrl = "https://chatgpt.com/s/synthetic-t_q2_a2_create_temporal_splice";
    const urlNode = makeNode({
      tagName: "input",
      attrs: { value: staleUrl },
      width: 480,
      height: 40
    });
    changingSurface.dialog.appendChild(urlNode);
    temporalSplice.copyButton.remove();
    const createButton = makeNode({
      tagName: "button",
      text: "Create link",
      onClick: () => {
        detachPortalSurface(temporalSplice, temporalSplice.shareDialog);
        mountPortalSurface(temporalSplice, changingSurface.dialog);
      }
    });
    temporalSplice.shareDialog.appendChild(createButton);
    const waitForValidatedShareUrlOverride = async () => {
      changingSurface.iframe.setAttribute("src", temporalSplice.portalIframe.getAttribute("src"));
      urlNode.remove();
      return { ok: true, url: staleUrl, surface: changingSurface.dialog };
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      temporalSplice,
      "q2_a2_create_temporal_splice",
      {
        shareOptionsOverride: {
          waitForValidatedShareUrl: waitForValidatedShareUrlOverride
        }
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        urlSurfaceMismatch: /url|surface|proof|belong/i.test(String(result?.reason || "")),
        shareCreatedThisAttempt: result?.shareCreatedThisAttempt,
        createClicks: createButton.clickCount,
        replacementCopyClicks: changingSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: temporalSplice.counts.clipboard,
        closeClicks: changingSurface.closeButton.clickCount,
        nativeSaves: temporalSplice.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-url",
        urlSurfaceMismatch: true,
        shareCreatedThisAttempt: true,
        createClicks: 1,
        replacementCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "one node must not combine an earlier URL state with a later iframe-proof state"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share accepts a proven Create-link replacement URL", async () => {
    const createReplacement = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-create-proven"
    });
    const replacement = makePortalReplacementSurface(createReplacement, {
      testId: "create-proven-replacement-share-dialog"
    });
    replacement.dialog.appendChild(makeNode({
      tagName: "input",
      attrs: { value: "https://chatgpt.com/s/synthetic-t_q2_a2_share_portal_create_proven" },
      width: 480,
      height: 40
    }));
    createReplacement.copyButton.remove();
    const createButton = makeNode({
      tagName: "button",
      text: "Create link",
      onClick: () => {
        detachPortalSurface(createReplacement, createReplacement.shareDialog);
        mountPortalSurface(createReplacement, replacement.dialog);
      }
    });
    createReplacement.shareDialog.appendChild(createButton);

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      createReplacement,
      "q2_a2_share_portal_create_proven"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        shareSource: result?.shareSource,
        createClicks: createButton.clickCount,
        replacementCopyClicks: replacement.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: createReplacement.counts.clipboard,
        replacementCloseClicks: replacement.closeButton.clickCount,
        nativeSaves: createReplacement.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        shareSource: "created",
        createClicks: 1,
        replacementCopyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        replacementCloseClicks: 1,
        nativeSaves: 1,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a Create-link replacement URL may proceed only after the exact source proof: ${result?.reason || "no reason"}`
    );
    assert(savedPayload.content.includes("https://chatgpt.com/s/synthetic-t_q2_a2_share_portal_create_proven"));
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share accepts a verified Copy-success state that stays open", async () => {
    const copiedOpen = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-copied-open"
    });
    let modalOpenAfterCopy = false;
    copiedOpen.copyButton.click = () => {
      copiedOpen.copyButton.clickCount += 1;
      copiedOpen.copyButton.textContent = "복사됨";
      copiedOpen.copyButton.innerText = "복사됨";
      copiedOpen.copyButton.setAttribute("aria-label", "복사됨");
      modalOpenAfterCopy = copiedOpen.driver.document.body.contains(copiedOpen.shareDialog);
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      copiedOpen,
      "q2_a2_share_portal_copied_open"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        shareClicks: copiedOpen.responseShareButton.clickCount,
        copyClicks: copiedOpen.copyButton.clickCount,
        copySuccessWaits,
        modalOpenAfterCopy,
        clipboardReads: copiedOpen.counts.clipboard,
        closeClicks: copiedOpen.closeButton.clickCount,
        nativeSaves: copiedOpen.counts.save,
        dialogStillMounted: copiedOpen.driver.document.body.contains(copiedOpen.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        shareClicks: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        modalOpenAfterCopy: true,
        clipboardReads: 1,
        closeClicks: 1,
        nativeSaves: 1,
        dialogStillMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `the already-proven surface may remain open after a fresh Copy-success state: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rechecks source proof on the same open Copy-success surface", async () => {
    const mutatedCopiedOpen = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-copied-open-source-mutation"
    });
    mutatedCopiedOpen.copyButton.click = () => {
      mutatedCopiedOpen.copyButton.clickCount += 1;
      mutatedCopiedOpen.copyButton.textContent = "복사됨";
      mutatedCopiedOpen.copyButton.innerText = "복사됨";
      mutatedCopiedOpen.copyButton.setAttribute("aria-label", "복사됨");
      mutatedCopiedOpen.portalIframe.setAttribute(
        "src",
        "https://app-block-other.web-sandbox.oaiusercontent.com/runtime"
      );
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      mutatedCopiedOpen,
      "q2_a2_copied_open_source_mutation"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        copyClicks: mutatedCopiedOpen.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: mutatedCopiedOpen.counts.clipboard,
        closeClicks: mutatedCopiedOpen.closeButton.clickCount,
        nativeSaves: mutatedCopiedOpen.counts.save,
        dialogStillMounted: mutatedCopiedOpen.driver.document.body.contains(mutatedCopiedOpen.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        dialogStillMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a visible Copied state must not reuse stale proof after its iframe source changes"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rechecks source proof after clipboard read", async () => {
    const clipboardMutation = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-clipboard-read-source-mutation"
    });
    clipboardMutation.copyButton.click = () => {
      clipboardMutation.copyButton.clickCount += 1;
      clipboardMutation.copyButton.textContent = "복사됨";
      clipboardMutation.copyButton.innerText = "복사됨";
      clipboardMutation.copyButton.setAttribute("aria-label", "복사됨");
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      clipboardMutation,
      "q2_a2_clipboard_read_source_mutation",
      {
        readClipboardTextOverride: async () => {
          await Promise.resolve();
          clipboardMutation.portalIframe.setAttribute(
            "src",
            "https://app-block-other.web-sandbox.oaiusercontent.com/runtime"
          );
          return "https://chatgpt.com/s/synthetic-t_q2_a2_clipboard_read_source_mutation";
        }
      }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        copyClicks: clipboardMutation.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: clipboardMutation.counts.clipboard,
        closeClicks: clipboardMutation.closeButton.clickCount,
        nativeSaves: clipboardMutation.counts.save,
        dialogStillMounted: clipboardMutation.driver.document.body.contains(clipboardMutation.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        closeClicks: 0,
        nativeSaves: 0,
        dialogStillMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "the Share source proof must remain valid after the asynchronous clipboard read"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rechecks source proof after the close guard", async () => {
    const closeGuardMutation = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-close-guard-source-mutation"
    });
    let sourceMutations = 0;
    const mutatingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-dialog-close" && sourceMutations === 0) {
          sourceMutations += 1;
          closeGuardMutation.portalIframe.setAttribute(
            "src",
            "https://app-block-other.web-sandbox.oaiusercontent.com/runtime"
          );
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      closeGuardMutation,
      "q2_a2_close_guard_source_mutation",
      { runtimeGuardOverride: mutatingRuntimeGuard }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|relocation|preserve/i.test(String(result?.reason || "")),
        sourceMutations,
        copyClicks: closeGuardMutation.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: closeGuardMutation.counts.clipboard,
        closeClicks: closeGuardMutation.closeButton.clickCount,
        nativeSaves: closeGuardMutation.counts.save,
        dialogStillMounted: closeGuardMutation.driver.document.body.contains(closeGuardMutation.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        sourceMutations: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        closeClicks: 0,
        nativeSaves: 0,
        dialogStillMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "the current response Share proof must survive the awaited close guard"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rechecks global uniqueness after the close guard", async () => {
    const closeGuardSibling = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-close-guard-sibling"
    });
    const competingSurface = makePortalReplacementSurface(closeGuardSibling, {
      testId: "close-guard-copied-competitor"
    });
    competingSurface.copyButton.textContent = "복사됨";
    competingSurface.copyButton.innerText = "복사됨";
    competingSurface.copyButton.setAttribute("aria-label", "복사됨");
    let siblingMounts = 0;
    const remountingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-dialog-close" && siblingMounts === 0) {
          siblingMounts += 1;
          mountPortalSurface(closeGuardSibling, competingSurface.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      closeGuardSibling,
      "q2_a2_close_guard_sibling",
      { runtimeGuardOverride: remountingRuntimeGuard }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        siblingMounts,
        copyClicks: closeGuardSibling.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: closeGuardSibling.counts.clipboard,
        originalCloseClicks: closeGuardSibling.closeButton.clickCount,
        competingCloseClicks: competingSurface.closeButton.clickCount,
        nativeSaves: closeGuardSibling.counts.save,
        originalStillMounted: closeGuardSibling.driver.document.body.contains(closeGuardSibling.shareDialog),
        competingStillMounted: closeGuardSibling.driver.document.body.contains(competingSurface.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        siblingMounts: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        originalCloseClicks: 0,
        competingCloseClicks: 0,
        nativeSaves: 0,
        originalStillMounted: true,
        competingStillMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "the awaited close guard must preserve a unique verified response Share surface"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share accepts verified auto-close during the close guard", async () => {
    const closeGuardAutoClose = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-close-guard-auto-close"
    });
    let autoCloses = 0;
    const autoClosingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-dialog-close" && autoCloses === 0) {
          autoCloses += 1;
          detachPortalSurface(closeGuardAutoClose, closeGuardAutoClose.shareDialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      closeGuardAutoClose,
      "q2_a2_close_guard_auto_close",
      { runtimeGuardOverride: autoClosingRuntimeGuard }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        autoCloses,
        copyClicks: closeGuardAutoClose.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: closeGuardAutoClose.counts.clipboard,
        closeClicks: closeGuardAutoClose.closeButton.clickCount,
        nativeSaves: closeGuardAutoClose.counts.save,
        dialogStillMounted: closeGuardAutoClose.driver.document.body.contains(closeGuardAutoClose.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        autoCloses: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        closeClicks: 0,
        nativeSaves: 1,
        dialogStillMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a fully proven response Share may auto-close during the awaited close guard when no fresh candidate appears: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects an open Copy-success state without a fresh signal", async () => {
    const copiedWithoutSignal = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-copied-open-no-signal"
    });
    copiedWithoutSignal.copyButton.click = () => {
      copiedWithoutSignal.copyButton.clickCount += 1;
      copiedWithoutSignal.copyButton.textContent = "복사됨";
      copiedWithoutSignal.copyButton.innerText = "복사됨";
      copiedWithoutSignal.copyButton.setAttribute("aria-label", "복사됨");
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      copiedWithoutSignal,
      "q2_a2_share_portal_copied_open_no_signal",
      { copySignalOk: false }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        proofFailure: /surface|share|missing|ambiguous/i.test(String(result?.reason || "")),
        copyClicks: copiedWithoutSignal.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: copiedWithoutSignal.counts.clipboard,
        closeClicks: copiedWithoutSignal.closeButton.clickCount,
        nativeSaves: copiedWithoutSignal.counts.save,
        dialogStillMounted: copiedWithoutSignal.driver.document.body.contains(copiedWithoutSignal.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        proofFailure: true,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        dialogStillMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a visible declassified surface without a fresh Copy signal must fail closed"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share accepts unchanged A2 with a proven open Copy-success state", async () => {
    const unchangedCopied = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-unchanged-copied-open",
      retainA2Iframe: true,
      includePortalAppBlock: false
    });
    unchangedCopied.copyButton.click = () => {
      unchangedCopied.copyButton.clickCount += 1;
      unchangedCopied.copyButton.textContent = "복사됨";
      unchangedCopied.copyButton.innerText = "복사됨";
      unchangedCopied.copyButton.setAttribute("aria-label", "복사됨");
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      unchangedCopied,
      "q2_a2_unchanged_copied_open"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        copyClicks: unchangedCopied.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: unchangedCopied.counts.clipboard,
        closeClicks: unchangedCopied.closeButton.clickCount,
        nativeSaves: unchangedCopied.counts.save,
        a2IframeCount: unchangedCopied.restoredAppBlock.querySelectorAll("iframe").length,
        dialogStillMounted: unchangedCopied.driver.document.body.contains(unchangedCopied.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: true,
        stage: "",
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        closeClicks: 1,
        nativeSaves: 1,
        a2IframeCount: 1,
        dialogStillMounted: false,
        manualUrlCalls: 0,
        savedPayload: true
      },
      `a fully unchanged A2 may keep its proven response surface open in Copy-success state: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects unchanged A2 Copy-success wording without a fresh signal", async () => {
    const unchangedNoSignal = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-unchanged-copied-no-signal",
      retainA2Iframe: true,
      includePortalAppBlock: false
    });
    unchangedNoSignal.copyButton.click = () => {
      unchangedNoSignal.copyButton.clickCount += 1;
      unchangedNoSignal.copyButton.textContent = "복사됨";
      unchangedNoSignal.copyButton.innerText = "복사됨";
      unchangedNoSignal.copyButton.setAttribute("aria-label", "복사됨");
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      unchangedNoSignal,
      "q2_a2_unchanged_copied_no_signal",
      { copySignalOk: false }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        copyClicks: unchangedNoSignal.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: unchangedNoSignal.counts.clipboard,
        closeClicks: unchangedNoSignal.closeButton.clickCount,
        nativeSaves: unchangedNoSignal.counts.save,
        dialogStillMounted: unchangedNoSignal.driver.document.body.contains(unchangedNoSignal.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        dialogStillMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "unchanged A2 must not accept Copy-success wording without the fresh signal"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share survives verified Copy auto-close", async () => {
    const autoClosed = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-auto-close",
      autoCloseOnCopy: true
    });
    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      autoClosed,
      "q2_a2_share_portal_auto_close"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        reason: result?.reason || "",
        mode: result?.mode || "",
        shareClicks: autoClosed.responseShareButton.clickCount,
        copyClicks: autoClosed.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: autoClosed.counts.clipboard,
        closeClicks: autoClosed.closeButton.clickCount,
        nativeSaves: autoClosed.counts.save,
        a2IframeCount: autoClosed.restoredAppBlock.querySelectorAll("iframe").length,
        dialogStillMounted: autoClosed.driver.document.body.contains(autoClosed.shareDialog),
        manualUrlCalls
      },
      {
        ok: true,
        stage: "",
        reason: "",
        mode: "previous-qa",
        shareClicks: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        closeClicks: 0,
        nativeSaves: 1,
        a2IframeCount: 0,
        dialogStillMounted: false,
        manualUrlCalls: 0
      },
      `a verified portal must remain valid when Copy auto-closes its final surface: ${result?.stage || "unknown"}/${result?.reason || "unknown"}`
    );
    assert(savedPayload, "the verified auto-close path must reach Native save");
    assert(savedPayload.content.includes("가상화 Q1 원본 질문"));
    assert(savedPayload.content.includes("가상화 A1 원본 답변"));
    assert(savedPayload.content.includes("https://chatgpt.com/s/synthetic-t_q2_a2_share_portal_auto_close"));
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a fresh visible candidate after verified auto-close", async () => {
    const autoClosedSibling = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-auto-close-copied-sibling",
      autoCloseOnCopy: true
    });
    const siblingSurface = makePortalReplacementSurface(autoClosedSibling, {
      testId: "auto-close-copied-sibling"
    });
    siblingSurface.copyButton.textContent = "복사됨";
    siblingSurface.copyButton.innerText = "복사됨";
    siblingSurface.copyButton.setAttribute("aria-label", "복사됨");
    let siblingMounted = 0;
    const siblingRuntimeGuard = {
      ...runtimeGuard,
      check: async phase => {
        if (phase === "share-copy-after-signal" && siblingMounted === 0) {
          siblingMounted += 1;
          mountPortalSurface(autoClosedSibling, siblingSurface.dialog);
        }
        return { ok: true };
      }
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      autoClosedSibling,
      "q2_a2_auto_close_copied_sibling",
      { runtimeGuardOverride: siblingRuntimeGuard }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        siblingMounted,
        copyClicks: autoClosedSibling.copyButton.clickCount,
        copySuccessWaits,
        siblingCopyClicks: siblingSurface.copyButton.clickCount,
        clipboardReads: autoClosedSibling.counts.clipboard,
        siblingCloseClicks: siblingSurface.closeButton.clickCount,
        nativeSaves: autoClosedSibling.counts.save,
        originalDialogMounted: autoClosedSibling.driver.document.body.contains(autoClosedSibling.shareDialog),
        siblingDialogMounted: autoClosedSibling.driver.document.body.contains(siblingSurface.dialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        siblingMounted: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        siblingCopyClicks: 0,
        clipboardReads: 0,
        siblingCloseClicks: 0,
        nativeSaves: 0,
        originalDialogMounted: false,
        siblingDialogMounted: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "auto-close may continue only when no fresh visible Share candidate appears"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects auto-close without a fresh Copy signal", async () => {
    const noSignal = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-auto-close-no-signal",
      autoCloseOnCopy: true
    });
    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      noSignal,
      "q2_a2_share_portal_auto_close_no_signal",
      { copySignalOk: false }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        proofFailure: /surface|share|missing|ambiguous/i.test(String(result?.reason || "")),
        copyClicks: noSignal.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: noSignal.counts.clipboard,
        nativeSaves: noSignal.counts.save,
        dialogStillMounted: noSignal.driver.document.body.contains(noSignal.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        proofFailure: true,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 0,
        nativeSaves: 0,
        dialogStillMounted: false,
        manualUrlCalls: 0,
        savedPayload: false
      },
      `an auto-closed surface without a fresh Copy signal must fail closed: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a different stale surface after Copy", async () => {
    const differentSurface = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-different-stale",
      autoCloseOnCopy: true
    });
    const unrelatedStaleSurface = makeNode({
      attrs: { role: "dialog", "data-testid": "share-dialog", "data-state": "open" },
      children: [makeNode({ tagName: "button", text: "링크 복사" })],
      width: 720,
      height: 640
    });
    unrelatedStaleSurface.isConnected = false;
    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      differentSurface,
      "q2_a2_share_portal_different_stale",
      { copySignalSurface: unrelatedStaleSurface }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        proofFailure: /surface|share|missing|ambiguous/i.test(String(result?.reason || "")),
        copyClicks: differentSurface.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: differentSurface.counts.clipboard,
        nativeSaves: differentSurface.counts.save,
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        proofFailure: true,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0,
        savedPayload: false
      },
      `a stale surface other than the verified portal must fail closed: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share rejects a final surface mounted inside A2", async () => {
    const insideA2 = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-inside-a2-surface",
      retainA2Iframe: true,
      includePortalAppBlock: false
    });
    const moveSurfaceInsideA2 = async () => {
      detachPortalSurface(insideA2, insideA2.shareDialog);
      insideA2.driver.restored.a2.appendChild(insideA2.shareDialog);
      setPortalSurfaceConnection(
        insideA2,
        insideA2.shareDialog,
        true,
        insideA2.driver.restored.a2
      );
      return {
        ok: true,
        kind: "final",
        dialog: insideA2.shareDialog,
        surface: insideA2.shareDialog
      };
    };

    const { result, copySuccessWaits, manualUrlCalls, savedPayload } = await runQ2A2SharePortalBoundary(
      insideA2,
      "q2_a2_inside_a2_surface",
      { waitForRelevantShareDialogOverride: moveSurfaceInsideA2 }
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        reason: result?.reason,
        shareClicks: insideA2.responseShareButton.clickCount,
        copyClicks: insideA2.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: insideA2.counts.clipboard,
        closeClicks: insideA2.closeButton.clickCount,
        nativeSaves: insideA2.counts.save,
        surfaceInsideA2: insideA2.driver.restored.a2.contains(insideA2.shareDialog),
        manualUrlCalls,
        savedPayload: !!savedPayload
      },
      {
        ok: false,
        stage: "share-dialog",
        reason: "verified response Share surface is missing or ambiguous",
        shareClicks: 1,
        copyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        surfaceInsideA2: true,
        manualUrlCalls: 0,
        savedPayload: false
      },
      "a response Share surface nested inside the verified A2 turn must fail closed"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only response Share accepts a strict unchanged A2 beside a copy-only dialog", async () => {
    const unchanged = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-dialog-unchanged",
      retainA2Iframe: true,
      includePortalAppBlock: false
    });
    const { result, copySuccessWaits, manualUrlCalls } = await runQ2A2SharePortalBoundary(
      unchanged,
      "q2_a2_share_dialog_unchanged"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage || "",
        reason: result?.reason || "",
        mode: result?.mode || "",
        shareClicks: unchanged.responseShareButton.clickCount,
        copyClicks: unchanged.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: unchanged.counts.clipboard,
        closeClicks: unchanged.closeButton.clickCount,
        nativeSaves: unchanged.counts.save,
        a2IframeCount: unchanged.restoredAppBlock.querySelectorAll("iframe").length,
        dialogIframeCount: unchanged.shareDialog.querySelectorAll("iframe").length,
        dialogStillMounted: unchanged.driver.document.body.contains(unchanged.shareDialog),
        manualUrlCalls
      },
      {
        ok: true,
        stage: "",
        reason: "",
        mode: "previous-qa",
        shareClicks: 1,
        copyClicks: 1,
        copySuccessWaits: 1,
        clipboardReads: 1,
        closeClicks: 1,
        nativeSaves: 1,
        a2IframeCount: 1,
        dialogIframeCount: 0,
        dialogStillMounted: false,
        manualUrlCalls: 0
      },
      `an exact unchanged A2 must not require iframe portaling: ${result?.stage || "unknown"}/${result?.reason || "unknown"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("share-dialog iframe portaling does not authorize an A2 turn replacement", async () => {
    const replacement = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-replacement",
      replaceA2OnShare: true
    });
    let manualUrlCalls = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-share-portal-replacement",
      replacement.counts,
      () => hooks.handleCopyClick(replacement.clickedSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(replacement.driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightOptions: {
          nativePreflightFn: async () => ({ ok: true, pong: true, native: true }),
          fileLinks: [],
          artifactRows: [],
          readableFiles: []
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          replacement.counts.consent += 1;
          const permissionGranted = await requestPermission();
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          replacement.counts.permission += 1;
          return true;
        },
        shareOptions: {
          root: replacement.driver.document,
          timeoutMs: 40,
          pollMs: 1,
          waitForCopySuccess: async () => ({ ok: true, surface: replacement.shareDialog }),
          readClipboardText: async () => {
            replacement.counts.clipboard += 1;
            return "https://chatgpt.com/s/synthetic-t_replacement_must_not_escape";
          },
          requestManualShareUrl: async () => {
            manualUrlCalls += 1;
            return "";
          }
        },
        extractDownloadFilesFn: async () => ({
          files: [],
          downloadedFiles: [],
          candidatesCount: 0,
          clickedFallback: 0,
          failures: [],
          warnings: []
        }),
        saveObsidianNoteFn: async () => {
          replacement.counts.save += 1;
          return { ok: true };
        }
      })
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        fingerprintFailure: /fingerprint|turn|node|context|remount|changed|mismatch/i
          .test(String(result?.reason || "")),
        shareClicks: replacement.responseShareButton.clickCount,
        copyClicks: replacement.copyButton.clickCount,
        clipboardReads: replacement.counts.clipboard,
        nativeSaves: replacement.counts.save,
        manualUrlCalls
      },
      {
        ok: false,
        stage: "share-dialog",
        fingerprintFailure: true,
        shareClicks: 1,
        copyClicks: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        manualUrlCalls: 0
      },
      `a replaced A2 must fail closed before copy: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("share-dialog iframe relocation requires the exact pre-share A2 source", async () => {
    const sourceMismatch = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-source-mismatch",
      portalIframeUrl: "https://app-block-other.web-sandbox.oaiusercontent.com/runtime"
    });
    const { result, copySuccessWaits, manualUrlCalls } = await runQ2A2SharePortalBoundary(
      sourceMismatch,
      "virtual-q2-a2-share-portal-source-mismatch"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        sourceProofFailure: /source|iframe|relocation|proof|mismatch/i.test(String(result?.reason || "")),
        shareClicks: sourceMismatch.responseShareButton.clickCount,
        copyClicks: sourceMismatch.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: sourceMismatch.counts.clipboard,
        closeClicks: sourceMismatch.closeButton.clickCount,
        nativeSaves: sourceMismatch.counts.save,
        a2IframeCount: sourceMismatch.restoredAppBlock.querySelectorAll("iframe").length,
        portalIframeCount: sourceMismatch.portalAppBlock.querySelectorAll("iframe").length,
        manualUrlCalls
      },
      {
        ok: false,
        stage: "share-dialog",
        sourceProofFailure: true,
        shareClicks: 1,
        copyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        a2IframeCount: 0,
        portalIframeCount: 1,
        manualUrlCalls: 0
      },
      `a different portal iframe source must fail closed before Copy: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("share-dialog iframe duplication is not accepted as relocation", async () => {
    const duplicate = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-share-portal-duplicate",
      retainA2Iframe: true
    });
    const { result, copySuccessWaits, manualUrlCalls } = await runQ2A2SharePortalBoundary(
      duplicate,
      "virtual-q2-a2-share-portal-duplicate"
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        relocationFailure: /source|iframe|relocation|proof|mismatch/i.test(String(result?.reason || "")),
        shareClicks: duplicate.responseShareButton.clickCount,
        copyClicks: duplicate.copyButton.clickCount,
        copySuccessWaits,
        clipboardReads: duplicate.counts.clipboard,
        closeClicks: duplicate.closeButton.clickCount,
        nativeSaves: duplicate.counts.save,
        a2IframeCount: duplicate.restoredAppBlock.querySelectorAll("iframe").length,
        portalIframeCount: duplicate.portalAppBlock.querySelectorAll("iframe").length,
        manualUrlCalls
      },
      {
        ok: false,
        stage: "share-dialog",
        relocationFailure: true,
        shareClicks: 1,
        copyClicks: 0,
        copySuccessWaits: 0,
        clipboardReads: 0,
        closeClicks: 0,
        nativeSaves: 0,
        a2IframeCount: 1,
        portalIframeCount: 1,
        manualUrlCalls: 0
      },
      `duplicating the iframe without removing it from A2 must fail closed before Copy: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("an injected share helper cannot remove the A2 iframe without relocation proof", async () => {
    const missingRelocationProof = makeQ2A2SharePortalBoundary({
      idPrefix: "virtual-q2-a2-injected-share-missing-relocation-proof"
    });
    let injectedShareCalls = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-injected-share-missing-relocation-proof",
      missingRelocationProof.counts,
      () => hooks.handleCopyClick(missingRelocationProof.clickedSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(missingRelocationProof.driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightOptions: {
          nativePreflightFn: async () => ({ ok: true, pong: true, native: true }),
          fileLinks: [],
          artifactRows: [],
          readableFiles: []
        },
        requestShareConsentFn: async () => {
          missingRelocationProof.counts.consent += 1;
          return { approved: true, permissionGranted: false };
        },
        requestClipboardReadPermissionFn: async () => {
          missingRelocationProof.counts.permission += 1;
          return true;
        },
        createShareLinkFn: async () => {
          injectedShareCalls += 1;
          missingRelocationProof.restoredIframe.remove();
          return {
            ok: true,
            url: "https://chatgpt.com/s/synthetic-t_injected_missing_relocation_proof",
            validatedShareUrl: "https://chatgpt.com/s/synthetic-t_injected_missing_relocation_proof",
            source: "existing",
            dialogClosed: true
          };
        },
        shareOptions: {
          root: missingRelocationProof.driver.document,
          readClipboardText: async () => {
            missingRelocationProof.counts.clipboard += 1;
            return "https://chatgpt.com/s/synthetic-t_injected_clipboard_must_not_run";
          }
        },
        extractDownloadFilesFn: async () => ({
          files: [],
          downloadedFiles: [],
          candidatesCount: 0,
          clickedFallback: 0,
          failures: [],
          warnings: []
        }),
        saveObsidianNoteFn: async () => {
          missingRelocationProof.counts.save += 1;
          return { ok: true };
        }
      })
    );

    assert.deepStrictEqual(
      {
        ok: result?.ok,
        stage: result?.stage,
        missingProofFailure: /fingerprint|source|iframe|relocation|proof|context|mismatch/i
          .test(String(result?.reason || "")),
        injectedShareCalls,
        responseShareClicks: missingRelocationProof.responseShareButton.clickCount,
        copyClicks: missingRelocationProof.copyButton.clickCount,
        permissionRequests: missingRelocationProof.counts.permission,
        clipboardReads: missingRelocationProof.counts.clipboard,
        nativeSaves: missingRelocationProof.counts.save,
        a2IframeCount: missingRelocationProof.restoredAppBlock.querySelectorAll("iframe").length
      },
      {
        ok: false,
        stage: "preflight",
        missingProofFailure: true,
        injectedShareCalls: 1,
        responseShareClicks: 0,
        copyClicks: 0,
        permissionRequests: 0,
        clipboardReads: 0,
        nativeSaves: 0,
        a2IframeCount: 0
      },
      `an injected strict URL must not bypass the pre-Native A2 proof: ${result?.reason || "no reason"}`
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only jump without a shared overlap fails closed", async () => {
    const noOverlap = makeVirtualizedCase({
      idPrefix: "virtual-q2-a2-no-overlap",
      q2A2OnlyInitialWindow: true,
      skipQ2A1Overlap: true
    });
    isolateRestoredAssistantHydrationClone(noOverlap.initial.a2);
    isolateRestoredAssistantHydrationClone(noOverlap.restored.a2);
    isolateVirtualizedA1Clone(noOverlap.upper.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "no overlap 저장"
    });
    noOverlap.initial.a2.appendChild(saveButton);
    installDocument(hooks, noOverlap.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-no-overlap",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(noOverlap),
          maxScrollSteps: 3
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "unproven overlap reached preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.notStrictEqual(result.reason, "unproven overlap reached preflight");
    assert.match(String(result.reason || ""), /overlap|recovered|verified|Q1|A1/i);
    assert.deepStrictEqual(noOverlap.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(noOverlap.scrollContainer.scrollTop, noOverlap.originalScrollTop);
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("Q2/A2-only missing frozen-A1 binding stops before consent permission", async () => {
    const missingA1Binding = makeVirtualizedCase({
      idPrefix: "virtual-q2-a2-missing-a1-binding",
      q2A2OnlyInitialWindow: true
    });
    isolateRestoredAssistantHydrationClone(missingA1Binding.initial.a2);
    isolateRestoredAssistantHydrationClone(missingA1Binding.restored.a2);
    isolateVirtualizedA1Clone(missingA1Binding.overlap.a1);
    isolateVirtualizedA1Clone(missingA1Binding.upper.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "missing A1 binding 저장"
    });
    missingA1Binding.initial.a2.appendChild(saveButton);
    installDocument(hooks, missingA1Binding.document);
    const counts = makeBoundaryCounts();
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-q2-a2-missing-a1-binding",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(missingA1Binding),
          maxScrollSteps: 3
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async ({ visualizeContext }) => {
          counts.preflight += 1;
          visualizeContext.hydrationVerification.answerNodeFingerprint = "";
          visualizeContext.answerNode.innerText = "consent 직전 변조된 A1 clone";
          visualizeContext.answerNode.textContent = "consent 직전 변조된 A1 clone";
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: "missing-a1-binding",
            targetTurnId: "virtual-q2-a2-missing-a1-binding-a2"
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          const permissionGranted = await requestPermission();
          return { approved: true, permissionGranted };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /frozen|A1|proof|binding|evidence/i);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  const runPostConsentQ2DriftCase = async ({
    idPrefix,
    driftBeforePermission = false,
    changedQ2Text = "",
    replaceA2 = false,
    duplicateQ2 = false,
    consentRecoveryMountsQ2 = true,
    consentRecoveryMountsA1 = true,
    q2A2OnlyInitialWindow = true,
    consentRecoveryUsesFreshA1 = false,
    addUnknownPredecessor = false,
    remountBeforeConsentReturns = false,
    expectedConsentRetryable = true
  }) => {
    const driver = makeVirtualizedCase({
      idPrefix,
      q2A2OnlyInitialWindow,
      consentRecoveryMountsQ2,
      consentRecoveryMountsA1,
      consentRecoveryUsesFreshA1
    });
    isolateRestoredAssistantHydrationClone(driver.initial.a2);
    isolateRestoredAssistantHydrationClone(driver.restored.a2);
    isolateRestoredAssistantHydrationClone(driver.consentReacquired.a2);
    isolateVirtualizedA1Clone(driver.overlap.a1);
    isolateVirtualizedA1Clone(driver.upper.a1);
    if (!q2A2OnlyInitialWindow) {
      isolateVirtualizedA1Clone(driver.initial.a1);
      isolateVirtualizedA1Clone(driver.restored.a1);
      isolateVirtualizedA1Clone(driver.consentReacquired.a1);
    }
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: `${idPrefix} 저장`
    });
    driver.initial.a2.appendChild(saveButton);
    installDocument(hooks, driver.document);

    const counts = makeBoundaryCounts();
    let shareNode = null;
    let savedPayload = null;
    let preflightVisualizeContext = null;
    let shareContextStatus = null;
    let consentBoundaryStatus = null;
    let consentCallbackVerified = false;
    const originalA2App = driver.restored.a2.querySelector("[data-app-block-preview]");
    const originalA2Runtime = originalA2App?.querySelector("iframe") || null;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          preflightVisualizeContext = visualizeContext;
          assert.strictEqual(currentAssistantNode, driver.restored.a2);
          assert.strictEqual(visualizeContext.visualizeRequestNode, driver.restored.q2);
          assert.strictEqual(
            visualizeContext.hydrationVerification.requireA1AtRestoredWindow,
            !q2A2OnlyInitialWindow
          );
          assert.strictEqual(
            visualizeContext.hydrationVerification.proofKind,
            q2A2OnlyInitialWindow ? "sequential-overlap" : "a1-overlap"
          );
          assert.strictEqual(
            Object.prototype.hasOwnProperty.call(
              visualizeContext.hydrationRecovery,
              "followingNavigationAnchor"
            ),
            false,
            "the initial following-turn geometry anchor must not propagate into post-consent recovery"
          );
          if (!q2A2OnlyInitialWindow) {
            assert.strictEqual(visualizeContext.answerNode, driver.restored.a1);
          }
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: idPrefix,
            targetTurnId: `${idPrefix}-a2`
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          if (driftBeforePermission) {
            driver.simulatePostConsentLayoutDrift({
              changedQ2Text,
              replaceA2,
              duplicateQ2,
              addUnknownPredecessor
            });
            consentBoundaryStatus = hooks.revalidateHydratedVisualizeContext(
              driver.restored.a2,
              preflightVisualizeContext,
              { root: driver.document }
            );
            assert.strictEqual(consentBoundaryStatus?.ok, false);
            if (expectedConsentRetryable !== null) {
              assert.strictEqual(
                consentBoundaryStatus?.retryableMissingHydrationWindow === true ||
                  consentBoundaryStatus?.retryableMissingQ2 === true,
                expectedConsentRetryable,
                expectedConsentRetryable
                  ? "the consent-time live drift must be a verified missing-only hydration window"
                  : "an unknown consent-time predecessor must not be a retryable hydration window"
              );
            }
            if (!q2A2OnlyInitialWindow) {
              assert.strictEqual(driver.restored.a1.isConnected, false);
              assert.strictEqual(
                preflightVisualizeContext.hydrationVerification.requireA1AtRestoredWindow,
                true,
                "the a1-overlap proof must require A1 and Q2 to return together"
              );
            }
            assert.strictEqual(driver.restored.q2.isConnected, false);
            assert.strictEqual(driver.restored.a2.isConnected, true);
            assert.strictEqual(
              driver.document.body.childNodes[0],
              addUnknownPredecessor ? driver.consentUnknownPredecessorTurn : driver.restored.a2Turn
            );
            if (addUnknownPredecessor) {
              assert.strictEqual(driver.document.body.childNodes[1], driver.restored.a2Turn);
            }
            assert.strictEqual(
              driver.restored.a2.querySelector("[data-app-block-preview]"),
              originalA2App,
              "the exact original A2 app must survive the consent-time Q2 unmount"
            );
            assert.strictEqual(
              driver.restored.a2.querySelector("iframe"),
              originalA2Runtime,
              "the exact original A2 app runtime must survive the consent-time anchor unmount"
            );
            assert.strictEqual(preflightVisualizeContext.visualizeAnswerNode, driver.restored.a2);
            assert.strictEqual(
              preflightVisualizeContext.hydrationRecovery.scrollContainer,
              driver.scrollContainer,
              "the verified conversation scroller must remain the same object"
            );
            assert.strictEqual(hooks.__sandbox.location.href, `https://chatgpt.com/c/synthetic-${idPrefix}`);
            assert.strictEqual(runtimeGuard.isAborted(), false);
            assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
            const scrollWritesBeforePermission = driver.scrollWrites.length;
            assert.deepStrictEqual(
              counts,
              { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
              "consent-time Q2 loss must not cross permission, recovery, Share, or Native save"
            );
            const permissionGranted = await requestPermission();
            assert.strictEqual(permissionGranted, false);
            assert.strictEqual(counts.permission, 0, "missing-only Q2 must skip the optional clipboard permission");
            assert.strictEqual(
              driver.scrollWrites.length,
              scrollWritesBeforePermission,
              "the consent callback must not start bounded Q2 recovery"
            );
            assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
            assert.strictEqual(counts.share, 0);
            assert.strictEqual(counts.save, 0);
            if (remountBeforeConsentReturns) {
              mountConversationWindow(driver.document, [
                ...(!q2A2OnlyInitialWindow && consentRecoveryMountsA1
                  ? [driver.consentReacquired.a1Turn]
                  : []),
                ...(consentRecoveryMountsQ2 ? [driver.consentReacquired.q2Turn] : []),
                driver.restored.a2Turn
              ]);
            }
            consentCallbackVerified = true;
            return { approved: true, permissionGranted };
          }
          const permissionGranted = await requestPermission();
          driver.simulatePostConsentLayoutDrift({
            changedQ2Text,
            replaceA2,
            duplicateQ2,
            addUnknownPredecessor
          });
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        createShareLinkFn: async (currentAssistantNode, options) => {
          if (driftBeforePermission) {
            assert.strictEqual(
              preflightVisualizeContext.hydrationRecovery.attempted,
              true,
              "the one-shot Q2 recovery must finish only after consent returns"
            );
            assert.strictEqual(
              preflightVisualizeContext.visualizeRequestNode,
              driver.consentReacquired.q2,
              "Share must use the fresh proof-matching Q2"
            );
            if (!q2A2OnlyInitialWindow) {
              assert.strictEqual(
                preflightVisualizeContext.answerNode,
                driver.consentReacquired.a1,
                "Share must use the fresh proof-matching A1"
              );
              assert.strictEqual(driver.restored.a1.isConnected, false);
              assert.notStrictEqual(driver.consentReacquired.a1.isConnected, false);
            }
            assert.strictEqual(options.shareKind, "response", "the refreshed Share scope must remain response-only");
            assert.strictEqual(counts.share, 0, "Share must remain untouched until post-consent recovery succeeds");
          }
          counts.share += 1;
          shareNode = currentAssistantNode;
          assert.strictEqual(currentAssistantNode, driver.restored.a2, "Q2 recovery must preserve the exact A2 object");
          shareContextStatus = options.validateShareContext?.("test-post-consent-q2-recovery", {
            shareKind: "response"
          }) || null;
          assert.strictEqual(shareContextStatus?.ok, true, "the recovered Q2/original A2 proof must validate at Share entry");
          assert.strictEqual(
            options.clipboardPermissionGranted,
            driftBeforePermission ? false : true,
            "a missing Q2 at the synchronous permission boundary must skip only the optional permission"
          );
          return {
            ok: true,
            url: `https://chatgpt.com/s/synthetic-t_${idPrefix.replace(/[^a-z0-9]+/gi, "_")}`,
            validatedShareUrl: `https://chatgpt.com/s/synthetic-t_${idPrefix.replace(/[^a-z0-9]+/gi, "_")}`,
            source: "existing",
            dialogClosed: true
          };
        },
        saveObsidianNoteFn: async (payload, options) => {
          counts.save += 1;
          savedPayload = payload;
          assert.strictEqual(options.validateContext().ok, true);
          return { ok: true };
        }
      })
    );
    return {
      driver,
      counts,
      result,
      shareNode,
      savedPayload,
      preflightVisualizeContext,
      shareContextStatus,
      consentBoundaryStatus,
      consentCallbackVerified,
      originalA2App,
      originalA2Runtime
    };
  };

  await verifyFocusedBoundary("post-consent lazy layout reacquires only fresh exact Q2 before Share", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-post-consent-q2-drift"
    });

    assert.strictEqual(outcome.result?.ok, true);
    assert.strictEqual(outcome.shareNode, outcome.driver.restored.a2);
    assert.notStrictEqual(outcome.driver.consentReacquired.q2, outcome.driver.restored.q2);
    assert.strictEqual(outcome.driver.restored.q2.isConnected, false);
    assert.notStrictEqual(outcome.driver.consentReacquired.q2.isConnected, false);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeRequestNode, outcome.driver.consentReacquired.q2);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeAnswerNode, outcome.driver.restored.a2);
    assert.strictEqual(outcome.shareContextStatus?.ok, true);
    assert(outcome.savedPayload, "the exact recovered Q2/original A2 pair must reach Native save");
    assert.deepStrictEqual(
      outcome.driver.transitions,
      ["initial", "overlap", "upper", "restored", "consent-drift", "consent-reacquired"]
    );
    assert.strictEqual(outcome.driver.document.body.childNodes[0], outcome.driver.consentReacquired.q2Turn);
    assert.strictEqual(outcome.driver.document.body.childNodes[1], outcome.driver.restored.a2Turn);
    const currentBottomOffset = outcome.driver.scrollContainer.scrollHeight -
      outcome.driver.scrollContainer.clientHeight - outcome.driver.scrollContainer.scrollTop;
    assert(
      outcome.driver.scrollContainer.scrollTop === outcome.driver.originalScrollTop ||
        currentBottomOffset === outcome.driver.originalBottomOffset,
      "Q2 recovery must finish at either the captured absolute position or the preserved bottom offset"
    );
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 1, share: 1, clipboard: 0, save: 1, uri: 0 }
    );
  });

  await verifyFocusedBoundary("post-consent Q2 recovery timeout is one-shot and stops before Share", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-post-consent-q2-never-remounts",
      consentRecoveryMountsQ2: false
    });

    assert.strictEqual(outcome.result?.ok, false);
    assert.strictEqual(outcome.result.stage, "preflight");
    assert.match(String(outcome.result.reason || ""), /reacquired|settle|Q2|target/i);
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 1, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    const scrollWritesBeforeSecondAttempt = outcome.driver.scrollWrites.length;
    const secondRecovery = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-post-consent-q2-never-remounts",
      outcome.counts,
      () => hooks.recoverHydratedVisualizeMissingQ2(
        outcome.driver.restored.a2,
        outcome.preflightVisualizeContext,
        { root: outcome.driver.document, runtimeGuard }
      )
    );
    assert.strictEqual(secondRecovery?.ok, false);
    assert.strictEqual(secondRecovery.reason, "hydrated Visualize Q2 recovery was already attempted");
    assert.strictEqual(
      outcome.driver.scrollWrites.length,
      scrollWritesBeforeSecondAttempt,
      "the spent recovery budget must not issue another scroll"
    );
  });

  await verifyFocusedBoundary("permission-time A1-overlap recovery never accepts Q2 without required A1", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-permission-time-a1-never-remounts",
      driftBeforePermission: true,
      q2A2OnlyInitialWindow: false,
      consentRecoveryMountsQ2: true,
      consentRecoveryMountsA1: false
    });

    assert.strictEqual(outcome.consentCallbackVerified, true);
    assert.strictEqual(outcome.consentBoundaryStatus?.retryableMissingHydrationWindow, true);
    assert.strictEqual(outcome.result?.ok, false);
    assert.strictEqual(outcome.result.stage, "preflight");
    assert.match(String(outcome.result.reason || ""), /A1|reacquired|settle|target/i);
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.strictEqual(
      outcome.driver.document.documentElement.contains(outcome.driver.consentReacquired.q2),
      true
    );
    assert.strictEqual(
      outcome.driver.document.documentElement.contains(outcome.driver.consentReacquired.a1),
      false
    );
    assert.strictEqual(outcome.shareNode, null);
    assert.strictEqual(outcome.savedPayload, null);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    const scrollWritesBeforeSecondAttempt = outcome.driver.scrollWrites.length;
    const secondRecovery = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-permission-time-a1-never-remounts",
      outcome.counts,
      () => hooks.recoverHydratedVisualizeMissingQ2(
        outcome.driver.restored.a2,
        outcome.preflightVisualizeContext,
        { root: outcome.driver.document, runtimeGuard }
      )
    );
    assert.strictEqual(secondRecovery?.ok, false);
    assert.strictEqual(secondRecovery.reason, "hydrated Visualize Q2 recovery was already attempted");
    assert.strictEqual(outcome.driver.scrollWrites.length, scrollWritesBeforeSecondAttempt);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("post-consent Q2 recovery refreshes the production response Share control", async () => {
    const idPrefix = "virtual-post-consent-share-control-refresh";
    const driver = makeVirtualizedCase({ idPrefix, q2A2OnlyInitialWindow: true });
    isolateRestoredAssistantHydrationClone(driver.initial.a2);
    isolateRestoredAssistantHydrationClone(driver.restored.a2);
    isolateVirtualizedA1Clone(driver.overlap.a1);
    isolateVirtualizedA1Clone(driver.upper.a1);
    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "control refresh 초기 저장"
    });
    driver.initial.a2.appendChild(clickedSaveButton);
    const restoredSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "control refresh 복원 저장"
    });
    let staleShareClicks = 0;
    let freshShareClicks = 0;
    const staleShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "Share" },
      text: "Share",
      onClick: () => { staleShareClicks += 1; }
    });
    const freshShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "Share" },
      text: "Share",
      onClick: () => { freshShareClicks += 1; }
    });
    const staleToolbar = makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [restoredSaveButton, staleShareButton]
    });
    const freshToolbar = makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [restoredSaveButton, freshShareButton]
    });
    driver.restored.a2.appendChild(staleToolbar);
    installDocument(hooks, driver.document);

    const counts = makeBoundaryCounts();
    let dialogWaits = 0;
    const sentinelReason = "refreshed response Share control reached dialog wait";
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(clickedSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightFn: async ({ visualizeContext }) => {
          counts.preflight += 1;
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: idPrefix,
            targetTurnId: `${idPrefix}-a2`
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          const permissionGranted = await requestPermission();
          driver.simulatePostConsentLayoutDrift();
          staleToolbar.remove();
          driver.restored.a2.appendChild(freshToolbar);
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        shareOptions: {
          root: driver.document,
          getDialogs: () => [],
          waitForRelevantShareDialog: async () => {
            dialogWaits += 1;
            return { ok: false, stage: "share-dialog", reason: sentinelReason };
          }
        },
        saveObsidianNoteFn: async () => {
          counts.save += 1;
          return { ok: true };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "share-dialog");
    assert.strictEqual(result.reason, sentinelReason);
    assert.strictEqual(staleShareClicks, 0, "the pre-consent response Share control must never be clicked");
    assert.strictEqual(freshShareClicks, 1, "the post-recovery response Share control must be clicked exactly once");
    assert.strictEqual(dialogWaits, 1);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 1, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
  });

  await verifyFocusedBoundary("permission-time missing-only Q2 combines production auto-scroller and real Share-plan refresh", async () => {
    const idPrefix = "virtual-permission-production-scroller-share-refresh";
    let staleToolbar = null;
    let freshToolbar = null;
    const driver = makeVirtualizedCase({
      idPrefix,
      q2A2OnlyInitialWindow: true,
      onPhase: nextPhase => {
        if (nextPhase !== "consent-reacquired") return;
        staleToolbar?.remove();
        driver.restored.a2.appendChild(freshToolbar);
      }
    });
    isolateRestoredAssistantHydrationClone(driver.initial.a2);
    isolateRestoredAssistantHydrationClone(driver.restored.a2);
    isolateVirtualizedA1Clone(driver.overlap.a1);
    isolateVirtualizedA1Clone(driver.upper.a1);
    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "production scroller 초기 저장"
    });
    driver.initial.a2.appendChild(clickedSaveButton);
    const staleSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "production scroller stale 저장"
    });
    const freshSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "production scroller fresh 저장"
    });
    let staleShareClicks = 0;
    let freshShareClicks = 0;
    const staleShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "Share" },
      text: "Share",
      onClick: () => { staleShareClicks += 1; }
    });
    const freshShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "Share" },
      text: "Share",
      onClick: () => { freshShareClicks += 1; }
    });
    staleToolbar = makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [staleSaveButton, staleShareButton]
    });
    freshToolbar = makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [freshSaveButton, freshShareButton]
    });
    driver.restored.a2.appendChild(staleToolbar);

    const outerBody = driver.document.body;
    const initialTurns = Array.from(outerBody.childNodes || []);
    const productionScroller = driver.scrollContainer;
    productionScroller.style.overflowY = "auto";
    outerBody.childNodes = [];
    productionScroller.childNodes = [];
    outerBody.appendChild(productionScroller);
    initialTurns.forEach(turn => productionScroller.appendChild(turn));
    driver.document.body = productionScroller;
    driver.document.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });
    const connectTree = (node, parent = null) => {
      if (!node) return;
      node.parentElement = parent;
      node.ownerDocument = driver.document;
      node.isConnected = true;
      (node.childNodes || []).forEach(child => connectTree(child, node));
    };
    connectTree(driver.document.documentElement, null);
    installDocument(hooks, driver.document);
    assert.strictEqual(
      hooks.resolveConversationScrollContainer(driver.initial.a2Turn, { root: driver.document }),
      productionScroller
    );

    const hydrationConfig = {
      root: driver.document,
      maxScrollSteps: 3,
      scrollStepPx: 500,
      timeoutMs: 100,
      pollMs: 1
    };
    assert.strictEqual("scrollContainer" in hydrationConfig, false);
    const counts = makeBoundaryCounts();
    let preflightVisualizeContext = null;
    let consentBoundaryStatus = null;
    let callbackCounts = null;
    let dialogWaits = 0;
    const sentinelReason = "fresh production response Share control reached dialog wait";
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(clickedSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationConfig,
        alertFn: () => {},
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          preflightVisualizeContext = visualizeContext;
          assert.strictEqual(currentAssistantNode, driver.restored.a2);
          assert.strictEqual(visualizeContext.visualizeRequestNode, driver.restored.q2);
          assert.strictEqual(visualizeContext.visualizeAnswerNode, driver.restored.a2);
          assert.strictEqual(visualizeContext.hydrationRecovery.scrollContainer, productionScroller);
          assert.strictEqual(typeof visualizeContext.hydrationRecovery.resolveCurrentScrollContainer, "function");
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: idPrefix,
            targetTurnId: `${idPrefix}-a2`
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          driver.simulatePostConsentLayoutDrift();
          consentBoundaryStatus = hooks.revalidateHydratedVisualizeContext(
            driver.restored.a2,
            preflightVisualizeContext,
            { root: driver.document }
          );
          assert.strictEqual(consentBoundaryStatus?.retryableMissingQ2, true);
          const scrollWritesBeforePermission = driver.scrollWrites.length;
          const permissionGranted = await requestPermission();
          callbackCounts = { ...counts };
          assert.strictEqual(permissionGranted, false);
          assert.strictEqual(counts.permission, 0);
          assert.strictEqual(driver.scrollWrites.length, scrollWritesBeforePermission);
          assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        shareOptions: {
          root: driver.document,
          getDialogs: () => [],
          waitForRelevantShareDialog: async () => {
            dialogWaits += 1;
            return { ok: false, stage: "share-dialog", reason: sentinelReason };
          }
        },
        saveObsidianNoteFn: async () => {
          counts.save += 1;
          return { ok: true };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "share-dialog");
    assert.strictEqual(result.reason, sentinelReason);
    assert.strictEqual(consentBoundaryStatus?.retryableMissingQ2, true);
    assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.strictEqual(preflightVisualizeContext.visualizeRequestNode, driver.consentReacquired.q2);
    assert.strictEqual(preflightVisualizeContext.visualizeAnswerNode, driver.restored.a2);
    assert.strictEqual(
      hooks.resolveConversationScrollContainer(driver.restored.a2Turn, { root: driver.document }),
      productionScroller
    );
    assert.strictEqual(staleShareClicks, 0);
    assert.strictEqual(freshShareClicks, 1);
    assert.strictEqual(dialogWaits, 1);
    assert.deepStrictEqual(
      callbackCounts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("permission-time missing-only Q2 defers one-shot recovery until after consent", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-permission-time-q2-drift",
      driftBeforePermission: true
    });

    assert.strictEqual(outcome.consentCallbackVerified, true);
    assert.strictEqual(outcome.consentBoundaryStatus?.retryableMissingQ2, true);
    assert.strictEqual(outcome.result?.ok, true);
    assert.strictEqual(outcome.shareNode, outcome.driver.restored.a2);
    assert.strictEqual(outcome.savedPayload !== null, true);
    assert.strictEqual(outcome.driver.restored.q2.isConnected, false);
    assert.notStrictEqual(outcome.driver.consentReacquired.q2.isConnected, false);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeRequestNode, outcome.driver.consentReacquired.q2);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeAnswerNode, outcome.driver.restored.a2);
    assert.strictEqual(
      outcome.driver.restored.a2.querySelector("[data-app-block-preview]"),
      outcome.originalA2App,
      "the fresh Q2 must rejoin the exact original A2 app"
    );
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.deepStrictEqual(
      outcome.driver.transitions,
      ["initial", "overlap", "upper", "restored", "consent-drift", "consent-reacquired"]
    );
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 0, share: 1, clipboard: 0, save: 1, uri: 0 },
      "only post-consent Q2 recovery may reach one same-scope Share and one Native save"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("permission-time missing-only Q2 rebinds an exact natural remount before consent resolves", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-permission-time-q2-natural-remount",
      driftBeforePermission: true,
      remountBeforeConsentReturns: true
    });

    assert.strictEqual(outcome.consentCallbackVerified, true);
    assert.strictEqual(outcome.consentBoundaryStatus?.retryableMissingQ2, true);
    assert.strictEqual(
      outcome.result?.ok,
      true,
      `a fresh proof-matching Q2 that naturally remounts before consent resolves must be rebound: ${outcome.result?.reason || "no reason"}`
    );
    assert(outcome.savedPayload, "the rebound fresh Q2 and exact original A2 must reach Native save");
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeRequestNode, outcome.driver.consentReacquired.q2);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeAnswerNode, outcome.driver.restored.a2);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 0, share: 1, clipboard: 0, save: 1, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("permission-time missing A1 and Q2 rebind exact natural remounts before consent resolves", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-permission-time-a1-q2-natural-remount",
      driftBeforePermission: true,
      q2A2OnlyInitialWindow: false,
      consentRecoveryUsesFreshA1: true,
      remountBeforeConsentReturns: true
    });

    assert.strictEqual(outcome.consentCallbackVerified, true);
    assert.strictEqual(outcome.consentBoundaryStatus?.retryableMissingHydrationWindow, true);
    assert.strictEqual(
      outcome.result?.ok,
      true,
      `fresh proof-matching A1/Q2 that naturally remount before consent resolves must be rebound: ${outcome.result?.reason || "no reason"}`
    );
    assert(outcome.savedPayload, "the rebound fresh A1/Q2 and exact original A2 must reach Native save");
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.strictEqual(outcome.preflightVisualizeContext.answerNode, outcome.driver.consentReacquired.a1);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeRequestNode, outcome.driver.consentReacquired.q2);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeAnswerNode, outcome.driver.restored.a2);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 0, share: 1, clipboard: 0, save: 1, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("permission-time missing required A1+Q2 defers one-shot a1-overlap recovery until after consent", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-permission-time-a1-q2-drift",
      driftBeforePermission: true,
      q2A2OnlyInitialWindow: false,
      consentRecoveryUsesFreshA1: true
    });

    assert.strictEqual(outcome.consentCallbackVerified, true);
    assert.strictEqual(outcome.consentBoundaryStatus?.ok, false);
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationVerification.proofKind, "a1-overlap");
    assert.strictEqual(
      outcome.preflightVisualizeContext.hydrationVerification.requireA1AtRestoredWindow,
      true
    );
    assert.strictEqual(
      outcome.result?.ok,
      true,
      `verified missing A1/Q2 must defer recovery until consent returns: ${outcome.result?.reason || "no reason"}`
    );
    assert.strictEqual(outcome.shareNode, outcome.driver.restored.a2);
    assert(outcome.savedPayload, "the recovered A1/Q2 proof and exact original A2 must reach Native save");
    assert.strictEqual(outcome.driver.restored.a1.isConnected, false);
    assert.strictEqual(outcome.driver.restored.q2.isConnected, false);
    assert.notStrictEqual(outcome.driver.consentReacquired.a1, outcome.driver.restored.a1);
    assert.notStrictEqual(outcome.driver.consentReacquired.q2, outcome.driver.restored.q2);
    assert.notStrictEqual(outcome.driver.consentReacquired.a1.isConnected, false);
    assert.notStrictEqual(outcome.driver.consentReacquired.q2.isConnected, false);
    assert.strictEqual(outcome.preflightVisualizeContext.answerNode, outcome.driver.consentReacquired.a1);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeRequestNode, outcome.driver.consentReacquired.q2);
    assert.strictEqual(outcome.preflightVisualizeContext.visualizeAnswerNode, outcome.driver.restored.a2);
    assert.strictEqual(outcome.driver.document.body.childNodes[0], outcome.driver.consentReacquired.a1Turn);
    assert.strictEqual(outcome.driver.document.body.childNodes[1], outcome.driver.consentReacquired.q2Turn);
    assert.strictEqual(outcome.driver.document.body.childNodes[2], outcome.driver.restored.a2Turn);
    assert.strictEqual(
      outcome.driver.restored.a2.querySelector("[data-app-block-preview]"),
      outcome.originalA2App
    );
    assert.strictEqual(outcome.driver.restored.a2.querySelector("iframe"), outcome.originalA2Runtime);
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.scrollContainer, outcome.driver.scrollContainer);
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.deepStrictEqual(
      outcome.driver.transitions,
      ["initial", "upper", "restored", "consent-drift", "consent-reacquired"]
    );
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 0, share: 1, clipboard: 0, save: 1, uri: 0 },
      "only post-consent A1/Q2 recovery may reach one response Share and one Native save"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("permission-time unknown predecessor is terminal before optional permission", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-permission-time-unknown-predecessor",
      driftBeforePermission: true,
      addUnknownPredecessor: true,
      expectedConsentRetryable: false
    });

    assert.strictEqual(outcome.consentCallbackVerified, true);
    assert.strictEqual(outcome.consentBoundaryStatus?.ok, false);
    assert.strictEqual(outcome.consentBoundaryStatus?.retryableMissingHydrationWindow, false);
    assert.strictEqual(outcome.result?.ok, false);
    assert.strictEqual(outcome.result.stage, "preflight");
    assert.match(String(outcome.result.reason || ""), /context|predecessor|changed/i);
    assert.strictEqual(outcome.preflightVisualizeContext.hydrationRecovery.attempted, false);
    assert.strictEqual(outcome.shareNode, null);
    assert.strictEqual(outcome.savedPayload, null);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("permission-time tool-wrapped role predecessor is terminal before optional permission", async () => {
    const idPrefix = "virtual-permission-time-tool-wrapped-predecessor";
    const driver = makeVirtualizedCase({ idPrefix, q2A2OnlyInitialWindow: true });
    isolateRestoredAssistantHydrationClone(driver.initial.a2);
    isolateRestoredAssistantHydrationClone(driver.restored.a2);
    isolateVirtualizedA1Clone(driver.overlap.a1);
    isolateVirtualizedA1Clone(driver.upper.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "tool wrapped predecessor 저장"
    });
    driver.initial.a2.appendChild(saveButton);
    installDocument(hooks, driver.document);

    const wrappedUser = makeNode({
      attrs: { "data-message-author-role": "user" },
      text: virtualizationRequest
    });
    const toolWrappedDuplicateQ2 = makeNode({
      attrs: {
        "data-testid": `${driver.restored.q2Turn.getAttribute("data-testid")}-tool-wrapper`,
        "data-turn": "tool",
        "data-turn-id": driver.restored.q2Turn.getAttribute("data-turn-id")
      },
      children: [wrappedUser]
    });
    const counts = makeBoundaryCounts();
    let preflightVisualizeContext = null;
    let consentBoundaryStatus = null;
    let callbackCounts = null;
    let scrollWritesAtConsent = -1;
    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          ...hydrationOptions(driver),
          maxScrollSteps: 3
        },
        alertFn: () => {},
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          preflightVisualizeContext = visualizeContext;
          assert.strictEqual(currentAssistantNode, driver.restored.a2);
          assert.strictEqual(visualizeContext.visualizeRequestNode, driver.restored.q2);
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: idPrefix,
            targetTurnId: `${idPrefix}-a2`
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          mountConversationWindow(driver.document, [
            toolWrappedDuplicateQ2,
            driver.restored.a2Turn
          ]);
          assert.strictEqual(toolWrappedDuplicateQ2.isConnected, true);
          assert.strictEqual(wrappedUser.isConnected, true);
          assert.strictEqual(driver.restored.q2.isConnected, false);
          assert.strictEqual(driver.restored.a2.isConnected, true);
          consentBoundaryStatus = hooks.revalidateHydratedVisualizeContext(
            driver.restored.a2,
            preflightVisualizeContext,
            { root: driver.document }
          );
          scrollWritesAtConsent = driver.scrollWrites.length;
          const permissionGranted = await requestPermission();
          callbackCounts = { ...counts };
          assert.strictEqual(counts.permission, 0);
          assert.strictEqual(counts.share, 0);
          assert.strictEqual(counts.save, 0);
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        createShareLinkFn: async () => {
          counts.share += 1;
          return {
            ok: true,
            url: "https://chatgpt.com/s/synthetic-t_tool_wrapped_predecessor_must_not_share",
            validatedShareUrl: "https://chatgpt.com/s/synthetic-t_tool_wrapped_predecessor_must_not_share",
            source: "existing",
            dialogClosed: true
          };
        },
        saveObsidianNoteFn: async () => {
          counts.save += 1;
          return { ok: true };
        }
      })
    );

    assert.strictEqual(consentBoundaryStatus?.ok, false);
    assert.strictEqual(
      consentBoundaryStatus?.retryableMissingHydrationWindow,
      false,
      "a skipped tool wrapper must not hide its role-bearing frozen-Q2 duplicate from the consent guard"
    );
    assert.strictEqual(consentBoundaryStatus?.retryableMissingQ2, false);
    assert.deepStrictEqual(
      callbackCounts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /predecessor|context|changed|ambiguous|duplicate/i);
    assert.strictEqual(
      preflightVisualizeContext.hydrationRecovery.attempted,
      false,
      "a role-bearing predecessor conflict must not spend the post-consent recovery"
    );
    assert.strictEqual(
      driver.scrollWrites.length,
      scrollWritesAtConsent,
      "a role-bearing predecessor conflict must not start a recovery scroll"
    );
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  const permissionTimeConflictCases = [
    {
      label: "changed Q2",
      idPrefix: "virtual-permission-time-changed-q2",
      mutate(driver) {
        driver.consentReacquired.q2.innerText = "바로 위가 아닌 다른 답변을 Visualize";
        driver.consentReacquired.q2.textContent = "바로 위가 아닌 다른 답변을 Visualize";
        mountConversationWindow(driver.document, [
          driver.consentReacquired.q2Turn,
          driver.restored.a2Turn
        ]);
      },
      expectedReason: /fingerprint|request|context|changed|mismatch/i
    },
    {
      label: "duplicate Q2",
      idPrefix: "virtual-permission-time-duplicate-q2",
      mutate(driver) {
        mountConversationWindow(driver.document, [
          driver.restored.q2Turn,
          driver.consentDuplicate.q2Turn,
          driver.restored.a2Turn
        ]);
      },
      expectedReason: /duplicate|identity|ambiguous|conflict|context/i
    },
    {
      label: "replacement A2",
      idPrefix: "virtual-permission-time-replacement-a2",
      mutate(driver) {
        mountConversationWindow(driver.document, [
          driver.restored.q2Turn,
          driver.consentReacquired.a2Turn
        ]);
      },
      expectedReason: /A2|turn|context|changed|remount/i
    },
    {
      label: "runtime checkSync failure",
      idPrefix: "virtual-permission-time-runtime-sync-failure",
      runtimeFailure: true,
      expectedReason: /runtime|generation|unavailable/i
    }
  ];
  for (const conflictCase of permissionTimeConflictCases) {
    await verifyFocusedBoundary(`permission-time ${conflictCase.label} stops before optional permission`, async () => {
      const driver = makeVirtualizedCase({
        idPrefix: conflictCase.idPrefix,
        q2A2OnlyInitialWindow: true
      });
      isolateRestoredAssistantHydrationClone(driver.initial.a2);
      isolateRestoredAssistantHydrationClone(driver.restored.a2);
      isolateVirtualizedA1Clone(driver.overlap.a1);
      isolateVirtualizedA1Clone(driver.upper.a1);
      const saveButton = makeNode({
        tagName: "button",
        attrs: { class: "gpt2obs-btn" },
        text: `${conflictCase.label} 저장`
      });
      driver.initial.a2.appendChild(saveButton);
      installDocument(hooks, driver.document);

      const counts = makeBoundaryCounts();
      let preflightVisualizeContext = null;
      let consentBoundaryStatus = null;
      let callbackCounts = null;
      let guardedPermissionInvocations = 0;
      let scrollWritesAtConsent = -1;
      const caseRuntimeGuard = conflictCase.runtimeFailure
        ? {
          ...runtimeGuard,
          checkSync: phase => phase === "visualize-consent-permission"
            ? { ok: false, error: "runtime generation changed at consent permission" }
            : { ok: true }
        }
        : runtimeGuard;
      const result = await runOnBoundaryRoute(
        `https://chatgpt.com/c/synthetic-${conflictCase.idPrefix}`,
        counts,
        () => hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard: caseRuntimeGuard,
          visualizeHydrationOptions: {
            ...hydrationOptions(driver),
            maxScrollSteps: 3
          },
          alertFn: () => {},
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            preflightVisualizeContext = visualizeContext;
            assert.strictEqual(currentAssistantNode, driver.restored.a2);
            assert.strictEqual(visualizeContext.visualizeRequestNode, driver.restored.q2);
            assert.strictEqual(visualizeContext.visualizeAnswerNode, driver.restored.a2);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: conflictCase.idPrefix,
              targetTurnId: `${conflictCase.idPrefix}-a2`
            });
          },
          requestShareConsentFn: async ({ requestPermission }) => {
            counts.consent += 1;
            conflictCase.mutate?.(driver);
            consentBoundaryStatus = hooks.revalidateHydratedVisualizeContext(
              driver.restored.a2,
              preflightVisualizeContext,
              { root: driver.document }
            );
            scrollWritesAtConsent = driver.scrollWrites.length;
            guardedPermissionInvocations += 1;
            const permissionGranted = await requestPermission();
            callbackCounts = { ...counts };
            assert.strictEqual(permissionGranted, false);
            assert.strictEqual(counts.permission, 0);
            assert.strictEqual(driver.scrollWrites.length, scrollWritesAtConsent);
            assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
            return { approved: true, permissionGranted };
          },
          requestClipboardReadPermissionFn: async () => {
            counts.permission += 1;
            return true;
          },
          createShareLinkFn: async () => {
            counts.share += 1;
            return {
              ok: true,
              url: "https://chatgpt.com/s/synthetic-t_permission_conflict_must_not_share",
              validatedShareUrl: "https://chatgpt.com/s/synthetic-t_permission_conflict_must_not_share",
              source: "existing",
              dialogClosed: true
            };
          },
          saveObsidianNoteFn: async () => {
            counts.save += 1;
            return { ok: true };
          }
        })
      );

      assert.strictEqual(guardedPermissionInvocations, 1);
      if (conflictCase.runtimeFailure) {
        assert.strictEqual(consentBoundaryStatus?.ok, true);
        assert.strictEqual(result.stage, "runtime");
      } else {
        assert.strictEqual(consentBoundaryStatus?.ok, false);
        assert.strictEqual(consentBoundaryStatus?.retryableMissingHydrationWindow === true, false);
        assert.strictEqual(consentBoundaryStatus?.retryableMissingQ2 === true, false);
        assert.strictEqual(result.stage, "preflight");
      }
      assert.strictEqual(result?.ok, false);
      assert.match(String(result.reason || result.error || ""), conflictCase.expectedReason);
      assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
      assert.strictEqual(driver.scrollWrites.length, scrollWritesAtConsent);
      assert.deepStrictEqual(
        callbackCounts,
        { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      );
      assert.deepStrictEqual(
        counts,
        { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
      );
      assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
    });
  }

  await verifyFocusedBoundary("post-consent Q2 fingerprint change remains fail-closed", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-post-consent-q2-changed",
      changedQ2Text: "바로 위가 아닌 다른 내용을 Visualize"
    });

    assert.strictEqual(outcome.result?.ok, false);
    assert.strictEqual(outcome.result.stage, "preflight");
    assert.match(String(outcome.result.reason || ""), /fingerprint|request|marker|changed|mismatch/i);
    assert.strictEqual(outcome.shareNode, null);
    assert.strictEqual(outcome.savedPayload, null);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 1, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
  });

  await verifyFocusedBoundary("post-consent A2 replacement is never eligible for Q2-only recovery", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-post-consent-a2-replaced",
      replaceA2: true
    });

    assert.strictEqual(outcome.result?.ok, false);
    assert.strictEqual(outcome.result.stage, "preflight");
    assert.match(String(outcome.result.reason || ""), /turn|context|changed|remount|A2/i);
    assert.strictEqual(outcome.shareNode, null);
    assert.strictEqual(outcome.savedPayload, null);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 1, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
  });

  await verifyFocusedBoundary("post-consent duplicate Q2 identity stops the one-shot recovery", async () => {
    const outcome = await runPostConsentQ2DriftCase({
      idPrefix: "virtual-post-consent-q2-duplicate",
      duplicateQ2: true
    });

    assert.strictEqual(outcome.result?.ok, false);
    assert.strictEqual(outcome.result.stage, "preflight");
    assert.match(String(outcome.result.reason || ""), /duplicate|identity|ambiguous|conflict/i);
    assert.strictEqual(outcome.shareNode, null);
    assert.strictEqual(outcome.savedPayload, null);
    assert.deepStrictEqual(
      outcome.counts,
      { preflight: 1, consent: 1, permission: 1, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
  });

  await verifyFocusedBoundary("consent-time hydrated turn remount stops before Share", async () => {
    const consentRemount = makeVirtualizedCase({ idPrefix: "virtual-consent-remount" });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "consent remount 저장" });
    consentRemount.initial.a2.appendChild(saveButton);
    installDocument(hooks, consentRemount.document);
    const counts = makeBoundaryCounts();
    const route = "https://chatgpt.com/c/synthetic-virtual-consent-remount";
    let observedRouteAfterResult = "";
    const result = await runOnBoundaryRoute(
      route,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: hydrationOptions(consentRemount),
          ...noExternalBoundaryOptions(counts),
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            assert.strictEqual(currentAssistantNode, consentRemount.restored.a2);
            assert.strictEqual(visualizeContext.hydratedFromVirtualizedTurns, true);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: "consent-turn-remount",
              targetTurnId: "virtual-consent-remount-a2"
            });
          },
          requestShareConsentFn: async () => {
            counts.consent += 1;
            const changedA1 = makeConversationTurn(
              "assistant",
              "consent 도중 fingerprint가 달라진 A1",
              [],
              "virtual-consent-remount-a1"
            );
            mountConversationWindow(consentRemount.document, [
              changedA1,
              consentRemount.restored.q2Turn,
              consentRemount.restored.a2Turn
            ]);
            return { approved: true, permissionGranted: false };
          }
        });
        observedRouteAfterResult = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.deepStrictEqual(consentRemount.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(observedRouteAfterResult, route);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "hydrated turn remount after consent must stop before every external boundary"
    );
    assert.strictEqual(result?.ok, false);
    assert(["preflight", "share-confirm"].includes(result.stage), "turn-remount stop must remain a pre-Share failure");
    assert.match(String(result.reason || ""), /fingerprint|turn|context|changed|remount/i);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("consent-time route change blocks clipboard permission before Share", async () => {
    const consentPermissionRouteChange = makeVirtualizedCase({
      idPrefix: "virtual-consent-permission-route-change"
    });
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "consent permission route 저장"
    });
    consentPermissionRouteChange.initial.a2.appendChild(saveButton);
    installDocument(hooks, consentPermissionRouteChange.document);
    const counts = makeBoundaryCounts();
    const sourceRoute = "https://chatgpt.com/c/synthetic-virtual-consent-permission-route-source";
    const destinationRoute = "https://chatgpt.com/c/synthetic-virtual-consent-permission-route-destination";
    let observedRouteAfterResult = "";
    const result = await runOnBoundaryRoute(
      sourceRoute,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(saveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: hydrationOptions(consentPermissionRouteChange),
          ...noExternalBoundaryOptions(counts),
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            assert.strictEqual(currentAssistantNode, consentPermissionRouteChange.restored.a2);
            assert.strictEqual(visualizeContext.hydratedFromVirtualizedTurns, true);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: "consent-permission-route-change",
              targetTurnId: "virtual-consent-permission-route-change-a2"
            });
          },
          requestShareConsentFn: async ({ requestPermission }) => {
            counts.consent += 1;
            hooks.__sandbox.location.href = destinationRoute;
            const permissionGranted = await requestPermission();
            return { approved: true, permissionGranted };
          }
        });
        observedRouteAfterResult = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.deepStrictEqual(consentPermissionRouteChange.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(observedRouteAfterResult, destinationRoute);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "a consent-time route change must stop before clipboard permission and every later external boundary"
    );
    assert.strictEqual(result?.ok, false);
    assert(["preflight", "share-confirm"].includes(result.stage));
    assert.match(String(result.reason || ""), /route|conversation.*changed/i);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("share-button runtime-guard route change stops hydrated Share click", async () => {
    const guardedRouteChange = makeVirtualizedCase({
      idPrefix: "virtual-share-button-route-change"
    });
    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "guard route 저장"
    });
    guardedRouteChange.initial.a2.appendChild(clickedSaveButton);
    isolateRestoredAssistantHydrationClone(guardedRouteChange.initial.a2);
    const counts = makeBoundaryCounts();
    const restoredSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "guard route 복원 저장"
    });
    // The broad fake returns itself from cloneNode(); keep fingerprint cleanup
    // from deleting the live restored toolbar that this TOCTOU case needs.
    isolateRestoredAssistantHydrationClone(guardedRouteChange.restored.a2);
    const externalShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "Share" },
      text: "Share",
      onClick: () => { counts.share += 1; }
    });
    guardedRouteChange.restored.a2.appendChild(makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [restoredSaveButton, externalShareButton]
    }));
    installDocument(hooks, guardedRouteChange.document);

    const sourceRoute = "https://chatgpt.com/c/synthetic-virtual-share-button-route-source";
    const destinationRoute = "https://chatgpt.com/c/synthetic-virtual-share-button-route-destination";
    const guardPhases = [];
    const shareButtonRuntimeGuard = {
      checkSync: () => ({ ok: true }),
      check: async phase => {
        guardPhases.push(phase);
        if (phase === "share-button") {
          await Promise.resolve();
          hooks.__sandbox.location.href = destinationRoute;
        }
        return { ok: true };
      },
      isAborted: () => false,
      getFailure: () => null,
      fail: () => ({ ok: false }),
      notify: () => {}
    };
    let observedRouteAfterResult = "";
    const result = await runOnBoundaryRoute(
      sourceRoute,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(clickedSaveButton, {
          delayMs: 0,
          runtimeGuard: shareButtonRuntimeGuard,
          visualizeHydrationOptions: hydrationOptions(guardedRouteChange),
          confirmFn: () => false,
          alertFn: () => {},
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            assert.strictEqual(currentAssistantNode, guardedRouteChange.restored.a2);
            assert.strictEqual(visualizeContext.hydratedFromVirtualizedTurns, true);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: "share-button-route-change",
              targetTurnId: "virtual-share-button-route-change-a2"
            });
          },
          requestShareConsentFn: async () => {
            counts.consent += 1;
            return { approved: true, permissionGranted: false };
          },
          requestClipboardReadPermissionFn: async () => {
            counts.permission += 1;
            return false;
          },
          shareOptions: {
            root: guardedRouteChange.document,
            getDialogs: () => [],
            waitForRelevantShareDialog: async () => ({
              ok: false,
              stage: "share-dialog",
              reason: "route-changing share-button guard must stop before dialog wait"
            }),
            readClipboardText: async () => {
              counts.clipboard += 1;
              return "https://chatgpt.com/s/synthetic-t_share_button_guard_must_not_read";
            }
          },
          saveObsidianNoteFn: async () => {
            counts.save += 1;
            return { ok: true };
          }
        });
        observedRouteAfterResult = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.deepStrictEqual(guardedRouteChange.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(observedRouteAfterResult, destinationRoute, "the stale attempt must not navigate back after the awaited guard observes a new route");
    assert.strictEqual(
      guardPhases.filter(phase => phase === "share-button").length,
      1,
      "the regression must change route inside createOrReuseVisualizeShareLink's awaited share-button guard"
    );
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "a route change inside the awaited share-button guard must stop before Share, clipboard, Native, or URI boundaries"
    );
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "share-button");
    assert.match(String(result.reason || ""), /route|conversation.*changed/i);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("share-dialog wait route change stops hydrated copy and Native boundaries", async () => {
    const dialogRouteChange = makeVirtualizedCase({
      idPrefix: "virtual-share-dialog-route-change"
    });
    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "dialog route 저장"
    });
    dialogRouteChange.initial.a2.appendChild(clickedSaveButton);
    isolateRestoredAssistantHydrationClone(dialogRouteChange.initial.a2);
    const counts = makeBoundaryCounts();
    const restoredSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "dialog route 복원 저장"
    });
    isolateRestoredAssistantHydrationClone(dialogRouteChange.restored.a2);
    const externalShareButton = makeNode({
      tagName: "button",
      attrs: { "data-testid": "share-response", "aria-label": "Share" },
      text: "Share",
      onClick: () => { counts.share += 1; }
    });
    dialogRouteChange.restored.a2.appendChild(makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [restoredSaveButton, externalShareButton]
    }));
    const copyShareLinkButton = makeNode({
      tagName: "button",
      attrs: { "aria-label": "Copy link" },
      text: "Copy link"
    });
    const copySurface = makeNode({
      attrs: { role: "dialog", "data-testid": "share-dialog", "data-state": "open" },
      children: [copyShareLinkButton]
    });
    installDocument(hooks, dialogRouteChange.document);

    const sourceRoute = "https://chatgpt.com/c/synthetic-virtual-share-dialog-route-source";
    const destinationRoute = "https://chatgpt.com/c/synthetic-virtual-share-dialog-route-destination";
    let observedRouteAfterResult = "";
    let dialogWaits = 0;
    const result = await runOnBoundaryRoute(
      sourceRoute,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(clickedSaveButton, {
          delayMs: 0,
          runtimeGuard,
          visualizeHydrationOptions: hydrationOptions(dialogRouteChange),
          confirmFn: () => false,
          alertFn: () => {},
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            assert.strictEqual(currentAssistantNode, dialogRouteChange.restored.a2);
            assert.strictEqual(visualizeContext.hydratedFromVirtualizedTurns, true);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: "share-dialog-route-change",
              targetTurnId: "virtual-share-dialog-route-change-a2"
            });
          },
          requestShareConsentFn: async () => {
            counts.consent += 1;
            return { approved: true, permissionGranted: true };
          },
          requestClipboardReadPermissionFn: async () => {
            counts.permission += 1;
            return true;
          },
          shareOptions: {
            root: dialogRouteChange.document,
            getDialogs: () => [],
            waitForRelevantShareDialog: async () => {
              dialogWaits += 1;
              await Promise.resolve();
              hooks.__sandbox.location.href = destinationRoute;
              return { ok: true, kind: "final", dialog: copySurface };
            },
            waitForCopySuccess: async () => ({ ok: true, surface: copySurface }),
            readClipboardText: async () => {
              counts.clipboard += 1;
              return "https://chatgpt.com/s/synthetic-t_share_dialog_guard_must_not_read";
            },
            requestManualShareUrl: async () => ""
          },
          extractDownloadFilesFn: async () => ({
            files: [],
            downloadedFiles: [],
            candidatesCount: 0,
            clickedFallback: 0,
            failures: [],
            warnings: []
          }),
          saveObsidianNoteFn: async () => {
            counts.save += 1;
            return { ok: true };
          }
        });
        observedRouteAfterResult = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.deepStrictEqual(dialogRouteChange.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(dialogWaits, 1, "the regression must change route inside the awaited response share-dialog wait");
    assert.strictEqual(observedRouteAfterResult, destinationRoute, "the stale attempt must leave the user's new route untouched");
    assert.deepStrictEqual(
      {
        preflight: counts.preflight,
        consent: counts.consent,
        permission: counts.permission,
        share: counts.share,
        copy: copyShareLinkButton.clickCount,
        clipboard: counts.clipboard,
        save: counts.save,
        uri: counts.uri
      },
      { preflight: 1, consent: 1, permission: 0, share: 1, copy: 0, clipboard: 0, save: 0, uri: 0 },
      "a route change during the awaited share-dialog wait may follow the initial Share click but must stop before copy, clipboard, Native, or URI boundaries"
    );
    assert.strictEqual(result?.ok, false);
    assert(["preflight", "share-button", "share-dialog"].includes(result.stage));
    assert.match(String(result.reason || ""), /route|conversation.*changed/i);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("native-save runtime-guard route change stops hydrated Native dispatch", async () => {
    const nativeRouteChange = makeVirtualizedCase({
      idPrefix: "virtual-native-save-route-change"
    });
    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "native route 저장"
    });
    nativeRouteChange.initial.a2.appendChild(clickedSaveButton);
    isolateRestoredAssistantHydrationClone(nativeRouteChange.initial.a2);
    isolateRestoredAssistantHydrationClone(nativeRouteChange.restored.a2);
    installDocument(hooks, nativeRouteChange.document);

    const counts = makeBoundaryCounts();
    const sourceRoute = "https://chatgpt.com/c/synthetic-virtual-native-save-route-source";
    const destinationRoute = "https://chatgpt.com/c/synthetic-virtual-native-save-route-destination";
    const guardPhases = [];
    let shareResolved = false;
    let shareResolvedBeforeNativeGuard = false;
    let productionSaveCalls = 0;
    let nativeDispatches = 0;
    let observedRouteAfterResult = "";
    const nativeSaveRuntimeGuard = {
      checkSync: () => ({ ok: true }),
      check: async phase => {
        guardPhases.push(phase);
        if (phase === "native-save") {
          shareResolvedBeforeNativeGuard = shareResolved;
          await Promise.resolve();
          hooks.__sandbox.location.href = destinationRoute;
        }
        return { ok: true };
      },
      isAborted: () => false,
      getFailure: () => null,
      fail: () => ({ ok: false }),
      notify: () => {}
    };
    const result = await runOnBoundaryRoute(
      sourceRoute,
      counts,
      async () => {
        const outcome = await hooks.handleCopyClick(clickedSaveButton, {
          delayMs: 0,
          runtimeGuard: nativeSaveRuntimeGuard,
          visualizeHydrationOptions: hydrationOptions(nativeRouteChange),
          confirmFn: () => false,
          alertFn: () => {},
          preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
            counts.preflight += 1;
            assert.strictEqual(currentAssistantNode, nativeRouteChange.restored.a2);
            assert.strictEqual(visualizeContext.hydratedFromVirtualizedTurns, true);
            return completePreviousQaBoundaryPreflight({
              visualizeContext,
              title: "native-save-route-change",
              targetTurnId: "virtual-native-save-route-change-a2"
            });
          },
          requestShareConsentFn: async () => {
            counts.consent += 1;
            return { approved: true, permissionGranted: false };
          },
          requestClipboardReadPermissionFn: async () => {
            counts.permission += 1;
            return false;
          },
          createShareLinkFn: async () => {
            counts.share += 1;
            shareResolved = true;
            return {
              ok: true,
              url: "https://chatgpt.com/s/synthetic-t_native_save_route_guard",
              validatedShareUrl: "https://chatgpt.com/s/synthetic-t_native_save_route_guard",
              source: "existing"
            };
          },
          shareOptions: {
            root: nativeRouteChange.document,
            readClipboardText: async () => {
              counts.clipboard += 1;
              return "https://chatgpt.com/s/synthetic-t_native_save_route_guard_must_not_read";
            }
          },
          extractDownloadFilesFn: async () => ({
            files: [],
            downloadedFiles: [],
            candidatesCount: 0,
            clickedFallback: 0,
            failures: [],
            warnings: []
          }),
          saveObsidianNoteFn: (payload, options) => {
            productionSaveCalls += 1;
            return hooks.saveObsidianNote(payload, {
              ...options,
              sendMessage: async message => {
                if (message?.type === "save-obsidian-note") nativeDispatches += 1;
                return {
                  ok: true,
                  attachments: [],
                  attachmentAudit: { writtenRequestedNames: [] },
                  warnings: []
                };
              },
              openUri: () => { counts.uri += 1; },
              showAlert: () => {}
            });
          }
        });
        observedRouteAfterResult = hooks.__sandbox.location.href;
        return outcome;
      }
    );

    assert.deepStrictEqual(nativeRouteChange.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(shareResolvedBeforeNativeGuard, true, "the strict Share URL must resolve before the native-save guard changes route");
    assert.strictEqual(
      guardPhases.filter(phase => phase === "native-save").length,
      1,
      "the regression must change route inside saveObsidianNote's awaited native-save guard"
    );
    assert.strictEqual(productionSaveCalls, 1, "the hydrated flow must exercise the production saveObsidianNote boundary");
    assert.strictEqual(observedRouteAfterResult, destinationRoute, "the stale save must leave the user's new route untouched");
    assert.deepStrictEqual(
      {
        shareResolution: counts.share,
        clipboard: counts.clipboard,
        nativeDispatches,
        uri: counts.uri
      },
      { shareResolution: 1, clipboard: 0, nativeDispatches: 0, uri: 0 },
      "a route change inside the awaited native-save guard must stop before Native sender or URI dispatch"
    );
    assert.strictEqual(result?.ok, false);
    assert(["preflight", "runtime", "native-save"].includes(result.stage));
    assert.match(String(result.reason || result.error || ""), /route|conversation.*changed/i);
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("duplicate restored save buttons use verified A2 as the internal anchor", async () => {
    const duplicateButtons = makeVirtualizedCase({
      idPrefix: "virtual-duplicate-restored-save-buttons"
    });
    const clickedSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "duplicate anchor 저장"
    });
    duplicateButtons.initial.a2.appendChild(clickedSaveButton);
    isolateRestoredAssistantHydrationClone(duplicateButtons.initial.a2);
    const firstRestoredSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "복원 저장 1"
    });
    const secondRestoredSaveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "복원 저장 2"
    });
    isolateRestoredAssistantHydrationClone(duplicateButtons.restored.a2);
    duplicateButtons.restored.a2.appendChild(makeNode({
      attrs: { role: "toolbar", "aria-label": "Response actions" },
      children: [firstRestoredSaveButton, secondRestoredSaveButton]
    }));
    installDocument(hooks, duplicateButtons.document);
    const counts = makeBoundaryCounts();
    let observedPreflight = null;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-duplicate-restored-save-buttons",
      counts,
      () => hooks.handleCopyClick(clickedSaveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationOptions(duplicateButtons),
        ...noExternalBoundaryOptions(counts),
        preflightFn: async args => {
          counts.preflight += 1;
          observedPreflight = args;
          return {
            ok: false,
            stage: "preflight",
            reason: "duplicate restored save-button anchor reached verified preflight"
          };
        }
      })
    );

    assert.deepStrictEqual(duplicateButtons.transitions, ["initial", "upper", "restored"]);
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "duplicate restored save-button anchor reached verified preflight");
    assert.strictEqual(observedPreflight?.currentAssistantNode, duplicateButtons.restored.a2);
    assert.strictEqual(observedPreflight?.visualizeContext?.hydratedFromVirtualizedTurns, true);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "duplicate saver controls must not cross an external boundary during anchor selection"
    );
    assert.strictEqual(
      observedPreflight?.btn === duplicateButtons.restored.a2,
      true,
      "post-hydration code must use the verified A2 as its internal action/shareRoot anchor when restored saver controls are ambiguous"
    );
    assert.notStrictEqual(observedPreflight?.btn, firstRestoredSaveButton);
    assert.notStrictEqual(observedPreflight?.btn, secondRestoredSaveButton);
  });

  await verifyFocusedBoundary("hidden oversized ancestor is skipped for a farther auto scroller", async () => {
    const currentTurn = makeConversationTurn("assistant", "스크롤 컨테이너 선택 대상", [], "scroll-resolver-target");
    const unknownOversized = makeNode({ children: [currentTurn] });
    unknownOversized.clientHeight = 350;
    unknownOversized.scrollHeight = 1500;
    unknownOversized.scrollTop = 0;
    const hiddenOversized = makeNode({ children: [unknownOversized] });
    hiddenOversized.clientHeight = 400;
    hiddenOversized.scrollHeight = 1600;
    hiddenOversized.scrollTop = 0;
    hiddenOversized.style.overflowY = "hidden";
    const actualScroller = makeNode({ children: [hiddenOversized] });
    actualScroller.clientHeight = 600;
    actualScroller.scrollHeight = 2600;
    actualScroller.scrollTop = 700;
    actualScroller.style.overflowY = "auto";
    const scrollDocument = makeDocument([actualScroller]);
    scrollDocument.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });

    const resolved = hooks.resolveConversationScrollContainer(currentTurn, { root: scrollDocument });
    assert.strictEqual(resolved === unknownOversized, false, "an ancestor with no verified scrolling style is not trusted");
    assert.strictEqual(resolved === hiddenOversized, false, "overflow:hidden layout wrappers are not scroll controls");
    assert.strictEqual(resolved, actualScroller, "the farther overflow-y:auto ancestor must be selected");
  });

  await verifyFocusedBoundary("positive scrollTop does not make overflow hidden ancestor selectable", async () => {
    const currentTurn = makeConversationTurn("assistant", "hidden positive scrollTop 대상", [], "hidden-positive-scroll-target");
    const hiddenOversized = makeNode({ children: [currentTurn] });
    hiddenOversized.clientHeight = 400;
    hiddenOversized.scrollHeight = 1800;
    hiddenOversized.scrollTop = 240;
    hiddenOversized.style.overflowY = "hidden";
    const actualScroller = makeNode({ children: [hiddenOversized] });
    actualScroller.clientHeight = 650;
    actualScroller.scrollHeight = 2800;
    actualScroller.scrollTop = 900;
    actualScroller.style.overflowY = "auto";
    const scrollDocument = makeDocument([actualScroller]);
    scrollDocument.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });

    const resolved = hooks.resolveConversationScrollContainer(currentTurn, { root: scrollDocument });
    assert.strictEqual(
      resolved === actualScroller,
      true,
      "overflow:hidden remains non-scrollable evidence even when its scrollTop is positive"
    );
  });

  await verifyFocusedBoundary("missing nested scroller falls back to document.scrollingElement", async () => {
    const currentTurn = makeConversationTurn("assistant", "문서 스크롤 fallback", [], "document-scroll-target");
    const plainWrapper = makeNode({ children: [currentTurn] });
    plainWrapper.clientHeight = 600;
    plainWrapper.scrollHeight = 600;
    const scrollDocument = makeDocument([plainWrapper]);
    const documentScroller = makeNode({ attrs: { "data-testid": "document-scrolling-element" } });
    documentScroller.clientHeight = 700;
    documentScroller.scrollHeight = 3000;
    documentScroller.scrollTop = 1100;
    scrollDocument.scrollingElement = documentScroller;

    assert.strictEqual(
      hooks.resolveConversationScrollContainer(currentTurn, { root: scrollDocument }),
      documentScroller,
      "document.scrollingElement must be used when no scrollable ancestor exists"
    );
  });

  await verifyFocusedBoundary("consent-time exact hydrated window reparent rejects a connected production auto-scroller change", async () => {
    const idPrefix = "consent-connected-auto-scroller-reparent";
    const fixtureOptions = {
      includePreviousQa: true,
      idPrefix,
      q1Text: "auto scroller Q1",
      a1Text: "auto scroller A1",
      q2Text: virtualizationRequest,
      a2Text: "auto scroller A2"
    };
    const initial = makeVisualizeConversationFixture(fixtureOptions);
    const upper = makeVisualizeConversationFixture(fixtureOptions);
    const restored = makeVisualizeConversationFixture(fixtureOptions);
    isolateRestoredAssistantHydrationClone(initial.a2);
    isolateRestoredAssistantHydrationClone(restored.a2);
    isolateVirtualizedA1Clone(initial.a1);
    isolateVirtualizedA1Clone(upper.a1);
    isolateVirtualizedA1Clone(restored.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "connected auto scroller 저장"
    });
    initial.a2.appendChild(saveButton);

    const scrollerA = makeNode({
      attrs: { "data-testid": "production-auto-scroller-a" },
      children: [initial.a1Turn, initial.q2Turn, initial.a2Turn]
    });
    const scrollerB = makeNode({ attrs: { "data-testid": "production-auto-scroller-b" } });
    [scrollerA, scrollerB].forEach(scroller => {
      scroller.clientHeight = 400;
      scroller.scrollHeight = 1800;
      scroller.style.overflowY = "auto";
      scroller.scrollLeft = 0;
    });
    scrollerB.scrollTop = 900;
    const scrollDocument = makeDocument([scrollerA, scrollerB]);
    scrollDocument.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });

    const setSubtreeConnection = (node, connected, parent = null) => {
      if (!node) return;
      node.parentElement = parent;
      node.ownerDocument = scrollDocument;
      node.isConnected = connected;
      (node.childNodes || []).forEach(child => {
        setSubtreeConnection(child, connected, connected ? node : null);
      });
    };
    const replaceScrollerChildren = (scroller, turns) => {
      (scroller.childNodes || []).forEach(turn => setSubtreeConnection(turn, false));
      scroller.childNodes = [];
      (turns || []).forEach(turn => {
        const previousParent = turn.parentElement;
        if (previousParent && previousParent !== scroller) {
          previousParent.childNodes = (previousParent.childNodes || []).filter(child => child !== turn);
        }
        scroller.childNodes.push(turn);
        setSubtreeConnection(turn, true, scroller);
      });
    };

    const scrollWritesA = [];
    const transitions = ["initial"];
    let phase = "initial";
    let scrollTopA = 900;
    const updateScrollerA = value => {
      const next = Number(value);
      if (!Number.isFinite(next)) return;
      const previous = scrollTopA;
      scrollWritesA.push({ phase, from: previous, to: next });
      scrollTopA = next;
      if (phase === "initial" && next < 900) {
        phase = "upper";
        transitions.push(phase);
        replaceScrollerChildren(scrollerA, [upper.q1Turn, upper.a1Turn]);
      } else if (phase === "upper" && next >= 900) {
        phase = "restored";
        transitions.push(phase);
        replaceScrollerChildren(scrollerA, [restored.a1Turn, restored.q2Turn, restored.a2Turn]);
      }
    };
    Object.defineProperty(scrollerA, "scrollTop", {
      configurable: true,
      get: () => scrollTopA,
      set: updateScrollerA
    });
    scrollerA.scrollTo = options => updateScrollerA(options?.top);
    scrollerA.scrollBy = options => updateScrollerA(scrollTopA + Number(options?.top || 0));

    installDocument(hooks, scrollDocument);
    assert.strictEqual(
      hooks.resolveConversationScrollContainer(initial.a2Turn, { root: scrollDocument }),
      scrollerA,
      "the product resolver must auto-select scroller A without an injected scrollContainer"
    );

    const counts = makeBoundaryCounts();
    let preflightVisualizeContext = null;
    let reparentStatus = null;
    let callbackCounts = null;
    let scrollWritesAtConsent = -1;
    const originalA2App = restored.a2.querySelector("[data-app-block-preview]");
    const originalA2Runtime = originalA2App?.querySelector("iframe") || null;
    const hydrationConfig = {
      root: scrollDocument,
      maxScrollSteps: 2,
      scrollStepPx: 500,
      timeoutMs: 100,
      pollMs: 1
    };
    assert.strictEqual("scrollContainer" in hydrationConfig, false);

    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: hydrationConfig,
        alertFn: () => {},
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          preflightVisualizeContext = visualizeContext;
          assert.strictEqual(currentAssistantNode, restored.a2);
          assert.strictEqual(visualizeContext.answerNode, restored.a1);
          assert.strictEqual(visualizeContext.visualizeRequestNode, restored.q2);
          assert.strictEqual(visualizeContext.visualizeAnswerNode, restored.a2);
          assert.strictEqual(visualizeContext.hydrationRecovery.scrollContainer, scrollerA);
          assert.strictEqual(
            hooks.resolveConversationScrollContainer(restored.a2Turn, { root: scrollDocument }),
            scrollerA
          );
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: idPrefix,
            targetTurnId: `${idPrefix}-a2`
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          const exactRestoredTurns = [restored.a1Turn, restored.q2Turn, restored.a2Turn];
          replaceScrollerChildren(scrollerA, []);
          replaceScrollerChildren(scrollerB, exactRestoredTurns);
          phase = "consent-reparented";
          transitions.push(phase);
          assert.strictEqual(scrollerA.isConnected, true);
          assert.strictEqual(scrollerB.isConnected, true);
          assert.strictEqual(restored.a1Turn.parentElement, scrollerB);
          assert.strictEqual(restored.q2Turn.parentElement, scrollerB);
          assert.strictEqual(restored.a2Turn.parentElement, scrollerB);
          assert.strictEqual(restored.a2.querySelector("[data-app-block-preview]"), originalA2App);
          assert.strictEqual(restored.a2.querySelector("iframe"), originalA2Runtime);
          assert.strictEqual(hooks.__sandbox.location.href, `https://chatgpt.com/c/synthetic-${idPrefix}`);
          assert.strictEqual(runtimeGuard.isAborted(), false);
          assert.strictEqual(
            hooks.resolveConversationScrollContainer(restored.a2Turn, { root: scrollDocument }),
            scrollerB,
            "the exact verified A2 must now resolve to connected auto-scroller B"
          );
          reparentStatus = hooks.revalidateHydratedVisualizeContext(
            restored.a2,
            preflightVisualizeContext,
            { root: scrollDocument }
          );
          scrollWritesAtConsent = scrollWritesA.length;
          const permissionGranted = await requestPermission();
          callbackCounts = { ...counts };
          assert.strictEqual(scrollWritesA.length, scrollWritesAtConsent);
          assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
          assert.strictEqual(counts.share, 0);
          assert.strictEqual(counts.save, 0);
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        createShareLinkFn: async (currentAssistantNode, options) => {
          counts.share += 1;
          assert.strictEqual(currentAssistantNode, restored.a2);
          assert.strictEqual(options.shareKind, "response");
          assert.strictEqual(options.validateShareContext?.()?.ok, true);
          return {
            ok: true,
            url: "https://chatgpt.com/s/synthetic-t_connected_auto_scroller_reparent",
            validatedShareUrl: "https://chatgpt.com/s/synthetic-t_connected_auto_scroller_reparent",
            source: "existing",
            dialogClosed: true
          };
        },
        saveObsidianNoteFn: async (_payload, options) => {
          counts.save += 1;
          assert.strictEqual(options.validateContext().ok, true);
          return { ok: true };
        }
      })
    );

    assert.deepStrictEqual(transitions, ["initial", "upper", "restored", "consent-reparented"]);
    assert.strictEqual(
      reparentStatus?.ok,
      false,
      "a connected old scroller must not hide that the verified turn window moved to another production scroller"
    );
    assert.match(String(reparentStatus?.reason || ""), /conversation scroll container changed/i);
    assert.deepStrictEqual(
      callbackCounts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /conversation scroll container changed/i);
    assert.strictEqual(scrollWritesA.length, scrollWritesAtConsent, "scroller A must not receive a recovery scroll");
    assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("post-consent recovery rejects a transient connected production auto-scroller reparent", async () => {
    const idPrefix = "recovery-transient-connected-auto-scroller-reparent";
    const driver = makeVirtualizedCase({
      idPrefix,
      q2A2OnlyInitialWindow: false,
      consentRecoveryUsesFreshA1: true
    });
    isolateRestoredAssistantHydrationClone(driver.initial.a2);
    isolateRestoredAssistantHydrationClone(driver.restored.a2);
    isolateVirtualizedA1Clone(driver.initial.a1);
    isolateVirtualizedA1Clone(driver.upper.a1);
    isolateVirtualizedA1Clone(driver.restored.a1);
    isolateVirtualizedA1Clone(driver.consentReacquired.a1);
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "transient connected auto scroller 저장"
    });
    driver.initial.a2.appendChild(saveButton);

    // Keep the driver's real scroll/mount behavior, but place that same object
    // in the document so production resolveConversationScrollContainer() owns
    // both the initial proof and the post-consent recovery proof.
    const outerBody = driver.document.body;
    const initialTurns = Array.from(outerBody.childNodes || []);
    const scrollerA = driver.scrollContainer;
    const scrollerB = makeNode({
      attrs: { "data-testid": "recovery-production-auto-scroller-b" }
    });
    scrollerA.style.overflowY = "auto";
    scrollerB.style.overflowY = "auto";
    scrollerB.clientHeight = 400;
    scrollerB.scrollHeight = 1800;
    scrollerB.scrollTop = 900;
    outerBody.childNodes = [];
    scrollerA.childNodes = [];
    outerBody.appendChild(scrollerA);
    outerBody.appendChild(scrollerB);
    initialTurns.forEach(turn => scrollerA.appendChild(turn));
    driver.document.body = scrollerA;
    driver.document.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });
    const connectTree = (node, parent = null) => {
      if (!node) return;
      node.parentElement = parent;
      node.ownerDocument = driver.document;
      node.isConnected = true;
      (node.childNodes || []).forEach(child => connectTree(child, node));
    };
    connectTree(driver.document.documentElement, null);

    installDocument(hooks, driver.document);
    assert.strictEqual(
      hooks.resolveConversationScrollContainer(driver.initial.a2Turn, { root: driver.document }),
      scrollerA,
      "the transient recovery fixture must start on production auto-scroller A"
    );

    const moveConnectedChildren = (from, to) => {
      const moving = Array.from(from.childNodes || []);
      assert.strictEqual(to.childNodes.length, 0, "the transient destination must start empty");
      from.childNodes = [];
      moving.forEach(turn => {
        to.childNodes.push(turn);
        connectTree(turn, to);
      });
      return moving;
    };
    const counts = makeBoundaryCounts();
    let preflightVisualizeContext = null;
    let consentBoundaryStatus = null;
    let callbackCounts = null;
    let recoveryStarted = false;
    let recoveryPollAwaits = 0;
    let reparented = false;
    let repatriated = false;
    let scrollWritesAtTransientReparent = -1;
    let repatriationTimer = null;
    const waitForRecoveryPoll = async () => {
      if (!recoveryStarted) return;
      recoveryPollAwaits += 1;
      if (recoveryPollAwaits === 1) {
        assert.strictEqual(driver.restored.a2Turn.parentElement, scrollerA);
        moveConnectedChildren(scrollerA, scrollerB);
        reparented = true;
        assert.strictEqual(scrollerA.isConnected, true);
        assert.strictEqual(scrollerB.isConnected, true);
        assert.strictEqual(driver.restored.a2Turn.parentElement, scrollerB);
        assert.strictEqual(
          hooks.resolveConversationScrollContainer(driver.restored.a2Turn, { root: driver.document }),
          scrollerB,
          "the first recovery poll await must expose exact A2 on production auto-scroller B"
        );
        // Prevent the old-scroller geometry from settling on the very next
        // poll. Current production then polls once more and lets the transient
        // window return to A; a correct poll guard must stop while it is on B.
        scrollerA.scrollHeight += 17;
        scrollWritesAtTransientReparent = driver.scrollWrites.length;
        repatriationTimer = setTimeout(() => {
          if (driver.restored.a2Turn.parentElement === scrollerB) {
            moveConnectedChildren(scrollerB, scrollerA);
            repatriated = true;
          }
        }, 0);
        return;
      }
      if (recoveryPollAwaits === 2) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    };

    const result = await runOnBoundaryRoute(
      `https://chatgpt.com/c/synthetic-${idPrefix}`,
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          root: driver.document,
          maxScrollSteps: 3,
          scrollStepPx: 500,
          timeoutMs: 100,
          pollMs: 1,
          waitForHydrationPollFn: waitForRecoveryPoll
        },
        alertFn: () => {},
        preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
          counts.preflight += 1;
          preflightVisualizeContext = visualizeContext;
          assert.strictEqual(currentAssistantNode, driver.restored.a2);
          assert.strictEqual(visualizeContext.answerNode, driver.restored.a1);
          assert.strictEqual(visualizeContext.visualizeRequestNode, driver.restored.q2);
          assert.strictEqual(visualizeContext.visualizeAnswerNode, driver.restored.a2);
          assert.strictEqual(visualizeContext.hydrationRecovery.scrollContainer, scrollerA);
          assert.strictEqual(typeof visualizeContext.hydrationRecovery.resolveCurrentScrollContainer, "function");
          assert.strictEqual(
            hooks.resolveConversationScrollContainer(driver.restored.a2Turn, { root: driver.document }),
            scrollerA
          );
          return completePreviousQaBoundaryPreflight({
            visualizeContext,
            title: idPrefix,
            targetTurnId: `${idPrefix}-a2`
          });
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          counts.consent += 1;
          driver.simulatePostConsentLayoutDrift();
          consentBoundaryStatus = hooks.revalidateHydratedVisualizeContext(
            driver.restored.a2,
            preflightVisualizeContext,
            { root: driver.document }
          );
          assert.strictEqual(consentBoundaryStatus?.retryableMissingHydrationWindow, true);
          const scrollWritesBeforePermission = driver.scrollWrites.length;
          const permissionGranted = await requestPermission();
          callbackCounts = { ...counts };
          assert.strictEqual(permissionGranted, false);
          assert.strictEqual(counts.permission, 0);
          assert.strictEqual(driver.scrollWrites.length, scrollWritesBeforePermission);
          assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, false);
          recoveryStarted = true;
          return { approved: true, permissionGranted };
        },
        requestClipboardReadPermissionFn: async () => {
          counts.permission += 1;
          return true;
        },
        createShareLinkFn: async () => {
          counts.share += 1;
          return {
            ok: true,
            url: "https://chatgpt.com/s/synthetic-t_transient_scroller_must_not_share",
            validatedShareUrl: "https://chatgpt.com/s/synthetic-t_transient_scroller_must_not_share",
            source: "existing",
            dialogClosed: true
          };
        },
        saveObsidianNoteFn: async () => {
          counts.save += 1;
          return { ok: true };
        }
      })
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    if (repatriationTimer !== null) clearTimeout(repatriationTimer);

    assert.strictEqual(reparented, true);
    assert.strictEqual(repatriated, true, "the transient fixture must return the exact window to scroller A");
    assert.strictEqual(scrollerA.isConnected, true);
    assert.strictEqual(scrollerB.isConnected, true);
    assert.strictEqual(driver.restored.a2Turn.parentElement, scrollerA);
    assert.strictEqual(consentBoundaryStatus?.retryableMissingHydrationWindow, true);
    assert.deepStrictEqual(
      callbackCounts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(preflightVisualizeContext.hydrationRecovery.attempted, true);
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.match(String(result.reason || ""), /conversation scroll container changed/i);
    assert.strictEqual(
      driver.scrollWrites.length,
      scrollWritesAtTransientReparent,
      "old connected scroller A must receive no more recovery writes after the transient change is observable"
    );
    assert.deepStrictEqual(
      counts,
      { preflight: 1, consent: 1, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0);
  });

  await verifyFocusedBoundary("runtime readiness rejects a connected scroll-container replacement before scrolling", async () => {
    const fixture = makeVisualizeConversationFixture({
      includePreviousQa: true,
      idPrefix: "readiness-scroll-container-replacement",
      q1Text: "unmounted readiness Q1",
      a1Text: "mounted readiness A1",
      q2Text: virtualizationRequest,
      a2Text: "readiness A2 설명"
    });
    isolateRestoredAssistantHydrationClone(fixture.a2);
    const appBlock = fixture.a2.querySelector('[data-app-block-preview="true"]');
    const delayedIframe = appBlock?.querySelector("iframe") || null;
    assert(appBlock && delayedIframe);
    delayedIframe.remove();
    const saveButton = makeNode({
      tagName: "button",
      attrs: { class: "gpt2obs-btn" },
      text: "scroll-container replacement 저장"
    });
    fixture.a2.appendChild(saveButton);

    const initialScroller = makeNode({
      attrs: { "data-testid": "initial-readiness-scroll" },
      children: [fixture.a1Turn, fixture.q2Turn, fixture.a2Turn]
    });
    initialScroller.clientHeight = 400;
    initialScroller.scrollHeight = 1800;
    initialScroller.style.overflowY = "auto";
    const replacementScroller = makeNode({ attrs: { "data-testid": "replacement-readiness-scroll" } });
    replacementScroller.clientHeight = 400;
    replacementScroller.scrollHeight = 1900;
    replacementScroller.style.overflowY = "auto";
    let initialTop = 900;
    let replacementTop = 900;
    let scrollWrites = 0;
    Object.defineProperty(initialScroller, "scrollTop", {
      configurable: true,
      get: () => initialTop,
      set: value => { scrollWrites += 1; initialTop = Number(value); }
    });
    Object.defineProperty(replacementScroller, "scrollTop", {
      configurable: true,
      get: () => replacementTop,
      set: value => { scrollWrites += 1; replacementTop = Number(value); }
    });
    const scrollDocument = makeDocument([initialScroller, replacementScroller]);
    scrollDocument.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });
    installDocument(hooks, scrollDocument);
    assert.strictEqual(
      hooks.resolveConversationScrollContainer(fixture.a2Turn, { root: scrollDocument }),
      initialScroller
    );

    const counts = makeBoundaryCounts();
    let virtualNow = 0;
    let replacements = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-readiness-scroll-container-replacement",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          root: scrollDocument,
          maxScrollSteps: 2,
          scrollStepPx: 500,
          appReadinessTimeoutMs: 80,
          timeoutMs: 120,
          pollMs: 10,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => {
            if (replacements === 0) {
              initialScroller.childNodes = [];
              replacementScroller.appendChild(fixture.a1Turn);
              replacementScroller.appendChild(fixture.q2Turn);
              replacementScroller.appendChild(fixture.a2Turn);
              appBlock.appendChild(delayedIframe);
              replacements += 1;
            }
            virtualNow += Number(delayMs) || 0;
          }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "replaced scroller must not reach verified preflight" };
        }
      })
    );

    assert.strictEqual(replacements, 1);
    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(result.reason, "conversation scroll container changed before Visualize hydration");
    assert.strictEqual(scrollWrites, 0);
    assert.strictEqual(initialTop, 900);
    assert.strictEqual(replacementTop, 900);
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 }
    );
  });

  await verifyFocusedBoundary("stuck scrollTop hydration fails closed before external boundaries", async () => {
    const stuckFixture = makeVisualizeConversationFixture({
      includePreviousQa: true,
      idPrefix: "virtual-stuck-scroll",
      q1Text: "언마운트된 stuck Q1",
      a1Text: "보이는 stuck A1",
      q2Text: virtualizationRequest,
      a2Text: "stuck A2 설명"
    });
    const saveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "stuck 저장" });
    stuckFixture.a2.appendChild(saveButton);
    const stuckScroller = makeNode({
      attrs: { "data-testid": "stuck-conversation-scroll" },
      children: [stuckFixture.a1Turn, stuckFixture.q2Turn, stuckFixture.a2Turn]
    });
    stuckScroller.clientHeight = 400;
    stuckScroller.scrollHeight = 1800;
    stuckScroller.style.overflowY = "auto";
    let stuckTop = 900;
    let scrollWriteAttempts = 0;
    Object.defineProperty(stuckScroller, "scrollTop", {
      configurable: true,
      get: () => stuckTop,
      set: () => { scrollWriteAttempts += 1; }
    });
    stuckScroller.scrollTo = () => { scrollWriteAttempts += 1; };
    const stuckDocument = makeDocument([stuckScroller]);
    stuckDocument.defaultView.getComputedStyle = node => ({
      display: node?.style?.display || "",
      visibility: node?.style?.visibility || "",
      opacity: node?.style?.opacity || "",
      overflowY: node?.style?.overflowY || ""
    });
    installDocument(hooks, stuckDocument);
    assert.strictEqual(
      hooks.resolveConversationScrollContainer(stuckFixture.a2Turn, { root: stuckDocument }),
      stuckScroller
    );
    const counts = makeBoundaryCounts();
    let virtualNow = 0;
    const result = await runOnBoundaryRoute(
      "https://chatgpt.com/c/synthetic-virtual-stuck-scroll",
      counts,
      () => hooks.handleCopyClick(saveButton, {
        delayMs: 0,
        runtimeGuard,
        visualizeHydrationOptions: {
          root: stuckDocument,
          maxScrollSteps: 1,
          scrollStepPx: 500,
          timeoutMs: 80,
          pollMs: 20,
          nowFn: () => virtualNow,
          waitForHydrationPollFn: async delayMs => { virtualNow += Number(delayMs) || 0; }
        },
        ...noExternalBoundaryOptions(counts),
        preflightFn: async () => {
          counts.preflight += 1;
          return { ok: false, stage: "preflight", reason: "stuck scroller must not reach preflight" };
        }
      })
    );

    assert.strictEqual(result?.ok, false);
    assert.strictEqual(result.stage, "preflight");
    assert.strictEqual(
      result.reason,
      "conversation scroll movement could not be applied",
      "a non-applying candidate must be rejected at the failed movement instead of consuming the hydration budget"
    );
    assert(scrollWriteAttempts > 0, "hydration must exercise the non-applying scroll candidate");
    assert.strictEqual(stuckTop, 900, "the fake candidate must prove that every requested write was ignored");
    assert.deepStrictEqual(
      counts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "a non-applying scroll candidate must fail before preflight and every external boundary"
    );
    assert.strictEqual(hooks.getActiveVisualizeAttemptKeys().length, 0, "failed hydration must release its attempt lock");
  });

  if (focusedBoundaryFailures.length) {
    throw new Error(`Focused virtualization boundary results:\n${focusedBoundaryStatuses.join("\n")}`);
  }

  const positive = makeVirtualizedCase({ idPrefix: "virtual-positive" });
  const positiveSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  positive.initial.a2.appendChild(positiveSaveButton);
  installDocument(hooks, positive.document);
  const positiveCounts = { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 };
  const positiveAlerts = [];
  const assertPositiveRecovered = boundary => {
    assert.strictEqual(positive.phase, "restored", `${boundary} must wait for scroll restoration`);
    assert.deepStrictEqual(
      positive.transitions,
      ["initial", "upper", "restored"],
      `${boundary} must run only after both virtualized windows were verified`
    );
    assert.strictEqual(positive.scrollContainer.scrollTop, positive.originalScrollTop, `${boundary} must run at the restored position`);
  };
  const originalVirtualizedSourceUrl = hooks.__sandbox.location.href;
  const originalVirtualizedRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
  hooks.__sandbox.location.href = "https://chatgpt.com/c/synthetic-virtualized-previous-answer-positive";
  hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message?.type === "open-obsidian-uri") positiveCounts.uri += 1;
    return originalVirtualizedRuntimeSender(message, callback);
  };
  let positiveResult;
  try {
    positiveResult = await hooks.handleCopyClick(positiveSaveButton, {
      delayMs: 0,
      runtimeGuard,
      visualizeHydrationOptions: hydrationOptions(positive),
      confirmFn: () => false,
      alertFn: message => positiveAlerts.push(String(message)),
      preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
        positiveCounts.preflight += 1;
        assertPositiveRecovered("preflight");
        assert.strictEqual(currentAssistantNode, positive.restored.a2, "preflight must reacquire the restored A2 node");
        assert.notStrictEqual(currentAssistantNode, positive.initial.a2, "preflight must not reuse the detached clicked A2 node");
        assert.strictEqual(visualizeContext.mode, "previous-qa");
        assert.strictEqual(visualizeContext.questionText, "가상화 Q1 원본 질문");
        assert.strictEqual(visualizeContext.answerText, "가상화 A1 원본 답변");
        assert.strictEqual(visualizeContext.answerNode, positive.restored.a1, "A1 must also be reacquired from the restored window");
        assert.strictEqual(visualizeContext.visualizeRequestNode, positive.restored.q2, "Q2 must be reacquired from the restored window");
        assert.strictEqual(visualizeContext.visualizeAnswerNode, positive.restored.a2, "A2 must be reacquired from the restored window");
        return {
          ok: true,
          mode: "previous-qa",
          title: "가상화된 이전 답변 시각화",
          filePath: "ChatGPT/virtualized-previous-answer.md",
          questionText: visualizeContext.questionText,
          answerText: visualizeContext.answerText,
          explanationText: "",
          fileLinks: [],
          artifactRows: [],
          readableFiles: [],
          fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
          localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
          remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
          richArtifactsExpected: 1,
          targetTurnId: "virtual-positive-a2"
        };
      },
      requestShareConsentFn: async ({ requestPermission }) => {
        positiveCounts.consent += 1;
        assertPositiveRecovered("share consent");
        const permissionGranted = await requestPermission();
        return { approved: true, permissionGranted };
      },
      requestClipboardReadPermissionFn: async () => {
        positiveCounts.permission += 1;
        assertPositiveRecovered("clipboard permission");
        return false;
      },
      createShareLinkFn: async currentAssistantNode => {
        positiveCounts.share += 1;
        assertPositiveRecovered("Share/URL discovery");
        assert.strictEqual(currentAssistantNode, positive.restored.a2, "Share must target the reacquired A2 node");
        return { ok: true, url: "https://chatgpt.com/s/synthetic-t_virtualized_previous_answer", source: "existing", dialogClosed: true };
      },
      shareOptions: {
        readClipboardText: async () => {
          positiveCounts.clipboard += 1;
          return "https://chatgpt.com/s/synthetic-t_must_not_be_read_before_recovery";
        }
      },
      saveObsidianNoteFn: async payload => {
        positiveCounts.save += 1;
        assertPositiveRecovered("Native save");
        assert(payload.content.includes("가상화 Q1 원본 질문"));
        assert(payload.content.includes("가상화 A1 원본 답변"));
        return { ok: true };
      }
    });
  } finally {
    hooks.__sandbox.location.href = originalVirtualizedSourceUrl;
    hooks.__sandbox.chrome.runtime.sendMessage = originalVirtualizedRuntimeSender;
  }
  assert.strictEqual(
    positiveResult?.ok,
    true,
    `verified overlapping virtualized windows must save successfully: ${positiveResult?.reason || "no result"}`
  );
  assert.strictEqual(positiveResult.mode, "previous-qa");
  assert.deepStrictEqual(positive.transitions, ["initial", "upper", "restored"]);
  assert.deepStrictEqual(
    positiveCounts,
    { preflight: 1, consent: 1, permission: 1, share: 1, clipboard: 0, save: 1, uri: 0 },
    "no Share, URL, clipboard, Native, or URI side effect may run before the full pair is recovered"
  );
  assert.strictEqual(positiveAlerts.length, 0);

  const mismatch = makeVirtualizedCase({
    idPrefix: "virtual-mismatch",
    upperA1Text: "같은 turn ID지만 내용이 달라진 A1"
  });
  const mismatchSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  mismatch.initial.a2.appendChild(mismatchSaveButton);
  installDocument(hooks, mismatch.document);
  const mismatchCounts = { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 };
  const originalMismatchSourceUrl = hooks.__sandbox.location.href;
  const originalMismatchRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
  hooks.__sandbox.location.href = "https://chatgpt.com/c/synthetic-virtualized-previous-answer-mismatch";
  hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message?.type === "open-obsidian-uri") mismatchCounts.uri += 1;
    return originalMismatchRuntimeSender(message, callback);
  };
  let mismatchResult;
  try {
    mismatchResult = await hooks.handleCopyClick(mismatchSaveButton, {
      delayMs: 0,
      runtimeGuard,
      visualizeHydrationOptions: hydrationOptions(mismatch),
      confirmFn: () => false,
      alertFn: () => {},
      preflightFn: async () => {
        mismatchCounts.preflight += 1;
        return { ok: false, stage: "preflight", reason: "mismatched overlap must not reach preflight" };
      },
      requestShareConsentFn: async () => {
        mismatchCounts.consent += 1;
        return { approved: true, permissionGranted: false };
      },
      requestClipboardReadPermissionFn: async () => {
        mismatchCounts.permission += 1;
        return false;
      },
      createShareLinkFn: async () => {
        mismatchCounts.share += 1;
        return { ok: true, url: "https://chatgpt.com/s/synthetic-t_mismatch_must_not_run", source: "existing" };
      },
      shareOptions: {
        readClipboardText: async () => {
          mismatchCounts.clipboard += 1;
          return "https://chatgpt.com/s/synthetic-t_mismatch_must_not_read";
        }
      },
      saveObsidianNoteFn: async () => {
        mismatchCounts.save += 1;
        return { ok: true };
      }
    });
  } finally {
    hooks.__sandbox.location.href = originalMismatchSourceUrl;
    hooks.__sandbox.chrome.runtime.sendMessage = originalMismatchRuntimeSender;
  }
  assert.strictEqual(mismatchResult?.ok, false, "a conflicting A1 overlap must fail closed");
  assert.strictEqual(mismatchResult.stage, "preflight");
  assert.match(
    String(mismatchResult.reason || ""),
    /overlap|conflict|mismatch|hydration|could not be verified/i,
    "the failure must identify the unverified virtualized overlap"
  );
  assert.deepStrictEqual(mismatch.transitions, ["initial", "upper", "restored"], "failed hydration must still restore the original window");
  assert.strictEqual(mismatch.scrollContainer.scrollTop, mismatch.originalScrollTop);
  assert.deepStrictEqual(
    mismatchCounts,
    { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
    "an unverified overlap must stop before every Share, URL, clipboard, Native, and URI boundary"
  );

  const noOverlap = makeVirtualizedCase({
    idPrefix: "virtual-no-overlap",
    upperIdPrefix: "unrelated-upper-window"
  });
  const noOverlapSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  noOverlap.initial.a2.appendChild(noOverlapSaveButton);
  installDocument(hooks, noOverlap.document);
  const noOverlapCounts = { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 };
  const originalNoOverlapSourceUrl = hooks.__sandbox.location.href;
  const originalNoOverlapRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
  hooks.__sandbox.location.href = "https://chatgpt.com/c/synthetic-virtualized-previous-answer-no-overlap";
  hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message?.type === "open-obsidian-uri") noOverlapCounts.uri += 1;
    return originalNoOverlapRuntimeSender(message, callback);
  };
  let noOverlapResult;
  try {
    noOverlapResult = await hooks.handleCopyClick(noOverlapSaveButton, {
      delayMs: 0,
      runtimeGuard,
      visualizeHydrationOptions: hydrationOptions(noOverlap),
      confirmFn: () => false,
      alertFn: () => {},
      preflightFn: async () => {
        noOverlapCounts.preflight += 1;
        return { ok: false, stage: "preflight", reason: "no-overlap hydration must not reach preflight" };
      },
      requestShareConsentFn: async () => {
        noOverlapCounts.consent += 1;
        return { approved: true, permissionGranted: false };
      },
      requestClipboardReadPermissionFn: async () => {
        noOverlapCounts.permission += 1;
        return false;
      },
      createShareLinkFn: async () => {
        noOverlapCounts.share += 1;
        return { ok: true, url: "https://chatgpt.com/s/synthetic-t_no_overlap_must_not_run", source: "existing" };
      },
      shareOptions: {
        readClipboardText: async () => {
          noOverlapCounts.clipboard += 1;
          return "https://chatgpt.com/s/synthetic-t_no_overlap_must_not_read";
        }
      },
      saveObsidianNoteFn: async () => {
        noOverlapCounts.save += 1;
        return { ok: true };
      }
    });
  } finally {
    hooks.__sandbox.location.href = originalNoOverlapSourceUrl;
    hooks.__sandbox.chrome.runtime.sendMessage = originalNoOverlapRuntimeSender;
  }
  assert.strictEqual(noOverlapResult?.ok, false, "an upper window with no A1 overlap must fail closed");
  assert.strictEqual(noOverlapResult.stage, "preflight");
  assert.match(String(noOverlapResult.reason || ""), /overlap|recover|hydration/i);
  assert.deepStrictEqual(noOverlap.transitions, ["initial", "upper", "restored"], "no-overlap hydration must restore the original window");
  assert.strictEqual(noOverlap.scrollContainer.scrollTop, noOverlap.originalScrollTop);
  assert.deepStrictEqual(
    noOverlapCounts,
    { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
    "a window with no verified overlap must stop before every external boundary"
  );

  const routeBeforeHydration = "https://chatgpt.com/c/synthetic-virtualized-route-change-source";
  const routeDuringHydration = "https://chatgpt.com/c/synthetic-virtualized-route-change-destination";
  let changeRouteOnUpperOnce = true;
  const routeChange = makeVirtualizedCase({
    idPrefix: "virtual-route-change",
    onPhase: nextPhase => {
      if (nextPhase === "upper" && changeRouteOnUpperOnce) {
        changeRouteOnUpperOnce = false;
        hooks.__sandbox.location.href = routeDuringHydration;
      }
    }
  });
  const routeChangeSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  routeChange.initial.a2.appendChild(routeChangeSaveButton);
  installDocument(hooks, routeChange.document);
  const routeChangeCounts = { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 };
  const originalRouteChangeSourceUrl = hooks.__sandbox.location.href;
  const originalRouteChangeRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
  hooks.__sandbox.location.href = routeBeforeHydration;
  hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message?.type === "open-obsidian-uri") routeChangeCounts.uri += 1;
    return originalRouteChangeRuntimeSender(message, callback);
  };
  let routeChangeResult;
  try {
    routeChangeResult = await hooks.handleCopyClick(routeChangeSaveButton, {
      delayMs: 0,
      runtimeGuard,
      visualizeHydrationOptions: hydrationOptions(routeChange),
      confirmFn: () => false,
      alertFn: () => {},
      preflightFn: async () => {
        routeChangeCounts.preflight += 1;
        return { ok: false, stage: "preflight", reason: "route-changed hydration must not reach preflight" };
      },
      requestShareConsentFn: async () => {
        routeChangeCounts.consent += 1;
        return { approved: true, permissionGranted: false };
      },
      requestClipboardReadPermissionFn: async () => {
        routeChangeCounts.permission += 1;
        return false;
      },
      createShareLinkFn: async () => {
        routeChangeCounts.share += 1;
        return { ok: true, url: "https://chatgpt.com/s/synthetic-t_route_change_must_not_run", source: "existing" };
      },
      shareOptions: {
        readClipboardText: async () => {
          routeChangeCounts.clipboard += 1;
          return "https://chatgpt.com/s/synthetic-t_route_change_must_not_read";
        }
      },
      saveObsidianNoteFn: async () => {
        routeChangeCounts.save += 1;
        return { ok: true };
      }
    });

    assert.strictEqual(routeChangeResult?.ok, false, "a route change during hydration must fail closed");
    assert.strictEqual(routeChangeResult.stage, "preflight");
    assert.match(String(routeChangeResult.reason || ""), /route changed/i);
    assert.strictEqual(hooks.__sandbox.location.href, routeDuringHydration, "the extension must not navigate back on the user's behalf");
    const transitionsBeforeRouteRetry = routeChange.transitions.slice();
    assert.deepStrictEqual(
      routeChangeCounts,
      { preflight: 0, consent: 0, permission: 0, share: 0, clipboard: 0, save: 0, uri: 0 },
      "a route change must stop before every external boundary"
    );

    hooks.__sandbox.location.href = routeBeforeHydration;
    routeChange.simulateOriginalRouteReload();
    const routeRetryButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장 재시도" });
    routeChange.restored.a2.appendChild(routeRetryButton);
    const retryCounts = { preflight: 0, consent: 0, permission: 0, share: 0, save: 0 };
    const routeRetryResult = await hooks.handleCopyClick(routeRetryButton, {
      delayMs: 0,
      runtimeGuard,
      visualizeHydrationOptions: hydrationOptions(routeChange),
      confirmFn: () => false,
      alertFn: () => {},
      preflightFn: async ({ currentAssistantNode, visualizeContext }) => {
        retryCounts.preflight += 1;
        assert.strictEqual(currentAssistantNode, routeChange.restored.a2);
        assert.strictEqual(visualizeContext.mode, "previous-qa");
        return { ok: false, stage: "preflight", reason: "route retry reached verified preflight" };
      },
      requestShareConsentFn: async () => {
        retryCounts.consent += 1;
        return { approved: true, permissionGranted: false };
      },
      requestClipboardReadPermissionFn: async () => {
        retryCounts.permission += 1;
        return false;
      },
      createShareLinkFn: async () => {
        retryCounts.share += 1;
        return { ok: true, url: "https://chatgpt.com/s/synthetic-t_route_retry_must_not_share", source: "existing" };
      },
      saveObsidianNoteFn: async () => {
        retryCounts.save += 1;
        return { ok: true };
      }
    });
    assert.strictEqual(routeRetryResult?.ok, false);
    assert.strictEqual(routeRetryResult.stage, "preflight", "the retry must not be rejected as a duplicate attempt");
    assert.strictEqual(routeRetryResult.reason, "route retry reached verified preflight");
    assert.deepStrictEqual(routeChange.transitions.slice(-3), ["route-reloaded", "upper", "restored"]);
    assert.deepStrictEqual(
      retryCounts,
      { preflight: 1, consent: 0, permission: 0, share: 0, save: 0 },
      "the cleaned-up attempt lock must permit a fresh hydration without crossing external boundaries"
    );
    assert.deepStrictEqual(
      transitionsBeforeRouteRetry,
      ["initial", "upper"],
      "after the route changes, hydration must not apply the previous route's scroll position to the new route"
    );
  } finally {
    hooks.__sandbox.location.href = originalRouteChangeSourceUrl;
    hooks.__sandbox.chrome.runtime.sendMessage = originalRouteChangeRuntimeSender;
  }

  const concurrent = makeVirtualizedCase({
    idPrefix: "virtual-concurrent",
    deferUpperMount: true
  });
  isolateRestoredAssistantHydrationClone(concurrent.initial.a2);
  isolateRestoredAssistantHydrationClone(concurrent.restored.a2);
  const concurrentSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  concurrent.initial.a2.appendChild(concurrentSaveButton);
  installDocument(hooks, concurrent.document);
  const concurrentCounts = { preflight: 0, consent: 0, permission: 0, share: 0, save: 0, uri: 0 };
  const originalConcurrentSourceUrl = hooks.__sandbox.location.href;
  const originalConcurrentRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
  hooks.__sandbox.location.href = "https://chatgpt.com/c/synthetic-virtualized-concurrent-attempt";
  hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message?.type === "open-obsidian-uri") concurrentCounts.uri += 1;
    return originalConcurrentRuntimeSender(message, callback);
  };
  const runConcurrentAttempt = () => hooks.handleCopyClick(concurrentSaveButton, {
    delayMs: 0,
    runtimeGuard,
    visualizeHydrationOptions: hydrationOptions(concurrent),
    confirmFn: () => false,
    alertFn: () => {},
    preflightFn: async () => {
      concurrentCounts.preflight += 1;
      return { ok: false, stage: "preflight", reason: "first concurrent attempt reached verified preflight" };
    },
    requestShareConsentFn: async () => {
      concurrentCounts.consent += 1;
      return { approved: true, permissionGranted: false };
    },
    requestClipboardReadPermissionFn: async () => {
      concurrentCounts.permission += 1;
      return false;
    },
    createShareLinkFn: async () => {
      concurrentCounts.share += 1;
      return { ok: true, url: "https://chatgpt.com/s/synthetic-t_concurrent_must_not_share", source: "existing" };
    },
    saveObsidianNoteFn: async () => {
      concurrentCounts.save += 1;
      return { ok: true };
    }
  });
  try {
    const concurrentAttemptKey = hooks.visualizeAttemptKeyForNode(concurrent.initial.a2);
    assert(concurrentAttemptKey, "the concurrent fixture must expose a stable Visualize attempt key");
    const firstConcurrentPromise = runConcurrentAttempt();
    assert.strictEqual(
      Array.from(hooks.getActiveVisualizeAttemptKeys()).join("\n"),
      concurrentAttemptKey,
      "the first hydration must hold its attempt lock before the second click"
    );
    assert.strictEqual(
      hooks.collectRichAppBlockCandidates(concurrent.initial.a2).length,
      1,
      "snapshotting must not mutate the live assistant while the first attempt is pending"
    );
    assert.strictEqual(
      hooks.visualizeAttemptKeyForNode(concurrent.initial.a2),
      concurrentAttemptKey,
      "the attempt key must remain stable while its turn is temporarily unmounted"
    );
    const secondConcurrentResult = await runConcurrentAttempt();
    assert.strictEqual(secondConcurrentResult?.ok, false);
    assert.strictEqual(secondConcurrentResult.stage, "duplicate", "a second click must be suppressed while hydration holds the attempt lock");
    assert.deepStrictEqual(
      concurrentCounts,
      { preflight: 0, consent: 0, permission: 0, share: 0, save: 0, uri: 0 },
      "the suppressed click must cross no downstream boundary"
    );
    let upperWindowReleased = false;
    for (let attempt = 0; attempt < 20 && !upperWindowReleased; attempt += 1) {
      upperWindowReleased = concurrent.releaseUpperWindow();
      if (!upperWindowReleased) await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.strictEqual(upperWindowReleased, true, "the first attempt must still be waiting for the virtualized upper window");
    const firstConcurrentResult = await firstConcurrentPromise;
    assert.strictEqual(firstConcurrentResult?.ok, false);
    assert.strictEqual(firstConcurrentResult.stage, "preflight");
    assert.strictEqual(firstConcurrentResult.reason, "first concurrent attempt reached verified preflight");
    assert.deepStrictEqual(concurrent.transitions, ["initial", "upper", "restored"]);
    assert.deepStrictEqual(
      concurrentCounts,
      { preflight: 1, consent: 0, permission: 0, share: 0, save: 0, uri: 0 },
      "only the original attempt may resume after the delayed overlap appears"
    );
  } finally {
    hooks.__sandbox.location.href = originalConcurrentSourceUrl;
    hooks.__sandbox.chrome.runtime.sendMessage = originalConcurrentRuntimeSender;
  }
}
const approveVisualizeConsent = ({ requestPermission }) => {
  let permissionPromise;
  try { permissionPromise = Promise.resolve(requestPermission()); } catch { permissionPromise = Promise.resolve(false); }
  return permissionPromise.then(granted => ({ approved: true, permissionGranted: granted === true }));
};

assert.strictEqual(typeof hooks.requestClipboardReadPermission, "function");
const originalPermissionSender = hooks.__sandbox.chrome.runtime.sendMessage;
const permissionMessages = [];
hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
  permissionMessages.push(message);
  callback?.({ ok: true, granted: true });
};
assert.strictEqual(await hooks.requestClipboardReadPermission(), true);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(permissionMessages)),
  [{ type: "gpt2obs-request-clipboard-read-permission" }],
  "content must request only the optional clipboardRead decision through background"
);
hooks.__sandbox.chrome.runtime.sendMessage = (_message, callback) => callback?.({ ok: true, granted: false });
assert.strictEqual(await hooks.requestClipboardReadPermission(), false);
hooks.__sandbox.chrome.runtime.sendMessage = originalPermissionSender;

assert.strictEqual(
  typeof hooks.normalizeChatGptShareUrl,
  "function",
  "Visualize share URL normalization must be exposed as a testable pure function"
);
assert.strictEqual(
  hooks.normalizeChatGptShareUrl("/s/synthetic-t_example"),
  "https://chatgpt.com/s/synthetic-t_example"
);
[
  ["https://chatgpt.com/s/synthetic-t_SYNTHETIC_SHARE_TOKEN_0000000000", "https://chatgpt.com/s/synthetic-t_SYNTHETIC_SHARE_TOKEN_0000000000"],
  ["https://chatgpt.com/s/synthetic-t_ok", "https://chatgpt.com/s/synthetic-t_ok"],
  ["https://chatgpt.com/share/synthetic-123e4567-e89b-12d3-a456-426614174000", "https://chatgpt.com/share/synthetic-123e4567-e89b-12d3-a456-426614174000"],
  ["http://chatgpt.com/s/t_bad", ""],
  ["https://chatgpt.com.evil.example/s/t_bad", ""],
  ["https://evil.example/s/t_bad", ""],
  ["https://chatgpt.com/c/synthetic-conversation", ""],
  ["https://user:pass@chatgpt.com/s/t_bad", ""],
  ["https://chatgpt.com:443/s/t_port", ""],
  ["https://chatgpt.com/s/synthetic-t_query?x=1", ""],
  ["https://chatgpt.com/s/synthetic-t_hash#x", ""],
  ["//chatgpt.com/s/t_bad", ""],
  ["/s/t_bad extra", ""],
  ["https://chatgpt.com/s/synthetic-t_bad/extra", ""],
  ["javascript:alert(1)", ""],
  ["", ""]
].forEach(([input, expected]) => {
  assert.strictEqual(hooks.normalizeChatGptShareUrl(input), expected, `URL validation for ${input}`);
});

assert.strictEqual(
  typeof hooks.validateStrictChatGptShareUrl,
  "function",
  "clipboard and manual input require a separate absolute single-URL validator"
);
[
  ["https://chatgpt.com/s/synthetic-t_clipboard", "https://chatgpt.com/s/synthetic-t_clipboard"],
  ["https://chatgpt.com/share/synthetic-123e4567-e89b-12d3-a456-426614174000", "https://chatgpt.com/share/synthetic-123e4567-e89b-12d3-a456-426614174000"],
  [" https://chatgpt.com/s/synthetic-t_trimmed ", "https://chatgpt.com/s/synthetic-t_trimmed"],
  ["/s/t_relative", ""],
  ["//chatgpt.com/s/t_protocol_relative", ""],
  ["http://chatgpt.com/s/t_http", ""],
  ["https://user:pass@chatgpt.com/s/t_credentials", ""],
  ["https://evil.example/s/t_external", ""],
  ["https://chatgpt.com.evil.example/s/t_external", ""],
  ["https://chatgpt.com/c/synthetic-conversation", ""],
  ["https://chatgpt.com/s/synthetic-t_one extra", ""],
  ["링크: https://chatgpt.com/s/synthetic-t_one", ""],
  ["[공유 링크](https://chatgpt.com/s/synthetic-t_one)", ""],
  ["https://chatgpt.com/s/synthetic-t_one\nhttps://chatgpt.com/s/synthetic-t_two", ""],
  ["javascript:alert(1)", ""],
  ["", ""]
].forEach(([input, expected]) => {
  assert.strictEqual(hooks.validateStrictChatGptShareUrl(input), expected, `strict share URL validation for ${input}`);
});

assert.strictEqual(
  typeof hooks.isVisualizeRequestNode,
  "function",
  "Visualize request detection must be exposed as a testable pure function"
);

const visualizeMention = makeNode({ attrs: { "data-id": "plugin:visualize" } });
const visualizeRequest = makeNode({ children: [visualizeMention] });
const plainVisualizeText = makeNode({ text: "Visualize" });
const otherPluginMention = makeNode({ attrs: { "data-plugin-id": "plugin:other" }, text: "Other" });
const appBlock = makeNode({ attrs: { "data-app-block-preview": "true" } });
const visualizeAssistant = makeNode({ children: [appBlock] });
assert.strictEqual(hooks.isVisualizeRequestNode(visualizeRequest), true);
assert.strictEqual(hooks.isVisualizeRequestNode(plainVisualizeText), false);
assert.strictEqual(hooks.isVisualizeRequestNode(otherPluginMention), false);
assert.strictEqual(
  hooks.isVisualizeShareCandidate(visualizeAssistant, { requestNode: visualizeRequest }),
  true,
  "only an app block paired with a structured Visualize request enters share mode"
);
assert.strictEqual(
  hooks.isVisualizeShareCandidate(visualizeAssistant, { requestNode: plainVisualizeText }),
  false,
  "plain Visualize body text must not trigger share mode"
);

const retryVariantAppBlock = makeNode({ attrs: { "data-app-block-preview": "true" } });
const retryVariantAssistant = makeNode({
  attrs: { "data-message-author-role": "assistant" },
  children: [retryVariantAppBlock]
});
const retryPreviousResponse = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Previous response" }
});
const retryVariantActions = makeNode({
  attrs: { role: "group", "aria-label": "Response actions" },
  children: [retryPreviousResponse, makeNode({ text: "2/2" })]
});
makeNode({
  attrs: { "data-testid": "conversation-turn-retry" },
  children: [retryVariantAssistant, retryVariantActions]
});
assert.strictEqual(
  hooks.isVisualizeShareCandidate(retryVariantAssistant, { requestNode: plainVisualizeText }),
  true,
  "a retried 2/2 app-block response must preserve Visualize share mode when ChatGPT drops the plugin marker"
);
retryPreviousResponse.disabled = true;
assert.strictEqual(
  hooks.isVisualizeShareCandidate(retryVariantAssistant, { requestNode: plainVisualizeText }),
  false,
  "plain Visualize text without an active earlier response variant must remain outside share mode"
);
retryPreviousResponse.disabled = false;
retryPreviousResponse.hidden = true;
assert.strictEqual(
  hooks.isVisualizeShareCandidate(retryVariantAssistant, { requestNode: plainVisualizeText }),
  false,
  "a hidden Previous response control must not prove a retry variant"
);
retryPreviousResponse.hidden = false;
retryPreviousResponse.style.display = "none";
assert.strictEqual(
  hooks.isVisualizeShareCandidate(retryVariantAssistant, { requestNode: plainVisualizeText }),
  false,
  "a display-none Previous response control must not prove a retry variant"
);
retryPreviousResponse.style.display = "";
retryPreviousResponse.setAttribute("aria-hidden", "true");
assert.strictEqual(
  hooks.isVisualizeShareCandidate(retryVariantAssistant, { requestNode: plainVisualizeText }),
  false,
  "an aria-hidden Previous response control must not prove a retry variant"
);
retryPreviousResponse.removeAttribute("aria-hidden");
retryPreviousResponse.isConnected = false;
assert.strictEqual(
  hooks.isVisualizeShareCandidate(retryVariantAssistant, { requestNode: plainVisualizeText }),
  false,
  "a detached Previous response control must not prove a retry variant"
);
retryPreviousResponse.isConnected = true;
const otherTurnPreviousResponse = makeNode({ tagName: "button", attrs: { "aria-label": "Previous response" } });
const unrelatedVariantTurn = makeNode({
  attrs: { "data-testid": "conversation-turn-unrelated-retry" },
  children: [otherTurnPreviousResponse]
});
const currentNonRetryAssistant = makeNode({
  attrs: { "data-message-author-role": "assistant" },
  children: [makeNode({ attrs: { "data-app-block-preview": "true" } })]
});
const currentNonRetryTurn = makeNode({
  attrs: { "data-testid": "conversation-turn-current-non-retry" },
  children: [currentNonRetryAssistant]
});
makeNode({ children: [unrelatedVariantTurn, currentNonRetryTurn] });
assert.strictEqual(
  hooks.isVisualizeShareCandidate(currentNonRetryAssistant, { requestNode: plainVisualizeText }),
  false,
  "another turn's enabled Previous response control must not trigger share mode"
);

assert.strictEqual(typeof hooks.isVisibleEnabledControl, "function");
assert.strictEqual(typeof hooks.findResponseShareButton, "function");
const markdownBody = makeNode({ attrs: { class: "markdown" }, text: "A2 explanation" });
const actionShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "conversation-turn-share" }, text: "Share" });
const actionToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [actionShare] });
const injectedSave = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Save to Obsidian" });
const currentTurn = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [markdownBody, actionToolbar, injectedSave] });
assert.strictEqual(hooks.isVisibleEnabledControl(actionShare), true);
assert.strictEqual(hooks.isVisibleEnabledControl(injectedSave), true);
assert.strictEqual(hooks.findResponseShareButton(currentTurn), actionShare, "share search must include the full current action toolbar");
actionShare.disabled = true;
assert.strictEqual(hooks.isVisibleEnabledControl(actionShare), false);
actionShare.disabled = false;
actionShare.style.display = "none";
assert.strictEqual(hooks.isVisibleEnabledControl(actionShare), false);
actionShare.style.display = "";
actionShare.attrs["aria-hidden"] = "true";
assert.strictEqual(hooks.isVisibleEnabledControl(actionShare), false);
delete actionShare.attrs["aria-hidden"];

const ambiguousShareA = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const ambiguousShareB = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const ambiguousTurn = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [ambiguousShareA, ambiguousShareB] });
assert.strictEqual(hooks.findResponseShareButton(ambiguousTurn), null, "tied share candidates must not be clicked");
const narrowAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, text: "A2" });
const turnToolbarShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const turnToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [turnToolbarShare] });
makeNode({ attrs: { "data-testid": "conversation-turn-1" }, children: [narrowAssistant, turnToolbar] });
assert.strictEqual(
  hooks.findResponseShareButton(narrowAssistant),
  turnToolbarShare,
  "share search must climb to the current turn action toolbar, not only the markdown body"
);
const otherTurnShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-response" }, text: "Share" });
const otherTurn = makeNode({ attrs: { "data-testid": "conversation-turn-other" }, children: [otherTurnShare] });
const scopedTurnShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const scopedActionToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [scopedTurnShare] });
const scopedAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [scopedActionToolbar] });
const scopedTurn = makeNode({ attrs: { "data-testid": "conversation-turn-scoped" }, children: [scopedAssistant] });
makeNode({ children: [otherTurn, scopedTurn] });
assert.strictEqual(
  hooks.findResponseShareButton(scopedAssistant),
  scopedTurnShare,
  "a stronger global or other-turn Share candidate must never be selected"
);

// Conversation-share fallback RED coverage. The live custom-GPT page exposes
// only the header-wide share-chat-button when the current assistant has no
// response-specific Share action. These assertions intentionally describe the
// new public behavior before the production resolver exists.
assert.strictEqual(typeof hooks.resolveResponseShareTrigger, "function");
assert.strictEqual(typeof hooks.resolveConversationShareTrigger, "function");
const missingResponseShare = makeNode({
  tagName: "button",
  attrs: { "aria-label": "응답 복사", "data-testid": "copy-turn-action-button" },
  text: ""
});
const missingResponseToolbar = makeNode({
  attrs: { role: "group", "aria-label": "응답 작업" },
  children: [missingResponseShare, makeNode({ tagName: "button", attrs: { "aria-label": "더 많은 액션" } })]
});
const missingResponseAssistant = makeNode({
  attrs: { "data-message-author-role": "assistant" },
  children: [makeNode({ attrs: { "data-app-block-preview": "true" } }), missingResponseToolbar]
});
const missingResponseTurn = makeNode({
  tagName: "section",
  attrs: { "data-testid": "conversation-turn-missing-share", "data-turn": "assistant", "data-turn-id": "a2-missing-share" },
  children: [missingResponseAssistant]
});
const headerConversationShare = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기"
});
const capabilityDocument = makeDocument([headerConversationShare, missingResponseTurn]);
installDocument(hooks, capabilityDocument);
const missingResolution = hooks.resolveResponseShareTrigger(missingResponseAssistant);
assert.strictEqual(missingResolution.status, "missing", "no response Share control must be diagnosed as missing");
assert.strictEqual(missingResolution.candidateCount, 0);
const conversationResolution = hooks.resolveConversationShareTrigger();
assert.strictEqual(conversationResolution.status, "found", "one visible header share-chat-button must be found for fallback");
assert.strictEqual(conversationResolution.control, headerConversationShare);
assert.strictEqual(conversationResolution.candidateCount, 1);

const promptShareLookalike = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share prompt", "data-testid": "share-chat-button" },
  text: "Share prompt"
});
installDocument(hooks, makeDocument([promptShareLookalike, missingResponseTurn]));
const promptShareResolution = hooks.resolveConversationShareTrigger();
assert.strictEqual(promptShareResolution.status, "missing", "a prompt-share lookalike must not become a whole-conversation fallback");

const artifactShareLookalike = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share", "data-testid": "share-chat-button" },
  text: "Share"
});
const artifactShareBlock = makeNode({
  attrs: { "data-app-block-preview": "true" },
  children: [artifactShareLookalike]
});
installDocument(hooks, makeDocument([artifactShareBlock, missingResponseTurn]));
const artifactShareResolution = hooks.resolveConversationShareTrigger();
assert.strictEqual(artifactShareResolution.status, "missing", "an app-block toolbar lookalike must not become a whole-conversation fallback");

const ambiguousHeaderA = makeNode({ tagName: "button", attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" }, text: "공유하기" });
const ambiguousHeaderB = makeNode({ tagName: "button", attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" }, text: "공유하기" });
installDocument(hooks, makeDocument([ambiguousHeaderA, ambiguousHeaderB, missingResponseTurn]));
const ambiguousConversationResolution = hooks.resolveConversationShareTrigger();
assert.strictEqual(ambiguousConversationResolution.status, "ambiguous", "two header share-chat-button controls must block fallback");
assert.strictEqual(ambiguousConversationResolution.control, null);

// The real custom-GPT topology has a previous-qa Visualize response but no
// response-scoped Share control. The production dispatcher must ask for the
// broader conversation-share consent before clicking the header control and
// must inspect the final Markdown rather than only helper return values.
const conversationVisualizeFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
let conversationDialogDocument;
const conversationDialogInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_conversation_fallback" } });
const conversationDialogClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const conversationDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [conversationDialogInput, conversationDialogClose] });
const conversationHeaderShare = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기",
  onClick: () => conversationDialogDocument.body.appendChild(conversationDialog)
});
conversationDialogDocument = makeDocument([conversationHeaderShare, ...conversationVisualizeFixture.turns]);
installDocument(hooks, conversationDialogDocument);
const conversationSaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
conversationVisualizeFixture.a2.appendChild(conversationSaveButton);
const conversationEvents = [];
let conversationSavedPayload = null;
const conversationSaveResult = await hooks.handleCopyClick(conversationSaveButton, {
  delayMs: 0,
  confirmFn: () => true,
  alertFn: () => {},
  requestClipboardReadPermissionFn: () => Promise.resolve(false),
  requestShareConsentFn: async ({ consentMode }) => {
    conversationEvents.push("consent");
    assert.strictEqual(consentMode, "conversation");
    assert.strictEqual(conversationHeaderShare.clickCount, 0, "conversation Share must not be clicked before its separate consent");
    return { approved: true, permissionGranted: false };
  },
  preflightFn: async ({ visualizeContext }) => {
    conversationEvents.push("preflight");
    assert.strictEqual(visualizeContext.mode, "previous-qa");
    return {
      ok: true,
      mode: "previous-qa",
      title: "Q1 원본 질문",
      filePath: "ChatGPT/conversation-fallback.md",
      questionText: "Q1 원본 질문",
      answerText: "A1 원본 답변",
      explanationText: "",
      fileLinks: [],
      artifactRows: [],
      readableFiles: [],
      fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
      localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
      remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
      richArtifactsExpected: 1
    };
  },
  saveObsidianNoteFn: async payload => {
    conversationEvents.push("native-save");
    conversationSavedPayload = payload;
    return { ok: true };
  }
});
assert.strictEqual(conversationSaveResult.ok, true, "missing response Share must use the approved conversation fallback");
assert.strictEqual(conversationSaveResult.mode, "previous-qa");
assert.strictEqual(conversationSaveResult.shareKind, "conversation");
assert.deepStrictEqual(conversationEvents.slice(0, 2), ["preflight", "consent"]);
assert.strictEqual(conversationHeaderShare.clickCount, 1, "approved conversation fallback must click the header Share exactly once");
assert(conversationSavedPayload.content.includes("capture_status: remote-reference"));
assert(conversationSavedPayload.content.includes("capture_mode: previous-qa-conversation-share-link"));
assert(conversationSavedPayload.content.includes('share_scope: conversation'));
assert(conversationSavedPayload.content.includes('conversation_share_url: "https://chatgpt.com/s/synthetic-t_conversation_fallback"'));
assert(conversationSavedPayload.content.includes("app_provider: visualize"));
assert(conversationSavedPayload.content.includes("app_provenance: verified"));
assert(conversationSavedPayload.content.includes("target_turn_id: \"a2\""));
assert(!conversationSavedPayload.content.includes("visualize_share_url:"), "conversation URL must never be written as visualize_share_url");
assert(conversationSavedPayload.content.includes("# 원본 질문"));
assert(conversationSavedPayload.content.includes("Q1 원본 질문"));
assert(conversationSavedPayload.content.includes("# 원본 답변"));
assert(conversationSavedPayload.content.includes("A1 원본 답변"));

// The live custom-GPT header Share has a second, valid outcome: it can copy an
// already-public whole-conversation URL immediately without opening any
// dialog or menu.  Add the real Korean status signal before the implementation
// exists so this path is an intentional RED test rather than an untested
// assumption that every header Share opens a surface.
assert.strictEqual(typeof hooks.waitForConversationShareOutcome, "function");
assert.strictEqual(typeof hooks.captureConversationShareCopySignals, "function");
const wrongKindOutcome = await hooks.waitForConversationShareOutcome({ shareKind: "response", timeoutMs: 10 });
assert.strictEqual(wrongKindOutcome.ok, false, "instant-copy outcome waiting is conversation-only");
assert.strictEqual(wrongKindOutcome.kind, "unresolved");
const instantCopyFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
let instantCopyDocument;
const instantCopyHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기",
  onClick: () => {
    instantCopyDocument.body.appendChild(makeNode({
      attrs: { role: "alert", class: "px-3 py-2 rounded-lg inline-flex" },
      text: "공개 링크가 클립보드에 복사되었습니다 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
    }));
    instantCopyDocument.body.appendChild(makeNode({
      attrs: { role: "status", "aria-live": "polite", class: "sr-only" },
      text: "공개 링크가 클립보드에 복사되었습니다. 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
    }));
  }
});
instantCopyDocument = makeDocument([instantCopyHeader, ...instantCopyFixture.turns]);
installDocument(hooks, instantCopyDocument);
const instantBeforeSignals = hooks.captureConversationShareCopySignals(instantCopyDocument);
assert.strictEqual(instantBeforeSignals.length, 0);
instantCopyHeader.click();
const instantOutcome = await hooks.waitForConversationShareOutcome({
  root: instantCopyDocument,
  beforeSurfaces: [],
  beforeCopySignals: [],
  getDialogs: () => [],
  timeoutMs: 80,
  pollMs: 1
});
assert.strictEqual(instantOutcome.ok, true);
assert.strictEqual(instantOutcome.kind, "instant-copy");
assert(instantOutcome.signal);

// The visual toast and its sr-only live-region mirror represent one action,
// but two independent visual events must remain fail-closed and retain their
// exact ambiguity subtype.
const duplicateVisualSignalsDocument = makeDocument([
  makeNode({
    attrs: { role: "alert", class: "px-3 py-2 rounded-lg inline-flex" },
    text: "공개 링크가 클립보드에 복사되었습니다 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
  }),
  makeNode({
    attrs: { role: "alert", class: "px-3 py-2 rounded-lg inline-flex" },
    text: "공개 링크가 클립보드에 복사되었습니다. 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
  })
]);
const duplicateVisualSignalsOutcome = await hooks.waitForConversationShareOutcome({
  root: duplicateVisualSignalsDocument,
  beforeSurfaces: [],
  beforeCopySignals: [],
  getDialogs: () => [],
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(duplicateVisualSignalsOutcome.ok, false);
assert.strictEqual(duplicateVisualSignalsOutcome.ambiguitySubtype, "multiple-copy-signals");
assert.strictEqual(duplicateVisualSignalsOutcome.reason, "multiple fresh conversation share copy signals");

const simultaneousOutcomeSurface = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_simultaneous_surface" } }),
    makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" })
  ]
});
const simultaneousOutcomeDocument = makeDocument([
  simultaneousOutcomeSurface,
  makeNode({
    attrs: { role: "status", "aria-live": "polite", class: "sr-only" },
    text: "공개 링크가 클립보드에 복사되었습니다. 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
  })
]);
const simultaneousOutcome = await hooks.waitForConversationShareOutcome({
  root: simultaneousOutcomeDocument,
  beforeSurfaces: [],
  beforeCopySignals: [],
  getDialogs: () => [simultaneousOutcomeSurface],
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(simultaneousOutcome.ok, false);
assert.strictEqual(simultaneousOutcome.ambiguitySubtype, "surface-and-copy-signal");
assert.strictEqual(simultaneousOutcome.reason, "a conversation share surface and copy signal appeared together");

const multipleSurfaceA = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_surface_a" } }),
    makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" })
  ]
});
const multipleSurfaceB = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_surface_b" } }),
    makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" })
  ]
});
const multipleSurfacesDocument = makeDocument([multipleSurfaceA, multipleSurfaceB]);
const multipleSurfacesOutcome = await hooks.waitForConversationShareOutcome({
  root: multipleSurfacesDocument,
  beforeSurfaces: [],
  beforeCopySignals: [],
  getDialogs: () => [multipleSurfaceA, multipleSurfaceB],
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(multipleSurfacesOutcome.ok, false);
assert.strictEqual(multipleSurfacesOutcome.ambiguitySubtype, "multiple-surfaces");
assert.strictEqual(multipleSurfacesOutcome.reason, "multiple fresh conversation share surfaces");

let instantClipboardReads = 0;
let instantSavedPayload = null;
const instantCopyClicksBeforeSave = instantCopyHeader.clickCount;
const instantCopySaveButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
instantCopyFixture.a2.appendChild(instantCopySaveButton);
const instantCopySaveResult = await hooks.handleVisualizeShareSave({
  btn: instantCopySaveButton,
  currentAssistantNode: instantCopyFixture.a2,
  previousQa: {
    questionText: "Q1 즉시 복사 질문",
    answerText: "A1 즉시 복사 답변",
    answerNode: instantCopyFixture.a1,
    requestNode: instantCopyFixture.q2
  },
  visualizeContext: { mode: "previous-qa" },
  sharePlan: { status: "found", kind: "conversation", control: instantCopyHeader },
  runtimeGuard: {
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null
  },
  sourceUrl: "https://chatgpt.com/c/synthetic-instant-copy",
  preflightFn: async () => ({
    ok: true,
    mode: "previous-qa",
    title: "즉시 복사 대화 공유",
    filePath: "ChatGPT/instant-copy.md",
    questionText: "Q1 즉시 복사 질문",
    answerText: "A1 즉시 복사 답변",
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1,
    targetTurnId: "a2"
  }),
  requestShareConsentFn: async () => {
    assert.strictEqual(instantCopyHeader.clickCount, instantCopyClicksBeforeSave, "instant-copy Share must wait for conversation consent");
    return { approved: true, permissionGranted: true };
  },
  shareOptions: {
    root: instantCopyDocument,
    getDialogs: () => [],
    readClipboardText: async () => {
      instantClipboardReads += 1;
      return "https://chatgpt.com/s/synthetic-t_instant_copy";
    }
  },
  saveObsidianNoteFn: async payload => {
    instantSavedPayload = payload;
    return { ok: true };
  },
  alertFn: () => {}
});
assert.strictEqual(instantCopySaveResult.ok, true);
assert.strictEqual(instantCopyHeader.clickCount, instantCopyClicksBeforeSave + 1, "the save path must click Share exactly once");
assert.strictEqual(instantClipboardReads, 1, "instant-copy must read the clipboard exactly once after a fresh signal");
assert.strictEqual(instantCopySaveResult.shareInteraction, "instant-copy");
assert.strictEqual(instantCopySaveResult.shareCreatedThisAttempt, false);
assert.strictEqual(instantCopySaveResult.shareUpdatedThisAttempt, false);
assert.strictEqual(instantCopySaveResult.conversationShareActionOccurred, true);
assert(instantSavedPayload.content.includes("capture_status: remote-reference"));
assert(instantSavedPayload.content.includes("share_interaction: instant-copy"));
assert(instantSavedPayload.content.includes("conversation_share_freshness: unverified"));
assert(instantSavedPayload.content.includes('conversation_share_url: "https://chatgpt.com/s/synthetic-t_instant_copy"'));
assert(!instantSavedPayload.content.includes("visualize_share_url:"));

// Permission denied/read unavailable must use the existing empty manual URL
// fallback without attempting a clipboard read.
const manualInstantFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
let manualInstantDocument;
const manualInstantHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기",
  onClick: () => manualInstantDocument.body.appendChild(makeNode({
    attrs: { role: "status", "aria-live": "polite" },
    text: "공개 링크가 클립보드에 복사되었습니다. 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
  }))
});
manualInstantDocument = makeDocument([manualInstantHeader, ...manualInstantFixture.turns]);
installDocument(hooks, manualInstantDocument);
let manualInstantClipboardReads = 0;
let manualInstantPrompts = 0;
const manualInstantResult = await hooks.createOrReuseVisualizeShareLink(manualInstantFixture.a2, {
  root: manualInstantDocument,
  shareKind: "conversation",
  shareTrigger: manualInstantHeader,
  clipboardPermissionGranted: false,
  readClipboardText: async () => {
    manualInstantClipboardReads += 1;
    return "https://chatgpt.com/s/synthetic-t_must-not-read";
  },
  requestManualShareUrl: async () => {
    manualInstantPrompts += 1;
    return "https://chatgpt.com/s/synthetic-t_manual_instant";
  },
  getDialogs: () => []
});
assert.strictEqual(manualInstantResult.ok, true);
assert.strictEqual(manualInstantResult.url, "https://chatgpt.com/s/synthetic-t_manual_instant");
assert.strictEqual(manualInstantClipboardReads, 0);
assert.strictEqual(manualInstantPrompts, 1);
assert.strictEqual(manualInstantResult.shareInteraction, "instant-copy");

// A stale signal that existed before the click and a generic "copied" toast
// are not evidence of this conversation Share action.
const staleInstantFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
const staleInstantStatus = makeNode({
  attrs: { role: "status", "aria-live": "polite" },
  text: "공개 링크가 클립보드에 복사되었습니다. 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
});
let staleInstantDocument;
const staleInstantHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기"
});
staleInstantDocument = makeDocument([staleInstantStatus, staleInstantHeader, ...staleInstantFixture.turns]);
installDocument(hooks, staleInstantDocument);
let staleInstantClipboardReads = 0;
const staleInstantResult = await hooks.createOrReuseVisualizeShareLink(staleInstantFixture.a2, {
  root: staleInstantDocument,
  shareKind: "conversation",
  shareTrigger: staleInstantHeader,
  clipboardPermissionGranted: true,
  readClipboardText: async () => {
    staleInstantClipboardReads += 1;
    return "https://chatgpt.com/s/synthetic-t_stale_should-not-save";
  },
  getDialogs: () => [],
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(staleInstantResult.ok, false);
assert.strictEqual(staleInstantClipboardReads, 0);

const genericToastFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
let genericToastDocument;
const genericToastHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기",
  onClick: () => genericToastDocument.body.appendChild(makeNode({ attrs: { role: "status" }, text: "복사됨" }))
});
genericToastDocument = makeDocument([genericToastHeader, ...genericToastFixture.turns]);
installDocument(hooks, genericToastDocument);
const genericToastResult = await hooks.createOrReuseVisualizeShareLink(genericToastFixture.a2, {
  root: genericToastDocument,
  shareKind: "conversation",
  shareTrigger: genericToastHeader,
  clipboardPermissionGranted: true,
  readClipboardText: async () => "https://chatgpt.com/s/synthetic-t_generic_should-not-save",
  getDialogs: () => [],
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(genericToastResult.ok, false);

let invalidSignalClipboardReads = 0;
const invalidSignalResult = await hooks.resolveShareUrlFromInstantCopy({ text: "복사됨" }, {
  clipboardPermissionGranted: true,
  readClipboardText: async () => {
    invalidSignalClipboardReads += 1;
    return "https://chatgpt.com/s/synthetic-t_invalid_signal";
  }
});
assert.strictEqual(invalidSignalResult.ok, false);
assert.strictEqual(invalidSignalClipboardReads, 0, "clipboard must not be read without a verified fresh whole-conversation signal");

// No classified surface and no fresh whole-conversation signal must stop the
// complete save pipeline before Native or any URI fallback is attempted.
let noOutcomeNativeSaves = 0;
const noOutcomeFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
const noOutcomeDocument = noOutcomeFixture.document;
const noOutcomeHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기"
});
noOutcomeDocument.body.appendChild(noOutcomeHeader);
installDocument(hooks, noOutcomeDocument);
const noOutcomeResult = await hooks.handleVisualizeShareSave({
  btn: makeNode({ tagName: "button", text: "Obsidian 저장" }),
  currentAssistantNode: noOutcomeFixture.a2,
  previousQa: {
    questionText: "Q1 결과 없음",
    answerText: "A1 결과 없음",
    answerNode: noOutcomeFixture.a1,
    requestNode: noOutcomeFixture.q2
  },
  visualizeContext: { mode: "previous-qa" },
  sharePlan: { status: "found", kind: "conversation", control: noOutcomeHeader },
  runtimeGuard: {
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null
  },
  sourceUrl: "https://chatgpt.com/c/synthetic-no-outcome",
  preflightFn: async () => ({
    ok: true,
    mode: "previous-qa",
    title: "결과 없는 대화 공유",
    filePath: "ChatGPT/no-outcome.md",
    questionText: "Q1 결과 없음",
    answerText: "A1 결과 없음",
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1,
    targetTurnId: "a2"
  }),
  requestShareConsentFn: async () => ({ approved: true, permissionGranted: true }),
  shareOptions: { root: noOutcomeDocument, getDialogs: () => [], timeoutMs: 20, pollMs: 1 },
  saveObsidianNoteFn: async () => {
    noOutcomeNativeSaves += 1;
    return { ok: true };
  },
  alertFn: () => {}
});
assert.strictEqual(noOutcomeResult.ok, false);
assert.strictEqual(noOutcomeNativeSaves, 0);

// A Native failure after instant-copy must describe a copied public link, not
// claim that Create/Update ran.
const instantNativeFailureFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
let instantNativeFailureDocument;
const instantNativeFailureHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기",
  onClick: () => instantNativeFailureDocument.body.appendChild(makeNode({
    attrs: { role: "status", "aria-live": "polite" },
    text: "공개 링크가 클립보드에 복사되었습니다. 이 링크가 있으면 누구나 이 대화를 볼 수 있습니다"
  }))
});
instantNativeFailureDocument = makeDocument([instantNativeFailureHeader, ...instantNativeFailureFixture.turns]);
installDocument(hooks, instantNativeFailureDocument);
const instantNativeFailureAlerts = [];
const instantNativeFailureResult = await hooks.handleVisualizeShareSave({
  btn: makeNode({ tagName: "button", text: "Obsidian 저장" }),
  currentAssistantNode: instantNativeFailureFixture.a2,
  previousQa: {
    questionText: "Q1 Native 실패",
    answerText: "A1 Native 실패",
    answerNode: instantNativeFailureFixture.a1,
    requestNode: instantNativeFailureFixture.q2
  },
  visualizeContext: { mode: "previous-qa" },
  sharePlan: { status: "found", kind: "conversation", control: instantNativeFailureHeader },
  runtimeGuard: {
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null
  },
  sourceUrl: "https://chatgpt.com/c/synthetic-instant-native-failure",
  preflightFn: async () => ({
    ok: true,
    mode: "previous-qa",
    title: "즉시 복사 Native 실패",
    filePath: "ChatGPT/instant-native-failure.md",
    questionText: "Q1 Native 실패",
    answerText: "A1 Native 실패",
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1,
    targetTurnId: "a2"
  }),
  requestShareConsentFn: async () => ({ approved: true, permissionGranted: true }),
  shareOptions: {
    root: instantNativeFailureDocument,
    getDialogs: () => [],
    readClipboardText: async () => "https://chatgpt.com/s/synthetic-t_instant_native_failure"
  },
  saveObsidianNoteFn: async () => ({ ok: false, error: "native failure" }),
  alertFn: message => instantNativeFailureAlerts.push(String(message))
});
assert.strictEqual(instantNativeFailureResult.ok, false);
assert(instantNativeFailureAlerts.some(message => /클립보드에 복사됐지만/.test(message)));
assert(!instantNativeFailureAlerts.some(message => /생성되거나 업데이트됐지만/.test(message)));

// Conversation fallback still honors the existing explicit partial-capture
// consent for a missing local A1 rich artifact. The remote-reference note
// must retain the permanent warning in the saved Q1/A1 body.
let partialConversationSavedPayload = null;
const partialConversationResult = await hooks.handleVisualizeShareSave({
  btn: conversationSaveButton,
  currentAssistantNode: conversationVisualizeFixture.a2,
  previousQa: {
    questionText: "Q1 부분 저장 질문",
    answerText: "A1 부분 저장 답변",
    answerNode: conversationVisualizeFixture.a1,
    requestNode: conversationVisualizeFixture.q2
  },
  visualizeContext: { mode: "previous-qa" },
  sharePlan: { status: "found", kind: "conversation", control: conversationHeaderShare },
  runtimeGuard: {
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null
  },
  sourceUrl: "https://chatgpt.com/c/synthetic-conversation-partial-warning",
  preflightFn: async () => ({
    ok: true,
    mode: "previous-qa",
    title: "부분 저장 대화 공유",
    filePath: "ChatGPT/conversation-partial-warning.md",
    questionText: "Q1 부분 저장 질문",
    answerText: "A1 부분 저장 답변",
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: {
      complete: false,
      expectedCount: 1,
      completeCount: 0,
      missingCount: 1,
      missingItems: [{ id: "a1-rich-0" }]
    },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1,
    targetTurnId: "a2"
  }),
  confirmFn: () => true,
  requestShareConsentFn: async () => ({ approved: true, permissionGranted: false }),
  createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/s/synthetic-t_conversation_partial_warning", source: "existing" }),
  saveObsidianNoteFn: async payload => {
    partialConversationSavedPayload = payload;
    return { ok: true };
  },
  alertFn: () => {}
});
assert.strictEqual(partialConversationResult.ok, true);
assert(partialConversationSavedPayload.content.includes("상호작용형 앱 블록 미저장"), "conversation previous-qa partial consent must preserve the missing-rich warning");

// Conversation metadata requires the current turn identifier. This must be
// checked before the share click so an otherwise valid header fallback cannot
// create a link and only then discover that the final note is unassemblable.
const missingTargetConversationFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
const missingTargetConversationTurn = missingTargetConversationFixture.a2.closest("[data-testid^='conversation-turn-']");
missingTargetConversationTurn.removeAttribute("data-turn-id");
const missingTargetConversationHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  text: "공유하기"
});
const missingTargetConversationDocument = makeDocument([missingTargetConversationHeader, ...missingTargetConversationFixture.turns]);
installDocument(hooks, missingTargetConversationDocument);
let missingTargetConversationShareCalls = 0;
let missingTargetConversationCreateCalls = 0;
const missingTargetConversationResult = await hooks.handleVisualizeShareSave({
  btn: { closest: () => missingTargetConversationFixture.a2 },
  currentAssistantNode: missingTargetConversationFixture.a2,
  previousQa: {
    questionText: "Q1 대상 ID 없음",
    answerText: "A1 대상 ID 없음",
    answerNode: missingTargetConversationFixture.a1,
    requestNode: missingTargetConversationFixture.q2
  },
  visualizeContext: { mode: "previous-qa" },
  sharePlan: { status: "found", kind: "conversation", control: missingTargetConversationHeader },
  runtimeGuard: {
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null
  },
  sourceUrl: "https://chatgpt.com/c/synthetic-conversation-missing-target-id",
  preflightFn: async () => ({
    ok: true,
    mode: "previous-qa",
    title: "대상 ID 없는 대화 공유",
    filePath: "ChatGPT/conversation-missing-target-id.md",
    questionText: "Q1 대상 ID 없음",
    answerText: "A1 대상 ID 없음",
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1
  }),
  requestShareConsentFn: async () => {
    missingTargetConversationShareCalls += 1;
    return { approved: true, permissionGranted: false };
  },
  createShareLinkFn: async () => {
    missingTargetConversationCreateCalls += 1;
    return { ok: true, url: "https://chatgpt.com/s/synthetic-t_should-not-be-created", source: "created" };
  },
  saveObsidianNoteFn: async () => ({ ok: true }),
  alertFn: () => {}
});
assert.strictEqual(missingTargetConversationResult.ok, false);
assert.strictEqual(missingTargetConversationResult.stage, "preflight");
assert.strictEqual(missingTargetConversationShareCalls, 0, "missing conversation target ID must stop before user share consent");
assert.strictEqual(missingTargetConversationCreateCalls, 0, "missing conversation target ID must stop before any Share click");

// A conversation-share surface that exposes an existing URL plus an Update
// control must never be silently reused. The update needs its own explicit
// approval and may be clicked at most once before a fresh URL is validated.
let staleConversationDialogOpen = false;
const staleConversationInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_stale_conversation" } });
const staleConversationUpdate = makeNode({ tagName: "button", text: "Update link" });
const staleConversationClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const staleConversationDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [staleConversationInput, staleConversationUpdate, staleConversationClose] });
const staleConversationShare = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  onClick: () => { staleConversationDialogOpen = true; }
});
staleConversationUpdate.click = () => {
  staleConversationUpdate.clickCount += 1;
  staleConversationInput.value = "https://chatgpt.com/s/synthetic-t_updated_conversation";
};
const staleConversationAssistant = conversationVisualizeFixture.a2;
const staleConversationDoc = makeDocument([staleConversationShare, ...conversationVisualizeFixture.turns]);
installDocument(hooks, staleConversationDoc);
const staleDeclined = await hooks.createOrReuseVisualizeShareLink(staleConversationAssistant, {
  root: staleConversationDoc,
  shareKind: "conversation",
  shareTrigger: staleConversationShare,
  requestConversationShareUpdateConsent: async () => false,
  getDialogs: () => staleConversationDialogOpen ? [staleConversationDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: staleConversationDialog, kind: "final" })
});
assert.strictEqual(staleDeclined.ok, false, "conversation stale URL must stop when update consent is declined");
assert.strictEqual(staleDeclined.stage, "share-update");
assert.strictEqual(staleConversationUpdate.clickCount, 0, "declining stale-link update must not click Update");

staleConversationDialogOpen = false;
staleConversationInput.value = "https://chatgpt.com/s/synthetic-t_stale_conversation";
const staleApproved = await hooks.createOrReuseVisualizeShareLink(staleConversationAssistant, {
  root: staleConversationDoc,
  shareKind: "conversation",
  shareTrigger: staleConversationShare,
  requestConversationShareUpdateConsent: async () => true,
  getDialogs: () => staleConversationDialogOpen ? [staleConversationDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: staleConversationDialog, kind: "final" }),
  waitForUpdatedShareUrl: async () => ({ ok: true, url: "https://chatgpt.com/s/synthetic-t_updated_conversation", surface: staleConversationDialog })
});
assert.strictEqual(staleApproved.ok, true, "approved stale-link update must return the newly validated URL");
assert.strictEqual(staleApproved.url, "https://chatgpt.com/s/synthetic-t_updated_conversation");
assert.strictEqual(staleApproved.shareUpdatedThisAttempt, true);
assert.strictEqual(staleConversationUpdate.clickCount, 1, "Update link must be clicked at most once");

// ChatGPT may expose an update action as a menu item rather than a button.
// It is still an update-capable share surface and must not silently reuse a
// potentially stale conversation URL.
let menuUpdateDialogOpen = false;
const menuUpdateInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_menu_stale" } });
const menuUpdateControl = makeNode({ tagName: "div", attrs: { role: "menuitem" }, text: "Update link" });
const menuUpdateClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const menuUpdateDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [menuUpdateInput, menuUpdateControl, menuUpdateClose] });
const menuUpdateHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  onClick: () => { menuUpdateDialogOpen = true; }
});
const menuUpdateDocument = makeDocument([menuUpdateHeader, ...conversationVisualizeFixture.turns]);
installDocument(hooks, menuUpdateDocument);
menuUpdateControl.click = () => { menuUpdateControl.clickCount += 1; };
const menuUpdateResult = await hooks.createOrReuseVisualizeShareLink(staleConversationAssistant, {
  root: menuUpdateDocument,
  shareKind: "conversation",
  shareTrigger: menuUpdateHeader,
  requestConversationShareUpdateConsent: async () => true,
  getDialogs: () => menuUpdateDialogOpen ? [menuUpdateDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: menuUpdateDialog, kind: "final" }),
  waitForUpdatedShareUrl: async () => ({ ok: true, url: "https://chatgpt.com/s/synthetic-t_menu_updated", surface: menuUpdateDialog })
});
assert.strictEqual(menuUpdateResult.ok, true, "a menuitem Update link must use the stale-link update path");
assert.strictEqual(menuUpdateResult.url, "https://chatgpt.com/s/synthetic-t_menu_updated");
assert.strictEqual(menuUpdateResult.shareUpdatedThisAttempt, true);
assert.strictEqual(menuUpdateControl.clickCount, 1, "menuitem Update link must be clicked at most once");

const noConversationHeaderTurn = makeConversationTurn("assistant", "no fallback", [makeNode({ attrs: { "data-app-block-preview": "true" } })], "no-fallback-a2");
const noConversationDoc = makeDocument([noConversationHeaderTurn]);
installDocument(hooks, noConversationDoc);
const noConversationPlan = hooks.resolveVisualizeShareTriggerPlan(noConversationHeaderTurn.querySelector("[data-message-author-role]"));
assert.strictEqual(noConversationPlan.status, "unavailable", "missing response and conversation Share must stop safely");
assert.strictEqual(noConversationPlan.control, null);

// Provider-neutral conversation metadata must retain the body mode without
// ever claiming that a conversation URL is a Visualize-specific URL.
const conversationDirectMarkdown = hooks.buildConversationShareMarkdown({
  title: "직접 대화 공유",
  sourceUrl: "https://chatgpt.com/c/synthetic-direct-conversation",
  shareUrl: "https://chatgpt.com/s/synthetic-t_direct_conversation",
  bodyMode: "direct-visualize",
  questionText: "직접 시각화 요청",
  explanationText: "앱 바깥 설명",
  targetTurnId: "a2-direct",
  richArtifactsExpected: 1,
  richArtifactsRemoteReferenced: 1
});
assert(conversationDirectMarkdown.includes("capture_mode: direct-visualize-conversation-share-link"));
assert(conversationDirectMarkdown.includes('conversation_share_url: "https://chatgpt.com/s/synthetic-t_direct_conversation"'));
assert(!conversationDirectMarkdown.includes("visualize_share_url:"));
const conversationContinuationMarkdown = hooks.buildConversationShareMarkdown({
  title: "후속 앱 대화 공유",
  sourceUrl: "https://chatgpt.com/c/synthetic-continuation-conversation",
  shareUrl: "https://chatgpt.com/s/synthetic-t_continuation_conversation",
  bodyMode: "rich-app-continuation",
  questionText: "다음 섹션을 보여줘",
  explanationText: "현재 앱 설명",
  targetTurnId: "a2-continuation",
  richArtifactsExpected: 1
});
assert(conversationContinuationMarkdown.includes("capture_mode: rich-app-continuation-conversation-share-link"));
assert(conversationContinuationMarkdown.includes('conversation_share_url: "https://chatgpt.com/s/synthetic-t_continuation_conversation"'));
assert(!conversationContinuationMarkdown.includes("visualize_share_url:"));

// If both scopes exist, an unambiguous response-specific trigger must remain
// first priority and the header control must not be selected.
const responsePriorityTurn = makeConversationTurn("assistant", "response priority", [], "response-priority");
const responsePriorityAssistant = responsePriorityTurn.querySelector("[data-message-author-role]");
const responsePriorityShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-response" }, text: "Share" });
responsePriorityAssistant.appendChild(makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [responsePriorityShare] }));
const responsePriorityHeader = makeNode({ tagName: "button", attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" }, text: "공유하기" });
const responsePriorityDoc = makeDocument([responsePriorityHeader, responsePriorityTurn]);
installDocument(hooks, responsePriorityDoc);
const responsePriorityPlan = hooks.resolveVisualizeShareTriggerPlan(responsePriorityAssistant);
assert.strictEqual(responsePriorityPlan.status, "found");
assert.strictEqual(responsePriorityPlan.kind, "response");
assert.strictEqual(responsePriorityPlan.control, responsePriorityShare);

// A validated conversation URL is mandatory. A final surface without a URL
// must stop before Native and must not manufacture remote-reference metadata.
const failedConversationFixture = makeVisualizeConversationFixture({
  includePreviousQa: true,
  q2Text: PREVIOUS_ANSWER_VISUALIZE_REQUEST
});
let failedConversationDialogOpen = false;
let failedConversationNativeSaves = 0;
const failedConversationDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" })] });
const failedConversationHeader = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" },
  onClick: () => { failedConversationDialogOpen = true; }
});
const failedConversationDoc = makeDocument([failedConversationHeader, ...failedConversationFixture.turns]);
installDocument(hooks, failedConversationDoc);
const failedConversationButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
failedConversationFixture.a2.appendChild(failedConversationButton);
const failedConversationResult = await hooks.handleCopyClick(failedConversationButton, {
  delayMs: 0,
  confirmFn: () => true,
  alertFn: () => {},
  requestClipboardReadPermissionFn: () => Promise.resolve(false),
  requestShareConsentFn: async ({ consentMode }) => {
    assert.strictEqual(consentMode, "conversation");
    return { approved: true, permissionGranted: false };
  },
  preflightFn: async () => ({
    ok: true,
    mode: "previous-qa",
    title: "URL 없는 대화 공유",
    filePath: "ChatGPT/url-failure.md",
    questionText: "Q1 원본 질문",
    answerText: "A1 원본 답변",
    explanationText: "",
    fileLinks: [],
    artifactRows: [],
    readableFiles: [],
    fileIntegrity: { complete: true, expectedHtmlNames: [], expectedDeliverableNames: [] },
    localRichIntegrity: { complete: true, expectedCount: 0, completeCount: 0 },
    remoteRichIntegrity: { complete: false, expectedCount: 1, completeCount: 0 },
    richArtifactsExpected: 1
  }),
  shareOptions: {
    getDialogs: () => failedConversationDialogOpen ? [failedConversationDialog] : [],
    waitForRelevantShareDialog: async () => ({ ok: true, dialog: failedConversationDialog, kind: "final" })
  },
  saveObsidianNoteFn: async () => {
    failedConversationNativeSaves += 1;
    return { ok: true };
  }
});
assert.strictEqual(failedConversationResult.ok, false);
assert.strictEqual(failedConversationResult.stage, "create-link");
assert.strictEqual(failedConversationNativeSaves, 0, "URL failure must not reach Native remote-reference save");

const ambiguousFallbackTurn = makeConversationTurn("assistant", "ambiguous", [], "ambiguous-fallback");
const ambiguousFallbackShareA = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-response" }, text: "Share" });
const ambiguousFallbackShareB = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-response-secondary" }, text: "Share" });
const ambiguousFallbackAssistant = ambiguousFallbackTurn.querySelector("[data-message-author-role]");
ambiguousFallbackAssistant.appendChild(makeNode({ attrs: { "data-app-block-preview": "true" } }));
ambiguousFallbackAssistant.appendChild(makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [ambiguousFallbackShareA, ambiguousFallbackShareB] }));
const ambiguousFallbackHeader = makeNode({ tagName: "button", attrs: { "aria-label": "공유하기", "data-testid": "share-chat-button" }, text: "공유하기" });
const ambiguousFallbackDocument = makeDocument([ambiguousFallbackHeader, ambiguousFallbackTurn]);
installDocument(hooks, ambiguousFallbackDocument);
const ambiguousPlan = hooks.resolveVisualizeShareTriggerPlan(ambiguousFallbackAssistant);
assert.strictEqual(ambiguousPlan.status, "blocked");
assert.strictEqual(ambiguousPlan.kind, "response");
assert.strictEqual(ambiguousFallbackHeader.clickCount, 0, "ambiguous response Share must never fall back to conversation Share");

assert.strictEqual(typeof hooks.visualizeShareMetadata, "function");
assert.strictEqual(typeof hooks.buildVisualizeShareMarkdown, "function");
assert.strictEqual(typeof hooks.buildVisualizeShareReferenceWarning, "function");
hooks.setTestLanguage("ko");
const sourceUrl = "https://chatgpt.com/c/synthetic-original-conversation";
const shareUrl = "https://chatgpt.com/s/synthetic-t_visualize";
const metadata = hooks.visualizeShareMetadata({ sourceUrl, shareUrl, richArtifactsExpected: 1 });
assert.strictEqual(metadata.captureStatus, "remote-reference");
assert.strictEqual(metadata.captureMode, "previous-qa-visualize-share-link");
assert.strictEqual(metadata.richArtifactsLocalComplete, 0);
assert.strictEqual(metadata.richArtifactsRemoteReferenced, 1);
assert.strictEqual(metadata.offlineAvailable, false);
const warning = hooks.buildVisualizeShareReferenceWarning();
assert(warning.includes("[!warning]"));
const shareMarkdown = hooks.buildVisualizeShareMarkdown({
  title: "원래 질문 제목",
  sourceUrl,
  shareUrl,
  questionText: "Q1 전체 질문",
  answerText: "A1 전체 답변",
  richArtifactsExpected: 1,
  richArtifactsRemoteReferenced: 1,
  captureMode: "previous-qa-visualize-share-link"
});
[
  "capture_status: remote-reference",
  "capture_mode: previous-qa-visualize-share-link",
  "rich_artifacts_local_complete: 0",
  "rich_artifacts_remote_referenced: 1",
  "offline_available: false",
  "# 시각화",
  "# 원본 질문",
  "Q1 전체 질문",
  "# 원본 답변",
  "A1 전체 답변",
  shareUrl,
  "[!warning]"
].forEach(fragment => assert(shareMarkdown.includes(fragment), `share note must contain ${fragment}`));
assert(!shareMarkdown.includes("Q2"));
assert(!shareMarkdown.includes("]()"));

assert.strictEqual(typeof hooks.extractValidatedChatGptShareUrl, "function");
const existingShareInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_existing" } });
const existingShareDialog = makeNode({ children: [existingShareInput] });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(existingShareDialog), "https://chatgpt.com/s/synthetic-t_existing");
const relativeShareInput = makeNode({ tagName: "input", attrs: { value: "/share/synthetic-t_relative" } });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(makeNode({ children: [relativeShareInput] })), "https://chatgpt.com/share/synthetic-t_relative");
const invalidShareInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/c/synthetic-not-a-share" } });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(makeNode({ children: [invalidShareInput] })), "");
const ambiguousShareUrls = makeNode({
  children: [
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_first" } }),
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_second" } })
  ]
});
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(ambiguousShareUrls), "", "two distinct visible share URLs must fail as ambiguous");
const shareTextDialog = makeNode({ text: "공유 링크: https://chatgpt.com/s/synthetic-t_from_text" });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(shareTextDialog), "https://chatgpt.com/s/synthetic-t_from_text");
const dialogWithoutUrl = makeNode({ attrs: { role: "dialog" }, text: "공유 링크를 만들 수 있습니다." });
const staleOutsideShareLink = makeNode({ tagName: "a", attrs: { href: "https://chatgpt.com/s/synthetic-t_outside_dialog" }, text: "stale" });
assert.strictEqual(
  hooks.extractValidatedChatGptShareUrl(dialogWithoutUrl),
  "",
  "a share URL outside the current dialog must never be reused"
);
dialogWithoutUrl.childNodes.push(staleOutsideShareLink);
staleOutsideShareLink.parentElement = dialogWithoutUrl;
assert.strictEqual(
  hooks.extractValidatedChatGptShareUrl(dialogWithoutUrl),
  "https://chatgpt.com/s/synthetic-t_outside_dialog",
  "a URL becomes eligible only after it is actually inside the current dialog"
);

[
  "getShareSurfaceCandidates",
  "getVisibleShareDialogs",
  "waitForRelevantShareDialog",
  "findCreateShareLinkButton",
  "findCopyShareLinkButton",
  "findCloseShareDialogButton",
  "captureCopySuccessState",
  "waitForCopySuccess",
  "resolveShareUrlFromCopySurface",
  "requestManualVisualizeShareUrl",
  "requestVisualizeShareConsent",
  "waitForValidatedShareUrl",
  "createOrReuseVisualizeShareLink"
].forEach(name => assert.strictEqual(typeof hooks[name], "function", `${name} must be exposed`));
const createButton = makeNode({ tagName: "button", text: "Create link" });
const closeButton = makeNode({ tagName: "button", text: "Close", attrs: { "aria-label": "Close" } });
const visibleDialog = makeNode({ attrs: { role: "dialog" }, children: [createButton, closeButton] });
const hiddenDialog = makeNode({ attrs: { role: "dialog" } });
hiddenDialog.style.display = "none";
const visibleDialogs = hooks.getVisibleShareDialogs(makeNode({ children: [visibleDialog, hiddenDialog] }));
const allDialogCandidates = hooks.getShareSurfaceCandidates(makeNode({ children: [visibleDialog, hiddenDialog] }));
assert.strictEqual(allDialogCandidates.length, 2, "pre-click snapshots must retain hidden candidate surfaces");
assert.strictEqual(visibleDialogs.length, 1);
assert.strictEqual(visibleDialogs[0], visibleDialog);
assert.strictEqual(hooks.findCreateShareLinkButton(visibleDialog), createButton);
assert.strictEqual(hooks.findCloseShareDialogButton(visibleDialog), closeButton);

const uniqueCopy = makeNode({ tagName: "button", text: "Copy link" });
const uniqueCopySurface = makeNode({ attrs: { role: "dialog" }, children: [uniqueCopy] });
assert.strictEqual(hooks.findCopyShareLinkButton(uniqueCopySurface), uniqueCopy);
const visibleTextCopy = makeNode({ tagName: "button", attrs: { "aria-label": "Copy" }, text: "링크 복사" });
assert.strictEqual(
  hooks.findCopyShareLinkButton(makeNode({ attrs: { role: "dialog" }, children: [visibleTextCopy] })),
  visibleTextCopy,
  "visible Copy-link text must remain eligible even when a generic aria-label is present"
);
const ambiguousCopySurface = makeNode({
  attrs: { role: "dialog" },
  children: [
    makeNode({ tagName: "button", text: "Copy link" }),
    makeNode({ tagName: "button", text: "링크 복사" })
  ]
});
assert.strictEqual(hooks.findCopyShareLinkButton(ambiguousCopySurface), null, "two Copy-link controls must fail closed");

const copySuccessControl = makeNode({ tagName: "button", text: "Copy link" });
const copySuccessSurface = makeNode({ attrs: { role: "dialog" }, children: [copySuccessControl] });
const copySuccessBefore = hooks.captureCopySuccessState(copySuccessSurface, copySuccessControl);
copySuccessControl.textContent = "Copied";
copySuccessControl.innerText = "Copied";
copySuccessControl.setAttribute("aria-label", "Copied");
const copySuccessTimer = makeTimerTracker();
const copySuccessResult = await hooks.waitForCopySuccess(copySuccessSurface, copySuccessControl, {
  beforeState: copySuccessBefore,
  timeoutMs: 20,
  setTimeout: copySuccessTimer.setTimeout,
  clearTimeout: copySuccessTimer.clearTimeout
});
assert.strictEqual(copySuccessResult.ok, true);
assert.strictEqual(copySuccessTimer.pending.size, 0, "success must clear its timeout");

const textOnlySuccessControl = makeNode({ tagName: "button", attrs: { "aria-label": "Copy link" }, text: "Copy link" });
const textOnlySuccessSurface = makeNode({ attrs: { role: "dialog" }, children: [textOnlySuccessControl] });
const textOnlyBefore = hooks.captureCopySuccessState(textOnlySuccessSurface, textOnlySuccessControl);
textOnlySuccessControl.textContent = "복사됨";
textOnlySuccessControl.innerText = "복사됨";
assert.strictEqual(
  (await hooks.waitForCopySuccess(textOnlySuccessSurface, textOnlySuccessControl, { beforeState: textOnlyBefore, timeoutMs: 5 })).ok,
  true,
  "visible Copied text must prove success even if aria-label stays at Copy link"
);

const staleCopiedControl = makeNode({ tagName: "button", text: "Copied", attrs: { "aria-label": "Copied" } });
const staleCopiedSurface = makeNode({ attrs: { role: "dialog" }, children: [staleCopiedControl] });
const staleTimer = makeTimerTracker();
const staleCopiedResult = await hooks.waitForCopySuccess(staleCopiedSurface, staleCopiedControl, {
  beforeState: hooks.captureCopySuccessState(staleCopiedSurface, staleCopiedControl),
  timeoutMs: 5,
  setTimeout: staleTimer.setTimeout,
  clearTimeout: staleTimer.clearTimeout
});
assert.strictEqual(staleCopiedResult.ok, false, "a stale Copied label must not prove this attempt copied anything");
assert.strictEqual(staleTimer.pending.size, 0, "timeout must leave no timer behind");

const staleAttributeControl = makeNode({
  tagName: "button",
  text: "Copied",
  attrs: { "aria-label": "Copied", "data-state": "idle" }
});
const staleAttributeSurface = makeNode({ attrs: { role: "dialog" }, children: [staleAttributeControl] });
const staleAttributeBefore = hooks.captureCopySuccessState(staleAttributeSurface, staleAttributeControl);
staleAttributeControl.setAttribute("data-state", "active");
const staleAttributeResult = await hooks.waitForCopySuccess(staleAttributeSurface, staleAttributeControl, {
  beforeState: staleAttributeBefore,
  timeoutMs: 5
});
assert.strictEqual(staleAttributeResult.ok, false, "unrelated attribute changes must not make a stale Copied state fresh");

let observedCopyObserver = null;
let observedCopyDisconnects = 0;
class CopyObserverFixture {
  constructor(callback) { this.callback = callback; observedCopyObserver = this; }
  observe() {}
  disconnect() { observedCopyDisconnects += 1; }
}
const asyncCopyControl = makeNode({ tagName: "button", text: "Copy link" });
const asyncCopySurface = makeNode({ attrs: { role: "dialog" }, children: [asyncCopyControl] });
const asyncCopyTimer = makeTimerTracker();
const asyncCopyPromise = hooks.waitForCopySuccess(asyncCopySurface, asyncCopyControl, {
  beforeState: hooks.captureCopySuccessState(asyncCopySurface, asyncCopyControl),
  timeoutMs: 50,
  MutationObserver: CopyObserverFixture,
  setTimeout: asyncCopyTimer.setTimeout,
  clearTimeout: asyncCopyTimer.clearTimeout
});
asyncCopyControl.textContent = "복사됨";
asyncCopyControl.innerText = "복사됨";
observedCopyObserver.callback();
assert.strictEqual((await asyncCopyPromise).ok, true);
assert.strictEqual(observedCopyDisconnects, 1, "copy-success observer must disconnect after success");
assert.strictEqual(asyncCopyTimer.pending.size, 0);

let replacementObserver = null;
class ReplacementCopyObserver {
  constructor(callback) { this.callback = callback; replacementObserver = this; }
  observe() {}
  disconnect() {}
}
const oldCopyControl = makeNode({ tagName: "button", text: "Copy link" });
const replacementCopySurface = makeNode({ attrs: { role: "dialog" }, children: [oldCopyControl] });
const replacementCopyPromise = hooks.waitForCopySuccess(replacementCopySurface, oldCopyControl, {
  beforeState: hooks.captureCopySuccessState(replacementCopySurface, oldCopyControl),
  timeoutMs: 50,
  MutationObserver: ReplacementCopyObserver
});
oldCopyControl.remove();
const newCopiedControl = makeNode({ tagName: "button", text: "Copied", attrs: { "aria-label": "Copied" } });
replacementCopySurface.appendChild(newCopiedControl);
replacementObserver.callback();
const replacementCopySignal = await replacementCopyPromise;
assert.strictEqual(replacementCopySignal.ok, true, "a newly inserted Copied control must be accepted as this attempt's fresh signal");
assert.strictEqual(replacementCopySignal.surface, replacementCopySurface);

function makeCopyResolutionFixture({ signal = true, copyCount = 1 } = {}) {
  const controls = [];
  for (let i = 0; i < copyCount; i += 1) {
    const control = makeNode({ tagName: "button", text: i ? "링크 복사" : "Copy link" });
    control.click = () => {
      control.clickCount += 1;
      if (signal) {
        control.textContent = "Copied";
        control.innerText = "Copied";
        control.setAttribute("aria-label", "Copied");
      }
    };
    controls.push(control);
  }
  return { controls, surface: makeNode({ attrs: { role: "dialog" }, children: controls }) };
}

{
  const fixture = makeCopyResolutionFixture();
  let reads = 0;
  let manuals = 0;
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    clipboardPermissionGranted: false,
    readClipboardText: async () => (++reads, "https://chatgpt.com/s/synthetic-should-not-be-read"),
    requestManualShareUrl: async () => (++manuals, "https://chatgpt.com/s/synthetic-t_manual_denied")
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.source, "manual");
  assert.strictEqual(reads, 0, "permission denial must cause zero clipboard reads");
  assert.strictEqual(manuals, 1);
  assert.strictEqual(fixture.controls[0].clickCount, 1);
}

{
  const fixture = makeCopyResolutionFixture();
  let reads = 0;
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    clipboardPermissionGranted: false,
    readClipboardText: async () => (++reads, "https://chatgpt.com/s/synthetic-should-not-be-read"),
    requestManualShareUrl: async () => ""
  });
  assert.strictEqual(result.ok, false, "manual cancellation must not produce a URL");
  assert.strictEqual(result.stage, "manual-share-url");
  assert.strictEqual(reads, 0);
}

{
  const fixture = makeCopyResolutionFixture();
  let reads = 0;
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    clipboardPermissionGranted: true,
    readClipboardText: async () => { reads += 1; throw new Error("opaque clipboard failure"); },
    requestManualShareUrl: async () => "https://chatgpt.com/share/synthetic-t_manual_after_exception"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.source, "manual");
  assert.strictEqual(reads, 1, "clipboard exceptions must not cause a retry");
}

for (const invalidManual of [
  "https://evil.example/s/no",
  "https://chatgpt.com/c/synthetic-not-share",
  "https://chatgpt.com/s/synthetic-one extra",
  "https://chatgpt.com/s/synthetic-one\nhttps://chatgpt.com/s/synthetic-two"
]) {
  const fixture = makeCopyResolutionFixture();
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    clipboardPermissionGranted: false,
    requestManualShareUrl: async () => invalidManual
  });
  assert.strictEqual(result.ok, false, `manual input must reject ${invalidManual}`);
}

{
  const fixture = makeCopyResolutionFixture({ copyCount: 2 });
  let manuals = 0;
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    clipboardPermissionGranted: true,
    readClipboardText: async () => { throw new Error("must not read after ambiguous Copy controls"); },
    requestManualShareUrl: async () => (++manuals, "https://chatgpt.com/s/synthetic-t_ambiguous_manual")
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(fixture.controls[0].clickCount + fixture.controls[1].clickCount, 0, "ambiguous Copy controls must never be clicked");
  assert.strictEqual(manuals, 1);
}

{
  const fixture = makeCopyResolutionFixture();
  let reads = 0;
  let manuals = 0;
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    runtimeGuard: {
      check: async () => ({ ok: false, error: "runtime stopped before Copy" }),
      isAborted: () => false
    },
    clipboardPermissionGranted: true,
    readClipboardText: async () => { reads += 1; return "https://chatgpt.com/s/synthetic-must-not-read"; },
    requestManualShareUrl: async () => { manuals += 1; return "https://chatgpt.com/s/synthetic-must-not-manual"; }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "runtime");
  assert.strictEqual(fixture.controls[0].clickCount, 0);
  assert.strictEqual(reads, 0);
  assert.strictEqual(manuals, 0);
}

{
  const fixture = makeCopyResolutionFixture();
  let guardChecks = 0;
  let reads = 0;
  let manuals = 0;
  const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
    runtimeGuard: {
      check: async () => {
        guardChecks += 1;
        return guardChecks === 1 ? { ok: true } : { ok: false, error: "runtime stopped after Copy" };
      },
      isAborted: () => false
    },
    clipboardPermissionGranted: true,
    readClipboardText: async () => { reads += 1; return "https://chatgpt.com/s/synthetic-must-not-read"; },
    requestManualShareUrl: async () => { manuals += 1; return "https://chatgpt.com/s/synthetic-must-not-manual"; }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "runtime");
  assert.strictEqual(fixture.controls[0].clickCount, 1);
  assert.strictEqual(reads, 0);
  assert.strictEqual(manuals, 0);
}

{
  const sentinelClipboardUrl = "https://chatgpt.com/s/synthetic-t_private_clipboard_sentinel";
  const capturedConsole = [];
  const consoleMethods = ["log", "debug", "info", "warn", "error"];
  const originals = Object.fromEntries(consoleMethods.map(name => [name, hooks.__sandbox.console[name]]));
  consoleMethods.forEach(name => {
    hooks.__sandbox.console[name] = (...args) => capturedConsole.push(args.map(String).join(" "));
  });
  try {
    const fixture = makeCopyResolutionFixture();
    const result = await hooks.resolveShareUrlFromCopySurface(fixture.surface, {
      clipboardPermissionGranted: true,
      readClipboardText: async () => sentinelClipboardUrl,
      requestManualShareUrl: async () => ""
    });
    assert.strictEqual(result.ok, true);
  } finally {
    consoleMethods.forEach(name => { hooks.__sandbox.console[name] = originals[name]; });
  }
  assert(!capturedConsole.join("\n").includes(sentinelClipboardUrl), "clipboard URL must never be logged");

  const invalidSentinel = "https://evil.example/s/private-invalid-sentinel";
  const invalidFixture = makeCopyResolutionFixture();
  const invalidResult = await hooks.resolveShareUrlFromCopySurface(invalidFixture.surface, {
    clipboardPermissionGranted: true,
    readClipboardText: async () => invalidSentinel,
    requestManualShareUrl: async () => ""
  });
  assert(!JSON.stringify(invalidResult).includes(invalidSentinel), "failure objects must not expose clipboard contents");
}

{
  const sandboxDocument = hooks.__sandbox.document;
  const originalCreateElement = sandboxDocument.createElement;
  const originalAppendChild = sandboxDocument.body.appendChild;
  const originalAddEventListener = hooks.__sandbox.addEventListener;
  const originalRemoveEventListener = hooks.__sandbox.removeEventListener;
  const formListeners = new Map();
  const cancelListeners = new Map();
  let hostRemoved = 0;
  let hostAppended = 0;
  let manualKeyHandler = null;
  let manualKeyRemovals = 0;
  const titleNode = { textContent: "" };
  const bodyNode = { textContent: "" };
  const saveNode = { textContent: "" };
  const cancelNode = {
    textContent: "",
    addEventListener(type, handler) { cancelListeners.set(type, handler); }
  };
  const errorNode = { textContent: "", hidden: true };
  const inputNode = { value: "", placeholder: "", focus() {} };
  const formNode = {
    addEventListener(type, handler) { formListeners.set(type, handler); },
    removeEventListener(type, handler) {
      if (formListeners.get(type) === handler) formListeners.delete(type);
    },
    querySelector(selector) { return selector === "[data-gpt2obs-manual-error]" ? errorNode : null; }
  };
  const shadow = {
    innerHTML: "",
    querySelector(selector) {
      return ({
        "#gpt2obs-manual-title": titleNode,
        "[data-gpt2obs-manual-body]": bodyNode,
        "[data-gpt2obs-manual-save]": saveNode,
        "[data-gpt2obs-manual-cancel]": cancelNode,
        "input": inputNode,
        "form": formNode
      })[selector] || null;
    }
  };
  const hostNode = {
    setAttribute() {},
    attachShadow() { return shadow; },
    remove() { hostRemoved += 1; }
  };
  sandboxDocument.createElement = () => hostNode;
  sandboxDocument.body.appendChild = node => { hostAppended += 1; return node; };
  hooks.__sandbox.addEventListener = (type, handler) => { if (type === "keydown") manualKeyHandler = handler; };
  hooks.__sandbox.removeEventListener = (type, handler) => {
    if (type === "keydown" && manualKeyHandler === handler) {
      manualKeyRemovals += 1;
      manualKeyHandler = null;
    }
  };
  try {
    const manualPromise = hooks.requestManualVisualizeShareUrl();
    assert.strictEqual(inputNode.value, "", "manual fallback input must start empty");
    inputNode.value = "https://evil.example/s/not-allowed";
    formListeners.get("submit")({ preventDefault() {} });
    assert.strictEqual(errorNode.hidden, false, "invalid manual input must remain in the extension UI");
    inputNode.value = "https://chatgpt.com/s/synthetic-t_manual_overlay";
    formListeners.get("submit")({ preventDefault() {} });
    assert.strictEqual(await manualPromise, "https://chatgpt.com/s/synthetic-t_manual_overlay");
    assert.strictEqual(inputNode.value, "", "manual input must be cleared after success");
    assert.strictEqual(hostAppended, 1);
    assert.strictEqual(hostRemoved, 1, "manual overlay must be removed after success");
    assert.strictEqual(formListeners.size, 0, "manual form listener must be removed after success");
    assert.strictEqual(manualKeyRemovals, 1, "manual Escape handler must be removed after success");

    const cancelledManualPromise = hooks.requestManualVisualizeShareUrl();
    inputNode.value = "https://chatgpt.com/s/synthetic-t_must_be_cleared";
    manualKeyHandler({ key: "Escape", preventDefault() {} });
    assert.strictEqual(await cancelledManualPromise, "");
    assert.strictEqual(inputNode.value, "", "manual input must be cleared after cancellation");
    assert.strictEqual(hostAppended, 2);
    assert.strictEqual(hostRemoved, 2, "manual overlay must be removed after cancellation");
    assert.strictEqual(formListeners.size, 0, "manual form listener must be removed after cancellation");
    assert.strictEqual(manualKeyRemovals, 2, "manual Escape handler must be removed after cancellation");
    assert.strictEqual(typeof cancelListeners.get("click"), "function");
  } finally {
    sandboxDocument.createElement = originalCreateElement;
    sandboxDocument.body.appendChild = originalAppendChild;
    hooks.__sandbox.addEventListener = originalAddEventListener;
    hooks.__sandbox.removeEventListener = originalRemoveEventListener;
  }
}

{
  const sandboxDocument = hooks.__sandbox.document;
  const originalCreateElement = sandboxDocument.createElement;
  const originalAppendChild = sandboxDocument.body.appendChild;
  const originalAddEventListener = hooks.__sandbox.addEventListener;
  const originalRemoveEventListener = hooks.__sandbox.removeEventListener;
  let continueHandler = null;
  let cancelHandler = null;
  let keyHandler = null;
  let keyRemovals = 0;
  let hostRemovals = 0;
  const titleNode = { textContent: "" };
  const bodyNode = { textContent: "" };
  const continueNode = { textContent: "", disabled: false, addEventListener(_type, handler) { continueHandler = handler; } };
  const cancelNode = { textContent: "", addEventListener(_type, handler) { cancelHandler = handler; } };
  const shadow = {
    innerHTML: "",
    querySelector(selector) {
      return ({
        "#gpt2obs-consent-title": titleNode,
        "[data-gpt2obs-consent-body]": bodyNode,
        "[data-gpt2obs-consent-continue]": continueNode,
        "[data-gpt2obs-consent-cancel]": cancelNode
      })[selector] || null;
    }
  };
  const hostNode = {
    setAttribute() {},
    attachShadow() { return shadow; },
    remove() { hostRemovals += 1; }
  };
  sandboxDocument.createElement = () => hostNode;
  sandboxDocument.body.appendChild = node => node;
  hooks.__sandbox.addEventListener = (type, handler) => { if (type === "keydown") keyHandler = handler; };
  hooks.__sandbox.removeEventListener = (type, handler) => {
    if (type === "keydown" && keyHandler === handler) {
      keyRemovals += 1;
      keyHandler = null;
    }
  };
  try {
    let permissionCalls = 0;
    const approvedPromise = hooks.requestVisualizeShareConsent({
      requestPermission: () => {
        permissionCalls += 1;
        return Promise.resolve(true);
      }
    });
    assert.strictEqual(permissionCalls, 0, "permission must wait for the extension-owned Continue click");
    continueHandler({ preventDefault() {} });
    assert.strictEqual(permissionCalls, 1, "Continue click must synchronously dispatch the permission request");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await approvedPromise)), { approved: true, permissionGranted: true });
    assert.strictEqual(hostRemovals, 1);
    assert.strictEqual(keyRemovals, 1);

    permissionCalls = 0;
    const richPromise = hooks.requestVisualizeShareConsent({
      consentMode: "rich-app-continuation",
      requestPermission: () => {
        permissionCalls += 1;
        return Promise.resolve(true);
      }
    });
    assert(titleNode.textContent.includes("공유 앱"), "continuation consent must use provider-neutral title text");
    assert(bodyNode.textContent.includes("상호작용형 앱"), "continuation consent must use provider-neutral body text");
    cancelHandler({ preventDefault() {} });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await richPromise)), { approved: false, permissionGranted: false });
    assert.strictEqual(permissionCalls, 0, "continuation cancellation must not request permission");
    assert.strictEqual(hostRemovals, 2);
    assert.strictEqual(keyRemovals, 2);

    permissionCalls = 0;
    const cancelledPromise = hooks.requestVisualizeShareConsent({
      requestPermission: () => {
        permissionCalls += 1;
        return Promise.resolve(true);
      }
    });
    keyHandler({ key: "Escape", preventDefault() {} });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(await cancelledPromise)), { approved: false, permissionGranted: false });
    assert.strictEqual(permissionCalls, 0, "Escape cancellation must not request permission");
    assert.strictEqual(hostRemovals, 3);
    assert.strictEqual(keyRemovals, 3, "Escape handler must be removed on every exit");
    assert.strictEqual(typeof cancelHandler, "function");
  } finally {
    sandboxDocument.createElement = originalCreateElement;
    sandboxDocument.body.appendChild = originalAppendChild;
    hooks.__sandbox.addEventListener = originalAddEventListener;
    hooks.__sandbox.removeEventListener = originalRemoveEventListener;
  }
}

let existingDialogOpen = false;
const existingLinkInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_existing_state" } });
const existingClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const existingDialog = makeNode({ attrs: { role: "dialog" }, children: [existingLinkInput, existingClose] });
const existingShareButton = makeNode({ tagName: "button", attrs: { "data-testid": "share-response", "aria-label": "Share" }, text: "Share" });
existingShareButton.click = () => { existingShareButton.clickCount += 1; existingDialogOpen = true; };
const existingAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [existingShareButton] })] });
const existingResult = await hooks.createOrReuseVisualizeShareLink(existingAssistant, {
  getDialogs: () => existingDialogOpen ? [existingDialog] : [],
  waitForRelevantShareDialog: async before => {
    assert.strictEqual(before.length, 0);
    return { ok: true, dialog: existingDialog };
  }
});
assert.strictEqual(existingResult.ok, true);
assert.strictEqual(existingResult.source, "existing");
assert.strictEqual(existingResult.url, "https://chatgpt.com/s/synthetic-t_existing_state");
assert.strictEqual(existingShareButton.clickCount, 1);
assert.strictEqual(existingClose.clickCount, 1);

let createDialogOpen = false;
let createdLinkClicks = 0;
const createLinkButton = makeNode({ tagName: "button", text: "Create link" });
createLinkButton.click = () => {
  createLinkButton.clickCount += 1;
  createdLinkClicks += 1;
  createDialog.childNodes.push(makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/share/synthetic-t_created_state" } }));
};
const createClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const createDialog = makeNode({ attrs: { role: "dialog" }, children: [createLinkButton, createClose] });
const createShareButton = makeNode({ tagName: "button", attrs: { "data-testid": "share-response", "aria-label": "Share" }, text: "Share" });
createShareButton.click = () => { createShareButton.clickCount += 1; createDialogOpen = true; };
const createAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [createShareButton] })] });
const createResult = await hooks.createOrReuseVisualizeShareLink(createAssistant, {
  getDialogs: () => createDialogOpen ? [createDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: createDialog }),
  waitForValidatedShareUrl: async dialog => ({ ok: true, url: hooks.extractValidatedChatGptShareUrl(dialog) })
});
assert.strictEqual(createResult.ok, true);
assert.strictEqual(createResult.source, "created");
assert.strictEqual(createResult.url, "https://chatgpt.com/share/synthetic-t_created_state");
assert.strictEqual(createdLinkClicks, 1, "create link must be clicked at most once");
assert.strictEqual(createShareButton.clickCount, 1);
assert.strictEqual(createClose.clickCount, 1);

let createdCopyDialogOpen = false;
let createdCopyReads = 0;
const createdCopyControl = makeNode({ tagName: "button", text: "Copy link" });
createdCopyControl.click = () => {
  createdCopyControl.clickCount += 1;
  createdCopyControl.textContent = "Copied";
  createdCopyControl.innerText = "Copied";
  createdCopyControl.setAttribute("aria-label", "Copied");
};
const createdCopyCreate = makeNode({ tagName: "button", text: "Create link" });
const createdCopyClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const createdCopyDialog = makeNode({ attrs: { role: "dialog" }, children: [createdCopyCreate, createdCopyClose] });
createdCopyCreate.click = () => {
  createdCopyCreate.clickCount += 1;
  createdCopyDialog.appendChild(createdCopyControl);
  createdCopyCreate.remove();
};
const createdCopyShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
createdCopyShare.click = () => { createdCopyShare.clickCount += 1; createdCopyDialogOpen = true; };
const createdCopyAssistant = makeNode({ children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [createdCopyShare] })] });
const createdCopyResult = await hooks.createOrReuseVisualizeShareLink(createdCopyAssistant, {
  getDialogs: () => createdCopyDialogOpen ? [createdCopyDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: createdCopyDialog }),
  waitForValidatedShareUrl: async () => ({ ok: false, stage: "share-url", reason: "DOM URL absent" }),
  clipboardPermissionGranted: true,
  readClipboardText: async () => {
    createdCopyReads += 1;
    return "https://chatgpt.com/share/synthetic-t_created_copy";
  },
  requestManualShareUrl: async () => ""
});
assert.strictEqual(createdCopyResult.ok, true);
assert.strictEqual(createdCopyResult.source, "created");
assert.strictEqual(createdCopyResult.shareCreatedThisAttempt, true);
assert.strictEqual(createdCopyResult.url, "https://chatgpt.com/share/synthetic-t_created_copy");
assert.strictEqual(createdCopyCreate.clickCount, 1, "Create link must run once");
assert.strictEqual(createdCopyControl.clickCount, 1, "post-create Copy link must run once");
assert.strictEqual(createdCopyReads, 1, "post-create clipboard read must run once");
assert.strictEqual(createdCopyClose.clickCount, 1);

let replacementCreated = false;
const replacementCopy = makeNode({ tagName: "button", text: "Copy link" });
replacementCopy.click = () => {
  replacementCopy.clickCount += 1;
  replacementCopy.textContent = "Copied";
  replacementCopy.innerText = "Copied";
  replacementCopy.setAttribute("aria-label", "Copied");
};
const replacementClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const replacementFinalDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [replacementCopy, replacementClose] });
const replacementCreate = makeNode({ tagName: "button", text: "Create link" });
const replacementInitialDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [replacementCreate] });
replacementCreate.click = () => { replacementCreate.clickCount += 1; replacementCreated = true; replacementInitialDialog.style.display = "none"; };
const replacementShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const replacementAssistant = makeNode({ children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [replacementShare] })] });
const replacementResult = await hooks.createOrReuseVisualizeShareLink(replacementAssistant, {
  getDialogs: () => replacementCreated ? [replacementInitialDialog, replacementFinalDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: replacementInitialDialog }),
  timeoutMs: 5,
  pollMs: 1,
  clipboardPermissionGranted: true,
  readClipboardText: async () => "https://chatgpt.com/s/synthetic-t_replaced_surface",
  requestManualShareUrl: async () => ""
});
assert.strictEqual(replacementResult.ok, true, "a post-Create replacement surface must be followed safely");
assert.strictEqual(replacementResult.source, "created");
assert.strictEqual(replacementCreate.clickCount, 1);
assert.strictEqual(replacementCopy.clickCount, 1);
assert.strictEqual(replacementClose.clickCount, 1);

let copyOnlyClicks = 0;
const copyOnlyButton = makeNode({ tagName: "button", text: "Copy link" });
copyOnlyButton.click = () => {
  copyOnlyClicks += 1;
  copyOnlyButton.clickCount += 1;
  copyOnlyButton.textContent = "Copied";
  copyOnlyButton.innerText = "Copied";
  copyOnlyButton.setAttribute("aria-label", "Copied");
};
const existingRogueCreate = makeNode({ tagName: "button", text: "Create link" });
const unrelatedCopy = makeNode({ tagName: "button", attrs: { "aria-label": "Copy" }, text: "Copy" });
const copyOnlyDialog = makeNode({ attrs: { role: "dialog", "data-testid": "share-dialog" }, children: [copyOnlyButton, unrelatedCopy, existingRogueCreate] });
const copyOnlyShareButton = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
let copyOnlyReads = 0;
let copyOnlyManualCalls = 0;
const copyOnlyResult = await hooks.createOrReuseVisualizeShareLink(makeNode({ children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [copyOnlyShareButton] })] }), {
  getDialogs: () => [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: copyOnlyDialog }),
  clipboardPermissionGranted: true,
  readClipboardText: async () => {
    copyOnlyReads += 1;
    return "https://chatgpt.com/s/synthetic-t_copy_only";
  },
  requestManualShareUrl: async () => {
    copyOnlyManualCalls += 1;
    return "";
  }
});
assert.strictEqual(copyOnlyResult.ok, true);
assert.strictEqual(copyOnlyResult.source, "existing");
assert.strictEqual(copyOnlyResult.url, "https://chatgpt.com/s/synthetic-t_copy_only");
assert.strictEqual(copyOnlyClicks, 1, "Copy link must be clicked at most once");
assert.strictEqual(existingRogueCreate.clickCount, 0, "an existing-link surface must never click Create link");
assert.strictEqual(unrelatedCopy.clickCount, 0, "a generic Copy control must never be clicked");
assert.strictEqual(copyOnlyReads, 1, "clipboard must be read exactly once after a fresh success signal");
assert.strictEqual(copyOnlyManualCalls, 0);

let copySurfaceReplaced = false;
const oldSurfaceClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const oldSurfaceCopy = makeNode({ tagName: "button", text: "Copy link" });
const oldCopySurface = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [oldSurfaceCopy, oldSurfaceClose] });
const newSurfaceClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const newSurfaceCopied = makeNode({ tagName: "button", attrs: { "aria-label": "Copied" }, text: "Copied" });
const newCopySurface = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [newSurfaceCopied, newSurfaceClose] });
oldSurfaceCopy.click = () => {
  oldSurfaceCopy.clickCount += 1;
  oldCopySurface.style.display = "none";
  copySurfaceReplaced = true;
};
const replacementDuringCopyShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const replacementDuringCopyAssistant = makeNode({ children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [replacementDuringCopyShare] })] });
const replacementDuringCopyResult = await hooks.createOrReuseVisualizeShareLink(replacementDuringCopyAssistant, {
  getDialogs: () => copySurfaceReplaced ? [oldCopySurface, newCopySurface] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: oldCopySurface }),
  clipboardPermissionGranted: true,
  readClipboardText: async () => "https://chatgpt.com/s/synthetic-t_copy_surface_replaced",
  requestManualShareUrl: async () => "",
  timeoutMs: 20
});
assert.strictEqual(replacementDuringCopyResult.ok, true, "whole-surface replacement during Copy must retain a fresh success signal");
assert.strictEqual(oldSurfaceCopy.clickCount, 1);
assert.strictEqual(newSurfaceClose.clickCount, 1, "the replacement share surface must be the one closed");
assert.strictEqual(oldSurfaceClose.clickCount, 0);

let unrelatedStaleReads = 0;
let unrelatedStaleManualCalls = 0;
const disappearingCopy = makeNode({ tagName: "button", text: "Copy link" });
const disappearingClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const disappearingSurface = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [disappearingCopy, disappearingClose]
});
const unrelatedCopied = makeNode({ tagName: "button", attrs: { "aria-label": "Copied" }, text: "Copied" });
const unrelatedClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const unrelatedPreExistingSurface = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [unrelatedCopied, unrelatedClose]
});
disappearingCopy.click = () => {
  disappearingCopy.clickCount += 1;
  disappearingSurface.style.display = "none";
};
const unrelatedStaleResult = await hooks.resolveShareUrlFromCopySurface(disappearingSurface, {
  getDialogs: () => [disappearingSurface, unrelatedPreExistingSurface],
  clipboardPermissionGranted: true,
  readClipboardText: async () => {
    unrelatedStaleReads += 1;
    return "https://chatgpt.com/s/synthetic-t_unrelated_stale";
  },
  requestManualShareUrl: async () => {
    unrelatedStaleManualCalls += 1;
    return "";
  },
  timeoutMs: 5
});
assert.strictEqual(unrelatedStaleResult.ok, false);
assert.strictEqual(unrelatedStaleResult.stage, "manual-share-url");
assert.strictEqual(disappearingCopy.clickCount, 1);
assert.strictEqual(unrelatedStaleReads, 0, "an unchanged Copied signal from a pre-existing unrelated surface must never permit a clipboard read");
assert.strictEqual(unrelatedStaleManualCalls, 1, "an unrelated stale success signal must fail closed into manual fallback");

// Regression for the live Korean existing-share surface observed on ChatGPT:
// a newly opened role=dialog exposes "링크 복사" plus social-share controls,
// but does not expose the URL in any DOM value or attribute. The extension must
// recognize the final share surface and fail closed at URL extraction without
// clicking Copy link; it must not misreport this as a dialog timeout.
let shareClipboardReads = 0;
hooks.__sandbox.navigator.clipboard.readText = async () => {
  shareClipboardReads += 1;
  return "https://chatgpt.com/s/synthetic-t_stale_clipboard";
};
let liveExistingManualCalls = 0;
let liveExistingDoc;
const liveExistingCopy = makeNode({ tagName: "button", text: "링크 복사" });
const liveExistingDialog = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [
    makeNode({ tagName: "button", attrs: { "aria-label": "닫기", "data-testid": "close-button" } }),
    makeNode({ tagName: "button", text: "피드백 보내기" }),
    liveExistingCopy,
    makeNode({ tagName: "button", text: "X" }),
    makeNode({ tagName: "button", text: "LinkedIn" }),
    makeNode({ tagName: "button", text: "Reddit" })
  ]
});
const liveExistingTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-state": "closed" },
  onClick: () => liveExistingDoc.body.appendChild(liveExistingDialog)
});
const liveExistingToolbar = makeNode({ attrs: { role: "group", "aria-label": "응답 작업" }, children: [liveExistingTrigger] });
const liveExistingAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [liveExistingToolbar] });
const liveExistingTurn = makeNode({ attrs: { "data-testid": "conversation-turn-live-existing" }, children: [liveExistingAssistant] });
liveExistingDoc = makeDocument([liveExistingTurn]);
installDocument(hooks, liveExistingDoc);
const liveExistingResult = await hooks.createOrReuseVisualizeShareLink(liveExistingAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1,
  clipboardPermissionGranted: true,
  requestManualShareUrl: async () => {
    liveExistingManualCalls += 1;
    return "";
  }
});
assert.strictEqual(liveExistingResult.ok, false);
assert.strictEqual(liveExistingResult.stage, "manual-share-url", "no fresh copy-success signal must fall back to manual entry");
assert.strictEqual(liveExistingTrigger.clickCount, 1);
assert.strictEqual(liveExistingCopy.clickCount, 1, "existing Copy link may be clicked once within the current share surface");
assert.strictEqual(shareClipboardReads, 0, "stale clipboard must not be read without a fresh Copied signal");
assert.strictEqual(liveExistingManualCalls, 1, "missing copy success must enter manual fallback");

let updateOnlyDoc;
const updateOnlyControl = makeNode({ tagName: "button", text: "링크 업데이트" });
const updateOnlyDialog = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [
    makeNode({ tagName: "button", attrs: { "aria-label": "닫기" } }),
    updateOnlyControl,
    makeNode({ tagName: "button", text: "X" }),
    makeNode({ tagName: "button", text: "LinkedIn" })
  ]
});
const updateOnlyTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기" },
  onClick: () => updateOnlyDoc.body.appendChild(updateOnlyDialog)
});
const updateOnlyToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [updateOnlyTrigger] });
const updateOnlyAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [updateOnlyToolbar] });
const updateOnlyTurn = makeNode({ attrs: { "data-testid": "conversation-turn-update-only" }, children: [updateOnlyAssistant] });
updateOnlyDoc = makeDocument([updateOnlyTurn]);
installDocument(hooks, updateOnlyDoc);
const updateOnlyResult = await hooks.createOrReuseVisualizeShareLink(updateOnlyAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(updateOnlyResult.ok, false);
assert.strictEqual(updateOnlyResult.stage, "manual-share-url", "an existing-link update surface must fall back without clicking Update");
assert.strictEqual(updateOnlyControl.clickCount, 0, "Update link must never be clicked automatically");

// A pre-mounted surface may keep the same node identity while changing from
// aria-hidden/data-state=closed to visible/open. Identity alone must not make
// the waiter ignore the newly activated share surface.
const reusedSurfaceInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_reused_surface" } });
const reusedSurfaceClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const reusedSurface = makeNode({
  attrs: { role: "dialog", "data-state": "closed", "aria-hidden": "true" },
  children: [reusedSurfaceInput, reusedSurfaceClose]
});
const reusedSurfaceTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share", "data-state": "closed" },
  onClick: () => {
    reusedSurface.setAttribute("data-state", "open");
    reusedSurface.removeAttribute("aria-hidden");
  }
});
const reusedSurfaceToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [reusedSurfaceTrigger] });
const reusedSurfaceAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [reusedSurfaceToolbar] });
const reusedSurfaceTurn = makeNode({ attrs: { "data-testid": "conversation-turn-reused-surface" }, children: [reusedSurfaceAssistant] });
const reusedSurfaceDoc = makeDocument([reusedSurfaceTurn, reusedSurface]);
installDocument(hooks, reusedSurfaceDoc);
const reusedSurfaceResult = await hooks.createOrReuseVisualizeShareLink(reusedSurfaceAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(reusedSurfaceResult.ok, true, "the same hidden surface node must be accepted after it opens");
assert.strictEqual(reusedSurfaceResult.source, "existing");
assert.strictEqual(reusedSurfaceResult.url, "https://chatgpt.com/s/synthetic-t_reused_surface");
assert.strictEqual(reusedSurfaceTrigger.clickCount, 1);

// A visible top-layer shell can be reused and structurally updated for the
// current share operation. A changed state on the same node must be accepted.
const updatedVisibleClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const updatedVisibleSurface = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [updatedVisibleClose] });
const updatedVisibleInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_updated_visible" } });
const updatedVisibleTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => updatedVisibleSurface.appendChild(updatedVisibleInput)
});
const updatedVisibleToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [updatedVisibleTrigger] });
const updatedVisibleAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [updatedVisibleToolbar] });
const updatedVisibleTurn = makeNode({ attrs: { "data-testid": "conversation-turn-updated-visible" }, children: [updatedVisibleAssistant] });
const updatedVisibleDoc = makeDocument([updatedVisibleTurn, updatedVisibleSurface]);
installDocument(hooks, updatedVisibleDoc);
const updatedVisibleResult = await hooks.createOrReuseVisualizeShareLink(updatedVisibleAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(updatedVisibleResult.ok, true, "a same-node visible shell must be accepted after its share structure changes");
assert.strictEqual(updatedVisibleResult.url, "https://chatgpt.com/s/synthetic-t_updated_visible");
assert.strictEqual(updatedVisibleTrigger.clickCount, 1);

// Final share UI can be a connected sheet/region rather than role=dialog.
let shareSheetDoc;
const shareSheetInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/share/synthetic-t_region_sheet" } });
const shareSheetClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const shareSheet = makeNode({ attrs: { role: "region", "aria-label": "Share link", "data-state": "open" }, children: [shareSheetInput, shareSheetClose] });
const shareSheetTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => shareSheetDoc.body.appendChild(shareSheet)
});
const shareSheetToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [shareSheetTrigger] });
const shareSheetAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [shareSheetToolbar] });
const shareSheetTurn = makeNode({ attrs: { "data-testid": "conversation-turn-share-sheet" }, children: [shareSheetAssistant] });
shareSheetDoc = makeDocument([shareSheetTurn]);
installDocument(hooks, shareSheetDoc);
const shareSheetResult = await hooks.createOrReuseVisualizeShareLink(shareSheetAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(shareSheetResult.ok, true, "a structurally valid share sheet must not require role=dialog");
assert.strictEqual(shareSheetResult.url, "https://chatgpt.com/share/synthetic-t_region_sheet");
assert.strictEqual(shareSheetTrigger.clickCount, 1);

let directPopoverDoc;
const directPopoverInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_direct_popover" } });
const directPopoverClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const directPopover = makeNode({ attrs: { "data-side": "bottom", "data-state": "open", "data-testid": "share-popover" }, children: [directPopoverInput, directPopoverClose] });
const directPopoverTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => directPopoverDoc.body.appendChild(directPopover)
});
const directPopoverToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [directPopoverTrigger] });
const directPopoverAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [directPopoverToolbar] });
const directPopoverTurn = makeNode({ attrs: { "data-testid": "conversation-turn-direct-popover" }, children: [directPopoverAssistant] });
directPopoverDoc = makeDocument([directPopoverTurn]);
installDocument(hooks, directPopoverDoc);
const directPopoverResult = await hooks.createOrReuseVisualizeShareLink(directPopoverAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(directPopoverResult.ok, true, "a structurally valid direct share popover must be accepted");
assert.strictEqual(directPopoverResult.url, "https://chatgpt.com/s/synthetic-t_direct_popover");

let bodyPortalDoc;
const bodyPortalInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_body_portal" } });
const bodyPortalClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const bodyPortalDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [bodyPortalInput, bodyPortalClose] });
const bodyPortalTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => bodyPortalDoc.body.appendChild(bodyPortalDialog)
});
const bodyPortalToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [bodyPortalTrigger] });
const bodyPortalAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [bodyPortalToolbar] });
const bodyPortalTurn = makeNode({ attrs: { "data-testid": "conversation-turn-body-portal" }, children: [bodyPortalAssistant] });
bodyPortalDoc = makeDocument([bodyPortalTurn]);
installDocument(hooks, bodyPortalDoc);
const bodyPortalResult = await hooks.createOrReuseVisualizeShareLink(bodyPortalAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(bodyPortalResult.ok, true);
assert.strictEqual(bodyPortalResult.url, "https://chatgpt.com/s/synthetic-t_body_portal");
assert.strictEqual(bodyPortalTurn.contains(bodyPortalDialog), false, "final share surface must be discovered outside the A2 turn");
assert.strictEqual(bodyPortalDoc.body.contains(bodyPortalDialog), true, "final share surface must be discovered in the body portal");

let exposedExistingDoc;
const exposedExistingInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/share/synthetic-t_exposed_existing" } });
const exposedExistingCopy = makeNode({ tagName: "button", text: "Copy link" });
const exposedExistingUpdate = makeNode({ tagName: "button", text: "Update link" });
const exposedExistingDelete = makeNode({ tagName: "button", text: "Delete link" });
const exposedExistingCreate = makeNode({ tagName: "button", text: "Create link" });
const exposedExistingClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const exposedExistingDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [exposedExistingInput, exposedExistingCopy, exposedExistingUpdate, exposedExistingDelete, exposedExistingCreate, exposedExistingClose] });
const exposedExistingTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => exposedExistingDoc.body.appendChild(exposedExistingDialog)
});
const exposedExistingToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [exposedExistingTrigger] });
const exposedExistingAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [exposedExistingToolbar] });
const exposedExistingTurn = makeNode({ attrs: { "data-testid": "conversation-turn-exposed-existing" }, children: [exposedExistingAssistant] });
exposedExistingDoc = makeDocument([exposedExistingTurn]);
installDocument(hooks, exposedExistingDoc);
const exposedExistingResult = await hooks.createOrReuseVisualizeShareLink(exposedExistingAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(exposedExistingResult.ok, true);
assert.strictEqual(exposedExistingResult.source, "existing");
assert.strictEqual(exposedExistingResult.url, "https://chatgpt.com/share/synthetic-t_exposed_existing");
assert.strictEqual(exposedExistingCopy.clickCount, 0);
assert.strictEqual(exposedExistingUpdate.clickCount, 0);
assert.strictEqual(exposedExistingDelete.clickCount, 0);
assert.strictEqual(exposedExistingCreate.clickCount, 0, "an exposed existing URL must prevent Create link from being clicked");

let realCreateDoc;
const realCreateButton = makeNode({ tagName: "button", text: "Create link" });
const realCreateClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const realCreateDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [realCreateButton, realCreateClose] });
realCreateButton.click = () => {
  realCreateButton.clickCount += 1;
  if (!realCreateDialog.querySelector("input")) {
    realCreateDialog.appendChild(makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_real_create" } }));
  }
};
const realCreateTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => realCreateDoc.body.appendChild(realCreateDialog)
});
const realCreateToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [realCreateTrigger] });
const realCreateAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [realCreateToolbar] });
const realCreateTurn = makeNode({ attrs: { "data-testid": "conversation-turn-real-create" }, children: [realCreateAssistant] });
realCreateDoc = makeDocument([realCreateTurn]);
installDocument(hooks, realCreateDoc);
const realCreateResult = await hooks.createOrReuseVisualizeShareLink(realCreateAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(realCreateResult.ok, true);
assert.strictEqual(realCreateResult.source, "created");
assert.strictEqual(realCreateResult.url, "https://chatgpt.com/s/synthetic-t_real_create");
assert.strictEqual(realCreateButton.clickCount, 1, "Create link may be clicked at most once");

// Some response toolbars open one intermediate menu/popover action before the
// final share surface. Only one unambiguous share action may be clicked.
let intermediateMenuDoc;
const intermediateFinalInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_intermediate_menu" } });
const intermediateFinalClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const intermediateFinalSurface = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [intermediateFinalInput, intermediateFinalClose] });
const intermediateShareAction = makeNode({
  tagName: "div",
  attrs: { role: "menuitem", "data-testid": "share-response-menu-item" },
  text: "공유하기",
  onClick: () => intermediateMenuDoc.body.appendChild(intermediateFinalSurface)
});
const intermediateMenu = makeNode({ attrs: { role: "menu", "data-state": "open" }, children: [intermediateShareAction] });
const intermediateTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => intermediateMenuDoc.body.appendChild(intermediateMenu)
});
const intermediateToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [intermediateTrigger] });
const intermediateAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [intermediateToolbar] });
const intermediateTurn = makeNode({ attrs: { "data-testid": "conversation-turn-intermediate" }, children: [intermediateAssistant] });
intermediateMenuDoc = makeDocument([intermediateTurn]);
installDocument(hooks, intermediateMenuDoc);
const intermediateResult = await hooks.createOrReuseVisualizeShareLink(intermediateAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 25,
  pollMs: 1
});
assert.strictEqual(intermediateResult.ok, true, "one intermediate share menu action must lead to the final surface");
assert.strictEqual(intermediateResult.url, "https://chatgpt.com/s/synthetic-t_intermediate_menu");
assert.strictEqual(intermediateTrigger.clickCount, 1);
assert.strictEqual(intermediateShareAction.clickCount, 1, "the intermediate share action may be clicked at most once");

let nestedPopoverDoc;
const nestedPopoverFinalInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_nested_popover" } });
const nestedPopoverFinalClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const nestedPopoverFinal = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [nestedPopoverFinalInput, nestedPopoverFinalClose] });
const nestedPopoverAction = makeNode({
  tagName: "button",
  attrs: { role: "menuitem", "data-testid": "share-response-menu-item" },
  text: "Share",
  onClick: () => nestedPopoverDoc.body.appendChild(nestedPopoverFinal)
});
const nestedPopoverMenu = makeNode({ attrs: { role: "menu", "data-state": "open" }, children: [nestedPopoverAction] });
const nestedPopoverWrapper = makeNode({ attrs: { "data-side": "bottom", "data-state": "open" }, children: [nestedPopoverMenu] });
const nestedPopoverTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => nestedPopoverDoc.body.appendChild(nestedPopoverWrapper)
});
const nestedPopoverToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [nestedPopoverTrigger] });
const nestedPopoverAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [nestedPopoverToolbar] });
const nestedPopoverTurn = makeNode({ attrs: { "data-testid": "conversation-turn-nested-popover" }, children: [nestedPopoverAssistant] });
nestedPopoverDoc = makeDocument([nestedPopoverTurn]);
installDocument(hooks, nestedPopoverDoc);
const nestedPopoverResult = await hooks.createOrReuseVisualizeShareLink(nestedPopoverAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 25,
  pollMs: 1
});
assert.strictEqual(nestedPopoverResult.ok, true, "one portal wrapper and its nested menu must count as one intermediate surface");
assert.strictEqual(nestedPopoverResult.url, "https://chatgpt.com/s/synthetic-t_nested_popover");
assert.strictEqual(nestedPopoverAction.clickCount, 1);

let ambiguousMenuDoc;
const ambiguousMenuActionA = makeNode({ tagName: "button", attrs: { role: "menuitem", "data-testid": "share-response-menu-item" }, text: "Share" });
const ambiguousMenuActionB = makeNode({ tagName: "button", attrs: { role: "menuitem", "aria-label": "Share" }, text: "Share" });
const ambiguousIntermediateMenu = makeNode({ attrs: { role: "menu", "data-state": "open" }, children: [ambiguousMenuActionA, ambiguousMenuActionB] });
const ambiguousMenuTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => ambiguousMenuDoc.body.appendChild(ambiguousIntermediateMenu)
});
const ambiguousMenuToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [ambiguousMenuTrigger] });
const ambiguousMenuAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [ambiguousMenuToolbar] });
const ambiguousMenuTurn = makeNode({ attrs: { "data-testid": "conversation-turn-ambiguous-menu" }, children: [ambiguousMenuAssistant] });
ambiguousMenuDoc = makeDocument([ambiguousMenuTurn]);
installDocument(hooks, ambiguousMenuDoc);
const ambiguousMenuFlowResult = await hooks.createOrReuseVisualizeShareLink(ambiguousMenuAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(ambiguousMenuFlowResult.ok, false);
assert.strictEqual(ambiguousMenuFlowResult.stage, "share-menu");
assert.strictEqual(ambiguousMenuActionA.clickCount, 0, "two eligible intermediate actions must block all clicks");
assert.strictEqual(ambiguousMenuActionB.clickCount, 0, "two eligible intermediate actions must block all clicks");

let feedbackDialogDoc;
const feedbackSubmit = makeNode({ tagName: "button", text: "Submit" });
const ordinaryFeedbackDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, text: "Share your feedback", children: [feedbackSubmit] });
const feedbackDialogTrigger = makeNode({
  tagName: "button",
  attrs: { "aria-label": "Share" },
  onClick: () => feedbackDialogDoc.body.appendChild(ordinaryFeedbackDialog)
});
const feedbackDialogToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [feedbackDialogTrigger] });
const feedbackDialogAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [feedbackDialogToolbar] });
const feedbackDialogTurn = makeNode({ attrs: { "data-testid": "conversation-turn-feedback-dialog" }, children: [feedbackDialogAssistant] });
feedbackDialogDoc = makeDocument([feedbackDialogTurn]);
installDocument(hooks, feedbackDialogDoc);
const feedbackDialogResult = await hooks.createOrReuseVisualizeShareLink(feedbackDialogAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(feedbackDialogResult.ok, false);
assert.strictEqual(feedbackDialogResult.stage, "share-dialog", "ordinary dialogs containing the word Share must not be accepted");
assert.strictEqual(feedbackSubmit.clickCount, 0);

// Trigger search is scoped to the current A2 turn, but it must also require the
// response action toolbar. A stronger-looking Share control inside the answer
// body and a hidden mobile duplicate must never beat the real Korean toolbar.
let toolbarScopeDoc;
const toolbarScopeInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/synthetic-t_toolbar_scope" } });
const toolbarScopeClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const toolbarScopeDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [toolbarScopeInput, toolbarScopeClose] });
const answerBodyShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-response" }, text: "Share" });
const hiddenMobileShare = makeNode({ tagName: "button", attrs: { "aria-label": "공유하기" }, width: 0, height: 0 });
const realKoreanToolbarShare = makeNode({
  tagName: "button",
  attrs: { "aria-label": "공유하기", "data-state": "closed" },
  onClick: () => toolbarScopeDoc.body.appendChild(toolbarScopeDialog)
});
const koreanResponseActions = makeNode({ attrs: { role: "group", "aria-label": "응답 작업" }, children: [hiddenMobileShare, realKoreanToolbarShare] });
const unrelatedArtifactToolbar = makeNode({ attrs: { role: "toolbar" }, children: [answerBodyShare] });
const toolbarScopeAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [unrelatedArtifactToolbar, koreanResponseActions] });
const toolbarScopeTurn = makeNode({ attrs: { "data-testid": "conversation-turn-toolbar-scope" }, children: [toolbarScopeAssistant] });
const previousTurnShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-response" }, text: "Share" });
const previousTurn = makeNode({ attrs: { "data-testid": "conversation-turn-previous" }, children: [previousTurnShare] });
const globalShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share", "data-testid": "share-chat-button" }, text: "Share" });
toolbarScopeDoc = makeDocument([globalShare, previousTurn, toolbarScopeTurn]);
installDocument(hooks, toolbarScopeDoc);
const toolbarScopeResult = await hooks.createOrReuseVisualizeShareLink(toolbarScopeAssistant, {
  root: hooks.__sandbox.document,
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(toolbarScopeResult.ok, true, "only the current A2 response action toolbar may trigger sharing");
assert.strictEqual(realKoreanToolbarShare.clickCount, 1);
assert.strictEqual(answerBodyShare.clickCount, 0);
assert.strictEqual(hiddenMobileShare.clickCount, 0);
assert.strictEqual(previousTurnShare.clickCount, 0);
assert.strictEqual(globalShare.clickCount, 0);

// Once Create link is clicked, every later failure must retain enough state to
// warn that a share may remain active even if the URL was never validated.
const postCreateButton = makeNode({ tagName: "button", attrs: { "aria-label": "Create link" }, text: "Create link" });
const postCreateClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const postCreateDialog = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [postCreateButton, postCreateClose] });
const postCreateTrigger = makeNode({ tagName: "button", attrs: { "aria-label": "Share" } });
const postCreateActions = makeNode({ attrs: { role: "group", "aria-label": "Response actions" }, children: [postCreateTrigger] });
const postCreateAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [postCreateActions] });
const postCreateFailure = await hooks.createOrReuseVisualizeShareLink(postCreateAssistant, {
  getDialogs: () => [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: postCreateDialog, kind: "final" }),
  waitForValidatedShareUrl: async () => ({ ok: false, stage: "share-url", reason: "URL never became visible" })
});
assert.strictEqual(postCreateFailure.ok, false);
assert.strictEqual(postCreateFailure.stage, "manual-share-url");
assert.strictEqual(postCreateButton.clickCount, 1);
assert.strictEqual(postCreateFailure.shareSource, "created");
assert.strictEqual(postCreateFailure.shareCreatedThisAttempt, true);
assert.strictEqual(postCreateFailure.validatedShareUrl, "");

for (const blockedStage of ["runtime", "share-dialog"]) {
  const blockedCopy = makeNode({ tagName: "button", text: "Copy link" });
  const blockedCreate = makeNode({ tagName: "button", text: "Create link" });
  const blockedDialog = makeNode({ attrs: { role: "dialog" }, children: [blockedCreate] });
  blockedCreate.click = () => {
    blockedCreate.clickCount += 1;
    blockedDialog.appendChild(blockedCopy);
  };
  const blockedShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" } });
  const blockedAssistant = makeNode({ children: [makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [blockedShare] })] });
  let blockedReads = 0;
  let blockedManuals = 0;
  const blockedResult = await hooks.createOrReuseVisualizeShareLink(blockedAssistant, {
    getDialogs: () => [],
    waitForRelevantShareDialog: async () => ({ ok: true, dialog: blockedDialog, kind: "final" }),
    waitForValidatedShareUrl: async () => ({ ok: false, stage: blockedStage, reason: `${blockedStage} blocked` }),
    clipboardPermissionGranted: true,
    readClipboardText: async () => { blockedReads += 1; return "https://chatgpt.com/s/synthetic-must-not-read"; },
    requestManualShareUrl: async () => { blockedManuals += 1; return "https://chatgpt.com/s/synthetic-must-not-manual"; }
  });
  assert.strictEqual(blockedResult.ok, false);
  assert.strictEqual(blockedResult.stage, blockedStage, `post-Create ${blockedStage} failure must propagate`);
  assert.strictEqual(blockedCreate.clickCount, 1);
  assert.strictEqual(blockedCopy.clickCount, 0, `post-Create ${blockedStage} failure must not click Copy`);
  assert.strictEqual(blockedReads, 0);
  assert.strictEqual(blockedManuals, 0);
}

const noShareAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" } });
const noShareResult = await hooks.createOrReuseVisualizeShareLink(noShareAssistant, {
  getDialogs: () => [],
  waitForRelevantShareDialog: async () => { throw new Error("must not wait without a button"); }
});
assert.strictEqual(noShareResult.ok, false);
assert.strictEqual(noShareResult.stage, "share-button");

let clock = 0;
const delayedInput = makeNode({ tagName: "input", attrs: { value: "" } });
const delayedDialog = makeNode({ attrs: { role: "dialog" }, children: [delayedInput] });
const delayedUrlResult = await hooks.waitForValidatedShareUrl(delayedDialog, {
  timeoutMs: 10,
  pollMs: 1,
  now: () => clock,
  sleep: async () => {
    clock += 1;
    delayedInput.value = "https://chatgpt.com/s/synthetic-t_delayed";
  }
});
assert.strictEqual(delayedUrlResult.ok, true);
assert.strictEqual(delayedUrlResult.url, "https://chatgpt.com/s/synthetic-t_delayed");

let copyAlternativeSleeps = 0;
const copyAlternativeDialog = makeNode({
  attrs: { role: "dialog" },
  children: [makeNode({ tagName: "button", text: "Copy link" })]
});
const copyAlternativeResult = await hooks.waitForValidatedShareUrl(copyAlternativeDialog, {
  timeoutMs: 100,
  now: () => copyAlternativeSleeps,
  sleep: async () => { copyAlternativeSleeps += 1; }
});
assert.strictEqual(copyAlternativeResult.ok, false);
assert.strictEqual(copyAlternativeResult.copyAvailable, true, "post-create Copy-link availability must end DOM URL waiting immediately");
assert.strictEqual(copyAlternativeSleeps, 0);

let observed = false;
let disconnected = false;
const successTimerTracker = makeTimerTracker();
class TrackingObserver {
  constructor(callback) { this.callback = callback; }
  observe() { observed = true; }
  disconnect() { disconnected = true; }
}
let dialogPolls = 0;
const waitingDialog = makeNode({
  attrs: { role: "dialog", "data-testid": "share-dialog" },
  children: [makeNode({ tagName: "button", text: "Create link" })]
});
const waitingResult = await hooks.waitForRelevantShareDialog([], {
  root: makeNode({}),
  timeoutMs: 30,
  pollMs: 1,
  MutationObserver: TrackingObserver,
  setTimeout: successTimerTracker.setTimeout,
  clearTimeout: successTimerTracker.clearTimeout,
  getDialogs: () => {
    dialogPolls += 1;
    return dialogPolls > 1 ? [waitingDialog] : [];
  }
});
assert.strictEqual(waitingResult.ok, true);
assert.strictEqual(waitingResult.dialog, waitingDialog);
assert.strictEqual(observed, true);
assert.strictEqual(disconnected, true, "dialog observer must be cleaned up after success");
assert.strictEqual(successTimerTracker.pending.size, 0, "dialog timers must be cleaned up after success");

let timeoutDisconnected = false;
const timeoutTimerTracker = makeTimerTracker();
class TimeoutObserver {
  observe() {}
  disconnect() { timeoutDisconnected = true; }
}
const timeoutResult = await hooks.waitForRelevantShareDialog([], {
  root: makeNode({}),
  timeoutMs: 5,
  pollMs: 1,
  MutationObserver: TimeoutObserver,
  setTimeout: timeoutTimerTracker.setTimeout,
  clearTimeout: timeoutTimerTracker.clearTimeout,
  getDialogs: () => []
});
assert.strictEqual(timeoutResult.ok, false);
assert.strictEqual(timeoutResult.stage, "share-dialog");
assert.strictEqual(timeoutDisconnected, true, "dialog observer must be cleaned up after timeout");
assert.strictEqual(timeoutTimerTracker.pending.size, 0, "dialog timers must be cleaned up after timeout");

let runtimeAbortDisconnected = false;
let runtimeAbortChecks = 0;
const runtimeAbortTimers = makeTimerTracker();
class RuntimeAbortObserver {
  observe() {}
  disconnect() { runtimeAbortDisconnected = true; }
}
const runtimeAbortResult = await hooks.waitForRelevantShareDialog([], {
  root: makeNode({}),
  timeoutMs: 30,
  pollMs: 1,
  MutationObserver: RuntimeAbortObserver,
  setTimeout: runtimeAbortTimers.setTimeout,
  clearTimeout: runtimeAbortTimers.clearTimeout,
  runtimeGuard: {
    isAborted: () => false,
    check: async () => {
      runtimeAbortChecks += 1;
      return runtimeAbortChecks < 2 ? { ok: true } : { ok: false, error: "runtime aborted during share wait" };
    }
  },
  getDialogs: () => []
});
assert.strictEqual(runtimeAbortResult.ok, false);
assert.strictEqual(runtimeAbortResult.stage, "runtime");
assert.strictEqual(runtimeAbortDisconnected, true, "dialog observer must be cleaned up after runtime cancellation");
assert.strictEqual(runtimeAbortTimers.pending.size, 0, "dialog timers must be cleaned up after runtime cancellation");
const ambiguousDialogA = makeNode({ attrs: { role: "dialog" }, children: [makeNode({ tagName: "button", text: "Create link" })] });
const ambiguousDialogB = makeNode({ attrs: { role: "dialog" }, children: [makeNode({ tagName: "button", text: "Create link" })] });
const ambiguousDialogResult = await hooks.waitForRelevantShareDialog([], {
  root: makeNode({}),
  timeoutMs: 20,
  pollMs: 1,
  getDialogs: () => [ambiguousDialogA, ambiguousDialogB]
});
assert.strictEqual(ambiguousDialogResult.ok, false);
assert.strictEqual(ambiguousDialogResult.stage, "share-dialog");
const generatedWordingDialog = makeNode({ attrs: { role: "dialog" }, children: [makeNode({ tagName: "button", text: "Generate link" })] });
const generatedWordingResult = await hooks.waitForRelevantShareDialog([], {
  root: makeNode({}),
  timeoutMs: 20,
  pollMs: 1,
  getDialogs: () => [generatedWordingDialog]
});
assert.strictEqual(generatedWordingResult.ok, true, "bounded dialog detection must accept common Generate link wording");

const ambiguousCloseA = makeNode({ tagName: "button", text: "Close" });
const ambiguousCloseB = makeNode({ tagName: "button", text: "Close" });
const ambiguousCloseDialog = makeNode({ attrs: { role: "dialog" }, children: [ambiguousCloseA, ambiguousCloseB] });
assert.strictEqual(hooks.findCloseShareDialogButton(ambiguousCloseDialog), null);
const koreanCreateButton = makeNode({ tagName: "button", text: "공유 링크 생성" });
const koreanCreateDialog = makeNode({ attrs: { role: "dialog" }, children: [koreanCreateButton] });
assert.strictEqual(
  hooks.findCreateShareLinkButton(koreanCreateDialog),
  koreanCreateButton,
  "Korean create-link wording must be recognized without clicking a copy control"
);

let staleRuntimeShareClicks = 0;
const staleRuntimeShareButton = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
staleRuntimeShareButton.click = () => { staleRuntimeShareClicks += 1; };
const staleRuntimeResult = await hooks.createOrReuseVisualizeShareLink(
  makeNode({ children: [staleRuntimeShareButton] }),
  { runtimeGuard: { check: async () => ({ ok: false, error: "extension context invalidated" }) } }
);
assert.strictEqual(staleRuntimeResult.ok, false);
assert.strictEqual(staleRuntimeResult.stage, "runtime");
assert.strictEqual(staleRuntimeShareClicks, 0, "stale runtime must stop before the Share click");

assert.strictEqual(typeof hooks.prepareVisualizeSharePreflight, "function");
assert.strictEqual(typeof hooks.collectRichArtifactCandidatesForStoredNote, "function");
const storedA1Rich = makeNode({ children: [makeNode({ attrs: { "data-app-block-preview": "true" } })] });
const storedCandidates = hooks.collectRichArtifactCandidatesForStoredNote(visualizeAssistant, {
  previousQa: { answerNode: storedA1Rich },
  usePreviousQaForHtml: true
});
assert.strictEqual(storedCandidates.length, 1);
assert(storedCandidates[0].id.startsWith("stored-a1-rich-"));
const currentStoredCandidates = hooks.collectRichArtifactCandidatesForStoredNote(visualizeAssistant, {
  previousQa: null,
  usePreviousQaForHtml: false
});
assert.strictEqual(currentStoredCandidates.length, 1);
assert(currentStoredCandidates[0].id.startsWith("stored-current-rich-"));
const preflightShareButton = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
const preflightAppBlock = makeNode({ attrs: { "data-app-block-preview": "true" } });
const preflightAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [preflightAppBlock, preflightShareButton] });
const preflightRequest = makeNode({ attrs: { "data-id": "plugin:visualize" } });
const preflightAnswer = makeNode({ attrs: { "data-message-author-role": "assistant" }, text: "A1" });
const preflight = await hooks.prepareVisualizeSharePreflight({
  currentAssistantNode: preflightAssistant,
  previousQa: {
    requestNode: preflightRequest,
    answerNode: preflightAnswer,
    questionText: "Q1",
    answerText: "A1"
  },
  sourceUrl
});
assert.strictEqual(preflight.ok, true);
assert.strictEqual(preflight.fileIntegrity.complete, true);
assert.strictEqual(preflight.localRichIntegrity.complete, true);
assert.strictEqual(preflight.richArtifactsExpected, 1);
assert.strictEqual(preflight.remoteRichIntegrity.expectedCount, 1);
assert.strictEqual(preflight.remoteRichIntegrity.complete, false, "A2 remote reference is not a local rich capture");
assert(preflight.filePath.endsWith(".md"));
assert(preflight.markdown.includes("{{validatedChatGptShareUrl}}"));
assert(preflight.markdown.includes("capture_mode: previous-qa-visualize-share-link"), "previous-qa preflight must reserve its remote capture mode");
assert(!preflight.markdown.includes("/s/preflight"), "preflight must not hard-code a share URL");
assert.strictEqual(preflightShareButton.clickCount, 0, "preflight must not click Share");

let nativePreflightCalls = 0;
const blockedNativePreflight = await hooks.prepareVisualizeSharePreflight({
  currentAssistantNode: preflightAssistant,
  previousQa: {
    requestNode: preflightRequest,
    answerNode: preflightAnswer,
    questionText: "Q1",
    answerText: "A1"
  },
  sourceUrl,
  nativePreflightFn: async () => {
    nativePreflightCalls += 1;
    return { ok: false, error: "native helper unavailable" };
  }
});
assert.strictEqual(nativePreflightCalls, 1, "Native helper availability must be checked during preflight");
assert.strictEqual(blockedNativePreflight.ok, false);
assert.strictEqual(blockedNativePreflight.stage, "native-preflight");
assert.strictEqual(preflightShareButton.clickCount, 0, "Native preflight failure must stop before Share");

const timeoutFlowTrigger = makeNode({ tagName: "button", attrs: { "aria-label": "Share" } });
const timeoutFlowToolbar = makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [timeoutFlowTrigger] });
const timeoutFlowAssistant = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [timeoutFlowToolbar] });
const timeoutFlowTurn = makeNode({ attrs: { "data-testid": "conversation-turn-timeout-flow" }, children: [timeoutFlowAssistant] });
const timeoutFlowDoc = makeDocument([timeoutFlowTurn]);
installDocument(hooks, timeoutFlowDoc);
let timeoutFlowNativeSaves = 0;
let timeoutFlowUriOpens = 0;
const timeoutFlowRuntimeSender = hooks.__sandbox.chrome.runtime.sendMessage;
hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
  if (message?.type === "open-obsidian-uri") timeoutFlowUriOpens += 1;
  timeoutFlowRuntimeSender(message, callback);
};
const timeoutFlowResult = await hooks.handleVisualizeShareSave({
  btn: { closest: () => timeoutFlowAssistant },
  currentAssistantNode: timeoutFlowAssistant,
  previousQa: {
    requestNode: preflightRequest,
    answerNode: preflightAnswer,
    questionText: "Q1",
    answerText: "A1"
  },
  runtimeGuard: {
    check: async () => ({ ok: true }),
    isAborted: () => false,
    getFailure: () => null
  },
  sourceUrl: "https://chatgpt.com/c/synthetic-share-timeout-safety",
  preflightFn: async () => ({ ...preflight, title: "Share timeout safety", filePath: "ChatGPT/share-timeout-safety.md" }),
  confirmFn: () => true,
  requestShareConsentFn: approveVisualizeConsent,
  alertFn: () => {},
  shareOptions: {
    root: hooks.__sandbox.document,
    shareRoot: timeoutFlowAssistant,
    timeoutMs: 5,
    pollMs: 1
  },
  saveObsidianNoteFn: async () => {
    timeoutFlowNativeSaves += 1;
    return { ok: true };
  }
});
hooks.__sandbox.chrome.runtime.sendMessage = timeoutFlowRuntimeSender;
assert.strictEqual(timeoutFlowResult.ok, false);
assert.strictEqual(timeoutFlowResult.stage, "share-dialog");
assert.strictEqual(timeoutFlowTrigger.clickCount, 1);
assert.strictEqual(timeoutFlowNativeSaves, 0, "share-dialog timeout must not call Native save");
assert.strictEqual(timeoutFlowUriOpens, 0, "share-dialog timeout must not invoke URI fallback");

const sandbox = hooks.__sandbox;
const originalRuntimeSender = sandbox.chrome.runtime.sendMessage;
const originalConfirm = sandbox.confirm;
const originalAlert = sandbox.alert;
const originalSelection = sandbox.window.getSelection;
const saveEvents = { confirms: 0, consents: 0, permissionRequests: 0, shares: 0, opens: [], saves: [], alerts: [] };
let shareApproval = false;
let nativeShouldFail = false;
let testShareSource = "existing";
sandbox.window.getSelection = () => "";
sandbox.confirm = () => {
  saveEvents.confirms += 1;
  return shareApproval;
};
sandbox.alert = message => saveEvents.alerts.push(String(message));
sandbox.chrome.runtime.sendMessage = (message, callback) => {
  if (message?.type === "gpt2obs-runtime-ping") {
    callback?.({ ok: true, pong: true, version: hooks.VERSION });
    return;
  }
  if (message?.type === "gpt2obs-native-preflight") {
    callback?.({ ok: true, pong: true, native: true });
    return;
  }
  if (message?.type === "open-obsidian-uri") {
    saveEvents.opens.push(message);
    callback?.({ ok: true });
    return;
  }
  if (message?.type === "save-obsidian-note") {
    saveEvents.saves.push(message);
    callback?.(nativeShouldFail
      ? { ok: false, error: "native helper test failure" }
      : { ok: true, attachments: [], attachmentAudit: { writtenRequestedNames: [] }, warnings: [] });
    return;
  }
  callback?.({ ok: true });
};
const runtimeGuard = {
  checkSync: () => ({ ok: true }),
  check: async () => ({ ok: true }),
  isAborted: () => false,
  getFailure: () => null,
  fail: () => ({ ok: false }),
  notify: () => {}
};
const a1ForSave = makeNode({ attrs: { "data-message-author-role": "assistant" }, text: "A1 전체 답변" });
const q2ForSave = makeNode({ attrs: { "data-message-author-role": "user" }, children: [makeNode({ attrs: { "data-id": "plugin:visualize" } })] });
const a2AppBlock = makeNode({ attrs: { "data-app-block-preview": "true" } });
const a2ShareButton = makeNode({ tagName: "button", attrs: { "data-testid": "share-response", "aria-label": "Share" }, text: "Share" });
const a2ForSave = makeNode({ attrs: { "data-message-author-role": "assistant" }, children: [a2AppBlock, a2ShareButton] });
const saveButton = { closest: selector => selector === "[data-message-author-role]" ? a2ForSave : null };
const previousQaForSave = {
  requestNode: q2ForSave,
  answerNode: a1ForSave,
  questionText: "Q1 원래 질문",
  answerText: "A1 전체 답변"
};

{
  const retryQ1 = makeNode({ attrs: { "data-message-author-role": "user" }, text: "재시도 Q1" });
  const retryA1 = makeNode({ attrs: { "data-message-author-role": "assistant" }, text: "재시도 A1" });
  retryA1.innerHTML = "<p>재시도 A1</p>";
  const retryQ2 = makeNode({ attrs: { "data-message-author-role": "user" }, text: "Visualize" });
  const retryIframe = makeNode({
    tagName: "iframe",
    attrs: { src: "https://app-block-test.web-sandbox.oaiusercontent.com?" }
  });
  const retryAppBlock = makeNode({
    attrs: { "data-app-block-preview": "true" },
    children: [retryIframe]
  });
  const retrySaveButton = makeNode({
    tagName: "button",
    attrs: { class: "gpt2obs-btn" },
    text: "Obsidian 저장"
  });
  const retryA2 = makeNode({
    attrs: { "data-message-author-role": "assistant" },
    text: "재시도 A2 설명",
    children: [retryAppBlock, retrySaveButton]
  });
  const retryPreviousControl = makeNode({ tagName: "button", attrs: { "aria-label": "이전 응답" } });
  const retryResponseActions = makeNode({
    attrs: { role: "group", "aria-label": "응답 작업" },
    children: [retryPreviousControl, makeNode({ text: "2/2" })]
  });
  const retryDocument = makeDocument([
    makeNode({ attrs: { "data-testid": "conversation-turn-retry-q1" }, children: [retryQ1] }),
    makeNode({ attrs: { "data-testid": "conversation-turn-retry-a1" }, children: [retryA1] }),
    makeNode({ attrs: { "data-testid": "conversation-turn-retry-q2" }, children: [retryQ2] }),
    makeNode({ attrs: { "data-testid": "conversation-turn-retry-a2" }, children: [retryA2, retryResponseActions] })
  ]);
  let genericPartialCalls = 0;
  let visualizePreflightCalls = 0;
  let shareConsentCalls = 0;
  let shareCalls = 0;
  let nativeSaveCalls = 0;
  let savedRetryPayload = null;
  const originalRetrySourceUrl = sandbox.location.href;
  let retrySaveResult;
  installDocument(hooks, retryDocument);
  sandbox.location.href = "https://chatgpt.com/c/synthetic-retry-variant-visualize";
  try {
    retrySaveResult = await hooks.handleCopyClick(retrySaveButton, {
      delayMs: 0,
      runtimeGuard,
      confirmFn: () => {
        genericPartialCalls += 1;
        return false;
      },
      findPreviousQaPairFn: currentAssistantNode => hooks.findPreviousQaPair(
        currentAssistantNode,
        undefined,
        {
          extractQuestion: node => node.innerText,
          extractAnswer: node => node.innerText
        }
      ),
      preflightFn: async () => {
        visualizePreflightCalls += 1;
        return {
          ...preflight,
          title: "재시도 Visualize",
          filePath: "ChatGPT/retry-variant-visualize.md",
          questionText: "재시도 Q1",
          answerText: "재시도 A1"
        };
      },
      requestShareConsentFn: async () => {
        shareConsentCalls += 1;
        return { approved: true, permissionGranted: false };
      },
      createShareLinkFn: async () => {
        shareCalls += 1;
        return { ok: true, url: "https://chatgpt.com/s/synthetic-t_retry_variant", source: "existing", dialogClosed: true };
      },
      saveObsidianNoteFn: async payload => {
        nativeSaveCalls += 1;
        savedRetryPayload = payload;
        return { ok: true };
      },
      alertFn: () => {}
    });
  } finally {
    installDocument(hooks, timeoutFlowDoc);
    sandbox.location.href = originalRetrySourceUrl;
  }
  assert(retrySaveResult, "retried 2/2 Visualize must return the share-save result instead of the generic partial path");
  assert.strictEqual(retrySaveResult.ok, true, "retried 2/2 Visualize must finish through share mode");
  assert.strictEqual(genericPartialCalls, 0, "retried Visualize must not enter the generic partial-rich confirmation");
  assert.strictEqual(visualizePreflightCalls, 1);
  assert.strictEqual(shareConsentCalls, 1);
  assert.strictEqual(shareCalls, 1);
  assert.strictEqual(nativeSaveCalls, 1);
  assert(savedRetryPayload.content.includes("재시도 Q1"));
  assert(savedRetryPayload.content.includes("재시도 A1"));
  assert(savedRetryPayload.content.includes("https://chatgpt.com/s/synthetic-t_retry_variant"));
  assert(!savedRetryPayload.content.includes("capture_status: partial"));
  assert.strictEqual(savedRetryPayload.fallbackUri, "");
}

{
  const deniedFixture = makeCopyResolutionFixture();
  let deniedPermissionCalls = 0;
  let deniedClipboardReads = 0;
  let deniedNativeSaves = 0;
  const deniedResult = await hooks.handleVisualizeShareSave({
    btn: saveButton,
    currentAssistantNode: a2ForSave,
    previousQa: previousQaForSave,
    runtimeGuard,
    sourceUrl: "https://chatgpt.com/c/synthetic-permission-denied-manual-success",
    preflightFn: async () => ({ ...preflight, title: "Manual permission denied", filePath: "ChatGPT/manual-permission-denied.md" }),
    confirmFn: () => true,
    requestShareConsentFn: approveVisualizeConsent,
    requestClipboardReadPermissionFn: () => {
      deniedPermissionCalls += 1;
      return Promise.resolve(false);
    },
    createShareLinkFn: async (_node, options) => {
      assert.strictEqual(options.clipboardPermissionGranted, false);
      const resolved = await hooks.resolveShareUrlFromCopySurface(deniedFixture.surface, {
        ...options,
        readClipboardText: async () => (++deniedClipboardReads, "https://chatgpt.com/s/synthetic-must-not-read"),
        requestManualShareUrl: async () => "https://chatgpt.com/s/synthetic-t_manual_handler"
      });
      return resolved.ok ? { ...resolved, source: "existing", dialogClosed: false } : resolved;
    },
    saveObsidianNoteFn: async payload => {
      deniedNativeSaves += 1;
      assert(payload.content.includes("https://chatgpt.com/s/synthetic-t_manual_handler"));
      assert.strictEqual(payload.fallbackUri, "");
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(deniedResult.ok, true);
  assert.strictEqual(deniedPermissionCalls, 1);
  assert.strictEqual(deniedClipboardReads, 0);
  assert.strictEqual(deniedNativeSaves, 1, "validated manual fallback must reach Native save once");
}

{
  const cancelledFixture = makeCopyResolutionFixture();
  let cancelledNativeSaves = 0;
  const cancelledResult = await hooks.handleVisualizeShareSave({
    btn: saveButton,
    currentAssistantNode: a2ForSave,
    previousQa: previousQaForSave,
    runtimeGuard,
    sourceUrl: "https://chatgpt.com/c/synthetic-permission-denied-manual-cancel",
    preflightFn: async () => ({ ...preflight, title: "Manual cancelled", filePath: "ChatGPT/manual-cancelled.md" }),
    confirmFn: () => true,
    requestShareConsentFn: approveVisualizeConsent,
    requestClipboardReadPermissionFn: () => Promise.resolve(false),
    createShareLinkFn: async (_node, options) => {
      const resolved = await hooks.resolveShareUrlFromCopySurface(cancelledFixture.surface, {
        ...options,
        requestManualShareUrl: async () => ""
      });
      return resolved.ok ? { ...resolved, source: "existing" } : resolved;
    },
    saveObsidianNoteFn: async () => {
      cancelledNativeSaves += 1;
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(cancelledResult.ok, false);
  assert.strictEqual(cancelledResult.stage, "manual-share-url");
  assert.strictEqual(cancelledNativeSaves, 0, "manual cancellation must not call Native save");
}

{
  let composedDialogOpen = false;
  let composedReads = 0;
  let composedNativeSaves = 0;
  const composedCopy = makeNode({ tagName: "button", text: "Copy link" });
  composedCopy.click = () => {
    composedCopy.clickCount += 1;
    composedCopy.textContent = "Copied";
    composedCopy.innerText = "Copied";
    composedCopy.setAttribute("aria-label", "Copied");
  };
  const composedCreate = makeNode({ tagName: "button", text: "Create link" });
  const composedClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
  const composedDialog = makeNode({ attrs: { role: "dialog" }, children: [composedCopy, composedCreate, composedClose] });
  const composedShare = makeNode({ tagName: "button", attrs: { "aria-label": "Share" }, text: "Share" });
  composedShare.click = () => { composedShare.clickCount += 1; composedDialogOpen = true; };
  const composedAssistant = makeNode({
    attrs: { "data-message-author-role": "assistant" },
    children: [
      makeNode({ attrs: { "data-app-block-preview": "true" } }),
      makeNode({ attrs: { role: "toolbar", "aria-label": "Response actions" }, children: [composedShare] })
    ]
  });
  const composedResult = await hooks.handleVisualizeShareSave({
    btn: { closest: () => composedAssistant },
    currentAssistantNode: composedAssistant,
    previousQa: previousQaForSave,
    runtimeGuard,
    sourceUrl: "https://chatgpt.com/c/synthetic-composed-existing-copy-save",
    preflightFn: async () => ({ ...preflight, title: "Composed existing copy save", filePath: "ChatGPT/composed-existing-copy-save.md" }),
    requestShareConsentFn: approveVisualizeConsent,
    requestClipboardReadPermissionFn: () => Promise.resolve(true),
    shareOptions: {
      getDialogs: () => composedDialogOpen ? [composedDialog] : [],
      waitForRelevantShareDialog: async () => ({ ok: true, dialog: composedDialog }),
      readClipboardText: async () => {
        composedReads += 1;
        return "https://chatgpt.com/s/synthetic-t_composed_handler";
      },
      requestManualShareUrl: async () => ""
    },
    saveObsidianNoteFn: async payload => {
      composedNativeSaves += 1;
      assert(payload.content.includes("Q1 원래 질문"));
      assert(payload.content.includes("A1 전체 답변"));
      assert(payload.content.includes("https://chatgpt.com/s/synthetic-t_composed_handler"));
      assert.strictEqual(payload.fallbackUri, "");
      return { ok: true };
    },
    alertFn: () => {}
  });
  assert.strictEqual(composedResult.ok, true, "existing Copy surface must compose through clipboard validation to Native save");
  assert.strictEqual(composedShare.clickCount, 1);
  assert.strictEqual(composedCopy.clickCount, 1);
  assert.strictEqual(composedCreate.clickCount, 0);
  assert.strictEqual(composedReads, 1);
  assert.strictEqual(composedNativeSaves, 1);
}

const shareFlow = async () => {
  saveEvents.shares += 1;
  return { ok: true, url: "https://chatgpt.com/s/synthetic-t_handler", source: testShareSource, dialogClosed: true };
};
const runSaveAttempt = () => hooks.handleCopyClick(saveButton, {
  delayMs: 0,
  runtimeGuard,
  confirmFn: sandbox.confirm,
  alertFn: sandbox.alert,
  findPreviousQaPairFn: () => previousQaForSave,
  createShareLinkFn: shareFlow,
  requestShareConsentFn: ({ requestPermission }) => {
    saveEvents.consents += 1;
    if (!shareApproval) return Promise.resolve({ approved: false, permissionGranted: false });
    let permissionPromise;
    try { permissionPromise = Promise.resolve(requestPermission()); } catch { permissionPromise = Promise.resolve(false); }
    return permissionPromise.then(granted => ({ approved: true, permissionGranted: granted === true }));
  },
  requestClipboardReadPermissionFn: () => {
    saveEvents.permissionRequests += 1;
    return Promise.resolve(true);
  }
});
const postCreateAlerts = [];
let postCreateNativeSaves = 0;
const postCreateHandlerFailure = await hooks.handleVisualizeShareSave({
  btn: saveButton,
  currentAssistantNode: a2ForSave,
  previousQa: previousQaForSave,
  runtimeGuard,
  sourceUrl: "https://chatgpt.com/c/synthetic-post-create-url-failure",
  preflightFn: async () => ({ ...preflight, title: "Post-create URL failure", filePath: "ChatGPT/post-create-url-failure.md" }),
  confirmFn: () => true,
  requestShareConsentFn: approveVisualizeConsent,
  createShareLinkFn: async () => postCreateFailure,
  saveObsidianNoteFn: async () => {
    postCreateNativeSaves += 1;
    return { ok: true };
  },
  alertFn: message => postCreateAlerts.push(String(message))
});
assert.strictEqual(postCreateHandlerFailure.ok, false);
assert.strictEqual(postCreateHandlerFailure.stage, "manual-share-url");
assert.strictEqual(postCreateHandlerFailure.shareCreatedThisAttempt, true);
assert.strictEqual(postCreateNativeSaves, 0, "an unvalidated post-create failure must not call Native save");
assert(postCreateAlerts.some(message => /share link|공유링크/i.test(message)), "a post-create URL failure must warn that a share may remain active");

shareApproval = false;
await runSaveAttempt();
assert.strictEqual(saveEvents.confirms, 0, "complete preflight must not use a page-owned confirm dialog");
assert.strictEqual(saveEvents.consents, 1);
assert.strictEqual(saveEvents.permissionRequests, 0, "consent cancellation must not request clipboard permission");
assert.strictEqual(saveEvents.shares, 0, "share flow must not run when the user cancels");
assert.strictEqual(saveEvents.opens.length, 0, "cancel must not open an Obsidian URI");
assert.strictEqual(saveEvents.saves.length, 0, "cancel must not call Native save");
shareApproval = true;
await runSaveAttempt();
assert.strictEqual(saveEvents.consents, 2);
assert.strictEqual(saveEvents.permissionRequests, 1, "permission request must occur once after explicit consent and before sharing");
assert.strictEqual(saveEvents.shares, 1);
assert.strictEqual(saveEvents.opens.length, 0);
assert.strictEqual(saveEvents.saves.length, 1);
const savedShareMarkdown = saveEvents.saves[0].payload.content;
assert(savedShareMarkdown.includes("Q1 원래 질문"));
assert(savedShareMarkdown.includes("A1 전체 답변"));
assert(savedShareMarkdown.includes("https://chatgpt.com/s/synthetic-t_handler"));
[
  'visualize_share_url: "https://chatgpt.com/s/synthetic-t_handler"',
  "capture_status: remote-reference",
  "capture_mode: previous-qa-visualize-share-link",
  "rich_artifacts_expected: 1",
  "rich_artifacts_local_complete: 0",
  "rich_artifacts_remote_referenced: 1",
  "interactive_behavior_preserved: remote-only",
  "offline_available: false"
].forEach(fragment => assert(savedShareMarkdown.includes(fragment), `previous-qa saved Markdown must contain ${fragment}`));
assert.strictEqual(savedShareMarkdown.split("https://chatgpt.com/s/synthetic-t_handler").length - 1, 2, "share URL must occur once in frontmatter and once in the body link");
assert(!savedShareMarkdown.includes("capture_status: partial"), "previous-qa remote save must not reuse partial metadata");
assert(!savedShareMarkdown.includes("plugin:visualize"));
assert(!savedShareMarkdown.includes("validatedChatGptShareUrl"), "preflight URL placeholder must never reach the saved note");
assert.strictEqual(saveEvents.saves[0].payload.fallbackUri, "", "share mode must prohibit URI fallback");

nativeShouldFail = true;
testShareSource = "created";
const failedBefore = saveEvents.saves.length;
const createdFailureAlertStart = saveEvents.alerts.length;
sandbox.location.href = "https://chatgpt.com/c/synthetic-another-conversation";
const nativeFailureResult = await runSaveAttempt();
assert.strictEqual(saveEvents.saves.length, failedBefore + 1);
assert.strictEqual(saveEvents.opens.length, 0, "Native failure after share must not fall back to URI");
assert(saveEvents.alerts.some(message => message.includes("share link") || message.includes("공유링크")), "created/existing share failure must be reported");
assert.strictEqual(nativeFailureResult.shareSource, "created");
assert.strictEqual(nativeFailureResult.shareCreatedThisAttempt, true);
assert.strictEqual(nativeFailureResult.validatedShareUrl, "https://chatgpt.com/s/synthetic-t_handler");
assert(
  saveEvents.alerts.slice(createdFailureAlertStart).some(message => message.includes("공유링크는 생성됐지만")),
  "a newly created share must receive the persistent-link warning after Native failure"
);

testShareSource = "existing";
const existingFailureAlertStart = saveEvents.alerts.length;
sandbox.location.href = "https://chatgpt.com/c/synthetic-existing-native-failure";
const existingNativeFailureResult = await runSaveAttempt();
const existingFailureAlerts = saveEvents.alerts.slice(existingFailureAlertStart);
assert.strictEqual(existingNativeFailureResult.ok, false);
assert.strictEqual(existingNativeFailureResult.shareSource, "existing");
assert.strictEqual(existingNativeFailureResult.shareCreatedThisAttempt, false);
assert(
  !existingFailureAlerts.some(message => message.includes("공유링크는 생성됐지만")),
  "an existing share must not be misreported as newly created after Native failure"
);
nativeShouldFail = false;

const nativeThrowAlerts = [];
const nativeThrowResult = await hooks.handleVisualizeShareSave({
  btn: saveButton,
  currentAssistantNode: a2ForSave,
  previousQa: previousQaForSave,
  runtimeGuard,
  sourceUrl: "https://chatgpt.com/c/synthetic-native-throw",
  preflightFn: async () => preflight,
  confirmFn: () => true,
  requestShareConsentFn: approveVisualizeConsent,
  createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/s/synthetic-t_native_throw", source: "created" }),
  saveObsidianNoteFn: async () => { throw new Error("native helper threw"); },
  alertFn: message => nativeThrowAlerts.push(String(message))
});
assert.strictEqual(nativeThrowResult.ok, false);
assert.strictEqual(nativeThrowResult.stage, "native-save");
assert.strictEqual(nativeThrowResult.shareCreatedThisAttempt, true);
assert.strictEqual(nativeThrowResult.validatedShareUrl, "https://chatgpt.com/s/synthetic-t_native_throw");
assert(nativeThrowAlerts.some(message => message.includes("공유링크")), "a thrown Native failure must retain the created-link warning");

const incompleteFilePreflight = {
  ...preflight,
  fileIntegrity: hooks.assessArtifactIntegrity({
    fileLinks: [{ name: "missing.html", href: "", unresolved: true }],
    artifactRows: [],
    attachments: [],
    downloadedAttachments: [],
    generatedMarkdown: {},
    failures: []
  }),
  fileLinks: [{ name: "missing.html", href: "", unresolved: true }],
  artifactRows: []
};
const preflightOrder = [];
const incompleteResult = await hooks.handleVisualizeShareSave({
  btn: saveButton,
  currentAssistantNode: a2ForSave,
  previousQa: previousQaForSave,
  runtimeGuard,
  sourceUrl: "https://chatgpt.com/c/synthetic-preflight-incomplete",
  preflightFn: async () => {
    preflightOrder.push("preflight");
    return incompleteFilePreflight;
  },
  confirmFn: () => {
    preflightOrder.push("partial-confirm");
    return false;
  },
  createShareLinkFn: async () => {
    preflightOrder.push("share");
    return { ok: true, url: "https://chatgpt.com/s/synthetic-should-not-be-created", source: "created" };
  },
  alertFn: () => {}
});
assert.strictEqual(incompleteResult.ok, false);
assert.deepStrictEqual(preflightOrder, ["preflight", "partial-confirm"]);
assert(!preflightOrder.includes("share"), "file partial consent must be resolved before any share click");

const a1WithRichBlock = makeNode({
  attrs: { "data-message-author-role": "assistant" },
  children: [makeNode({ attrs: { "data-app-block-preview": "true" } })],
  text: "A1 with a separate app block"
});
let a1RichShareCalls = 0;
const a1RichResult = await hooks.handleVisualizeShareSave({
  btn: saveButton,
  currentAssistantNode: a2ForSave,
  previousQa: { ...previousQaForSave, answerNode: a1WithRichBlock, answerText: "A1 with a separate app block" },
  runtimeGuard,
  sourceUrl: "https://chatgpt.com/c/synthetic-a1-rich-preflight",
  confirmFn: () => false,
  createShareLinkFn: async () => {
    a1RichShareCalls += 1;
    return { ok: true, url: "https://chatgpt.com/s/synthetic-should-not-be-created", source: "created" };
  },
  alertFn: () => {}
});
assert.strictEqual(a1RichResult.ok, false);
assert.strictEqual(a1RichShareCalls, 0, "A1 rich loss must be handled before sharing A2");
let missingPairShareCalls = 0;
const missingPairResult = await hooks.handleVisualizeShareSave({
  btn: saveButton,
  currentAssistantNode: a2ForSave,
  previousQa: null,
  runtimeGuard,
  sourceUrl: "https://chatgpt.com/c/synthetic-missing-pair",
  createShareLinkFn: async () => {
    missingPairShareCalls += 1;
    return { ok: true, url: "https://chatgpt.com/s/synthetic-should-not-be-created", source: "created" };
  },
  alertFn: () => {}
});
assert.strictEqual(missingPairResult.ok, false);
assert.strictEqual(missingPairShareCalls, 0, "missing Q1/A1 must stop before the Share UI");

sandbox.chrome.runtime.sendMessage = originalRuntimeSender;
sandbox.confirm = originalConfirm;
sandbox.alert = originalAlert;
sandbox.window.getSelection = originalSelection;

const sourceText = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
assert(/const ARTIFACT_DEBUG = false;/.test(sourceText), "artifact debug logging must default to false");
assert(!savedShareMarkdown.includes("web-sandbox.oaiusercontent.com"));

console.log("visualize share reference self-test ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
