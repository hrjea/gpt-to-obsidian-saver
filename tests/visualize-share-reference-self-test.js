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
    location: { href: "https://chatgpt.com/c/test-conversation" },
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
            ? { ok: true, pong: true, version: "1.5.47" }
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
    if (s === "input") return node.tagName === "INPUT";
    if (s === "textarea") return node.tagName === "TEXTAREA";
    if (s === "a[href]") return node.tagName === "A" && node.getAttribute("href") !== "";
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
    ownerDocument: { defaultView: { getComputedStyle: () => ({ display: "", visibility: "" }) } },
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

function makeVisualizeConversationFixture({
  includePreviousQa = false,
  intermediateTurns = [],
  q2Text = "Q2에서 시각화해 주세요",
  a1Text = "A1 원본 답변",
  appBlock = true,
  duplicateRoleNodes = false
} = {}) {
  const turns = [];
  if (includePreviousQa) {
    turns.push(makeConversationTurn("user", "Q1 원본 질문", [], "q1"));
    turns.push(makeConversationTurn("assistant", a1Text, [], "a1"));
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
      "data-testid": "conversation-turn-q2",
      "data-turn": "user",
      "data-turn-id": "q2"
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
  const a2Turn = makeConversationTurn("assistant", "A2 바깥 설명", a2Children, "a2");
  turns.push(a2Turn);
  return { document: makeDocument(turns), q2: q2RoleNode, a2: a2Turn.querySelector("[data-message-author-role]"), a2Turn, turns };
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
assert.strictEqual(hooks.VERSION, "1.5.47");
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
    sourceUrl: "https://chatgpt.com/c/rich-app-continuation",
    shareUrl: "https://chatgpt.com/s/t_continuation",
    questionText: continuationContext.questionText,
    explanationText: "A2 바깥 설명",
    richArtifactsExpected: 1,
    richArtifactsRemoteReferenced: 1
  });
  [
    "capture_status: remote-reference",
    "capture_mode: rich-app-continuation-share-link",
    'rich_app_share_url: "https://chatgpt.com/s/t_continuation"',
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
    "https://chatgpt.com/s/t_continuation"
  ].forEach(fragment => assert(continuationMarkdown.includes(fragment), `continuation note must contain ${fragment}`));
  assert(!continuationMarkdown.includes("visualize_share_url:"), "provider-neutral continuation must not claim a Visualize URL field");
  assert(!continuationMarkdown.includes("# 원본 답변"), "continuation mode must not store A0 as the original answer");
  assert(!hooks.buildRichAppContinuationShareMarkdown({
    title: "invalid",
    sourceUrl: "https://chatgpt.com/c/rich-app-invalid",
    shareUrl: "https://chatgpt.com/c/not-a-share",
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
      return { ok: true, url: "https://chatgpt.com/s/t_continuation_current", source: "existing", dialogClosed: true };
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
    'rich_app_share_url: "https://chatgpt.com/s/t_continuation_current"',
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
  assert(!continuationSavedPayload.content.includes("https://chatgpt.com/s/t_continuation\""), "the previous A0 URL must not be reused");
  assert(!continuationSavedPayload.content.includes("A0 app explanation"), "A0 must not become the saved original answer");
  assert.strictEqual(continuationSavedPayload.fallbackUri, "", "continuation share mode must prohibit URI fallback");

  installDocument(hooks, continuationFixture.document);
  const continuationPreflight = await hooks.prepareVisualizeSharePreflight({
    currentAssistantNode: continuationFixture.a2,
    visualizeContext: continuationContext,
    sourceUrl: "https://chatgpt.com/c/rich-app-preflight",
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
    sourceUrl: "https://chatgpt.com/c/rich-app-invalid-share",
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
    createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/c/not-a-share", source: "existing" }),
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

  const previousFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
  installDocument(hooks, previousFixture.document);
  const previousContext = hooks.resolveVisualizeSaveContext(previousFixture.a2);
  assert.strictEqual(previousContext.mode, "previous-qa");
  assert.strictEqual(previousContext.questionNode.getAttribute("data-message-author-role"), "user");
  assert.strictEqual(previousContext.answerNode.getAttribute("data-message-author-role"), "assistant");
  assert.strictEqual(previousContext.visualizeRequestNode, previousFixture.q2);
  assert.strictEqual(previousContext.visualizeAnswerNode, previousFixture.a2);
  assert.strictEqual(previousContext.questionText, "Q1 원본 질문");
  assert.strictEqual(previousContext.answerText, "A1 원본 답변");

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
    sourceUrl: "https://chatgpt.com/c/direct-preflight",
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
    sourceUrl: "https://chatgpt.com/c/direct",
    shareUrl: "https://chatgpt.com/s/t_direct",
    questionText: directContext.questionText,
    explanationText: "A2 바깥 설명",
    richArtifactsExpected: 1
  });
  [
    "capture_status: remote-reference",
    "capture_mode: direct-visualize-share-link",
    "rich_artifacts_expected: 1",
    "rich_artifacts_local_complete: 0",
    "rich_artifacts_remote_referenced: 1",
    "interactive_behavior_preserved: remote-only",
    "offline_available: false",
    "# 시각화 요청",
    "Q2에서 시각화해 주세요",
    "# 시각화 설명",
    "A2 바깥 설명",
    "https://chatgpt.com/s/t_direct"
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
    sourceUrl: "https://chatgpt.com/c/direct-save",
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
      return { ok: true, url: "https://chatgpt.com/s/t_direct_save", source: "existing", dialogClosed: true };
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
  assert(directSavedPayload.content.includes("https://chatgpt.com/s/t_direct_save"));
  [
    'visualize_share_url: "https://chatgpt.com/s/t_direct_save"',
    "capture_status: remote-reference",
    "capture_mode: direct-visualize-share-link",
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
    sourceUrl: "https://chatgpt.com/c/direct-invalid-share",
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
    createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/c/not-a-share", source: "existing" }),
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
    sourceUrl: "https://chatgpt.com/c/direct-relative-share",
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

  const directClickButton = makeNode({ tagName: "button", attrs: { class: "gpt2obs-btn" }, text: "Obsidian 저장" });
  directFixture.a2.appendChild(directClickButton);
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
    createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/s/t_direct_click", source: "existing", dialogClosed: true }),
    saveObsidianNoteFn: async payload => {
      directClickSaveCalls += 1;
      assert(payload.content.includes("# 시각화 요청"));
      assert(payload.content.includes("Q2에서 시각화해 주세요"));
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
  const ambiguousAfterQ2 = makeVisualizeConversationFixture({ intermediateTurns: [strayAssistant] });
  installDocument(hooks, ambiguousAfterQ2.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(ambiguousAfterQ2.a2).mode, "unresolved", "an extra assistant between Q2 and A2 must stop safely");

  const olderQ1 = makeConversationTurn("user", "더 오래된 질문", [], "older-q1");
  const olderA1 = makeConversationTurn("assistant", "더 오래된 답변", [], "older-a1");
  const longHistory = makeVisualizeConversationFixture({ includePreviousQa: true });
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
    intermediateTurns: [makeNode({ tagName: "section", attrs: { "data-testid": "conversation-turn-tool-2", "data-turn": "tool" }, text: "tool output" })]
  });
  installDocument(hooks, previousWithTool.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(previousWithTool.a2).mode, "previous-qa");

  const emptyA1 = makeVisualizeConversationFixture({ includePreviousQa: true, a1Text: "" });
  installDocument(hooks, emptyA1.document);
  assert.strictEqual(hooks.resolveVisualizeSaveContext(emptyA1.a2).mode, "unresolved", "an empty A1 must not fall through to direct mode");
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
  hooks.normalizeChatGptShareUrl("/s/t_example"),
  "https://chatgpt.com/s/t_example"
);
[
  ["https://chatgpt.com/s/t_SYNTHETIC_SHARE_TOKEN_0000000000", "https://chatgpt.com/s/t_SYNTHETIC_SHARE_TOKEN_0000000000"],
  ["https://chatgpt.com/s/t_ok", "https://chatgpt.com/s/t_ok"],
  ["https://chatgpt.com/share/123e4567-e89b-12d3-a456-426614174000", "https://chatgpt.com/share/123e4567-e89b-12d3-a456-426614174000"],
  ["http://chatgpt.com/s/t_bad", ""],
  ["https://chatgpt.com.evil.example/s/t_bad", ""],
  ["https://evil.example/s/t_bad", ""],
  ["https://chatgpt.com/c/conversation", ""],
  ["https://user:pass@chatgpt.com/s/t_bad", ""],
  ["https://chatgpt.com:443/s/t_port", ""],
  ["https://chatgpt.com/s/t_query?x=1", ""],
  ["https://chatgpt.com/s/t_hash#x", ""],
  ["//chatgpt.com/s/t_bad", ""],
  ["/s/t_bad extra", ""],
  ["https://chatgpt.com/s/t_bad/extra", ""],
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
  ["https://chatgpt.com/s/t_clipboard", "https://chatgpt.com/s/t_clipboard"],
  ["https://chatgpt.com/share/123e4567-e89b-12d3-a456-426614174000", "https://chatgpt.com/share/123e4567-e89b-12d3-a456-426614174000"],
  [" https://chatgpt.com/s/t_trimmed ", "https://chatgpt.com/s/t_trimmed"],
  ["/s/t_relative", ""],
  ["//chatgpt.com/s/t_protocol_relative", ""],
  ["http://chatgpt.com/s/t_http", ""],
  ["https://user:pass@chatgpt.com/s/t_credentials", ""],
  ["https://evil.example/s/t_external", ""],
  ["https://chatgpt.com.evil.example/s/t_external", ""],
  ["https://chatgpt.com/c/conversation", ""],
  ["https://chatgpt.com/s/t_one extra", ""],
  ["링크: https://chatgpt.com/s/t_one", ""],
  ["[공유 링크](https://chatgpt.com/s/t_one)", ""],
  ["https://chatgpt.com/s/t_one\nhttps://chatgpt.com/s/t_two", ""],
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
const conversationVisualizeFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
let conversationDialogDocument;
const conversationDialogInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_conversation_fallback" } });
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
assert(conversationSavedPayload.content.includes('conversation_share_url: "https://chatgpt.com/s/t_conversation_fallback"'));
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
const instantCopyFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_simultaneous_surface" } }),
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
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_surface_a" } }),
    makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" })
  ]
});
const multipleSurfaceB = makeNode({
  attrs: { role: "dialog", "data-state": "open" },
  children: [
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_surface_b" } }),
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
  sourceUrl: "https://chatgpt.com/c/instant-copy",
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
      return "https://chatgpt.com/s/t_instant_copy";
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
assert(instantSavedPayload.content.includes('conversation_share_url: "https://chatgpt.com/s/t_instant_copy"'));
assert(!instantSavedPayload.content.includes("visualize_share_url:"));

// Permission denied/read unavailable must use the existing empty manual URL
// fallback without attempting a clipboard read.
const manualInstantFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
    return "https://chatgpt.com/s/t_must-not-read";
  },
  requestManualShareUrl: async () => {
    manualInstantPrompts += 1;
    return "https://chatgpt.com/s/t_manual_instant";
  },
  getDialogs: () => []
});
assert.strictEqual(manualInstantResult.ok, true);
assert.strictEqual(manualInstantResult.url, "https://chatgpt.com/s/t_manual_instant");
assert.strictEqual(manualInstantClipboardReads, 0);
assert.strictEqual(manualInstantPrompts, 1);
assert.strictEqual(manualInstantResult.shareInteraction, "instant-copy");

// A stale signal that existed before the click and a generic "copied" toast
// are not evidence of this conversation Share action.
const staleInstantFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
    return "https://chatgpt.com/s/t_stale_should-not-save";
  },
  getDialogs: () => [],
  timeoutMs: 20,
  pollMs: 1
});
assert.strictEqual(staleInstantResult.ok, false);
assert.strictEqual(staleInstantClipboardReads, 0);

const genericToastFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
  readClipboardText: async () => "https://chatgpt.com/s/t_generic_should-not-save",
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
    return "https://chatgpt.com/s/t_invalid_signal";
  }
});
assert.strictEqual(invalidSignalResult.ok, false);
assert.strictEqual(invalidSignalClipboardReads, 0, "clipboard must not be read without a verified fresh whole-conversation signal");

// No classified surface and no fresh whole-conversation signal must stop the
// complete save pipeline before Native or any URI fallback is attempted.
let noOutcomeNativeSaves = 0;
const noOutcomeFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
  sourceUrl: "https://chatgpt.com/c/no-outcome",
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
const instantNativeFailureFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
  sourceUrl: "https://chatgpt.com/c/instant-native-failure",
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
    readClipboardText: async () => "https://chatgpt.com/s/t_instant_native_failure"
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
  sourceUrl: "https://chatgpt.com/c/conversation-partial-warning",
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
  createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/s/t_conversation_partial_warning", source: "existing" }),
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
const missingTargetConversationFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
  sourceUrl: "https://chatgpt.com/c/conversation-missing-target-id",
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
    return { ok: true, url: "https://chatgpt.com/s/t_should-not-be-created", source: "created" };
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
const staleConversationInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_stale_conversation" } });
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
  staleConversationInput.value = "https://chatgpt.com/s/t_updated_conversation";
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
staleConversationInput.value = "https://chatgpt.com/s/t_stale_conversation";
const staleApproved = await hooks.createOrReuseVisualizeShareLink(staleConversationAssistant, {
  root: staleConversationDoc,
  shareKind: "conversation",
  shareTrigger: staleConversationShare,
  requestConversationShareUpdateConsent: async () => true,
  getDialogs: () => staleConversationDialogOpen ? [staleConversationDialog] : [],
  waitForRelevantShareDialog: async () => ({ ok: true, dialog: staleConversationDialog, kind: "final" }),
  waitForUpdatedShareUrl: async () => ({ ok: true, url: "https://chatgpt.com/s/t_updated_conversation", surface: staleConversationDialog })
});
assert.strictEqual(staleApproved.ok, true, "approved stale-link update must return the newly validated URL");
assert.strictEqual(staleApproved.url, "https://chatgpt.com/s/t_updated_conversation");
assert.strictEqual(staleApproved.shareUpdatedThisAttempt, true);
assert.strictEqual(staleConversationUpdate.clickCount, 1, "Update link must be clicked at most once");

