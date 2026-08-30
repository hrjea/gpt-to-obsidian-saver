#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REQUEST_TYPE = "gpt2obs-request-clipboard-read-permission";
const GENERIC_ERROR = "clipboard-read-permission-request-failed";

function loadBackground({ permissionApi = true, permissionResult = true, lastErrorMessage = "", permissionThrows = false } = {}) {
  let messageListener = null;
  const requestCalls = [];
  const noop = () => {};
  const event = { addListener: noop, removeListener: noop };
  const runtime = {
    lastError: null,
    onInstalled: event,
    onMessage: {
      addListener(listener) { messageListener = listener; },
      removeListener: noop
    },
    sendNativeMessage: noop
  };
  const chrome = {
    downloads: { onCreated: event, onChanged: event, search: (_query, callback) => callback([]) },
    runtime,
    storage: { sync: { get: (_keys, callback) => callback({}), set: noop } }
  };
  if (permissionApi) {
    chrome.permissions = {
      request(request, callback) {
        requestCalls.push(request);
        if (permissionThrows) throw new Error("internal browser detail");
        runtime.lastError = lastErrorMessage ? { message: lastErrorMessage } : null;
        callback(permissionResult);
        runtime.lastError = null;
      }
    };
  }
  const sandbox = { console, chrome, setTimeout, clearTimeout, URL };
  sandbox.globalThis = sandbox;
  const backgroundPath = path.join(__dirname, "..", "background.js");
  vm.runInNewContext(fs.readFileSync(backgroundPath, "utf8"), sandbox, { filename: backgroundPath });
  assert.strictEqual(typeof messageListener, "function", "background message listener must be registered");
  return { messageListener, requestCalls };
}

function invokePermissionRequest(fixture) {
  let response;
  const keepChannelOpen = fixture.messageListener({ type: REQUEST_TYPE }, {}, value => { response = value; });
  return { keepChannelOpen, response };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

{
  const fixture = loadBackground({ permissionResult: true });
  const result = invokePermissionRequest(fixture);
  assert.strictEqual(result.keepChannelOpen, true, "permission request must keep the message channel open");
  assert.deepStrictEqual(plain(fixture.requestCalls), [{ permissions: ["clipboardRead"] }], "permission request must ask only for clipboardRead once");
  assert.deepStrictEqual(plain(result.response), { ok: true, granted: true });
}

{
  const fixture = loadBackground({ permissionResult: false });
  const result = invokePermissionRequest(fixture);
  assert.strictEqual(result.keepChannelOpen, true);
  assert.deepStrictEqual(plain(fixture.requestCalls), [{ permissions: ["clipboardRead"] }]);
  assert.deepStrictEqual(plain(result.response), { ok: true, granted: false });
}

{
  const fixture = loadBackground({ permissionResult: false, lastErrorMessage: "internal browser detail" });
  const result = invokePermissionRequest(fixture);
  assert.strictEqual(result.keepChannelOpen, true);
  assert.deepStrictEqual(plain(fixture.requestCalls), [{ permissions: ["clipboardRead"] }]);
  assert.deepStrictEqual(plain(result.response), { ok: false, error: GENERIC_ERROR }, "runtime errors must not expose browser-provided details");
}

{
  const fixture = loadBackground({ permissionApi: false });
  const result = invokePermissionRequest(fixture);
  assert.strictEqual(result.keepChannelOpen, false, "missing permissions API must fail synchronously without opening a dangling channel");
  assert.deepStrictEqual(plain(fixture.requestCalls), []);
  assert.deepStrictEqual(plain(result.response), { ok: false, error: GENERIC_ERROR });
}

{
  const fixture = loadBackground({ permissionThrows: true });
  const result = invokePermissionRequest(fixture);
  assert.strictEqual(result.keepChannelOpen, false);
  assert.deepStrictEqual(plain(fixture.requestCalls), [{ permissions: ["clipboardRead"] }]);
  assert.deepStrictEqual(plain(result.response), { ok: false, error: GENERIC_ERROR });
}

console.log("background clipboard permission self-test ok");
