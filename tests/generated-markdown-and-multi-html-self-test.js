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
            ? { ok: true, pong: true, version: "1.5.63" }
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

function makeArtifactViewer(name, source, {
  initialCodeVisible = false,
  previewRestoreDelayMs = 0,
  neverRestorePreview = false,
  onPreviewRequested = () => {},
  onSourceVisibilityChange = () => {}
} = {}) {
  let sourceVisible = initialCodeVisible;
  let previewRestored = false;
  let restoreTimer = null;
  const sourceNode = {
    value: "",
    innerText: source,
    textContent: source,
    getAttribute: () => ""
  };
  const root = {
    isConnected: true,
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
    getAttribute: attr => attr === "aria-label" ? "코딩" : (attr === "aria-pressed" ? String(sourceVisible) : ""),
    closest: selector => selector === "[role=\"group\"]" ? group : null,
    querySelector: () => null,
    click: () => {
      sourceVisible = true;
      onSourceVisibilityChange(true);
    }
  };
  const previewToggle = {
    parentElement: group,
    innerText: "미리 보기",
    textContent: "미리 보기",
    getAttribute: attr => attr === "aria-label" ? "미리 보기" : (attr === "aria-pressed" ? String(!sourceVisible) : ""),
    closest: selector => selector === "[role=\"group\"]" ? group : null,
    querySelector: () => null,
    click: () => {
      onPreviewRequested();
      if (neverRestorePreview) return;
      const restore = () => {
        sourceVisible = false;
        previewRestored = true;
        onSourceVisibilityChange(false);
      };
      if (previewRestoreDelayMs > 0) restoreTimer = setTimeout(restore, previewRestoreDelayMs);
      else restore();
    }
  };
  return {
    name, root, codeToggle, previewToggle, source,
    wasPreviewRestored: () => previewRestored,
    cleanup: () => { clearTimeout(restoreTimer); }
  };
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

function makeHandleCopyFixture(hooks, {
  rich = true,
  html = false,
  detailedMarkdown = "",
  downloadedDetailedMarkdown = false,
  previousQa = false,
  outer = "outer explanation",
  question = "ordinary selected question",
  questionId = "ordinary-q1",
  selectedAssistantId = "ordinary-a1",
  interveningAssistants = []
} = {}) {
  const sandbox = hooks.__sandbox;
  const original = {
    sendMessage: sandbox.chrome.runtime.sendMessage,
    confirm: sandbox.confirm,
    selection: sandbox.window.getSelection,
    href: sandbox.location.href,
    body: sandbox.document.body,
    querySelector: sandbox.document.querySelector,
    querySelectorAll: sandbox.document.querySelectorAll,
    fetch: sandbox.fetch
  };
  const events = {
    confirms: 0,
    shareConsents: 0,
    permissions: 0,
    nativePreflights: [],
    shares: [],
    opens: [],
    saves: [],
    alerts: [],
    consentModes: [],
    shareTargets: [],
    order: []
  };
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
  const markdownName = "chapter-detailed-summary.md";
  const markdownDownloadButton = {
    isConnected: true,
    tagName: "BUTTON",
    parentElement: null,
    style: {},
    innerText: "Download",
    textContent: "Download",
    getAttribute: name => name === "aria-label" ? "Download" : "",
    hasAttribute: () => false,
    matches: selector => selector === "button" || selector === "[role='button']",
    closest: selector => selector === "[class*='artifact-row']" ? markdownRow : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 32, height: 32 }),
    click() {}
  };
  const markdownOpenButton = {
    isConnected: true,
    tagName: downloadedDetailedMarkdown ? "BUTTON" : "A",
    parentElement: null,
    style: {},
    href: detailedMarkdown && !downloadedDetailedMarkdown
      ? `data:text/markdown;charset=utf-8,${encodeURIComponent(detailedMarkdown)}`
      : "",
    innerText: markdownName,
    textContent: markdownName,
    getAttribute(name) {
      if (name === "href") return this.href;
      if (name === "data-file-name") return markdownName;
      return "";
    },
    hasAttribute: () => false,
    matches(selector) {
      return (!downloadedDetailedMarkdown && selector === "a[href]") ||
        (downloadedDetailedMarkdown && (selector === "button" || selector === "[role='button']"));
    },
    closest: selector => selector === "[class*='artifact-row']" ? markdownRow : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 180, height: 32 }),
    click() {}
  };
  const markdownRow = {
    isConnected: true,
    parentElement: null,
    className: "artifact-row",
    style: {},
    innerText: markdownName,
    textContent: markdownName,
    getAttribute: name => name === "class" ? "artifact-row" : "",
    matches: selector => selector === "[class*='artifact-row']",
    closest: () => null,
    querySelector: selector => selector === "a[href]" && !downloadedDetailedMarkdown ? markdownOpenButton : null,
    querySelectorAll: selector => selector.includes("button") || selector.includes("a[href]") || selector.includes("[role='button']")
      ? downloadedDetailedMarkdown ? [markdownOpenButton, markdownDownloadButton] : [markdownOpenButton]
      : [],
    getBoundingClientRect: () => ({ width: 420, height: 48 }),
    contains: node => node === markdownOpenButton || node === markdownDownloadButton
  };
  markdownOpenButton.parentElement = markdownRow;
  markdownDownloadButton.parentElement = markdownRow;
  const makeAnswerClone = () => {
    const clonedBlock = { remove() {}, closest: selector => selector === richSelector ? clonedBlock : null };
    return {
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: selector => selector === richSelector && rich ? [clonedBlock] : [],
      cloneNode: makeAnswerClone,
      getAttribute: () => "",
      innerHTML: "",
      innerText: answerText,
      textContent: answerText,
      contains: () => false
    };
  };
  const makeQuestionClone = () => ({
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: () => [],
    cloneNode: makeQuestionClone,
    getAttribute: () => "",
    innerHTML: "",
    innerText: question,
    textContent: question,
    contains: () => false
  });
  let assistantTurn = null;
  let questionTurn = null;
  const container = {
    isConnected: true,
    parentElement: null,
    matches: selector => selector === "[data-message-author-role]",
    getAttribute: name => {
      if (name === "data-message-author-role") return "assistant";
      if (name === "data-message-id") return selectedAssistantId;
      return "";
    },
    innerHTML: "",
    innerText: answerText,
    textContent: answerText,
    contains: node => node === container || node === button,
    cloneNode: makeAnswerClone,
    closest(selector) {
      if (selector === "[data-message-author-role]") return container;
      if (selector.includes("[data-turn-id]") || selector.includes("[data-message-id]") || selector.includes("[data-testid^='conversation-turn-']")) return assistantTurn;
      return null;
    },
    querySelector(selector) {
      return html && selector.includes("iframe") ? realFrame : null;
    },
    querySelectorAll(selector) {
      if (selector === richSelector) return rich ? [appBlock] : [];
      if (selector === "iframe") return html ? (rich ? [appFrame, realFrame] : [realFrame]) : (rich ? [appFrame] : []);
      if (detailedMarkdown && (
        selector.includes("button") || selector.includes("a[href]") ||
        selector.includes("[data-file-name]") || selector.includes("[data-filename]")
      )) {
        return downloadedDetailedMarkdown ? [markdownOpenButton, markdownDownloadButton] : [markdownOpenButton];
      }
      return [];
    }
  };
  const questionNode = {
    isConnected: true,
    parentElement: null,
    matches: selector => selector === "[data-message-author-role]",
    getAttribute: name => {
      if (name === "data-message-author-role") return "user";
      if (name === "data-message-id") return questionId;
      return "";
    },
    innerHTML: "",
    innerText: question,
    textContent: question,
    contains: node => node === questionNode,
    cloneNode: makeQuestionClone,
    closest(selector) {
      if (selector === "[data-message-author-role]") return questionNode;
      if (selector.includes("[data-turn-id]") || selector.includes("[data-message-id]") || selector.includes("[data-testid^='conversation-turn-']")) return questionTurn;
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const matchesWrapperSelector = (attrs, selector) => String(selector || "").split(",").some(part => {
    const candidate = part.trim();
    if (candidate === "[data-testid^='conversation-turn-']") {
      return String(attrs["data-testid"] || "").startsWith("conversation-turn-");
    }
    if (candidate === "[data-turn-id]") return !!attrs["data-turn-id"];
    if (candidate === "[data-message-id]") return !!attrs["data-message-id"];
    if (candidate === "[data-turn]") return !!attrs["data-turn"];
    return false;
  });
  const makeTurn = (role, id, roleNode) => {
    const attrs = {
      "data-testid": `conversation-turn-${id}`,
      "data-turn-id": id,
      "data-message-id": id,
      "data-turn": role
    };
    return {
      isConnected: true,
      parentElement: null,
      matches(selector) { return matchesWrapperSelector(attrs, selector); },
      getAttribute: name => attrs[name] || "",
      contains: node => node === roleNode || roleNode.contains?.(node),
      closest(selector) {
        if (this.matches(selector)) return this;
        return this.parentElement?.closest?.(selector) || null;
      },
      querySelector(selector) {
        if (selector === "[data-message-author-role]") return roleNode;
        return roleNode.querySelector?.(selector) || null;
      },
      querySelectorAll(selector) {
        if (selector === "[data-message-author-role]") return [roleNode];
        return roleNode.querySelectorAll?.(selector) || [];
      }
    };
  };
  questionTurn = makeTurn("user", questionId, questionNode);
  assistantTurn = makeTurn("assistant", selectedAssistantId, container);
  const makePlainTurn = (role, id, text) => {
    let turn = null;
    const makeClone = () => ({
      matches: () => false,
      querySelector: () => null,
      querySelectorAll: () => [],
      cloneNode: makeClone,
      getAttribute: () => "",
      innerHTML: "",
      innerText: text,
      textContent: text,
      contains: () => false
    });
    const node = {
      isConnected: true,
      parentElement: null,
      matches: selector => selector === "[data-message-author-role]",
      getAttribute: name => {
        if (name === "data-message-author-role") return role;
        if (name === "data-message-id") return id;
        return "";
      },
      innerHTML: "",
      innerText: text,
      textContent: text,
      contains: candidate => candidate === node,
      cloneNode: makeClone,
      closest(selector) {
        if (selector === "[data-message-author-role]") return node;
        if (selector.includes("[data-turn-id]") || selector.includes("[data-message-id]") || selector.includes("[data-testid^='conversation-turn-']")) return turn;
        return null;
      },
      querySelector: () => null,
      querySelectorAll: () => []
    };
    turn = makeTurn(role, id, node);
    node.parentElement = turn;
    return { node, turn };
  };
  const previousQuestion = makePlainTurn("user", "ordinary-q0", "original earlier question");
  const previousAnswer = makePlainTurn("assistant", "ordinary-a0", "original earlier answer");
  const interveningAssistantTurns = interveningAssistants.map(({ id, text }, index) => makePlainTurn(
    "assistant",
    id || `ordinary-intervening-a${index + 1}`,
    text || `ordinary intervening assistant ${index + 1}`
  ));
  const makeBarrierTurn = (id, declaredRole = "tool") => {
    const attrs = {
      "data-testid": `conversation-turn-${id}`,
      "data-turn-id": id,
      ...(declaredRole ? { "data-turn": declaredRole } : {})
    };
    const turn = {
      isConnected: true,
      parentElement: null,
      matches(selector) { return matchesWrapperSelector(attrs, selector); },
      getAttribute: name => attrs[name] || "",
      contains: () => false,
      closest(selector) {
        if (this.matches(selector)) return this;
        return this.parentElement?.closest?.(selector) || null;
      },
      querySelector: () => null,
      querySelectorAll: () => []
    };
    return turn;
  };
  questionNode.parentElement = questionTurn;
  container.parentElement = assistantTurn;
  appFrame.parentElement = container;
  htmlRoot.parentElement = container;
  realFrame.parentElement = htmlRoot;
  const button = {
    isConnected: true,
    closest: selector => (
      selector === "[data-message-author-role]"
    ) ? container : selector === "[data-testid^='conversation-turn-']" ? assistantTurn : null
  };
  const orderedTurnWrappers = previousQa
    ? [previousQuestion.turn, previousAnswer.turn, questionTurn, ...interveningAssistantTurns.map(turn => turn.turn), assistantTurn]
    : [questionTurn, ...interveningAssistantTurns.map(turn => turn.turn), assistantTurn];
  const root = {
    orderedTurnWrappers,
    querySelectorAll(selector) {
      if (selector === "[data-message-author-role]") {
        return orderedTurnWrappers.flatMap(turn => Array.from(turn.querySelectorAll?.(selector) || []));
      }
      return orderedTurnWrappers.filter(turn => turn.matches?.(selector));
    },
    querySelector: () => null
  };
  const proofNodes = [questionNode, ...interveningAssistantTurns.map(turn => turn.node), container];

  sandbox.location.href = `https://chatgpt.example/c/handle-rich-${++handleFixtureSequence}`;
  sandbox.document.body = root;
  sandbox.document.querySelector = selector => selector === "main" ? root : null;
  sandbox.document.querySelectorAll = selector => root.querySelectorAll(selector);
  sandbox.fetch = async href => ({
    ok: !!detailedMarkdown && !downloadedDetailedMarkdown && String(href).startsWith("data:text/markdown"),
    status: detailedMarkdown && !downloadedDetailedMarkdown ? 200 : 404,
    text: async () => detailedMarkdown
  });
  sandbox.window.getSelection = () => "";
  sandbox.confirm = () => {
    events.confirms += 1;
    events.order.push("partial-consent");
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
    if (message?.type === "begin-markdown-download-watch" && downloadedDetailedMarkdown) {
      callback?.({ ok: true, watchId: "ordinary-detailed-markdown-watch" });
      return;
    }
    if (message?.type === "await-markdown-download-watch" && downloadedDetailedMarkdown) {
      callback?.({
        ok: true,
        download: {
          id: 904,
          name: markdownName,
          sourcePath: "/tmp/synthetic-chapter-detailed-summary.md",
          startTime: "2026-08-31T00:00:00.000Z",
          endTime: "2026-08-31T00:00:00.250Z"
        }
      });
      return;
    }
    if (message?.type === "cancel-markdown-download-watch" && downloadedDetailedMarkdown) {
      callback?.({ ok: true });
      return;
    }
    callback?.({ ok: true });
  };

  const runtimeGuard = {
    checkSync: phase => ({ ok: true, phase }),
    check: async phase => ({ ok: true, phase }),
    isAborted: () => false,
    getFailure: () => null,
    fail: result => result,
    notify() {}
  };
  const responseShareUrl = ["https://chatgpt.com", "s", "synthetic-ordinary-response"].join("/");
  const responseShareControl = { id: "ordinary-response-share" };
  const defaultSharePlan = {
    status: "found",
    kind: "response",
    control: responseShareControl,
    response: { status: "found", control: responseShareControl },
    conversation: null,
    reason: ""
  };
  const defaultOptions = {
    delayMs: 0,
    runtimeGuard,
    nativePreflightFn: async phase => {
      events.nativePreflights.push(phase);
      events.order.push("native-preflight");
      return { ok: true, pong: true, native: true };
    },
    openObsidianURIFn: uri => {
      events.opens.push({ type: "open-obsidian-uri", uri });
      events.order.push("uri");
    },
    saveObsidianNoteFn: async payload => {
      events.saves.push({ type: "save-obsidian-note", payload });
      events.order.push("native");
      return { ok: true };
    },
    alertFn: message => { events.alerts.push(String(message)); },
    requestShareConsentFn: async ({ requestPermission, consentMode }) => {
      events.shareConsents += 1;
      events.consentModes.push(consentMode);
      events.order.push("share-consent");
      const permissionGranted = await Promise.resolve(requestPermission());
      return { approved: true, permissionGranted: permissionGranted === true };
    },
    requestClipboardReadPermissionFn: () => {
      events.permissions += 1;
      events.order.push("permission");
      return Promise.resolve(true);
    },
    createSupplementalShareLinkFn: async (assistantNode, options) => {
      events.shareTargets.push(assistantNode);
      events.shares.push(options.shareKind);
      events.order.push(`share-${options.shareKind}`);
      return {
        ok: true,
        url: responseShareUrl,
        validatedShareUrl: responseShareUrl,
        source: "existing",
        shareKind: options.shareKind,
        shareInteraction: "dialog",
        conversationShareActionOccurred: options.shareKind === "conversation",
        dialogClosed: true
      };
    },
    supplementalSharePlan: defaultSharePlan,
    supplementalShareOptions: {
      root,
      nodes: proofNodes
    }
  };

  return {
    events,
    nodes: {
      root,
      appBlock,
      appFrame,
      realFrame,
      questionNode,
      container,
      questionTurn,
      assistantTurn,
      interveningAssistantTurns,
      orderedTurnWrappers,
      makePlainTurn,
      makeBarrierTurn,
      previousQuestion,
      previousAnswer,
      proofNodes
    },
    responseShareUrl,
    defaultSharePlan,
    setApprove(value) { approve = value; },
    run(overrides = {}) {
      const { omitSupplementalProofNodes = false, ...runOverrides } = overrides;
      const supplementalShareOptions = {
        ...defaultOptions.supplementalShareOptions,
        ...(runOverrides.supplementalShareOptions || {})
      };
      if (omitSupplementalProofNodes) delete supplementalShareOptions.nodes;
      return hooks.handleCopyClick(button, {
        ...defaultOptions,
        ...runOverrides,
        supplementalShareOptions
      });
    },
    restore() {
      sandbox.chrome.runtime.sendMessage = original.sendMessage;
      sandbox.confirm = original.confirm;
      sandbox.window.getSelection = original.selection;
      sandbox.location.href = original.href;
      sandbox.document.body = original.body;
      sandbox.document.querySelector = original.querySelector;
      sandbox.document.querySelectorAll = original.querySelectorAll;
      sandbox.fetch = original.fetch;
    }
  };
}

function installArtifactTestClock(sandbox) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  sandbox.Date = class extends Date { static now() { return now; } };
  sandbox.setTimeout = (callback, delay = 0) => {
    const id = nextId++;
    timers.set(id, { callback, due: now + Math.max(0, Number(delay) || 0) });
    return id;
  };
  sandbox.clearTimeout = id => timers.delete(id);
  const flushMicrotasks = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
  const nextTimer = () => Array.from(timers.entries()).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
  const runTimer = entry => {
    timers.delete(entry[0]);
    now = entry[1].due;
    entry[1].callback();
  };
  return {
    now: () => now,
    setTimeout: sandbox.setTimeout,
    async settle(operation) {
      let settled = false, value, error;
      Promise.resolve(operation).then(result => { value = result; settled = true; }, failure => { error = failure; settled = true; });
      for (let i = 0; i < 20000; i++) {
        await flushMicrotasks();
        if (settled) { if (error) throw error; return value; }
        const next = nextTimer();
        assert(next, "timed artifact fixture must not leave an unresolved operation without a timer");
        runTimer(next);
      }
      throw new Error("timed artifact fixture exceeded its finite timer budget");
    },
    async advanceBy(duration) {
      const until = now + duration;
      for (let i = 0; i < 20000; i++) {
        await flushMicrotasks();
        const next = nextTimer();
        if (!next || next[1].due > until) { now = until; return; }
        runTimer(next);
      }
      throw new Error("late artifact fixture exceeded its finite timer budget");
    }
  };
}