// ChatGPT may expose an update action as a menu item rather than a button.
// It is still an update-capable share surface and must not silently reuse a
// potentially stale conversation URL.
let menuUpdateDialogOpen = false;
const menuUpdateInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_menu_stale" } });
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
  waitForUpdatedShareUrl: async () => ({ ok: true, url: "https://chatgpt.com/s/t_menu_updated", surface: menuUpdateDialog })
});
assert.strictEqual(menuUpdateResult.ok, true, "a menuitem Update link must use the stale-link update path");
assert.strictEqual(menuUpdateResult.url, "https://chatgpt.com/s/t_menu_updated");
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
  sourceUrl: "https://chatgpt.com/c/direct-conversation",
  shareUrl: "https://chatgpt.com/s/t_direct_conversation",
  bodyMode: "direct-visualize",
  questionText: "직접 시각화 요청",
  explanationText: "앱 바깥 설명",
  targetTurnId: "a2-direct",
  richArtifactsExpected: 1,
  richArtifactsRemoteReferenced: 1
});
assert(conversationDirectMarkdown.includes("capture_mode: direct-visualize-conversation-share-link"));
assert(conversationDirectMarkdown.includes('conversation_share_url: "https://chatgpt.com/s/t_direct_conversation"'));
assert(!conversationDirectMarkdown.includes("visualize_share_url:"));
const conversationContinuationMarkdown = hooks.buildConversationShareMarkdown({
  title: "후속 앱 대화 공유",
  sourceUrl: "https://chatgpt.com/c/continuation-conversation",
  shareUrl: "https://chatgpt.com/s/t_continuation_conversation",
  bodyMode: "rich-app-continuation",
  questionText: "다음 섹션을 보여줘",
  explanationText: "현재 앱 설명",
  targetTurnId: "a2-continuation",
  richArtifactsExpected: 1
});
assert(conversationContinuationMarkdown.includes("capture_mode: rich-app-continuation-conversation-share-link"));
assert(conversationContinuationMarkdown.includes('conversation_share_url: "https://chatgpt.com/s/t_continuation_conversation"'));
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
const failedConversationFixture = makeVisualizeConversationFixture({ includePreviousQa: true });
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
const sourceUrl = "https://chatgpt.com/c/original-conversation";
const shareUrl = "https://chatgpt.com/s/t_visualize";
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
const existingShareInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_existing" } });
const existingShareDialog = makeNode({ children: [existingShareInput] });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(existingShareDialog), "https://chatgpt.com/s/t_existing");
const relativeShareInput = makeNode({ tagName: "input", attrs: { value: "/share/t_relative" } });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(makeNode({ children: [relativeShareInput] })), "https://chatgpt.com/share/t_relative");
const invalidShareInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/c/not-a-share" } });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(makeNode({ children: [invalidShareInput] })), "");
const ambiguousShareUrls = makeNode({
  children: [
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_first" } }),
    makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_second" } })
  ]
});
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(ambiguousShareUrls), "", "two distinct visible share URLs must fail as ambiguous");
const shareTextDialog = makeNode({ text: "공유 링크: https://chatgpt.com/s/t_from_text" });
assert.strictEqual(hooks.extractValidatedChatGptShareUrl(shareTextDialog), "https://chatgpt.com/s/t_from_text");
const dialogWithoutUrl = makeNode({ attrs: { role: "dialog" }, text: "공유 링크를 만들 수 있습니다." });
const staleOutsideShareLink = makeNode({ tagName: "a", attrs: { href: "https://chatgpt.com/s/t_outside_dialog" }, text: "stale" });
assert.strictEqual(
  hooks.extractValidatedChatGptShareUrl(dialogWithoutUrl),
  "",
  "a share URL outside the current dialog must never be reused"
);
dialogWithoutUrl.childNodes.push(staleOutsideShareLink);
staleOutsideShareLink.parentElement = dialogWithoutUrl;
assert.strictEqual(
  hooks.extractValidatedChatGptShareUrl(dialogWithoutUrl),
  "https://chatgpt.com/s/t_outside_dialog",
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
    readClipboardText: async () => (++reads, "https://chatgpt.com/s/should-not-be-read"),
    requestManualShareUrl: async () => (++manuals, "https://chatgpt.com/s/t_manual_denied")
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
    readClipboardText: async () => (++reads, "https://chatgpt.com/s/should-not-be-read"),
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
    requestManualShareUrl: async () => "https://chatgpt.com/share/t_manual_after_exception"
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.source, "manual");
  assert.strictEqual(reads, 1, "clipboard exceptions must not cause a retry");
}

