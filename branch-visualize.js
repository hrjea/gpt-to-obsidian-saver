// User-clicked branching and Visualize submission. No private ChatGPT API.
(function () {
  'use strict';
  const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const ID = new RegExp('^' + UUID + '$', 'i');
  const KEY = 'gpt2obsBranchIntents';
  const TTL = 120000;
  const PREFIX = 'gpt2obs-branch-';
  const PILL = '[data-inline-selection-pill][data-id="plugin:visualize"][data-symbol="ecosystemMention"]';
  const LABELS = {
    ko: { button: '분기해서 시각화', opening: '새 분기 여는 중…', ready: '분기 확인 중…', select: 'Visualize 선택 중…', sending: '시각화 요청 전송 중…', done: '시각화 요청 전송됨', failed: '시각화 자동화가 중단되었습니다. 단계: ', detail: '새 분기와 입력창을 확인하세요. 자동으로 다시 전송하지 않습니다.', title: '새 분기를 만들고 바로 위 답변의 시각화를 ChatGPT에 요청합니다.', prompt: '바로위 답변을 ' },
    en: { button: 'Branch & visualize', opening: 'Opening branch…', ready: 'Checking branch…', select: 'Selecting Visualize…', sending: 'Sending visualization request…', done: 'Visualization requested', failed: 'Visualization stopped. Stage: ', detail: 'Check the new branch and composer. The extension will not resend automatically.', title: 'Create a new branch and ask ChatGPT to visualize the preceding answer.', prompt: 'Visualize the answer immediately above. ' }
  };
  const STAGES = {
    ko: { handoff:'분기 연결', ready:'분기 확인', insert:'요청 입력', plugin:'Visualize 선택', verify:'전송 전 확인', send:'요청 전송', confirmation:'전송 결과 확인' },
    en: { handoff:'Connect branch', ready:'Check branch', insert:'Enter request', plugin:'Select Visualize', verify:'Check before sending', send:'Send request', confirmation:'Confirm submission' }
  };
  function failureReason(code, language) {
    const ko=language==='ko';
    if(code==='existing-draft' || code==='draft-changed')return ko?'입력창에 기존 글이 있거나 내용이 바뀌었습니다.':'The composer contains a draft or its contents changed.';
    if(code==='duplicate')return ko?'직전 분기 요청이 남아 있습니다. 열린 분기 탭을 확인하세요. 최대 2분 뒤 다시 시도할 수 있습니다.':'A recent branch request remains. Check its open tab. You can start another request within two minutes.';
    if(code==='user-input')return ko?'사용자 조작이 감지되어 멈췄습니다.':'Stopped because you interacted with the page.';
    if(/runtime|session|background/.test(code))return ko?'확장 프로그램 연결을 확인하고 ChatGPT 탭을 새로고침하세요.':'Check the extension and refresh the ChatGPT tab.';
    if(code==='timeout')return ko?'필요한 화면이 제한 시간 안에 준비되지 않았습니다.':'The required page state did not become ready in time.';
    if(code==='handoff')return ko?'시각화 요청을 새 분기에 연결하지 못했습니다.':'The visualization request could not be connected to the new branch.';
    if(/plugin|ambiguous-control|send-control/.test(code))return ko?'Visualize 또는 전송 버튼을 정확히 확인할 수 없습니다.':'Visualize or the Send control could not be identified safely.';
    return ko?'원본 답변, 새 분기 또는 입력창 상태를 확인할 수 없습니다.':'The original answer, branch or composer could not be verified.';
  }

  function parseConversationUrl(value) {
    if (typeof value !== 'string' || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(value)) return null;
    try {
      const url = new URL(value);
      const match = url.pathname.match(new RegExp('^/(?:g/g-p-[a-zA-Z0-9_-]+/)?c/(' + UUID + ')$','i'));
      if (!match || url.username || url.password || url.port) return null;
      return { conversationId: match[1], origin: url.origin, route: url.origin + url.pathname };
    } catch { return null; }
  }

  // A native branch is an unsaved WEB draft until its first prompt is sent.
  // This parser is destination-only; branch sources stay canonical.
  function parseBranchDestinationUrl(value) {
    const canonical = parseConversationUrl(value);
    if (canonical) return { ...canonical, temporary: false };
    if (typeof value !== 'string' || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(value)) return null;
    try {
      const url = new URL(value);
      const match = url.pathname.match(new RegExp('^/c/WEB:(' + UUID + ')$','i'));
      if (!match || url.username || url.password || url.port) return null;
      return { conversationId: 'WEB:' + match[1], origin: url.origin, route: url.origin + url.pathname, temporary: true };
    } catch { return null; }
  }

  // Serialized session updates survive worker suspension and bind an intent to
  // one extension-created tab. Consumed/claimed intents never replay on reload.
  function createBackground(api, version, now = Date.now, cryptoApi = globalThis.crypto) {
    let queue = Promise.resolve();
    async function dispatch(msg, sender) {
      if (typeof msg?.type !== 'string' || !msg.type.startsWith(PREFIX)) return { ok: false };
      if (sender?.id !== api.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || msg.version !== version) return { ok: false, stage: 'runtime' };
      if (!api.storage?.session) return { ok: false, stage: 'session' };
      const tabId = sender.tab.id;
      const stored = (await api.storage.session.get(KEY))[KEY];
      const jobs = (Array.isArray(stored) ? stored : []).filter(j => j.version === version && j.expires > now());
      const save = () => api.storage.session.set({ [KEY]: jobs });
      await save();
      const route = parseConversationUrl(sender.url);
      if (msg.type === PREFIX + 'start') {
        if (!route || msg.sourceUrl !== sender.url || !ID.test(msg.messageId || '') || !/^[a-f0-9]{64}$/.test(msg.fingerprint || '')) return { ok: false, stage: 'source' };
        if (jobs.length >= 20 || jobs.some(j => j.sourceTabId === tabId)) return { ok: false, stage: 'duplicate' };
        const source = await api.tabs.get(tabId);
        if (source?.url !== sender.url) return { ok: false, stage: 'source-changed' };
        // The installed Chrome can redact even our own extension page URL.
        // The page will identify itself through trusted runtime sender metadata.
        const launchUrl = api.runtime.getURL('branch-launch.html');
        const tab = await api.tabs.create({ url: launchUrl, openerTabId: tabId, active: true });
        if (!Number.isInteger(tab?.id)) return { ok: false, stage: 'open-tab' };
        const job = { token: cryptoApi.randomUUID(), version, sourceTabId: tabId, targetTabId: tab.id, sourceUrl: sender.url, sourceRoute: route.route, sourceId: route.conversationId, messageId: msg.messageId, fingerprint: msg.fingerprint, language: msg.language === 'ko' ? 'ko' : 'en', phase: 'launching', expires: now() + TTL };
        jobs.push(job);
        await save();
        return { ok: true, targetTabId: tab.id };
      }
      const job = jobs.find(j => j.targetTabId === tabId);
      if (msg.type === PREFIX + 'launch') {
        if (!job || job.phase !== 'launching' || sender.url !== api.runtime.getURL('branch-launch.html')) return { ok: false, stage: 'launch' };
        const source = await api.tabs.get(job.sourceTabId);
        if (source?.url !== job.sourceUrl || source.status !== 'complete' || (source.pendingUrl && source.pendingUrl !== job.sourceUrl) || job.expires <= now()) {
          job.phase = 'cancelled'; await save(); return { ok: false, stage: 'source-changed' };
        }
        // Consume before replying. Only the requesting document navigates itself;
        // the worker never redirects a tab that the user may have navigated away.
        job.phase = 'pending';
        await save();
        return { ok: true, branchUrl: new URL(job.sourceRoute).origin + '/branch/' + job.sourceId + '/' + job.messageId };
      }
      if (msg.type === PREFIX + 'claim') {
        if (!job || job.phase !== 'pending') return { ok: true };
        const route = parseBranchDestinationUrl(msg.currentUrl);
        const launchUrl = new URL(job.sourceRoute).origin + '/branch/' + job.sourceId + '/' + job.messageId;
        // Chrome sender.url can retain the document's original native /branch/
        // URL after ChatGPT replaces its history entry with an unsaved WEB URL.
        if (sender.url !== launchUrl && sender.url !== msg.currentUrl) return { ok: false, stage: 'document-changed', intent: true };
        if (msg.currentUrl !== launchUrl && (!route || route.origin !== new URL(job.sourceRoute).origin)) return { ok: false, stage: 'route-changed', intent: true };
        if (!route || route.conversationId === job.sourceId) return { ok: true, wait: true };
        if ((await api.tabs.get(tabId))?.url !== msg.currentUrl || job.expires <= now()) return { ok: false, stage: 'route-changed', intent: true };
        job.phase = 'claimed';
        job.targetRoute = route.route;
        await save();
        return { ok: true, job };
      }
      if (msg.type === PREFIX + 'authorize') {
        const route = parseBranchDestinationUrl(msg.currentUrl);
        if (!job || job.phase !== 'claimed' || job.token !== msg.token || !route || route.route !== job.targetRoute) return { ok: false, stage: 'authorization' };
        const launchUrl = new URL(job.sourceRoute).origin + '/branch/' + job.sourceId + '/' + job.messageId;
        if ((sender.url !== launchUrl && sender.url !== msg.currentUrl) || (await api.tabs.get(tabId))?.url !== msg.currentUrl || job.expires <= now()) return { ok: false, stage: 'route-changed' };
        job.phase = 'consumed';
        await save();
        return { ok: true };
      }
      return { ok: false, stage: 'message' };
    }
    return (msg, sender) => {
      const result = queue.then(() => dispatch(msg, sender));
      queue = result.catch(() => {});
      return result;
    };
  }

  async function runBranchLaunch(api, view, version) {
    const launchUrl = api.runtime.getURL('branch-launch.html');
    if (view.url() !== launchUrl) return { ok: false, stage: 'launch' };
    let active = true, timer;
    const dispose = view.watch(() => { active = false; });
    try {
      const result = await Promise.race([
        api.runtime.sendMessage({ type: PREFIX + 'launch', version }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('runtime-timeout')), 8000); })
      ]);
      if (!active || view.url() !== launchUrl) return { ok: false, stage: 'launch-changed' };
      if (!result?.ok) return { ok: false, stage: result?.stage === 'source-changed' ? 'source-changed' : 'launch' };
      if (typeof result.branchUrl !== 'string' || !new RegExp('^https://(chatgpt\\.com|chat\\.openai\\.com)/branch/' + UUID + '/' + UUID + '$','i').test(result.branchUrl)) return { ok: false, stage: 'launch-url' };
      // No asynchronous boundary between document proof and self-navigation.
      view.navigate(result.branchUrl);
      return { ok: true };
    } catch { return { ok: false, stage: 'runtime' }; }
    finally { clearTimeout(timer); dispose(); }
  }

  async function runVisualizeJob(job, ui, authorize) {
    await ui.ready(job);
    await ui.insert(job);
    await ui.select(job);
    await ui.verify(job);
    if ((await authorize(job))?.ok !== true) throw new Error('authorization');
    await ui.verify(job);
    await ui.send(job);
    await ui.confirm(job);
  }

  function cleanText(value) { return String(value || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim(); }
  function answerText(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('button, [data-gpt2obs-ui], .gpt2obs-btn, .gpt2obs-visualize-btn, style, svg, h4.sr-only[data-conversation-role]').forEach(n => n.remove());
    return cleanText(clone.textContent);
  }
  async function fingerprint(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  function visible(node) {
    return !!node?.isConnected && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  }
  function isVisualizeMenuItem(node) {
    if (!visible(node)) return false;
    const icon = node.querySelector('[data-testid="plugin-icon-wrapper"] img');
    if (!icon) return false;
    try {
      const url = new URL(icon.src, location.href);
      if (url.origin !== new URL(location.href).origin || url.pathname !== '/images/visualize/app-blocks-visualize.svg' || url.search || url.hash) return false;
    } catch { return false; }
    // The native menu may render a description beside its separate name span.
    return Array.from(node.querySelectorAll('span')).some(label => !label.children.length && cleanText(label.textContent) === 'Visualize');
  }
  function single(nodes, predicate = visible) { const matches = Array.from(nodes).filter(predicate); if (matches.length > 1) throw new Error('ambiguous-control'); return matches[0] || null; }
  function getEditor() { return single(document.querySelectorAll('#prompt-textarea[contenteditable="true"]')); }
  function getTurns() { return Array.from(document.querySelectorAll('[data-message-author-role]')).filter(n => !n.closest('[data-gpt2obs-ui]')); }
  function isGenerating() { return !!single(document.querySelectorAll('[data-testid="stop-button"]')); }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(read, timeout, check = () => {}) {
    const end = Date.now() + timeout;
    do { check(); const result = read(); if (result) return result; await pause(100); } while (Date.now() < end);
    throw new Error('timeout');
  }
  function createContent(version, language, saveActive, dom = {}) {
    const turns = dom.getTurns || getTurns;
    const role = dom.getRole || (node => node?.getAttribute('data-message-author-role'));
    const nativeId = dom.getMessageId || (node => node?.getAttribute('data-message-id'));
    const userText = dom.getUserText || (node => node.textContent);
    let busy = false;
    let resumed = false;
    const labels = () => LABELS[language() === 'ko' ? 'ko' : 'en'];
    let banner;
    function status(text) {
      if (!banner?.isConnected) {
        banner = document.createElement('div');
        banner.dataset.gpt2obsUi = 'branch-status';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'position:fixed;bottom:20px;right:20px;max-width:400px;padding:12px 16px;border:1px solid #888;border-radius:10px;background:#fff;color:#222;z-index:2147483647;font:14px/1.5 sans-serif;white-space:pre-line;box-shadow:0 4px 16px #0003';
        document.body.appendChild(banner);
      }
      if (banner.textContent !== text) banner.textContent = text;
    }
    async function message(type, payload = {}) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('runtime-timeout')), 8000);
        try {
          chrome.runtime.sendMessage({ type, version, ...payload }, result => {
            clearTimeout(timer);
            if (chrome.runtime.lastError || !result) reject(new Error('runtime'));
            else resolve(result);
          });
        } catch { clearTimeout(timer); reject(new Error('runtime')); }
      });
    }
    function sourceProof(node, sourceUrl, text, messageId) {
      if (location.href !== sourceUrl || !node.isConnected || role(node) !== 'assistant' || nativeId(node) !== messageId || answerText(node) !== text || isGenerating()) throw new Error('source-changed');
      const matches = turns().filter(n => nativeId(n) === messageId);
      if (matches.length !== 1 || matches[0] !== node) throw new Error('source-ambiguous');
    }
    async function start(node, button) {
      if (busy || saveActive()) return;
      banner?.remove();
      busy = true;
      button.disabled = true;
      button.textContent = labels().opening;
      try {
        const sourceUrl = location.href;
        const messageId = nativeId(node);
        const text = answerText(node);
        if (!parseConversationUrl(sourceUrl) || !ID.test(messageId || '') || !text || isGenerating()) throw new Error('source');
        const hash = await fingerprint(text);
        sourceProof(node, sourceUrl, text, messageId);
        const result = await message(PREFIX+'start', { sourceUrl, messageId, fingerprint: hash, language: language() });
        if (!result.ok) throw new Error(result.stage || 'open');
      } catch (error) { status(failureReason(error.message,language()) + '\n' + labels().detail); }
      finally { busy = false; button.disabled = false; button.textContent = labels().button; }
    }
    function attach(saveButton, node) {
      let button = saveButton.nextElementSibling;
      if (button?.classList.contains('gpt2obs-visualize-btn')) {
        if (button.dataset.gpt2obsVersion === version) { if (!button.disabled && button.textContent !== labels().button) button.textContent = labels().button; return; }
        button.remove();
      }
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'gpt2obs-visualize-btn';
      button.dataset.gpt2obsUi = 'branch';
      button.dataset.gpt2obsVersion = version;
      button.textContent = labels().button;
      button.title = labels().title;
      button.style.cssText = saveButton.style.cssText;
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void start(node, button); });
      saveButton.after(button);
    }
    function makeUi(job) {
      const l = LABELS[job.language];
      let interrupted = false;
      let editor, selected, frozenText, composerHtml, branchMarker;
      let stage = 'ready';
      const interrupt = event => { if (event.isTrusted) interrupted = true; };
      document.addEventListener('keydown', interrupt, true);
      document.addEventListener('pointerdown', interrupt, true);
      document.addEventListener('paste', interrupt, true);
      function check() {
        if (interrupted) throw new Error('user-input');
        if (Date.now() >= job.expires || parseBranchDestinationUrl(location.href)?.route !== job.targetRoute) throw new Error('branch-changed');
        if (!chrome.runtime?.id) throw new Error('runtime');
        if (branchMarker && (!branchMarker.isConnected || parseConversationUrl(branchMarker.href)?.route !== job.sourceRoute)) throw new Error('branch-origin');
        if (selected && (!selected.isConnected || turns().at(-1) !== selected || nativeId(selected) !== job.messageId || answerText(selected) !== frozenText)) throw new Error('answer-changed');
        if (editor && (getEditor() !== editor || !editor.isConnected)) throw new Error('composer-changed');
      }
      function verifyComposer() {
        check();
        if (isGenerating() || single(editor.querySelectorAll(PILL)) === null) throw new Error('plugin');
        if (editor.querySelectorAll('[data-inline-selection-pill]').length !== 1 || cleanText(editor.textContent) !== cleanText(l.prompt+'Visualize')) throw new Error('draft-changed');
        const submit = single(document.querySelectorAll('#composer-submit-button[data-testid="send-button"]'));
        if (!submit || submit.disabled || submit.getAttribute('aria-disabled') === 'true') throw new Error('send-control');
        return submit;
      }
      return {
        async ready() {
          status(l.ready);
          await waitFor(() => {
            const candidates=turns(); const last=candidates.at(-1);
            if (!last || nativeId(last) !== job.messageId || role(last) !== 'assistant') return false;
            const matches=candidates.filter(n=>nativeId(n)===job.messageId);
            if(matches.length!==1) throw new Error('answer-ambiguous');
            const marker=single(document.querySelectorAll('a[href]'),a=>visible(a) && parseConversationUrl(a.href)?.route===job.sourceRoute && /브랜치됨|branched from/i.test(a.parentElement?.textContent || '') && !!(last.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING));
            if(!marker) return false;
            const candidate=getEditor();
            if(!candidate || isGenerating()) return false;
            if(cleanText(candidate.textContent) || candidate.querySelector('[data-inline-selection-pill], img')) throw new Error('existing-draft');
            branchMarker=marker; selected=last; editor=candidate; frozenText=answerText(last); return true;
          },45000,check);
          if (await fingerprint(frozenText) !== job.fingerprint) throw new Error('answer-mismatch');
          check();
        },
        async insert() {
          stage='insert'; check(); status(l.select);
          if(cleanText(editor.textContent)) throw new Error('existing-draft');
          editor.focus();
          const selection=window.getSelection(); const range=document.createRange();
          range.selectNodeContents(editor); selection.removeAllRanges(); selection.addRange(range);
          if (!document.execCommand('insertText',false,l.prompt+'@Visualize')) throw new Error('composer-input');
        },
        async select() {
          stage='plugin'; let clicked=false;
          await waitFor(() => {
            if (single(editor.querySelectorAll(PILL))) return true;
            if (cleanText(editor.textContent) !== cleanText(l.prompt+'@Visualize')) throw new Error('draft-changed');
            const item=single(document.querySelectorAll('div.__menu-item[tabindex], [role="option"], [role="menuitem"]'), isVisualizeMenuItem);
            if(item && !clicked) { clicked=true; item.click(); }
            return false;
          },10000,check);
        },
        async verify() { stage='verify'; verifyComposer(); composerHtml=editor.innerHTML; },
        async send() {
          stage='send'; status(l.sending);
          const submit=verifyComposer();
          if(editor.innerHTML!==composerHtml) throw new Error('draft-changed');
          // No asynchronous boundary between final proof and the one click.
          submit.click();
        },
        async confirm() {
          stage='confirmation';
          await waitFor(() => turns().some(n=>role(n)==='user' && n.compareDocumentPosition(selected)&Node.DOCUMENT_POSITION_PRECEDING && cleanText(userText(n))===cleanText(l.prompt+'Visualize')),15000,()=>{
            const before = parseBranchDestinationUrl(job.targetRoute), current = parseBranchDestinationUrl(location.href);
            const sameRoute = current?.route === job.targetRoute;
            const savedDraft = before?.temporary && current && !current.temporary && current.origin === before.origin && current.conversationId !== job.sourceId;
            if (interrupted || (!sameRoute && !savedDraft)) throw new Error('branch-changed');
            if (!selected.isConnected || nativeId(selected) !== job.messageId || answerText(selected) !== frozenText || !branchMarker.isConnected || parseConversationUrl(branchMarker.href)?.route !== job.sourceRoute) throw new Error('branch-origin');
          });
          status(l.done);
        },
        close(error) {
          document.removeEventListener('keydown',interrupt,true);
          document.removeEventListener('pointerdown',interrupt,true);
          document.removeEventListener('paste',interrupt,true);
          if(error) status(l.failed+STAGES[job.language][stage]+'\n'+failureReason(error.message,job.language)+'\n'+l.detail);
        }
      };
    }
    async function resume() {
      if(resumed) return; resumed=true;
      const end=Date.now()+TTL;
      let pending=false;
      try {
        let result;
        do {
          result=await message(PREFIX+'claim',{currentUrl:location.href});
          if(result.wait || result.intent) { pending=true; status(labels().ready); }
          if(!result.wait) break;
          await pause(250);
        } while(Date.now()<end);
        if(!result.job) {
          if(pending) throw new Error(result.stage || (result.wait?'timeout':'handoff'));
          return;
        }
        busy=true;
        const ui=makeUi(result.job);
        try { await runVisualizeJob(result.job,ui,job=>message(PREFIX+'authorize',{token:job.token,currentUrl:location.href})); ui.close(); }
        catch(error) { ui.close(error); }
        finally { busy=false; }
      } catch(error) {
        // Normal pages stay quiet; an acknowledged attempt must show its failure.
        if(pending) status(labels().failed+STAGES[language()==='ko'?'ko':'en'].handoff+'\n'+failureReason(error.message,language())+'\n'+labels().detail);
      }
    }
    function updateLabels() {
      document.querySelectorAll('.gpt2obs-visualize-btn').forEach(button=>{
        if(button.dataset.gpt2obsVersion===version && !button.disabled) {
          if(button.textContent!==labels().button)button.textContent=labels().button;
          button.title=labels().title;
        }
      });
    }
    return { attach, resume, updateLabels, isBusy:()=>busy };
  }
  const exported={parseConversationUrl,parseBranchDestinationUrl,createBackground,runBranchLaunch,runVisualizeJob,createContent};
  if(typeof module==='object' && module.exports) module.exports=exported;
  else globalThis.GPT2OBSBranchVisualize=exported;
})();