async function testResourceRowHtmlBatch({ preReadIndex = false, mismatch = false, ambiguous = false, disappear = false, timeout = false, runtimeAbort = false, attributeDownload = false, count = 3, timeline = null } = {}) {
  const hooks = loadHooks();
  const clock = timeline ? installArtifactTestClock(hooks.__sandbox) : null;
  const names = ["index.html", "complete.html", ...Array.from({ length: count - 2 }, (_, index) => `chapter-${String(index + 1).padStart(2, "0")}.html`)];
  const activated = [];
  const watches = [];
  let expanded = false;
  const leaf = (label, attrs = {}) => ({
    tagName: "BUTTON", isConnected: true, style: {}, innerText: label, textContent: label,
    getAttribute: key => attrs[key] || "", hasAttribute: () => false,
    querySelector: () => null, querySelectorAll: () => [], matches: () => false,
    closest: () => null, getBoundingClientRect: () => ({ width: 100, height: 30 })
  });
  const references = names.map(name => leaf(name, { "data-file-reference": "true", role: "button", "data-markdown-copy-text": name }));
  const rows = names.map(name => {
    const open = leaf("", { "aria-label": `${name} 미리보기 열기` });
    const download = leaf("", attributeDownload ? { download: name, href: `sandbox:/mnt/data/${name}` } : { "aria-label": "파일 다운로드" });
    if (attributeDownload) {
      download.tagName = "A";
      download.hasAttribute = key => key === "download";
    }
    download.click = () => activated.push(name);
    const row = { ...leaf(name), tagName: "SPAN", className: "group/resource-row relative",
      querySelectorAll: () => [open, download] };
    open.parentElement = row; download.parentElement = row;
    open.closest = download.closest = selector => selector === "[class*='resource-row']" ? row : null;
    return { name, row, open, download };
  });
  const more = leaf("2개 더", { "aria-controls": "synthetic-resource-list" });
  more.getAttribute = key => key === "aria-expanded" ? String(expanded) : key === "aria-controls" ? "synthetic-resource-list" : "";
  more.click = () => { expanded = true; };
  const indexSource = htmlDocument("Index", "Index", "Index body", '<a href="complete.html">Complete</a>');
  const previewRoot = { ...leaf("index.html"), querySelector: () => ({}) };
  const frame = { ...leaf(""), parentElement: previewRoot, getAttribute: key => key === "srcdoc" ? indexSource : "" };
  const container = {
    innerText: names.join("\n"), textContent: names.join("\n"),
    querySelector: () => null,
    querySelectorAll: selector => {
      if (selector === "a, [role='link']") return [];
      if (selector.includes("data-file-reference")) return references;
      if (selector === "iframe") return preReadIndex ? [frame] : [];
      const cards = (expanded ? rows : rows.slice(0, 1)).flatMap(item => [item.open, item.download]);
      if (selector === "button") return [...cards, ...(expanded ? [] : [more])];
      if (selector.includes("button")) return [...references, ...cards, ...(expanded ? [] : [more])];
      return [];
    }
  };
  rows.forEach(item => { item.row.parentElement = container; });
  if (ambiguous) {
    const duplicate = { ...rows[1].download, click: () => { throw new Error("ambiguous download must never be activated"); } };
    rows[1].row.querySelectorAll = () => [rows[1].open, rows[1].download, duplicate];
  }
  references.forEach(node => { node.parentElement = container; });
  more.parentElement = container;
  const saveButton = { closest: selector => selector === "[data-message-author-role]" ? container : null };
  let activeName = "";
  let waiting = null;
  let cancelled = 0;
  hooks.__sandbox.chrome.runtime.sendMessage = (message, callback) => {
    if (message.type === "begin-html-download-watch") {
      assert.strictEqual(message.expectedNames.length, 1, "each HTML watch must bind exactly one current file");
      activeName = message.expectedNames[0]; watches.push(activeName);
      if (disappear) rows.forEach(item => { item.row.isConnected = false; item.download.isConnected = false; });
      const response = { ok: true, watchId: `watch-${watches.length}` };
      if (clock && timeline.beginDelayMs) clock.setTimeout(() => callback(response), timeline.beginDelayMs);
      else callback(response);
    } else if (message.type === "await-html-download-watch") {
      assert.strictEqual(activated.at(-1), activeName, "the exact row download must be activated after its watch starts");
      if (timeout) { waiting = callback; return; }
      const watchNumber = watches.length;
      const wrongName = mismatch || timeline?.mismatchAt?.includes(watchNumber);
      const response = { ok: true, download: { id: watchNumber, name: wrongName ? "unrelated.html" : activeName.replace(/\.html$/, " (1).html"), sourcePath: `/tmp/synthetic-${watchNumber}.html` } };
      if (clock) {
        waiting = callback;
        clock.setTimeout(() => callback(response), timeline.delaysMs?.[watchNumber - 1] ?? timeline.delayMs ?? 4000);
      } else callback(response);
    } else if (message.type === "cancel-html-download-watch") {
      cancelled += 1;
      waiting?.({ ok: false, error: "cancelled" });
      waiting = null;
      if (clock && timeline.cancelDelayMs) clock.setTimeout(() => callback({ ok: true }), timeline.cancelDelayMs);
      else callback({ ok: true });
    } else callback({ ok: true });
  };
  assert.deepStrictEqual(Array.from(hooks.collectFileLikeLinks(container), file => file.name), names,
    "inline file-reference buttons must retain all expected HTML files before collapsed cards are revealed");
  const runtimeGuard = runtimeAbort || timeline ? {
    checkSync: () => ({ ok: true }),
    check: async phase => (runtimeAbort && phase === "html-download-watch-start" && activated.length) ||
      (timeline?.runtimeAtMs && clock.now() >= timeline.runtimeAtMs)
      ? { ok: false, runtimeUnavailable: true, error: "synthetic runtime changed" } : { ok: true }
  } : null;
  const started = Date.now();
  const operation = hooks.extractDownloadFiles(saveButton, [], "", { runtimeGuard, ...(timeout ? { htmlBatchTimeoutMs: 10 } : {}) });
  const result = clock ? await clock.settle(operation) : await operation;
  assert(expanded, "the observed Korean N개 더 resource control must reveal collapsed files");
  if (timeline) {
    assert.strictEqual(result.downloadedFiles.length, timeline.capturedCount, timeline.label);
    assert(clock.now() <= timeline.maxElapsedMs, "a stalled file or total batch cap must not become an unbounded wait");
    if (timeline.minElapsedMs) assert(clock.now() >= timeline.minElapsedMs, "successful downloads must spend their modeled real completion time");
    if (timeline.failureReason) assert(result.failures.some(failure => failure.reason === timeline.failureReason), "the timed failure must identify its actual boundary");
    const completedNames = Array.from(result.downloadedFiles, file => file.name);
    const activatedBeforeLate = activated.slice();
    await clock.advanceBy(200000);
    assert.strictEqual(cancelled, watches.length, "every begun timed watch, including a late watch ID, must be cancelled exactly once");
    assert.deepStrictEqual(activated, activatedBeforeLate, "a late completion after cancellation must not activate another file");
    assert.deepStrictEqual(Array.from(result.downloadedFiles, file => file.name), completedNames, "a late completion must not enter the returned attachment set");
  }
  const expected = timeline ? names.slice(0, timeline.activatedCount) : disappear ? [] : timeout || runtimeAbort ? [names[0]] : names.slice(0, 100).filter(name => !(preReadIndex && name === "index.html") && !(ambiguous && name === "complete.html"));
  assert.deepStrictEqual(activated, expected, "every unambiguous remaining resource-row HTML download must be captured once");
  assert.deepStrictEqual(Array.from(result.downloadedFiles, file => file.name), timeline ? names.slice(0, timeline.capturedCount) : mismatch || timeout ? [] : expected,
    "Chrome duplicate suffixes must retain the requested canonical names for sibling HTML links");
  assert.strictEqual(result.files.length, preReadIndex ? 1 : 0, "a readable index stays page-readable while sibling files are downloaded");
  const integrity = hooks.assessArtifactIntegrity({ fileLinks: hooks.collectFileLikeLinks(container), attachments: result.files, downloadedAttachments: result.downloadedFiles });
  assert.strictEqual(integrity.complete, timeline ? timeline.capturedCount === count : !(mismatch || ambiguous || disappear || timeout || runtimeAbort || count > 100));
  if (timeline && !integrity.complete) {
    assert.strictEqual(integrity.expectedHtmlNames.length, count, "timed batches must preserve every expected filename");
    assert.strictEqual(integrity.missingNames.length, count - timeline.capturedCount);
    assert.strictEqual(hooks.confirmIncompleteCaptureSave({ complete: false, files: integrity }, () => false), false, "timeout must retain the existing explicit partial-save decision");
  }
  assert.strictEqual(!!result.runtimeUnavailable, runtimeAbort || !!timeline?.runtimeAtMs, "runtime failure must stop before the next row activation");
  if (timeout) {
    assert(Date.now() - started < 1000, "one shared batch deadline must stop the sequence and cancel the active watch");
    assert.strictEqual(cancelled, 1);
  }
  return result;
}