for (const invalidManual of [
  "https://evil.example/s/no",
  "https://chatgpt.com/c/not-share",
  "https://chatgpt.com/s/one extra",
  "https://chatgpt.com/s/one\nhttps://chatgpt.com/s/two"
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
    requestManualShareUrl: async () => (++manuals, "https://chatgpt.com/s/t_ambiguous_manual")
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
    readClipboardText: async () => { reads += 1; return "https://chatgpt.com/s/must-not-read"; },
    requestManualShareUrl: async () => { manuals += 1; return "https://chatgpt.com/s/must-not-manual"; }
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
    readClipboardText: async () => { reads += 1; return "https://chatgpt.com/s/must-not-read"; },
    requestManualShareUrl: async () => { manuals += 1; return "https://chatgpt.com/s/must-not-manual"; }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.stage, "runtime");
  assert.strictEqual(fixture.controls[0].clickCount, 1);
  assert.strictEqual(reads, 0);
  assert.strictEqual(manuals, 0);
}

{
  const sentinelClipboardUrl = "https://chatgpt.com/s/t_private_clipboard_sentinel";
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
    inputNode.value = "https://chatgpt.com/s/t_manual_overlay";
    formListeners.get("submit")({ preventDefault() {} });
    assert.strictEqual(await manualPromise, "https://chatgpt.com/s/t_manual_overlay");
    assert.strictEqual(inputNode.value, "", "manual input must be cleared after success");
    assert.strictEqual(hostAppended, 1);
    assert.strictEqual(hostRemoved, 1, "manual overlay must be removed after success");
    assert.strictEqual(formListeners.size, 0, "manual form listener must be removed after success");
    assert.strictEqual(manualKeyRemovals, 1, "manual Escape handler must be removed after success");

    const cancelledManualPromise = hooks.requestManualVisualizeShareUrl();
    inputNode.value = "https://chatgpt.com/s/t_must_be_cleared";
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
const existingLinkInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_existing_state" } });
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
assert.strictEqual(existingResult.url, "https://chatgpt.com/s/t_existing_state");
assert.strictEqual(existingShareButton.clickCount, 1);
assert.strictEqual(existingClose.clickCount, 1);

let createDialogOpen = false;
let createdLinkClicks = 0;
const createLinkButton = makeNode({ tagName: "button", text: "Create link" });
createLinkButton.click = () => {
  createLinkButton.clickCount += 1;
  createdLinkClicks += 1;
  createDialog.childNodes.push(makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/share/t_created_state" } }));
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
assert.strictEqual(createResult.url, "https://chatgpt.com/share/t_created_state");
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
    return "https://chatgpt.com/share/t_created_copy";
  },
  requestManualShareUrl: async () => ""
});
assert.strictEqual(createdCopyResult.ok, true);
assert.strictEqual(createdCopyResult.source, "created");
assert.strictEqual(createdCopyResult.shareCreatedThisAttempt, true);
assert.strictEqual(createdCopyResult.url, "https://chatgpt.com/share/t_created_copy");
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
  readClipboardText: async () => "https://chatgpt.com/s/t_replaced_surface",
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
    return "https://chatgpt.com/s/t_copy_only";
  },
  requestManualShareUrl: async () => {
    copyOnlyManualCalls += 1;
    return "";
  }
});
assert.strictEqual(copyOnlyResult.ok, true);
assert.strictEqual(copyOnlyResult.source, "existing");
assert.strictEqual(copyOnlyResult.url, "https://chatgpt.com/s/t_copy_only");
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
  readClipboardText: async () => "https://chatgpt.com/s/t_copy_surface_replaced",
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
    return "https://chatgpt.com/s/t_unrelated_stale";
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
  return "https://chatgpt.com/s/t_stale_clipboard";
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
const reusedSurfaceInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_reused_surface" } });
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
assert.strictEqual(reusedSurfaceResult.url, "https://chatgpt.com/s/t_reused_surface");
assert.strictEqual(reusedSurfaceTrigger.clickCount, 1);

// A visible top-layer shell can be reused and structurally updated for the
// current share operation. A changed state on the same node must be accepted.
const updatedVisibleClose = makeNode({ tagName: "button", attrs: { "aria-label": "Close" }, text: "Close" });
const updatedVisibleSurface = makeNode({ attrs: { role: "dialog", "data-state": "open" }, children: [updatedVisibleClose] });
const updatedVisibleInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_updated_visible" } });
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
assert.strictEqual(updatedVisibleResult.url, "https://chatgpt.com/s/t_updated_visible");
assert.strictEqual(updatedVisibleTrigger.clickCount, 1);

// Final share UI can be a connected sheet/region rather than role=dialog.
let shareSheetDoc;
const shareSheetInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/share/t_region_sheet" } });
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
assert.strictEqual(shareSheetResult.url, "https://chatgpt.com/share/t_region_sheet");
assert.strictEqual(shareSheetTrigger.clickCount, 1);

let directPopoverDoc;
const directPopoverInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_direct_popover" } });
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
assert.strictEqual(directPopoverResult.url, "https://chatgpt.com/s/t_direct_popover");

let bodyPortalDoc;
const bodyPortalInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_body_portal" } });
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
assert.strictEqual(bodyPortalResult.url, "https://chatgpt.com/s/t_body_portal");
assert.strictEqual(bodyPortalTurn.contains(bodyPortalDialog), false, "final share surface must be discovered outside the A2 turn");
assert.strictEqual(bodyPortalDoc.body.contains(bodyPortalDialog), true, "final share surface must be discovered in the body portal");