async function main() {
  await testResourceRowHtmlBatch({ count: 41, timeline: {
    label: "41 healthy sequential HTML downloads must not be cut off by cumulative 90-second latency",
    delayMs: 4000, capturedCount: 41, activatedCount: 41, minElapsedMs: 164000, maxElapsedMs: 165000
  } });
  await testResourceRowHtmlBatch({ count: 41, timeline: {
    label: "a healthy file completing after the old shared deadline must keep its remaining siblings",
    delaysMs: [...Array(24).fill(3600), 7800], delayMs: 3600,
    capturedCount: 41, activatedCount: 41, minElapsedMs: 150000, maxElapsedMs: 153000
  } });
  const timedIncompleteBatch = await testResourceRowHtmlBatch({ count: 5, timeline: {
    label: "a stalled file must stop the batch after one bounded file wait",
    delaysMs: [4000, 4000, 120000], capturedCount: 2, activatedCount: 3,
    minElapsedMs: 98000, maxElapsedMs: 99000, failureReason: "HTML file download deadline exceeded"
  } });
  await testResourceRowHtmlBatch({ count: 41, timeline: {
    label: "ongoing progress must never extend the batch beyond its absolute ten-minute cap",
    delayMs: 21000, capturedCount: 28, activatedCount: 29,
    minElapsedMs: 600000, maxElapsedMs: 601000, failureReason: "HTML batch download deadline exceeded"
  } });
  await testResourceRowHtmlBatch({ count: 8, timeline: {
    label: "wrong-name downloads must not renew the last verified progress deadline",
    delaysMs: [4000, 4000, 20000, 20000, 20000, 120000], mismatchAt: [3, 4, 5],
    capturedCount: 2, activatedCount: 6, minElapsedMs: 98000, maxElapsedMs: 99000,
    failureReason: "HTML file download deadline exceeded"
  } });
  await testResourceRowHtmlBatch({ count: 5, timeline: {
    label: "runtime loss during a pending download must cancel it before any next activation",
    delaysMs: [4000, 120000], runtimeAtMs: 6000, capturedCount: 1, activatedCount: 2,
    minElapsedMs: 6000, maxElapsedMs: 7000
  } });
  await testResourceRowHtmlBatch({ count: 5, timeline: {
    label: "late watch setup must stop before activation and cancel its eventual watch ID",
    beginDelayMs: 120000, capturedCount: 0, activatedCount: 0,
    minElapsedMs: 90000, maxElapsedMs: 91000, failureReason: "HTML file download deadline exceeded"
  } });
  await testResourceRowHtmlBatch({ count: 5, timeline: {
    label: "uncertain watch cleanup must stop before another file is activated",
    cancelDelayMs: 120000, capturedCount: 1, activatedCount: 1,
    minElapsedMs: 90000, maxElapsedMs: 91000, failureReason: "HTML download watch cleanup deadline exceeded"
  } });
  await testResourceRowHtmlBatch({ count: 5, timeline: {
    label: "watch cleanup time must not renew the last verified download receipt deadline",
    delaysMs: [4000, 12000], cancelDelayMs: 80000, capturedCount: 1, activatedCount: 2,
    minElapsedMs: 94000, maxElapsedMs: 95000, failureReason: "HTML file download deadline exceeded"
  } });
  await testResourceRowHtmlBatch();
  await testResourceRowHtmlBatch({ preReadIndex: true, count: 41 });
  await testResourceRowHtmlBatch({ mismatch: true });
  await testResourceRowHtmlBatch({ ambiguous: true });
  await testResourceRowHtmlBatch({ disappear: true });
  await testResourceRowHtmlBatch({ runtimeAbort: true });
  await testResourceRowHtmlBatch({ timeout: true });
  await testResourceRowHtmlBatch({ count: 101 });
  await testResourceRowHtmlBatch({ attributeDownload: true });
  await testResourceRowHtmlBatch({ attributeDownload: true, ambiguous: true });
  const hooks = loadHooks();
  assert.strictEqual(hooks.VERSION, "1.5.63");
  const assertOrdinaryResponseSupplementalSchema = (markdown, shareUrl, label) => {
    assert.strictEqual((markdown.match(/^# (?:ChatGPT Share|ChatGPT 공유)$/gm) || []).length, 1, `${label} must contain exactly one supplemental block`);
    assert.strictEqual((markdown.match(/^chatgpt_share_url:/gm) || []).length, 1, `${label} must contain exactly one response URL field`);
    assert.strictEqual((markdown.match(/^share_scope: response$/gm) || []).length, 1, `${label} must keep response scope`);
    assert.strictEqual(markdown.split(shareUrl).length - 1, 2, `${label} must use the same response URL once in metadata and once in the body`);
    [
      "conversation_share_url:",
      "target_turn_id:",
      "share_interaction:",
      "conversation_share_freshness:",
      "visualize_share_url:",
      "rich_app_share_url:",
      "app_provider:",
      "app_provenance:",
      "rich_artifacts_local_complete:",
      "rich_artifacts_remote_referenced:",
      "interactive_behavior_preserved: remote-only",
      "offline_available: false"
    ].forEach(fragment => assert(!markdown.includes(fragment), `${label} must not contain ${fragment}`));
  };
  const assertReg018SelectedAssistantNote = (markdown, label) => {
    assert(markdown.includes("REG018-Q"), `${label} must retain the nearest user question`);
    assert(markdown.includes("REG018-A3-SELECTED"), `${label} must retain only the clicked A3 answer`);
    assert(!markdown.includes("REG018-A1-PROVENANCE"), `${label} must not merge A1 provenance into the note`);
    assert(!markdown.includes("REG018-A2-PROVENANCE"), `${label} must not merge A2 provenance into the note`);
    assert(markdown.includes("share_scope: response"), `${label} must retain response Share scope`);
  };

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
  [
    "피드백 보내기",
    "Obsidian 저장",
    "web-sandbox.oaiusercontent.com",
    "/images/visualize/app-blocks-visualize.svg",
    "]()",
    "capture_status: remote-reference",
    "capture_mode:",
    "app_provider:",
    "app_provenance:",
    "rich_artifacts_local_complete:",
    "rich_artifacts_remote_referenced:",
    "interactive_behavior_preserved: remote-only",
    "offline_available: false"
  ]
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

  const makeHtmlPreviewSaveFixture = ({ neverRestorePreview = false, restoredAnswer = null } = {}) => {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true, outer: "Frozen authored answer with actual.html" });
    hooks.__sandbox.location.href = `https://chatgpt.com/c/synthetic-html-preview-${handleFixtureSequence}`;
    const frozenAnswer = fixture.nodes.container.innerText;
    const viewer = makeArtifactViewer("actual.html", htmlDocument("Actual", "Real file", "complete body"), {
      previewRestoreDelayMs: 150,
      neverRestorePreview,
      onSourceVisibilityChange: visible => {
        fixture.nodes.container.innerText = visible ? `${frozenAnswer}\n${viewer.source}` : (restoredAnswer ?? frozenAnswer);
        fixture.nodes.container.textContent = fixture.nodes.container.innerText;
        fixture.events.order.push(visible ? "artifact-code-visible" : "artifact-preview-restored");
      }
    });
    const originalQuerySelectorAll = fixture.nodes.container.querySelectorAll;
    fixture.nodes.container.querySelectorAll = selector => selector === "button"
      ? [viewer.codeToggle, viewer.previewToggle] : originalQuerySelectorAll(selector);
    viewer.root.parentElement = fixture.nodes.container;
    fixture.nodes.realFrame.parentElement = viewer.root;
    return { fixture, viewer, frozenAnswer };
  };

  {
    const { fixture, viewer, frozenAnswer } = makeHtmlPreviewSaveFixture();
    try {
      const result = await fixture.run({ saveObsidianNoteFn: undefined });
      assert.strictEqual(fixture.events.saves.length, 1, `ordinary HTML must wait for its asynchronous Preview restoration before Share proof and Native save: ${result?.reason || result?.stage || "unknown failure"}`);
      assert(viewer.wasPreviewRestored(), "ordinary HTML extraction must restore Preview before it returns");
      assert(fixture.events.order.indexOf("artifact-preview-restored") < fixture.events.order.indexOf("share-consent"), "Share consent must follow completed Preview restoration");
      assert.deepStrictEqual(Array.from(fixture.events.shares), ["response"]);
      assert.strictEqual(fixture.events.opens.length, 0);
      const payload = fixture.events.saves[0].payload;
      assert(payload.content.includes(frozenAnswer));
      assert(!payload.content.includes("<!doctype html>"), "temporary code-view text must not replace the frozen note answer");
      assert.strictEqual(payload.attachments.length, 1);
      assert.strictEqual(payload.attachments[0].content, viewer.source);
      assert.deepStrictEqual(Array.from(payload.attachmentNames), ["actual.html"]);
      assertOrdinaryResponseSupplementalSchema(payload.content, fixture.responseShareUrl, "ordinary HTML after asynchronous Preview restoration");
    } finally {
      viewer.cleanup();
      fixture.restore();
    }
  }

  {
    const { fixture, viewer } = makeHtmlPreviewSaveFixture({ neverRestorePreview: true });
    let deadline;
    try {
      const result = await Promise.race([
        fixture.run({ saveObsidianNoteFn: undefined }),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error("HTML Preview restoration must terminate within a bounded wait")), 6000); })
      ]);
      assert.strictEqual(viewer.wasPreviewRestored(), false);
      assert.strictEqual(result?.ok, false, "an HTML viewer that never returns to Preview must fail closed");
      assert.strictEqual(result?.stage, "preflight");
      assert.match(result?.reason || "", /HTML artifact preview could not be restored/i, "a Preview timeout must report its cause instead of misreporting an authored-answer change");
      assert.strictEqual(fixture.events.shareConsents, 0);
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0, "an un-restored Preview must stop before Share");
      assert.strictEqual(fixture.events.opens.length, 0, "an un-restored Preview must stop before URI dispatch");
      assert.strictEqual(fixture.events.saves.length, 0, "an un-restored Preview must stop before Native dispatch");
    } finally {
      clearTimeout(deadline);
      viewer.cleanup();
      fixture.restore();
    }
  }

  {
    const { fixture, viewer } = makeHtmlPreviewSaveFixture({ restoredAnswer: "Author edited the answer while the HTML viewer was open: actual.html" });
    try {
      const result = await fixture.run({ saveObsidianNoteFn: undefined });
      assert(viewer.wasPreviewRestored(), "authored-content drift must be evaluated after the temporary Code presentation is gone");
      assert.strictEqual(result?.ok, false);
      assert.strictEqual(result?.reason, "selected assistant changed", "restoring Preview must not exempt a genuine authored-answer change from the strict Share proof");
      assert.strictEqual(fixture.events.shareConsents, 0);
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0);
      assert.strictEqual(fixture.events.saves.length, 0);
    } finally {
      viewer.cleanup();
      fixture.restore();
    }
  }

  const projectPath = "/g/g-p-0123456789abcdef0123456789abcdef-synthetic-project/c/11111111-2222-4333-8444-555555555555";
  const setProjectRoute = () => {
    const sourceUrl = `https://chatgpt.com${projectPath}?synthetic-case=${handleFixtureSequence}`;
    hooks.__sandbox.location.href = sourceUrl;
    return sourceUrl;
  };
  const assertProjectHasNoShare = (fixture, markdown = "") => {
    assert.strictEqual(fixture.events.shareConsents, 0, "project saves must not request Share consent");
    assert.strictEqual(fixture.events.permissions, 0, "project saves must not request clipboard permission");
    assert.strictEqual(fixture.events.shares.length, 0, "project saves must not operate Share");
    [
      "chatgpt_share_url:", "conversation_share_url:", "share_scope:", "target_turn_id:",
      "visualize_share_url:", "rich_app_share_url:", "# ChatGPT Share", "# ChatGPT 공유",
      "capture_status: remote-reference", "interactive_behavior_preserved: remote-only",
      "rich_artifacts_remote_referenced:", "offline_available:"
    ].forEach(fragment => assert(!markdown.includes(fragment), `project local note must omit ${fragment}`));
  };

  for (const project of [false, true]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      if (project) setProjectRoute();
      await fixture.run({ extractDownloadFilesFn: async () => timedIncompleteBatch });
      assert.strictEqual(fixture.events.confirms, 1, "timed-out HTML extraction must reach explicit partial consent in either save route");
      assert.strictEqual(fixture.events.saves.length, 0, "declining a timed-out HTML batch must perform zero Native writes");
      assert.strictEqual(fixture.events.opens.length, 0, "declining a timed-out HTML batch must perform zero URI writes");
      assert.strictEqual(fixture.events.shareConsents, 0, "declining a timed-out HTML batch must stop before Share consent");
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      question: "PROJECT-Q",
      outer: "PROJECT-A3-SELECTED",
      selectedAssistantId: "project-a3",
      interveningAssistants: [
        { id: "project-a1", text: "PROJECT-A1-PROVENANCE" },
        { id: "project-a2", text: "PROJECT-A2-PROVENANCE" }
      ]
    });
    try {
      const sourceUrl = setProjectRoute(fixture);
      const result = await fixture.run({
        supplementalSharePlan: { status: "unavailable", kind: "none", control: null, reason: "no Share control" }
      });
      assert.strictEqual(fixture.events.opens.length, 1, `project conversation without Share must dispatch its local URI note: ${result?.reason || result?.stage || "unknown failure"}`);
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.shareConsents, 0);
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes(`source: ${JSON.stringify(sourceUrl)}`));
      assert(markdown.includes("PROJECT-Q"));
      assert(markdown.includes("PROJECT-A3-SELECTED"));
      assert(!markdown.includes("PROJECT-A1-PROVENANCE"));
      assert(!markdown.includes("PROJECT-A2-PROVENANCE"));
      assertProjectHasNoShare(fixture, markdown);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, outer: "PROJECT DOM answer without clipboard" });
    const originalReadText = hooks.__sandbox.navigator.clipboard.readText;
    let clipboardReads = 0;
    try {
      setProjectRoute(fixture);
      hooks.__sandbox.navigator.clipboard.readText = async () => {
        clipboardReads += 1;
        return "Unrelated clipboard content";
      };
      await fixture.run({ preferClipboard: true });
      assert.strictEqual(clipboardReads, 0, "project local saving must ignore the legacy clipboard preference without reading unrelated clipboard content");
      assert.strictEqual(fixture.events.opens.length, 1);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes("PROJECT DOM answer without clipboard"));
      assert(!markdown.includes("Unrelated clipboard content"));
      assertProjectHasNoShare(fixture, markdown);
    } finally {
      hooks.__sandbox.navigator.clipboard.readText = originalReadText;
      fixture.restore();
    }
  }

  for (const url of [
    `https://chatgpt.com${projectPath}`,
    `https://chatgpt.com${projectPath}/?view=synthetic`,
    `https://chat.openai.com${projectPath}`,
    "https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef/c/11111111-2222-4333-8444-555555555555"
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      hooks.__sandbox.location.href = url;
      await fixture.run();
      assert.strictEqual(fixture.events.opens.length, 1, `recognized project route must save locally even when Share is available: ${url}`);
      assert.strictEqual(fixture.events.saves.length, 0);
      assertProjectHasNoShare(fixture, new URL(fixture.events.opens[0].uri).searchParams.get("content"));
    } finally {
      fixture.restore();
    }
  }

  for (const url of [
    "https://chatgpt.com/c/synthetic-ordinary",
    "https://chatgpt.com/g/g-synthetic-custom-gpt/c/11111111-2222-4333-8444-555555555555",
    "https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef-synthetic-project/project",
    "https://chatgpt.com/g/g-p-short/c/11111111-2222-4333-8444-555555555555",
    "https://chatgpt.com/g/g-p-0123456789abcdef0123456789abcdef/c/not-a-conversation-id",
    `https://chatgpt.com${projectPath}/extra`,
    `http://chatgpt.com${projectPath}`,
    `https://chatgpt.com.example${projectPath}`,
    `https://chatgpt.com:8443${projectPath}`,
    `https://chatgpt.com:443${projectPath}`,
    `https://user@chatgpt.com${projectPath}`,
    `https://chatgpt.com/?next=${encodeURIComponent(projectPath)}`
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      hooks.__sandbox.location.href = url;
      await fixture.run({
        supplementalSharePlan: { status: "unavailable", kind: "none", control: null, reason: "no Share control" }
      });
      assert.strictEqual(fixture.events.opens.length, 0, `nonproject or malformed route must retain mandatory Share: ${url}`);
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.alerts.length, 1);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true, outer: "PROJECT frozen answer before file viewer" });
    try {
      setProjectRoute(fixture);
      await fixture.run({
        extractDownloadFilesFn: async (...args) => {
          const extraction = await hooks.extractDownloadFiles(...args);
          fixture.nodes.container.innerText = "viewer now displays actual.html and Download";
          fixture.nodes.container.textContent = "viewer now displays actual.html and Download";
          return extraction;
        },
        saveObsidianNoteFn: undefined
      });
      assert.strictEqual(fixture.events.saves.length, 1, "project HTML must survive file-viewer presentation changes and dispatch through the real Native wrapper");
      assert.strictEqual(fixture.events.opens.length, 0);
      const payload = fixture.events.saves[0].payload;
      assert.deepStrictEqual(Array.from(payload.attachmentNames), ["actual.html"]);
      assert.strictEqual(payload.attachments.length, 1);
      assert(payload.attachments[0].content.includes("complete body"));
      assert.strictEqual((payload.content.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1);
      assert(payload.content.includes("PROJECT frozen answer before file viewer"));
      assert(!payload.content.includes("viewer now displays"));
      assertProjectHasNoShare(fixture, payload.content);
    } finally {
      fixture.restore();
    }
  }

  for (const previousAnswerHasApp of [false, true]) {
    const htmlHooks = loadHooks({ syncState: { usePreviousQaForHtml: true, prefixDate: false, uiLanguage: "en" } });
    const fixture = makeHandleCopyFixture(htmlHooks, { rich: !previousAnswerHasApp, html: true, previousQa: true });
    let previousAppVisible = previousAnswerHasApp;
    const previousAppBlock = { remove() {} };
    const previousQuerySelectorAll = fixture.nodes.previousAnswer.node.querySelectorAll;
    fixture.nodes.previousAnswer.node.querySelectorAll = selector => selector === '[data-app-block-preview="true"]' && previousAppVisible
      ? [previousAppBlock] : previousQuerySelectorAll(selector);
    const runWithPreviousAppDisappearance = () => fixture.run({
      // This harness has no HTML parser; use the existing resolved-Q/A seam
      // while keeping the live stored-answer inventory and extraction real.
      findPreviousQaPairFn: () => ({
        questionNode: fixture.nodes.previousQuestion.node,
        answerNode: fixture.nodes.previousAnswer.node,
        requestNode: fixture.nodes.questionNode,
        questionText: "original earlier question",
        answerText: "original earlier answer"
      }),
      extractDownloadFilesFn: async (...args) => {
        const extraction = await htmlHooks.extractDownloadFiles(...args);
        previousAppVisible = false;
        return extraction;
      }
    });
    try {
      htmlHooks.__sandbox.location.href = `https://chatgpt.com${projectPath}?synthetic-case=${handleFixtureSequence}`;
      await runWithPreviousAppDisappearance();
      if (previousAnswerHasApp) {
        assert.strictEqual(fixture.events.confirms, 1, "an app disappearing from the saved previous answer must retain its initial partial-capture requirement");
        assert.strictEqual(fixture.events.saves.length, 0, "declining missing previous-answer app content must stop the HTML note");
        previousAppVisible = true;
        fixture.setApprove(true);
        await runWithPreviousAppDisappearance();
        assert.strictEqual(fixture.events.confirms, 2);
      } else {
        assert.strictEqual(fixture.events.confirms, 0, "an app only in the clicked answer must not make the app-free saved previous answer partial");
      }
      assert.strictEqual(fixture.events.saves.length, 1, "project previous-Q/A HTML must preserve Native dispatch");
      assert.strictEqual(fixture.events.opens.length, 0);
      const payload = fixture.events.saves[0].payload;
      assert(payload.content.includes("# Original Question"));
      assert(payload.content.includes("# Original Answer"));
      assert(payload.content.includes("original earlier question"));
      assert(payload.content.includes("original earlier answer"));
      assert(!payload.content.includes("ordinary selected question"));
      assert(!payload.content.includes("outer explanation"));
      assert.deepStrictEqual(Array.from(payload.attachmentNames), ["actual.html"]);
      assert.strictEqual(payload.content.includes("capture_status: partial"), previousAnswerHasApp);
      if (previousAnswerHasApp) {
        assert(payload.content.includes("rich_artifacts_expected: 1"));
        assert(payload.content.includes("rich_artifacts_complete: 0"));
        assert(payload.content.includes("Interactive app block not saved"));
      }
      assertProjectHasNoShare(fixture, payload.content);
    } finally {
      fixture.restore();
    }
  }

  for (const downloadedDetailedMarkdown of [false, true]) {
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      detailedMarkdown: "# 장별 상세 한국어 요약\n\nPROJECT generated detail",
      downloadedDetailedMarkdown
    });
    try {
      setProjectRoute(fixture);
      await fixture.run();
      assert.strictEqual(fixture.events.saves.length, 1, "project detailed Markdown must retain Native transport");
      assert.strictEqual(fixture.events.opens.length, 0);
      const payload = fixture.events.saves[0].payload;
      assert.strictEqual((payload.content.match(/^# 장별 상세 한국어 요약$/gm) || []).length, 1);
      if (downloadedDetailedMarkdown) {
        assert(payload.downloadedMarkdown.sourcePath.endsWith("synthetic-chapter-detailed-summary.md"));
        assert.strictEqual((payload.content.match(/%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%/g) || []).length, 1);
      } else {
        assert(payload.content.includes("PROJECT generated detail"));
      }
      assertProjectHasNoShare(fixture, payload.content);
    } finally {
      fixture.restore();
    }
  }

  for (const mutation of [
    { label: "route switch", apply: () => { hooks.__sandbox.location.href = "https://chatgpt.com/c/synthetic-other-conversation"; } },
    { label: "selected node disconnected", apply: fixture => { fixture.nodes.container.isConnected = false; } },
    { label: "selected role changed", apply: fixture => {
      const original = fixture.nodes.container.getAttribute;
      fixture.nodes.container.getAttribute = name => name === "data-message-author-role" ? "user" : original(name);
    } },
    { label: "selected message ID changed", apply: fixture => {
      const original = fixture.nodes.container.getAttribute;
      fixture.nodes.container.getAttribute = name => name === "data-message-id" ? "project-replaced-a1" : original(name);
    } }
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    try {
      setProjectRoute(fixture);
      await fixture.run({ extractDownloadFilesFn: async (...args) => {
        const extraction = await hooks.extractDownloadFiles(...args);
        mutation.apply(fixture);
        return extraction;
      } });
      assert.strictEqual(fixture.events.saves.length, 0, `${mutation.label} during file extraction must stop the project Native write`);
      assert.strictEqual(fixture.events.opens.length, 0);
      assertProjectHasNoShare(fixture);
    } finally {
      fixture.restore();
    }
  }

  for (const html of [false, true]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html });
    let finalGuardReached = false;
    try {
      setProjectRoute(fixture);
      await fixture.run({ runtimeGuard: {
        checkSync: phase => ({ ok: true, phase }),
        check: async phase => {
          if (phase.endsWith("before-save")) {
            finalGuardReached = true;
            fixture.nodes.container.isConnected = false;
          }
          return { ok: true, phase };
        },
        isAborted: () => false,
        getFailure: () => null,
        fail: result => result,
        notify() {}
      } });
      assert(finalGuardReached, "project fixture must reach the final awaited runtime boundary");
      assert.strictEqual(fixture.events.saves.length, 0, "selected-node loss during final runtime await must block Native");
      assert.strictEqual(fixture.events.opens.length, 0, "selected-node loss during final runtime await must block URI");
      assertProjectHasNoShare(fixture);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    const originalQuerySelectorAll = fixture.nodes.container.querySelectorAll;
    let fileVisible = true;
    const missingFileLink = {
      innerText: "missing.html", textContent: "missing.html",
      getAttribute: () => "", hasAttribute: () => false, closest: () => null
    };
    fixture.nodes.container.querySelectorAll = selector => selector === "a, [role='link']" && fileVisible
      ? [missingFileLink] : originalQuerySelectorAll(selector);
    try {
      setProjectRoute(fixture);
      assert.deepStrictEqual(Array.from(hooks.collectFileLikeLinks(fixture.nodes.container), link => link.name), ["missing.html"], "fixture must initially expose one href-less expected HTML file");
      await fixture.run({ extractDownloadFilesFn: async (...args) => {
        const extraction = await hooks.extractDownloadFiles(...args);
        fileVisible = false;
        return extraction;
      } });
      assert.strictEqual(fixture.events.confirms, 1, "a project file present at click time must still require partial consent after its link disappears during extraction");
      assert.strictEqual(fixture.events.opens.length, 0, "a disappearing uncaptured project file must not silently become a complete URI note");
      assert.strictEqual(fixture.events.saves.length, 0);
      assertProjectHasNoShare(fixture);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: true });
    const originalQuerySelectorAll = fixture.nodes.container.querySelectorAll;
    const hideAppDuringExtraction = async (...args) => {
      const extraction = await hooks.extractDownloadFiles(...args);
      fixture.nodes.container.querySelectorAll = selector => selector === '[data-app-block-preview="true"]' || selector === "iframe"
        ? [] : originalQuerySelectorAll(selector);
      return extraction;
    };
    try {
      setProjectRoute(fixture);
      await fixture.run({ extractDownloadFilesFn: hideAppDuringExtraction });
      assert.strictEqual(fixture.events.confirms, 1, "a project app present at click time must still require partial consent after its preview disappears during extraction");
      assert.strictEqual(fixture.events.opens.length, 0, "declining partial consent after project app disappearance must create no URI note");
      assert.strictEqual(fixture.events.saves.length, 0);
      assertProjectHasNoShare(fixture);

      fixture.nodes.container.querySelectorAll = originalQuerySelectorAll;
      fixture.setApprove(true);
      await fixture.run({ extractDownloadFilesFn: hideAppDuringExtraction });
      assert.strictEqual(fixture.events.confirms, 2);
      assert.strictEqual(fixture.events.opens.length, 1, "approved project app-loss partial note must be immediately retryable");
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes("capture_status: partial"));
      assert(markdown.includes("rich_artifacts_expected: 1"));
      assert(markdown.includes("rich_artifacts_complete: 0"));
      assert(markdown.includes("Interactive app block not saved"));
      assertProjectHasNoShare(fixture, markdown);
    } finally {
      fixture.restore();
    }
  }

  for (const richCase of [
    { label: "generic partial", previousQa: false },
    { label: "provider-neutral previous Q/A", previousQa: true },
    { label: "structured Visualize", previousQa: false, structured: true },
    { label: "rich-app continuation", previousQa: true, continuation: true }
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: true, previousQa: richCase.previousQa });
    try {
      setProjectRoute(fixture);
      if (richCase.previousQa) {
        Object.assign(fixture.nodes.appBlock, {
          isConnected: true, style: {},
          getAttribute: () => "",
          getBoundingClientRect: () => ({ width: 320, height: 200 }),
          querySelectorAll: selector => selector === "iframe" ? [fixture.nodes.appFrame] : []
        });
        Object.assign(fixture.nodes.appFrame, {
          parentElement: fixture.nodes.appBlock, isConnected: true, style: {},
          getBoundingClientRect: () => ({ width: 320, height: 200 }),
          getAttribute: name => name === "src" ? "https://app-block-test.web-sandbox.oaiusercontent.com/" : ""
        });
        if (richCase.continuation) {
          const previousBlock = { ...fixture.nodes.appBlock };
          const previousFrame = { ...fixture.nodes.appFrame, parentElement: previousBlock };
          previousBlock.querySelectorAll = selector => selector === "iframe" ? [previousFrame] : [];
          fixture.nodes.previousAnswer.node.querySelectorAll = selector => selector === '[data-app-block-preview="true"]'
            ? [previousBlock] : selector === "iframe" ? [previousFrame] : [];
          assert.strictEqual(hooks.resolveRichAppContinuationContext(fixture.nodes.container).mode, "rich-app-continuation", "fixture must exercise an otherwise specialized continuation route");
        } else {
          assert.strictEqual(hooks.resolvePreviousQaRichAppSaveContext(fixture.nodes.container).mode, "previous-qa-rich-app", "fixture must exercise an otherwise specialized previous-Q/A route");
        }
      }
      if (richCase.structured) {
        const marker = { getAttribute: name => name === "data-plugin-id" ? "plugin:visualize" : "" };
        fixture.nodes.questionNode.querySelectorAll = selector => selector === "[data-id], [data-plugin-id]" ? [marker] : [];
        assert.strictEqual(hooks.isVisualizeShareCandidate(fixture.nodes.container, { requestNode: fixture.nodes.questionNode }), true, "fixture must exercise an otherwise specialized Visualize route");
      }
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 1, `${richCase.label}: project rich content requires explicit local partial consent`);
      assert.strictEqual(fixture.events.opens.length, 0, "declined project partial save must create no note");
      assert.strictEqual(fixture.events.saves.length, 0);
      assertProjectHasNoShare(fixture);
      fixture.setApprove(true);
      await fixture.run();
      assert.strictEqual(fixture.events.opens.length, 1, "approved project rich partial note must be retryable and keep URI transport");
      assert.strictEqual(fixture.events.saves.length, 0);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes("capture_status: partial"));
      assert(markdown.includes("rich_artifacts_expected: 1"));
      assert(markdown.includes("rich_artifacts_complete: 0"));
      assert(markdown.includes("Interactive app block not saved"));
      assertProjectHasNoShare(fixture, markdown);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks);
    try {
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 1);
      assert.strictEqual(
        fixture.events.shareConsents,
        0,
        "declining the earlier partial-capture consent must stop before generic Share consent"
      );
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0, "Cancel must not issue an Obsidian URI request");
      assert.strictEqual(fixture.events.saves.length, 0, "Cancel must not issue a Native save request");

      fixture.setApprove(true);
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 2, "the same response must be immediately retryable after cancellation");
      assert.strictEqual(fixture.events.shareConsents, 1);
      assert.strictEqual(fixture.events.permissions, 1);
      assert.deepStrictEqual(Array.from(fixture.events.shares), ["response"]);
      assert.strictEqual(fixture.events.opens.length, 1);
      assert.strictEqual(fixture.events.saves.length, 0);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes("capture_status: partial"));
      assert(markdown.includes("rich_artifacts_expected: 1"));
      assert(markdown.includes("rich_artifacts_complete: 0"));
      assert(markdown.includes("> [!warning]"));
      assert(markdown.includes(`chatgpt_share_url: ${JSON.stringify(fixture.responseShareUrl)}`));
      assertOrdinaryResponseSupplementalSchema(markdown, fixture.responseShareUrl, "orchestrated partial note");
      assert(markdown.includes("Interactive app block not saved"));
      assert(!markdown.includes("capture_status: remote-reference"));
      assert(!markdown.includes("offline_available:"));
      assert(!markdown.includes("capture_mode:"), "an explicitly approved generic partial note must not claim a remote-share mode");
      assert(!markdown.includes("visualize_share_url:"));
      assert(!markdown.includes("rich_app_share_url:"));
      [
        "web-sandbox.oaiusercontent.com",
        "피드백 보내기",
        "]()",
        "app_provider:",
        "app_provenance:",
        "rich_artifacts_local_complete:",
        "rich_artifacts_remote_referenced:",
        "interactive_behavior_preserved: remote-only"
      ]
        .forEach(forbidden => assert(!markdown.includes(forbidden), `orchestrated partial note must not contain ${forbidden}`));
    } finally {
      fixture.restore();
    }
  }

  {
    const htmlHooks = loadHooks({
      syncState: { usePreviousQaForHtml: true, prefixDate: false, uiLanguage: "en" }
    });
    const fixture = makeHandleCopyFixture(htmlHooks, {
      rich: false,
      html: true,
      previousQa: true
    });
    try {
      await fixture.run({
        findPreviousQaPairFn: () => ({
          questionNode: fixture.nodes.previousQuestion.node,
          answerNode: fixture.nodes.previousAnswer.node,
          requestNode: fixture.nodes.questionNode,
          questionText: "original earlier question",
          answerText: "original earlier answer"
        })
      });
      assert.deepStrictEqual(Array.from(fixture.events.order), [
        "native-preflight",
        "share-consent",
        "permission",
        "share-response",
        "native"
      ]);
      assert.strictEqual(fixture.events.opens.length, 0, "HTML Native save must not open an Obsidian URI");
      assert.strictEqual(fixture.events.saves.length, 1);
      const payload = fixture.events.saves[0].payload;
      assert.deepStrictEqual(Array.from(payload.attachmentNames), ["actual.html"]);
      assert.strictEqual((payload.content.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1);
      assert.strictEqual((payload.content.match(/^# ChatGPT Share$/gm) || []).length, 1);
      assert.strictEqual(payload.content.split(fixture.responseShareUrl).length - 1, 2);
      assert(payload.content.indexOf("# HTML Learning Material") < payload.content.indexOf("# Original Question"));
      assert(payload.content.indexOf("# Original Question") < payload.content.indexOf("# Original Answer"));
      assert(payload.content.includes("original earlier question"));
      assert(payload.content.includes("original earlier answer"));
    } finally {
      fixture.restore();
    }
  }

  {
    const detailedBody = [
      "# 장별 상세 한국어 요약",
      "",
      "## REG018 detail",
      "",
      "REG018 detailed body"
    ].join("\n");
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      detailedMarkdown: detailedBody,
      question: "REG018-Q",
      outer: "REG018-A3-SELECTED",
      selectedAssistantId: "reg018-a3",
      interveningAssistants: [
        { id: "reg018-a1", text: "REG018-A1-PROVENANCE" },
        { id: "reg018-a2", text: "REG018-A2-PROVENANCE" }
      ]
    });
    try {
      const result = await fixture.run();
      assert.strictEqual(fixture.events.opens.length, 0, `consecutive-assistant detailed Markdown must remain Native-backed: ${result?.reason || result?.stage || "unknown failure"}`);
      assert.strictEqual(fixture.events.saves.length, 1, `consecutive-assistant detailed Markdown must dispatch one Native save: ${result?.reason || result?.stage || "unknown failure"}`);
      assert.deepStrictEqual(Array.from(fixture.events.shareTargets), [fixture.nodes.container], "detailed-Markdown Share helper must receive the selected A3 object");
      const markdown = fixture.events.saves[0].payload.content;
      assertReg018SelectedAssistantNote(markdown, "consecutive-assistant detailed-Markdown note");
      assert.strictEqual((markdown.match(/%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%/g) || []).length, 0, "inline detailed Markdown must keep the adjacent-pair marker result");
      assert(markdown.indexOf("# ChatGPT Share") < markdown.indexOf("# Question"), "detailed Markdown supplemental Share placement must match the adjacent-pair path");
      assert(markdown.indexOf("# Question") < markdown.indexOf("# Answer"), "detailed Markdown ordinary Q/A order must remain unchanged");
      assert(markdown.indexOf("# Answer") < markdown.indexOf("# 장별 상세 한국어 요약"), "detailed Markdown must remain after the ordinary Q/A");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      html: true,
      question: "REG018-Q",
      outer: "REG018-A3-SELECTED",
      selectedAssistantId: "reg018-a3",
      interveningAssistants: [
        { id: "reg018-a1", text: "REG018-A1-PROVENANCE" },
        { id: "reg018-a2", text: "REG018-A2-PROVENANCE" }
      ]
    });
    try {
      const result = await fixture.run();
      assert.strictEqual(fixture.events.opens.length, 0, `consecutive-assistant HTML must remain Native-backed: ${result?.reason || result?.stage || "unknown failure"}`);
      assert.strictEqual(fixture.events.saves.length, 1, `consecutive-assistant HTML must dispatch one Native save: ${result?.reason || result?.stage || "unknown failure"}`);
      assert.deepStrictEqual(Array.from(fixture.events.shareTargets), [fixture.nodes.container], "HTML Share helper must receive the selected A3 object");
      const markdown = fixture.events.saves[0].payload.content;
      assertReg018SelectedAssistantNote(markdown, "consecutive-assistant HTML note");
      assert.strictEqual((markdown.match(/%%GPT_OBSIDIAN_ATTACHMENTS%%/g) || []).length, 1, "HTML attachment marker must match the adjacent-pair path");
      assert(markdown.indexOf("# ChatGPT Share") < markdown.indexOf("# HTML Learning Material"), "HTML supplemental Share placement must match the adjacent-pair path");
      assert(markdown.indexOf("# HTML Learning Material") < markdown.indexOf("# Question"), "HTML learning material must remain before the ordinary question");
      assert(markdown.indexOf("# Question") < markdown.indexOf("# Answer"), "HTML ordinary Q/A order must remain unchanged");
    } finally {
      fixture.restore();
    }
  }

  {
    const detailedBody = [
      "# 장별 상세 한국어 요약",
      "",
      "## 첫 장",
      "",
      "인라인 상세 본문"
    ].join("\n");
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      detailedMarkdown: detailedBody
    });
    try {
      const result = await fixture.run();
      assert.strictEqual(fixture.events.opens.length, 0);
      assert.strictEqual(fixture.events.saves.length, 1);
      const payload = fixture.events.saves[0].payload;
      assert.strictEqual((payload.content.match(/^# ChatGPT Share$/gm) || []).length, 1);
      assert.strictEqual((payload.content.match(/^# 장별 상세 한국어 요약$/gm) || []).length, 1);
      assert.strictEqual((payload.content.match(/%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%/g) || []).length, 0);
      assert(payload.content.includes("인라인 상세 본문"));
      assertOrdinaryResponseSupplementalSchema(payload.content, fixture.responseShareUrl, "inline detailed Markdown note");
      assert.strictEqual(payload.downloadedMarkdown, null);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      detailedMarkdown: "downloaded detailed Markdown placeholder",
      downloadedDetailedMarkdown: true
    });
    try {
      await fixture.run();
      assert.strictEqual(fixture.events.opens.length, 0);
      assert.strictEqual(fixture.events.saves.length, 1);
      const payload = fixture.events.saves[0].payload;
      assert.strictEqual((payload.content.match(/^# ChatGPT Share$/gm) || []).length, 1);
      assert.strictEqual((payload.content.match(/%%GPT_OBSIDIAN_DETAILED_MARKDOWN%%/g) || []).length, 1);
      assertOrdinaryResponseSupplementalSchema(payload.content, fixture.responseShareUrl, "downloaded detailed Markdown note");
      assert.strictEqual(payload.downloadedMarkdown.name, "chapter-detailed-summary.md");
      assert.strictEqual(payload.downloadedMarkdown.downloadId, 904);
      assert.strictEqual(payload.fallbackUri, "", "downloaded detailed Markdown must retain the no-URI-fallback rule");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      html: true,
      interveningAssistants: [
        { id: "reg018-default-a1", text: "REG018-DEFAULT-A1" },
        { id: "reg018-default-a2", text: "REG018-DEFAULT-A2" }
      ]
    });
    try {
      const result = await fixture.run({
        omitSupplementalProofNodes: true,
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          fixture.nodes.orderedTurnWrappers.splice(
            2,
            0,
            fixture.nodes.makeBarrierTurn("reg018-default-tool-after-consent", "tool")
          );
          const permissionGranted = await Promise.resolve(requestPermission());
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      assert.deepStrictEqual(Array.from(fixture.events.nativePreflights), ["supplemental-share-preflight"], "default DOM Native flow must complete its preflight before consent");
      assert(fixture.events.order.indexOf("native-preflight") < fixture.events.order.indexOf("share-consent"), "default DOM Native preflight must precede consent");
      assert.strictEqual(result?.ok, false, "default DOM proof must reject a tool wrapper inserted during consent");
      assert.strictEqual(fixture.events.permissions, 0, "default DOM topology drift must stop before clipboard permission");
      assert.strictEqual(fixture.events.shares.length, 0, "default DOM topology drift must stop before Share");
      assert.strictEqual(fixture.events.opens.length, 0, "default DOM topology drift must stop before URI dispatch");
      assert.strictEqual(fixture.events.saves.length, 0, "default DOM topology drift must stop before Native dispatch");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    const conversationUrl = "https://chatgpt.com/s/synthetic-ordinary-conversation";
    const conversationControl = { id: "ordinary-conversation-share" };
    const conversationPlan = {
      status: "found",
      kind: "conversation",
      control: conversationControl,
      response: { status: "missing", control: null },
      conversation: { status: "found", control: conversationControl },
      reason: ""
    };
    try {
      await fixture.run({
        supplementalSharePlan: conversationPlan,
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return {
            ok: true,
            url: conversationUrl,
            validatedShareUrl: conversationUrl,
            source: "existing",
            shareKind: "conversation",
            shareInteraction: "instant-copy",
            conversationShareActionOccurred: true,
            conversationShareFreshness: "verified"
          };
        }
      });
      assert.deepStrictEqual(Array.from(fixture.events.consentModes), ["supplemental-conversation"]);
      assert.deepStrictEqual(Array.from(fixture.events.shares), ["conversation"]);
      assert.strictEqual(fixture.events.opens.length, 1);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assert(markdown.includes(`conversation_share_url: ${JSON.stringify(conversationUrl)}`));
      assert(markdown.includes("share_scope: conversation"));
      assert(markdown.includes("target_turn_id: \"ordinary-a1\""));
      assert(!markdown.includes("chatgpt_share_url:"));
      assert.strictEqual((markdown.match(/^# ChatGPT Share$/gm) || []).length, 1);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run();
      assert.strictEqual(fixture.events.confirms, 0, "an ordinary response must not show a rich-app warning");
      assert.deepStrictEqual(Array.from(fixture.events.order), [
        "share-consent",
        "permission",
        "share-response",
        "uri"
      ]);
      assert.strictEqual(fixture.events.opens.length, 1);
      assert.strictEqual(fixture.events.saves.length, 0);
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      const ordinaryShareUrl = ["https://chatgpt.com", "s", "synthetic-ordinary-response"].join("/");
      assert(markdown.includes(`chatgpt_share_url: ${JSON.stringify(ordinaryShareUrl)}`));
      assert(markdown.includes("share_scope: response"));
      assert(markdown.indexOf("# Question") < markdown.indexOf("# Answer"));
      assert.strictEqual(markdown.split(ordinaryShareUrl).length - 1, 2);
      assert(!markdown.includes("capture_status: partial"));
      assert(markdown.includes("> [!warning] Shared ChatGPT content"));
      [
        "visualize_share_url:",
        "rich_app_share_url:",
        "conversation_share_url:",
        "capture_status: remote-reference"
      ].forEach(fragment => assert(!markdown.includes(fragment), `ordinary note must not contain ${fragment}`));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, {
      rich: false,
      question: "REG018-Q",
      outer: "REG018-A3-SELECTED",
      selectedAssistantId: "reg018-a3",
      interveningAssistants: [
        { id: "reg018-a1", text: "REG018-A1-PROVENANCE" },
        { id: "reg018-a2", text: "REG018-A2-PROVENANCE" }
      ]
    });
    try {
      const result = await fixture.run();
      assert.deepStrictEqual(Array.from(fixture.events.order), [
        "share-consent",
        "permission",
        "share-response",
        "uri"
      ]);
      assert.strictEqual(fixture.events.opens.length, 1, `consecutive-assistant Markdown must retain URI transport: ${result?.reason || result?.stage || "unknown failure"}`);
      assert.strictEqual(fixture.events.saves.length, 0, "consecutive-assistant Markdown must not switch to Native transport");
      assert.deepStrictEqual(Array.from(fixture.events.shareTargets), [fixture.nodes.container], "Share helper must receive the selected A3 object");
      const markdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assertReg018SelectedAssistantNote(markdown, "consecutive-assistant URI Markdown note");
      assert(markdown.indexOf("# Question") < markdown.indexOf("# Answer"), "consecutive-assistant URI note must preserve ordinary section order");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run({
        requestShareConsentFn: async () => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          return { approved: false, permissionGranted: false };
        }
      });
      assert.strictEqual(fixture.events.shareConsents, 1);
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0, "Share-consent cancellation must create no URI note");
      assert.strictEqual(fixture.events.saves.length, 0, "Share-consent cancellation must create no Native note");
      assert.strictEqual(fixture.events.alerts.length, 0, "Share-consent cancellation must not report a persistence warning");
    } finally {
      fixture.restore();
    }
  }

  for (const unavailableCase of [
    {
      name: "ambiguous response Share",
      plan: { status: "blocked", kind: "response", control: null, reason: "multiple response Share controls" }
    },
    {
      name: "missing response and conversation Share",
      plan: { status: "unavailable", kind: "none", control: null, reason: "no Share control" }
    }
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run({ supplementalSharePlan: unavailableCase.plan });
      assert.strictEqual(fixture.events.shareConsents, 0, `${unavailableCase.name} must stop before consent`);
      assert.strictEqual(fixture.events.permissions, 0, `${unavailableCase.name} must stop before permission`);
      assert.strictEqual(fixture.events.shares.length, 0, `${unavailableCase.name} must stop before Share`);
      assert.strictEqual(fixture.events.opens.length, 0, `${unavailableCase.name} must create no URI note`);
      assert.strictEqual(fixture.events.saves.length, 0, `${unavailableCase.name} must create no Native note`);
      assert.strictEqual(fixture.events.alerts.length, 1, `${unavailableCase.name} must report only the generic failure`);
      assert(fixture.events.alerts[0].includes("ChatGPT share save stopped at share-button:"));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run({
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return { ok: true, url: "https://example.com/not-chatgpt", source: "created", shareKind: options.shareKind };
        }
      });
      assert.deepStrictEqual(Array.from(fixture.events.shares), ["response"]);
      assert.strictEqual(fixture.events.opens.length, 0, "an invalid returned Share URL must create no URI note");
      assert.strictEqual(fixture.events.saves.length, 0, "an invalid returned Share URL must create no Native note");
      assert.strictEqual(fixture.events.alerts.length, 2, "response Create followed by URL failure must report failure and persistence risk exactly once each");
      assert(fixture.events.alerts[0].includes("ChatGPT share save stopped at share-url:"));
      assert(fixture.events.alerts[1].includes("Create link action ran") && fixture.events.alerts[1].includes("could not be validated"));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    const conversationControl = { id: "ordinary-conversation-share" };
    const conversationPlan = {
      status: "found",
      kind: "conversation",
      control: conversationControl,
      response: { status: "missing", control: null },
      conversation: { status: "found", control: conversationControl },
      reason: ""
    };
    try {
      await fixture.run({
        supplementalSharePlan: conversationPlan,
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return {
            ok: false,
            stage: "share-url",
            reason: "synthetic whole-conversation URL failure",
            shareKind: "conversation",
            shareInteraction: "dialog",
            conversationShareActionOccurred: true
          };
        }
      });
      assert.deepStrictEqual(Array.from(fixture.events.shares), ["conversation"]);
      assert.strictEqual(fixture.events.opens.length, 0, "a whole-conversation URL failure must create no URI note");
      assert.strictEqual(fixture.events.saves.length, 0, "a whole-conversation URL failure must create no Native note");
      assert.strictEqual(fixture.events.alerts.length, 2, "a whole-conversation action followed by URL failure must report failure and persistence risk exactly once each");
      assert(fixture.events.alerts[0].includes("ChatGPT share save stopped at share-url:"));
      assert(fixture.events.alerts[1].includes("whole-conversation share action ran") && fixture.events.alerts[1].includes("URL was not validated"));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    let artifactExtractionCalls = 0;
    try {
      const result = await fixture.run({
        extractDownloadFilesFn: async () => {
          artifactExtractionCalls += 1;
          const mutatedAnswer = "same assistant node mutated during artifact extraction";
          fixture.nodes.container.innerText = mutatedAnswer;
          fixture.nodes.container.textContent = mutatedAnswer;
          fixture.nodes.container.cloneNode = () => ({
            matches: () => false,
            querySelector: () => null,
            querySelectorAll: () => [],
            cloneNode: fixture.nodes.container.cloneNode,
            getAttribute: () => "",
            innerHTML: "",
            innerText: mutatedAnswer,
            textContent: mutatedAnswer,
            contains: () => false
          });
          return {
            files: [],
            downloadedFiles: [],
            failures: [],
            warnings: [],
            clickedFallback: 0,
            candidatesCount: 0
          };
        }
      });
      assert.strictEqual(artifactExtractionCalls, 1, "the orchestration fixture must mutate the live assistant during artifact extraction");
      assert.strictEqual(result?.ok, false, "same-node assistant mutation after note Q/A extraction must fail closed");
      assert.strictEqual(fixture.events.shareConsents, 0, "post-extraction proof drift must stop before Share consent");
      assert.strictEqual(fixture.events.shares.length, 0, "post-extraction proof drift must stop before Share");
      assert.strictEqual(fixture.events.opens.length, 0, "post-extraction proof drift must stop before URI dispatch");
      assert.strictEqual(fixture.events.saves.length, 0, "post-extraction proof drift must stop before Native dispatch");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run({
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          hooks.__sandbox.location.href = `${hooks.__sandbox.location.href}?changed-during-consent=1`;
          const permissionGranted = await Promise.resolve(requestPermission());
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      assert.strictEqual(fixture.events.permissions, 0, "route drift in Continue must stop before optional permission");
      assert.strictEqual(fixture.events.shares.length, 0, "route drift in Continue must stop before Share");
      assert.strictEqual(fixture.events.opens.length, 0, "route drift in Continue must create no URI note");
      assert.strictEqual(fixture.events.saves.length, 0, "route drift in Continue must create no Native note");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run({
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          const permissionGranted = await Promise.resolve(requestPermission());
          fixture.nodes.container.innerText = "answer changed before Share";
          fixture.nodes.container.textContent = "answer changed before Share";
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      assert.strictEqual(fixture.events.permissions, 1);
      assert.strictEqual(fixture.events.shares.length, 0, "answer drift after consent must stop before Share");
      assert.strictEqual(fixture.events.opens.length, 0, "answer drift after consent must create no URI note");
      assert.strictEqual(fixture.events.saves.length, 0, "answer drift after consent must create no Native note");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    try {
      await fixture.run({
        nativePreflightFn: async phase => {
          fixture.events.nativePreflights.push(phase);
          fixture.events.order.push("native-preflight");
          const originalGetAttribute = fixture.nodes.assistantTurn.getAttribute;
          fixture.nodes.assistantTurn.getAttribute = name => name === "data-turn-id" || name === "data-message-id"
            ? "ordinary-a1-changed-after-native-preflight"
            : originalGetAttribute(name);
          return { ok: true, pong: true, native: true };
        }
      });
      assert.strictEqual(fixture.events.shareConsents, 0, "target-ID drift during Native preflight must stop before Share consent");
      assert.strictEqual(fixture.events.permissions, 0);
      assert.strictEqual(fixture.events.shares.length, 0);
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    let useConversationScope = false;
    const conversationControl = { id: "scope-changed-during-native-preflight" };
    try {
      const result = await fixture.run({
        supplementalSharePlan: null,
        supplementalShareOptions: {
          resolveSharePlanFn: () => useConversationScope
            ? {
              status: "found",
              kind: "conversation",
              control: conversationControl,
              response: { status: "missing", control: null },
              conversation: { status: "found", control: conversationControl },
              reason: ""
            }
            : fixture.defaultSharePlan
        },
        nativePreflightFn: async phase => {
          fixture.events.nativePreflights.push(phase);
          fixture.events.order.push("native-preflight");
          useConversationScope = true;
          return { ok: true, pong: true, native: true };
        }
      });
      assert.strictEqual(result.ok, false, "Share scope drift during Native preflight must abort the save");
      assert.strictEqual(result.stage, "share-button");
      assert.strictEqual(fixture.events.shareConsents, 0, "post-preflight Share scope drift must stop before consent");
      assert.strictEqual(fixture.events.permissions, 0, "post-preflight Share scope drift must stop before clipboard permission");
      assert.strictEqual(fixture.events.shares.length, 0);
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    let replaceResponseControl = false;
    const replacementControl = { id: "replacement-response-share-control" };
    try {
      const result = await fixture.run({
        supplementalSharePlan: null,
        supplementalShareOptions: {
          resolveSharePlanFn: () => replaceResponseControl
            ? {
              status: "found",
              kind: "response",
              control: replacementControl,
              response: { status: "found", control: replacementControl },
              conversation: null,
              reason: ""
            }
            : fixture.defaultSharePlan
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          replaceResponseControl = true;
          const permissionGranted = await Promise.resolve(requestPermission());
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      assert.strictEqual(result.ok, false, "exact Share control replacement before permission must abort the save");
      assert.strictEqual(result.stage, "share-button");
      assert.strictEqual(fixture.events.shareConsents, 1);
      assert.strictEqual(fixture.events.permissions, 0, "replaced Share control must stop before clipboard permission");
      assert.strictEqual(fixture.events.shares.length, 0);
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0);
    } finally {
      fixture.restore();
    }
  }

  for (const afterConsentMutation of [
    {
      label: "question text drift",
      mutate: fixture => {
        fixture.nodes.questionNode.innerText = "question changed after consent";
        fixture.nodes.questionNode.textContent = "question changed after consent";
        fixture.nodes.questionNode.cloneNode = () => ({
          matches: () => false,
          querySelector: () => null,
          querySelectorAll: () => [],
          cloneNode() { return this; },
          getAttribute: () => "",
          innerHTML: "",
          innerText: "question changed after consent",
          textContent: "question changed after consent",
          contains: () => false
        });
      }
    },
    {
      label: "duplicate target",
      mutate: fixture => {
        const duplicateAssistant = { ...fixture.nodes.container, isConnected: true, parentElement: null };
        const duplicateTurn = {
          ...fixture.nodes.assistantTurn,
          contains: node => node === duplicateAssistant,
          querySelector: selector => selector === "[data-message-author-role]" ? duplicateAssistant : null,
          querySelectorAll: selector => selector === "[data-message-author-role]" ? [duplicateAssistant] : []
        };
        duplicateAssistant.parentElement = duplicateTurn;
        duplicateAssistant.contains = node => node === duplicateAssistant;
        duplicateAssistant.closest = selector => selector === "[data-message-author-role]"
          ? duplicateAssistant
          : selector.includes("[data-turn-id]") || selector.includes("[data-message-id]") || selector.includes("[data-testid^='conversation-turn-']")
            ? duplicateTurn
            : null;
        fixture.nodes.proofNodes.push(duplicateAssistant);
      }
    }
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    try {
      await fixture.run({
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          const permissionGranted = await Promise.resolve(requestPermission());
          afterConsentMutation.mutate(fixture);
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      assert.strictEqual(fixture.events.permissions, 1);
      assert.strictEqual(fixture.events.shares.length, 0, `${afterConsentMutation.label} must stop before Share`);
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0);
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    let useConversationScope = false;
    const conversationControl = { id: "changed-scope-control" };
    try {
      await fixture.run({
        supplementalSharePlan: null,
        supplementalShareOptions: {
          resolveSharePlanFn: () => useConversationScope
            ? {
              status: "found",
              kind: "conversation",
              control: conversationControl,
              response: { status: "missing", control: null },
              conversation: { status: "found", control: conversationControl },
              reason: ""
            }
            : fixture.defaultSharePlan
        },
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          const permissionGranted = await Promise.resolve(requestPermission());
          useConversationScope = true;
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      assert.strictEqual(fixture.events.permissions, 1);
      assert.strictEqual(fixture.events.shares.length, 0, "approved-scope drift must stop before Share");
      assert.strictEqual(fixture.events.saves.length, 0);
      assert.strictEqual(fixture.events.opens.length, 0);
    } finally {
      fixture.restore();
    }
  }

  for (const finalBoundaryCase of [
    { label: "URI", html: false, mutateNode: "container", expectedEffect: "opens" },
    { label: "Native", html: true, mutateNode: "container", expectedEffect: "saves" }
  ]) {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: finalBoundaryCase.html });
    const finalRuntimeGuard = {
      checkSync: phase => ({ ok: true, phase }),
      check: async phase => {
        if (phase === "supplemental-share-before-save") {
          const node = fixture.nodes[finalBoundaryCase.mutateNode];
          node.innerText = `${finalBoundaryCase.label} target changed during final runtime guard`;
          node.textContent = `${finalBoundaryCase.label} target changed during final runtime guard`;
        }
        return { ok: true, phase };
      },
      isAborted: () => false,
      getFailure: () => null,
      fail: result => result,
      notify() {}
    };
    try {
      await fixture.run({ runtimeGuard: finalRuntimeGuard });
      assert.strictEqual(
        fixture.events[finalBoundaryCase.expectedEffect].length,
        0,
        `${finalBoundaryCase.label} target drift during the final awaited runtime guard must stop the final effect`
      );
      assert.strictEqual(fixture.events.shares.length, 1, "the regression must mutate only after the validated Share result");
    } finally {
      fixture.restore();
    }
  }

  const finalReviewGuardResults = [];
  for (const identityCase of [
    {
      label: "selected ID cross-role collision before clipboard permission",
      fixtureOptions: { rich: false },
      mutate(fixture) {
        const duplicate = fixture.nodes.makePlainTurn(
          "user",
          fixture.nodes.assistantTurn.getAttribute("data-turn-id"),
          "unrelated user reusing the selected assistant ID"
        );
        fixture.nodes.proofNodes.unshift(duplicate.node);
      }
    },
    {
      label: "question ID global collision before clipboard permission",
      fixtureOptions: { rich: false },
      mutate(fixture) {
        const duplicate = fixture.nodes.makePlainTurn(
          "assistant",
          fixture.nodes.questionTurn.getAttribute("data-turn-id"),
          "unrelated assistant reusing the selected question ID"
        );
        fixture.nodes.proofNodes.unshift(duplicate.node);
      }
    },
    {
      label: "same-text ID-less question replacement before clipboard permission",
      fixtureOptions: { rich: false, questionId: "" },
      mutate(fixture) {
        const replacement = fixture.nodes.makePlainTurn(
          "user",
          "",
          fixture.nodes.questionNode.innerText
        );
        fixture.nodes.proofNodes.splice(0, 1, replacement.node);
      }
    }
  ]) {
    const fixture = makeHandleCopyFixture(hooks, identityCase.fixtureOptions);
    try {
      const result = await fixture.run({
        requestShareConsentFn: async ({ requestPermission }) => {
          fixture.events.shareConsents += 1;
          fixture.events.order.push("share-consent");
          identityCase.mutate(fixture);
          const permissionGranted = await Promise.resolve(requestPermission());
          return { approved: true, permissionGranted: permissionGranted === true };
        }
      });
      finalReviewGuardResults.push({
        label: identityCase.label,
        resultOk: result?.ok === true,
        consent: fixture.events.shareConsents,
        permission: fixture.events.permissions,
        share: fixture.events.shares.length,
        uri: fixture.events.opens.length,
        native: fixture.events.saves.length
      });
    } finally {
      fixture.restore();
    }
  }

  const runDelayedOrdinaryUriFallbackCase = async ({
    label,
    project = false,
    driftRoute = false,
    disconnectSelected = false,
    disconnectRuntime = false,
    openerResponseKind = "explicit-failure",
    shareOutcome = null,
    verifyReporting = false
  }) => {
    const fixture = makeHandleCopyFixture(hooks, { rich: false });
    if (project) setProjectRoute(fixture);
    const sandbox = hooks.__sandbox;
    const fixtureSender = sandbox.chrome.runtime.sendMessage;
    const originalCreateElement = sandbox.document.createElement;
    const originalLastError = sandbox.chrome.runtime.lastError;
    let openerCallback = null;
    let directUriClicks = 0;
    let runtimeFailCalls = 0;
    let runtimeNotifyCalls = 0;
    const runtimeGuard = hooks.createRuntimeGuard({
      syncCheck: phase => ({ ok: true, phase }),
      ping: async phase => ({ ok: true, pong: true, phase }),
      notifyUser: () => { runtimeNotifyCalls += 1; }
    });
    const recordRuntimeFailure = runtimeGuard.fail.bind(runtimeGuard);
    runtimeGuard.fail = (result, phase) => {
      runtimeFailCalls += 1;
      return recordRuntimeFailure(result, phase);
    };
    sandbox.chrome.runtime.sendMessage = (message, callback) => {
      if (message?.type === "open-obsidian-uri") {
        fixture.events.opens.push(message);
        openerCallback = callback;
        return;
      }
      return fixtureSender(message, callback);
    };
    sandbox.document.createElement = tagName => {
      const element = originalCreateElement(tagName);
      if (String(tagName).toLowerCase() === "a") {
        element.click = () => {
          if (/^obsidian:\/\//i.test(String(element.href || ""))) directUriClicks += 1;
        };
      }
      return element;
    };
    try {
      const result = await fixture.run({
        openObsidianURIFn: undefined,
        runtimeGuard,
        ...(shareOutcome ? {
          supplementalSharePlan: { ...fixture.defaultSharePlan, kind: shareOutcome.shareKind },
          createSupplementalShareLinkFn: async () => ({
            ok: true,
            url: fixture.responseShareUrl,
            validatedShareUrl: fixture.responseShareUrl,
            dialogClosed: true,
            ...shareOutcome
          })
        } : {})
      });
      if (driftRoute) {
        sandbox.location.href = "https://chatgpt.example/c/final-review-uri-fallback-drift";
      }
      if (disconnectSelected) fixture.nodes.container.isConnected = false;
      if (disconnectRuntime) {
        sandbox.chrome.runtime.lastError = {
          message: "Extension context invalidated while URI opener was pending"
        };
      }
      if (typeof openerCallback === "function") {
        const openerResponse = openerResponseKind === "undefined"
          ? undefined
          : openerResponseKind === "malformed"
            ? { error: "synthetic malformed Native URI opener response" }
            : openerResponseKind === "array"
              ? [{ ok: false }]
              : openerResponseKind === "non-boolean"
                ? { ok: "false", error: "synthetic non-boolean Native URI opener response" }
                : openerResponseKind === "success"
                  ? { ok: true }
                  : { ok: false, error: "synthetic Native URI opener failure" };
        openerCallback(openerResponse);
      }
      sandbox.chrome.runtime.lastError = null;
      if (project) assertProjectHasNoShare(fixture);
      if (verifyReporting) {
        assert.strictEqual(typeof openerCallback, "function", `${label}: exercise the real deferred URI callback`);
        assert.strictEqual(result.mode, "ordinary-uri", `${label}: initial result acknowledges URI dispatch only`);
        assert.strictEqual(fixture.events.opens.length, 1, `${label}: one URI runtime dispatch`);
        assert.strictEqual(fixture.events.saves.length, 0, `${label}: no Native note save`);
        const failed = driftRoute || disconnectRuntime || !["explicit-failure", "success"].includes(openerResponseKind);
        const persistenceRisk = shareOutcome.shareCreatedThisAttempt || shareOutcome.shareUpdatedThisAttempt || shareOutcome.conversationShareActionOccurred;
        const ordinaryErrors = fixture.events.alerts.filter(message => message.includes("ChatGPT share save stopped at "));
        const persistenceWarnings = fixture.events.alerts.filter(message => message.includes("may remain active"));
        assert.strictEqual(ordinaryErrors.length + runtimeNotifyCalls, failed ? 1 : 0, `${label}: deferred URI failure must be reported once`);
        assert.strictEqual(persistenceWarnings.length, failed && persistenceRisk ? 1 : 0, `${label}: deferred URI failure must retain the tracked Share persistence warning`);
        assert.strictEqual(fixture.events.alerts.length, ordinaryErrors.length + persistenceWarnings.length, `${label}: no unrelated or duplicate alerts`);
        assert.strictEqual(directUriClicks, !failed && openerResponseKind === "explicit-failure" ? 1 : 0, `${label}: preserve fail-closed navigation`);
        if (persistenceWarnings.length) {
          assert.strictEqual(persistenceWarnings[0].includes("whole-conversation"), shareOutcome.shareKind === "conversation", `${label}: warning must retain the approved Share scope`);
        }
      }
      return {
        label,
        resultOk: result?.ok === true,
        openerCallbackCaptured: typeof openerCallback === "function",
        runtimeDispatch: fixture.events.opens.length,
        directUriClicks,
        runtimeFailCalls,
        runtimeNotifyCalls,
        runtimeAborted: runtimeGuard.isAborted()
      };
    } finally {
      sandbox.chrome.runtime.lastError = originalLastError;
      sandbox.document.createElement = originalCreateElement;
      fixture.restore();
    }
  };

  for (const boundary of [
    { label: "unchanged project context", expectedClicks: 1 },
    { label: "project route changed before delayed URI fallback", driftRoute: true, expectedClicks: 0 },
    { label: "project selected node disconnected before delayed URI fallback", disconnectSelected: true, expectedClicks: 0 }
  ]) {
    const result = await runDelayedOrdinaryUriFallbackCase({ ...boundary, project: true });
    assert.strictEqual(result.resultOk, true, `${boundary.label}: initial URI request must be dispatched`);
    assert.strictEqual(result.openerCallbackCaptured, true, `${boundary.label}: exercise the real delayed opener callback`);
    assert.strictEqual(result.runtimeDispatch, 1);
    assert.strictEqual(result.directUriClicks, boundary.expectedClicks, `${boundary.label}: revalidate project identity before direct fallback`);
  }

  // REG-019: an accepted URI request is not a completed save. A later
  // fail-closed callback must retain the attempt's Share side-effect warning.
  for (const shareOutcome of [
    { label: "response created", shareKind: "response", source: "created", shareCreatedThisAttempt: true },
    { label: "response updated", shareKind: "response", source: "updated", shareUpdatedThisAttempt: true },
    { label: "response reused", shareKind: "response", source: "existing" },
    { label: "conversation dialog", shareKind: "conversation", shareInteraction: "dialog", conversationShareActionOccurred: true },
    { label: "conversation instant-copy", shareKind: "conversation", shareInteraction: "instant-copy", conversationShareActionOccurred: true }
  ]) {
    for (const boundary of [
      { label: "route drift", driftRoute: true },
      { label: "runtime disconnect", disconnectRuntime: true },
      { label: "undefined callback", openerResponseKind: "undefined" },
      { label: "malformed callback", openerResponseKind: "malformed" },
      { label: "array callback", openerResponseKind: "array" },
      { label: "non-boolean callback", openerResponseKind: "non-boolean" },
      { label: "healthy permitted fallback" },
      { label: "opener success", openerResponseKind: "success" }
    ]) {
      await runDelayedOrdinaryUriFallbackCase({
        ...boundary,
        label: `REG-019 ${shareOutcome.label} / ${boundary.label}`,
        shareOutcome,
        verifyReporting: true
      });
    }
  }

  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "healthy unchanged Native URI opener failure permits one direct fallback"
  }));
  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "route drift while Native URI opener is pending blocks direct fallback",
    driftRoute: true
  }));
  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "runtime disconnect while Native URI opener is pending blocks direct fallback",
    disconnectRuntime: true
  }));
  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "undefined Native URI opener response blocks direct fallback",
    openerResponseKind: "undefined"
  }));
  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "malformed Native URI opener response blocks direct fallback",
    openerResponseKind: "malformed"
  }));
  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "array Native URI opener response blocks direct fallback",
    openerResponseKind: "array"
  }));
  finalReviewGuardResults.push(await runDelayedOrdinaryUriFallbackCase({
    label: "non-boolean Native URI opener response blocks direct fallback",
    openerResponseKind: "non-boolean"
  }));

  assert.deepStrictEqual(JSON.parse(JSON.stringify(finalReviewGuardResults)), [
    {
      label: "selected ID cross-role collision before clipboard permission",
      resultOk: false,
      consent: 1,
      permission: 0,
      share: 0,
      uri: 0,
      native: 0
    },
    {
      label: "question ID global collision before clipboard permission",
      resultOk: false,
      consent: 1,
      permission: 0,
      share: 0,
      uri: 0,
      native: 0
    },
    {
      label: "same-text ID-less question replacement before clipboard permission",
      resultOk: false,
      consent: 1,
      permission: 0,
      share: 0,
      uri: 0,
      native: 0
    },
    {
      label: "healthy unchanged Native URI opener failure permits one direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 1,
      runtimeFailCalls: 0,
      runtimeNotifyCalls: 0,
      runtimeAborted: false
    },
    {
      label: "route drift while Native URI opener is pending blocks direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 0,
      runtimeFailCalls: 0,
      runtimeNotifyCalls: 0,
      runtimeAborted: false
    },
    {
      label: "runtime disconnect while Native URI opener is pending blocks direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 0,
      runtimeFailCalls: 1,
      runtimeNotifyCalls: 1,
      runtimeAborted: true
    },
    {
      label: "undefined Native URI opener response blocks direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 0,
      runtimeFailCalls: 1,
      runtimeNotifyCalls: 1,
      runtimeAborted: true
    },
    {
      label: "malformed Native URI opener response blocks direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 0,
      runtimeFailCalls: 1,
      runtimeNotifyCalls: 1,
      runtimeAborted: true
    },
    {
      label: "array Native URI opener response blocks direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 0,
      runtimeFailCalls: 1,
      runtimeNotifyCalls: 1,
      runtimeAborted: true
    },
    {
      label: "non-boolean Native URI opener response blocks direct fallback",
      resultOk: true,
      openerCallbackCaptured: true,
      runtimeDispatch: 1,
      directUriClicks: 0,
      runtimeFailCalls: 1,
      runtimeNotifyCalls: 1,
      runtimeAborted: true
    }
  ], "final-review identity drift and delayed ordinary URI fallback races must stop before their next effect");

  {
    hooks.setTestLanguage("ko");
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    try {
      const result = await fixture.run({
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return {
            ok: true,
            url: fixture.responseShareUrl,
            validatedShareUrl: fixture.responseShareUrl,
            source: "created",
            shareKind: "response",
            shareCreatedThisAttempt: true,
            shareInteraction: "dialog"
          };
        },
        saveObsidianNoteFn: async payload => {
          fixture.events.saves.push({ type: "save-obsidian-note", payload });
          fixture.events.order.push("native");
          return { ok: false, stage: "native-save", reason: "synthetic native failure" };
        }
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.shareState.shareCreatedThisAttempt, true);
      assert.strictEqual(fixture.events.alerts.length, 2, "response post-Share Native failure must show one failure and one persistence warning");
      assert(fixture.events.alerts[0].includes("ChatGPT 공유 저장이 native-save 단계에서 중단되었습니다:"));
      assert(fixture.events.alerts[1].includes("계속 활성 상태") && fixture.events.alerts[1].includes("직접"));
    } finally {
      fixture.restore();
      hooks.setTestLanguage("en");
    }
  }

  {
    hooks.setTestLanguage("ko");
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    try {
      const result = await fixture.run({
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return {
            ok: true,
            url: fixture.responseShareUrl,
            validatedShareUrl: fixture.responseShareUrl,
            source: "created",
            shareKind: "response",
            shareCreatedThisAttempt: true,
            shareInteraction: "dialog"
          };
        },
        saveObsidianNoteFn: (payload, saveOptions) => hooks.saveObsidianNote(payload, {
          ...saveOptions,
          sendMessage: async message => {
            fixture.events.saves.push(message);
            fixture.events.order.push("native");
            return { ok: false, error: "real Native helper failure" };
          },
          openUri: uri => {
            fixture.events.opens.push({ type: "open-obsidian-uri", uri });
            fixture.events.order.push("uri-fallback");
          }
        })
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.shareState.shareCreatedThisAttempt, true);
      assert.strictEqual(fixture.events.saves.length, 1, "the regression must traverse the real Native transport boundary");
      assert.strictEqual(fixture.events.opens.length, 1, "an ordinary HTML Native failure may attempt its guarded URI fallback once");
      const fallbackMarkdown = new URL(fixture.events.opens[0].uri).searchParams.get("content");
      assertOrdinaryResponseSupplementalSchema(fallbackMarkdown, fixture.responseShareUrl, "ordinary Native-to-URI fallback note");
      assert.strictEqual(fixture.events.alerts.length, 2, "real Native failure must show its failure once plus one persistence warning");
      assert(fixture.events.alerts[0].includes("Native helper 저장 실패:"), "the real Native layer must own the ordinary failure alert");
      assert(!fixture.events.alerts[0].includes("ChatGPT 공유 저장이"), "the outer generic failure must not duplicate a real Native alert");
      assert(fixture.events.alerts[1].includes("계속 활성 상태") && fixture.events.alerts[1].includes("직접"));
    } finally {
      fixture.restore();
      hooks.setTestLanguage("en");
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    const nonFailureWarning = "Synthetic Native warning before an unreported failure";
    try {
      const result = await fixture.run({
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return {
            ok: true,
            url: fixture.responseShareUrl,
            validatedShareUrl: fixture.responseShareUrl,
            source: "created",
            shareKind: "response",
            shareCreatedThisAttempt: true,
            shareInteraction: "dialog"
          };
        },
        saveObsidianNoteFn: async (payload, saveOptions) => {
          fixture.events.saves.push({ type: "save-obsidian-note", payload });
          fixture.events.order.push("native");
          saveOptions.showAlert(nonFailureWarning);
          return { ok: false, stage: "native-save", reason: "failure was not reported by the Native layer" };
        }
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.shareState.shareCreatedThisAttempt, true);
      assert.deepStrictEqual(Array.from(fixture.events.alerts), [
        nonFailureWarning,
        "ChatGPT share save stopped at native-save: failure was not reported by the Native layer",
        "A ChatGPT response share link was created, but the Obsidian note was not saved. The link may remain active. If needed, manage or disable it manually from ChatGPT; the extension will not roll it back automatically."
      ], "a non-failure Native warning must not suppress the outer ordinary failure or persistence warning");
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    const conversationUrl = "https://chatgpt.com/s/synthetic-post-share-conversation";
    const conversationControl = { id: "post-share-conversation-control" };
    const conversationPlan = {
      status: "found",
      kind: "conversation",
      control: conversationControl,
      response: { status: "missing", control: null },
      conversation: { status: "found", control: conversationControl },
      reason: ""
    };
    try {
      const result = await fixture.run({
        supplementalSharePlan: conversationPlan,
        createSupplementalShareLinkFn: async (_assistantNode, options) => {
          fixture.events.shares.push(options.shareKind);
          fixture.events.order.push(`share-${options.shareKind}`);
          return {
            ok: true,
            url: conversationUrl,
            validatedShareUrl: conversationUrl,
            source: "existing",
            shareKind: "conversation",
            shareInteraction: "instant-copy",
            conversationShareActionOccurred: true
          };
        },
        saveObsidianNoteFn: async payload => {
          fixture.events.saves.push({ type: "save-obsidian-note", payload });
          fixture.events.order.push("native");
          return { ok: false, stage: "native-save", reason: "synthetic native failure" };
        }
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.shareState.conversationShareActionOccurred, true);
      assert.strictEqual(fixture.events.alerts.length, 2, "conversation instant-copy failure must show one failure and one scope-specific warning");
      assert(fixture.events.alerts[0].includes("ChatGPT share save stopped at native-save:"));
      assert(fixture.events.alerts[1].includes("whole-conversation") && fixture.events.alerts[1].includes("manage"));
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
      assert.deepStrictEqual(Array.from(fixture.events.order), [
        "partial-consent",
        "native-preflight",
        "share-consent",
        "permission",
        "share-response",
        "native"
      ]);
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
      assertOrdinaryResponseSupplementalSchema(payload.content, fixture.responseShareUrl, "Native partial HTML note");
      [
        "capture_status: remote-reference",
        "capture_mode:",
        "app_provider:",
        "app_provenance:",
        "rich_artifacts_local_complete:",
        "rich_artifacts_remote_referenced:",
        "interactive_behavior_preserved: remote-only",
        "offline_available: false"
      ].forEach(fragment => assert(!payload.content.includes(fragment), `Native partial HTML note must not contain ${fragment}`));
    } finally {
      fixture.restore();
    }
  }

  {
    const fixture = makeHandleCopyFixture(hooks, { rich: false, html: true });
    const guardFailureAlerts = [];
    let nativeWrapperCalls = 0;
    let nativeDispatches = 0;
    const saveWithLateValidation = async (_payload, saveOptions) => {
      nativeWrapperCalls += 1;
      if (nativeWrapperCalls === 1) {
        fixture.nodes.container.innerText = "answer changed inside Native validation";
        fixture.nodes.container.textContent = "answer changed inside Native validation";
        const validation = saveOptions.validateContext();
        assert.strictEqual(validation.ok, false, "the late Native boundary must detect answer/proof drift");
        return { ...validation, nativeAttempted: false, fallbackAttempted: false };
      }
      nativeDispatches += 1;
      return { ok: true, nativeAttempted: true, fallbackAttempted: false };
    };
    try {
      const firstResult = await fixture.run({
        alertFn: message => { guardFailureAlerts.push(String(message)); },
        saveObsidianNoteFn: saveWithLateValidation
      });
      assert.strictEqual(firstResult.ok, false, "a no-dispatch Native guard failure must propagate to the caller");
      assert.strictEqual(firstResult.stage, "preflight");
      assert.strictEqual(firstResult.shareState.validatedShareUrl, fixture.responseShareUrl);
      assert.strictEqual(nativeDispatches, 0, "late validation failure must send neither Native nor URI transport");
      assert.strictEqual(guardFailureAlerts.length, 1, "an otherwise silent late Native guard failure must be reported once");
      assert(guardFailureAlerts[0].includes("ChatGPT share save stopped at preflight:"));

      fixture.nodes.container.innerText = "outer explanation";
      fixture.nodes.container.textContent = "outer explanation";
      const secondResult = await fixture.run({
        alertFn: message => { guardFailureAlerts.push(String(message)); },
        saveObsidianNoteFn: saveWithLateValidation
      });
      assert.strictEqual(secondResult.ok, true, "a no-dispatch guard failure must release the duplicate reservation for immediate retry");
      assert.strictEqual(nativeWrapperCalls, 2);
      assert.strictEqual(nativeDispatches, 1);
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

  let resolveLateNativeFailure;
  let markLateNativeStarted;
  let lateApprovedShareControl = { id: "approved-response-share" };
  const approvedLateShareControl = lateApprovedShareControl;
  const lateNativeStarted = new Promise(resolve => { markLateNativeStarted = resolve; });
  const lateNativeResponse = new Promise(resolve => { resolveLateNativeFailure = resolve; });
  const lateFallbackRuntimePhases = [];
  let lateFallbackContextChecks = 0;
  let lateFallbackUriAttempts = 0;
  const lateFallbackPromise = hooks.saveObsidianNote({
    vaultName: "Test",
    vaultPath: "/tmp/Test",
    filePath: "ChatGPT/late-fallback-drift.md",
    content: "# late fallback drift",
    attachments: [{ name: "late.html", content: "<!doctype html><html><body>late</body></html>" }],
    downloadedAttachments: [],
    downloadedMarkdown: null,
    attachmentNames: [],
    htmlSaveDir: "ChatGPT/Attachments",
    fallbackUri: "obsidian://new?vault=Test&name=late-fallback-drift"
  }, {
    runtimeGuard: {
      checkSync: phase => {
        lateFallbackRuntimePhases.push(phase);
        return { ok: true, phase };
      },
      check: async phase => ({ ok: true, phase }),
      isAborted: () => false,
      getFailure: () => null,
      fail: result => result,
      notify() {}
    },
    validateContext: () => {
      lateFallbackContextChecks += 1;
      return lateApprovedShareControl === approvedLateShareControl
        ? { ok: true }
        : { ok: false, stage: "share-button", reason: "approved Share control changed before fallback" };
    },
    sendMessage: () => {
      markLateNativeStarted();
      return lateNativeResponse;
    },
    openUri: () => { lateFallbackUriAttempts += 1; },
    showAlert: () => {}
  });
  await lateNativeStarted;
  lateApprovedShareControl = { id: "replacement-response-share" };
  resolveLateNativeFailure({ ok: false, error: "native helper failed after approved control drift" });
  const lateFallbackResult = await lateFallbackPromise;
  assert.strictEqual(lateFallbackResult.ok, false);
  assert.strictEqual(lateFallbackResult.stage, "share-button");
  assert.strictEqual(lateFallbackResult.fallbackAttempted, false);
  assert.strictEqual(lateFallbackUriAttempts, 0, "approved control drift while Native is pending must block URI fallback");
  assert.strictEqual(lateFallbackContextChecks, 2, "the approved context must be revalidated immediately before fallback");
  assert(
    lateFallbackRuntimePhases.includes("native-save-fallback"),
    "the runtime must be checked synchronously immediately before fallback"
  );

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

  for (const mutation of ["duplicate", "missing"]) {
    let activeViewers;
    const secondViewer = makeArtifactViewer("restore-check.html", htmlDocument("Other", "Other", "other body"));
    const viewer = makeArtifactViewer("restore-check.html", htmlDocument("Restore", "Restore", "original body"), {
      onPreviewRequested: () => { activeViewers = mutation === "duplicate" ? [viewer, secondViewer] : []; }
    });
    activeViewers = [viewer];
    const container = {
      innerText: "restore-check.html",
      textContent: "restore-check.html",
      querySelector: selector => selector.includes("iframe") ? {} : null,
      querySelectorAll: selector => selector === "button"
        ? activeViewers.flatMap(item => [item.codeToggle, item.previewToggle]) : []
    };
    let deadline;
    try {
      const files = await Promise.race([
        hooks.readInteractiveHtmlArtifacts(container, ["restore-check.html"], []),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error(`${mutation} viewer restoration must terminate within a bounded wait`)), 6000); })
      ]);
      assert.strictEqual(files.length, 1, `${mutation} fixture must capture the original HTML before the viewer changes`);
      assert.strictEqual(files[0].content, viewer.source);
      assert(viewer.wasPreviewRestored(), `${mutation} fixture must remove temporary source so ambiguity or absence causes the failure`);
      assert.strictEqual(files.previewRestorationFailed, true, `${mutation} HTML viewer after Preview click must not certify restoration`);
    } finally {
      clearTimeout(deadline);
      viewer.cleanup();
      secondViewer.cleanup();
    }
  }

  {
    let previewRequests = 0;
    const viewer = makeArtifactViewer("already-code.html", htmlDocument("Code", "Code", "already visible source"), {
      initialCodeVisible: true,
      onPreviewRequested: () => { previewRequests += 1; }
    });
    const container = {
      innerText: "already-code.html",
      textContent: "already-code.html",
      querySelector: selector => selector.includes("iframe") ? {} : null,
      querySelectorAll: selector => selector === "button" ? [viewer.codeToggle, viewer.previewToggle] : []
    };
    try {
      const files = await hooks.readInteractiveHtmlArtifacts(container, ["already-code.html"], []);
      assert.strictEqual(files.length, 1);
      assert.strictEqual(files[0].content, viewer.source);
      assert.strictEqual(previewRequests, 0, "an already active Code view must not be switched to Preview by extraction");
      assert.strictEqual(viewer.codeToggle.getAttribute("aria-pressed"), "true");
      assert(!files.previewRestorationFailed, "an unchanged initial Code view must not be treated as a restoration failure");
    } finally {
      viewer.cleanup();
    }
  }

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