let exposedExistingDoc;
const exposedExistingInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/share/t_exposed_existing" } });
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
assert.strictEqual(exposedExistingResult.url, "https://chatgpt.com/share/t_exposed_existing");
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
    realCreateDialog.appendChild(makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_real_create" } }));
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
assert.strictEqual(realCreateResult.url, "https://chatgpt.com/s/t_real_create");
assert.strictEqual(realCreateButton.clickCount, 1, "Create link may be clicked at most once");

// Some response toolbars open one intermediate menu/popover action before the
// final share surface. Only one unambiguous share action may be clicked.
let intermediateMenuDoc;
const intermediateFinalInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_intermediate_menu" } });
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
assert.strictEqual(intermediateResult.url, "https://chatgpt.com/s/t_intermediate_menu");
assert.strictEqual(intermediateTrigger.clickCount, 1);
assert.strictEqual(intermediateShareAction.clickCount, 1, "the intermediate share action may be clicked at most once");

let nestedPopoverDoc;
const nestedPopoverFinalInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_nested_popover" } });
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
assert.strictEqual(nestedPopoverResult.url, "https://chatgpt.com/s/t_nested_popover");
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
const toolbarScopeInput = makeNode({ tagName: "input", attrs: { value: "https://chatgpt.com/s/t_toolbar_scope" } });
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
    readClipboardText: async () => { blockedReads += 1; return "https://chatgpt.com/s/must-not-read"; },
    requestManualShareUrl: async () => { blockedManuals += 1; return "https://chatgpt.com/s/must-not-manual"; }
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
    delayedInput.value = "https://chatgpt.com/s/t_delayed";
  }
});
assert.strictEqual(delayedUrlResult.ok, true);
assert.strictEqual(delayedUrlResult.url, "https://chatgpt.com/s/t_delayed");

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
  sourceUrl: "https://chatgpt.com/c/share-timeout-safety",
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
  sandbox.location.href = "https://chatgpt.com/c/retry-variant-visualize";
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
        return { ok: true, url: "https://chatgpt.com/s/t_retry_variant", source: "existing", dialogClosed: true };
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
  assert(savedRetryPayload.content.includes("https://chatgpt.com/s/t_retry_variant"));
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
    sourceUrl: "https://chatgpt.com/c/permission-denied-manual-success",
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
        readClipboardText: async () => (++deniedClipboardReads, "https://chatgpt.com/s/must-not-read"),
        requestManualShareUrl: async () => "https://chatgpt.com/s/t_manual_handler"
      });
      return resolved.ok ? { ...resolved, source: "existing", dialogClosed: false } : resolved;
    },
    saveObsidianNoteFn: async payload => {
      deniedNativeSaves += 1;
      assert(payload.content.includes("https://chatgpt.com/s/t_manual_handler"));
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
    sourceUrl: "https://chatgpt.com/c/permission-denied-manual-cancel",
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
    sourceUrl: "https://chatgpt.com/c/composed-existing-copy-save",
    preflightFn: async () => ({ ...preflight, title: "Composed existing copy save", filePath: "ChatGPT/composed-existing-copy-save.md" }),
    requestShareConsentFn: approveVisualizeConsent,
    requestClipboardReadPermissionFn: () => Promise.resolve(true),
    shareOptions: {
      getDialogs: () => composedDialogOpen ? [composedDialog] : [],
      waitForRelevantShareDialog: async () => ({ ok: true, dialog: composedDialog }),
      readClipboardText: async () => {
        composedReads += 1;
        return "https://chatgpt.com/s/t_composed_handler";
      },
      requestManualShareUrl: async () => ""
    },
    saveObsidianNoteFn: async payload => {
      composedNativeSaves += 1;
      assert(payload.content.includes("Q1 원래 질문"));
      assert(payload.content.includes("A1 전체 답변"));
      assert(payload.content.includes("https://chatgpt.com/s/t_composed_handler"));
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
  return { ok: true, url: "https://chatgpt.com/s/t_handler", source: testShareSource, dialogClosed: true };
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
  sourceUrl: "https://chatgpt.com/c/post-create-url-failure",
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
assert(savedShareMarkdown.includes("https://chatgpt.com/s/t_handler"));
[
  'visualize_share_url: "https://chatgpt.com/s/t_handler"',
  "capture_status: remote-reference",
  "capture_mode: previous-qa-visualize-share-link",
  "rich_artifacts_expected: 1",
  "rich_artifacts_local_complete: 0",
  "rich_artifacts_remote_referenced: 1",
  "interactive_behavior_preserved: remote-only",
  "offline_available: false"
].forEach(fragment => assert(savedShareMarkdown.includes(fragment), `previous-qa saved Markdown must contain ${fragment}`));
assert.strictEqual(savedShareMarkdown.split("https://chatgpt.com/s/t_handler").length - 1, 2, "share URL must occur once in frontmatter and once in the body link");
assert(!savedShareMarkdown.includes("capture_status: partial"), "previous-qa remote save must not reuse partial metadata");
assert(!savedShareMarkdown.includes("plugin:visualize"));
assert(!savedShareMarkdown.includes("validatedChatGptShareUrl"), "preflight URL placeholder must never reach the saved note");
assert.strictEqual(saveEvents.saves[0].payload.fallbackUri, "", "share mode must prohibit URI fallback");

nativeShouldFail = true;
testShareSource = "created";
const failedBefore = saveEvents.saves.length;
const createdFailureAlertStart = saveEvents.alerts.length;
sandbox.location.href = "https://chatgpt.com/c/another-conversation";
const nativeFailureResult = await runSaveAttempt();
assert.strictEqual(saveEvents.saves.length, failedBefore + 1);
assert.strictEqual(saveEvents.opens.length, 0, "Native failure after share must not fall back to URI");
assert(saveEvents.alerts.some(message => message.includes("share link") || message.includes("공유링크")), "created/existing share failure must be reported");
assert.strictEqual(nativeFailureResult.shareSource, "created");
assert.strictEqual(nativeFailureResult.shareCreatedThisAttempt, true);
assert.strictEqual(nativeFailureResult.validatedShareUrl, "https://chatgpt.com/s/t_handler");
assert(
  saveEvents.alerts.slice(createdFailureAlertStart).some(message => message.includes("공유링크는 생성됐지만")),
  "a newly created share must receive the persistent-link warning after Native failure"
);

testShareSource = "existing";
const existingFailureAlertStart = saveEvents.alerts.length;
sandbox.location.href = "https://chatgpt.com/c/existing-native-failure";
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
  sourceUrl: "https://chatgpt.com/c/native-throw",
  preflightFn: async () => preflight,
  confirmFn: () => true,
  requestShareConsentFn: approveVisualizeConsent,
  createShareLinkFn: async () => ({ ok: true, url: "https://chatgpt.com/s/t_native_throw", source: "created" }),
  saveObsidianNoteFn: async () => { throw new Error("native helper threw"); },
  alertFn: message => nativeThrowAlerts.push(String(message))
});
assert.strictEqual(nativeThrowResult.ok, false);
assert.strictEqual(nativeThrowResult.stage, "native-save");
assert.strictEqual(nativeThrowResult.shareCreatedThisAttempt, true);
assert.strictEqual(nativeThrowResult.validatedShareUrl, "https://chatgpt.com/s/t_native_throw");
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
  sourceUrl: "https://chatgpt.com/c/preflight-incomplete",
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
    return { ok: true, url: "https://chatgpt.com/s/should-not-be-created", source: "created" };
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
  sourceUrl: "https://chatgpt.com/c/a1-rich-preflight",
  confirmFn: () => false,
  createShareLinkFn: async () => {
    a1RichShareCalls += 1;
    return { ok: true, url: "https://chatgpt.com/s/should-not-be-created", source: "created" };
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
  sourceUrl: "https://chatgpt.com/c/missing-pair",
  createShareLinkFn: async () => {
    missingPairShareCalls += 1;
    return { ok: true, url: "https://chatgpt.com/s/should-not-be-created", source: "created" };
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
