#!/usr/bin/env node
const assert = require('assert');
const { webcrypto } = require('crypto');
const { parseConversationUrl, parseBranchDestinationUrl, createBackground, runVisualizeJob, runBranchLaunch } = require('../branch-visualize.js');

const id = '11111111-2222-4333-8444-555555555555';
const target = 'aaaaaaaa-2222-4333-8444-555555555555';
const mid = 'bbbbbbbb-2222-4333-8444-555555555555';
const origin = 'https://chatgpt.com';
const sourceUrl = origin + '/c/' + id;
const targetUrl = origin + '/c/' + target;
const version = 'test';
const claimMessage=(currentUrl=targetUrl)=>({type:'gpt2obs-branch-claim',version,currentUrl});
function fixture() {
  const data = {};
  const tabs = new Map([[1, { id: 1, url: sourceUrl, status: 'complete' }]]);
  const effects = [];
  let time = 1000;
  const api = {
    runtime: { id: 'synthetic-extension', getURL: path => 'chrome-extension://synthetic-extension/' + path },
    storage: { session: {
      async get(key) { return { [key]: structuredClone(data[key]) }; },
      async set(obj) { Object.assign(data, structuredClone(obj)); }
    } },
    tabs: {
      async get(n) {
        const tab = tabs.get(n);
        if (!tab) return tab;
        // Observed Chrome 152 omits URL fields outside granted ChatGPT hosts,
        // including the extension's own staging page.
        const canRead = url => /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url || '');
        const visible = { ...tab };
        if (!canRead(visible.url)) delete visible.url;
        if (!canRead(visible.pendingUrl)) delete visible.pendingUrl;
        return visible;
      },
      async create(opts) { effects.push(['create', opts]); const tab = { id: tabs.size + 1, status: 'complete', ...opts }; tabs.set(tab.id, tab); return tab; },
      async update(n, opts) { effects.push(['update', n, opts]); Object.assign(tabs.get(n), opts); return tabs.get(n); }
    }
  };
  const handler = createBackground(api, version, () => time, webcrypto);
  const sender = (tabId=1, url=tabs.get(tabId)?.url) => ({ id: api.runtime.id, tab: tabs.get(tabId), frameId: 0, url });
  const start = { type: 'gpt2obs-branch-start', version, sourceUrl, messageId: mid, fingerprint: 'a'.repeat(64), language: 'ko' };
  return { handler, api, start, sender, tabs, effects, data, expire: () => { time += 120001; } };
}

(async () => {
  assert.equal(parseConversationUrl(sourceUrl)?.conversationId, id);
  assert.equal(parseBranchDestinationUrl(origin+'/c/WEB:'+target)?.temporary,true);
  for(const invalid of [origin+'/c/WEB:invalid','http://chatgpt.com/c/WEB:'+target,'https://chatgpt.com:443/c/WEB:'+target,'https://user@chatgpt.com/c/WEB:'+target,'https://chatgpt.com.evil.example/c/WEB:'+target,origin+'/share/WEB:'+target]) {
    assert.equal(parseBranchDestinationUrl(invalid),null,'temporary destination parser must preserve strict host, scheme, authority and ID validation');
  }
  for (const url of [sourceUrl.replace('chatgpt.com','chatgpt.com.evil.test'), sourceUrl.replace('https:', 'http:'), sourceUrl.replace('chatgpt.com', 'user@chatgpt.com'), sourceUrl.replace('chatgpt.com', 'chatgpt.com:443'), origin+'/c/WEB:'+id, origin+'/share/'+id]) {
    assert.equal(parseConversationUrl(url), null, 'non-canonical routes must not authorize branch creation');
  }
  const f=fixture();
  const result=await f.handler(f.start,f.sender());
  assert.equal(result.ok,true,'opening must succeed even when Chrome redacts the own staging tab URL');
  assert.equal(f.effects.length,1,'worker creates a staging tab but must never redirect a potentially navigated tab');
  const launchMessage={type:'gpt2obs-branch-launch',version};
  const launch=await f.handler(launchMessage,f.sender(2));
  assert.equal(launch.branchUrl,origin+'/branch/'+id+'/'+mid);
  assert.equal((await f.handler(launchMessage,f.sender(2))).ok,false,'launch grant is consumed once before replying');
  assert.equal((await f.handler(f.start,f.sender())).ok,false,'repeated clicks must not create another branch');
  assert.equal((await f.handler(claimMessage(),f.sender())).job,undefined,'source must not receive destination intent');
  f.tabs.get(2).url=targetUrl;
  const claim=await f.handler(claimMessage(),f.sender(2));
  assert.equal(claim.job.messageId,mid);
  assert.equal((await f.handler(claimMessage(),f.sender(2))).job,undefined,'a reload must not replay a claimed job');
  const authorize={type:'gpt2obs-branch-authorize',version,token:claim.job.token,currentUrl:targetUrl};
  assert.equal((await f.handler(authorize,f.sender())).ok,false,'other tabs cannot authorize sending');
  assert.equal((await f.handler(authorize,f.sender(2))).ok,true);
  assert.equal((await f.handler(authorize,f.sender(2))).ok,false,'send authorization must be consumed once');
  const draft=fixture(); await draft.handler(draft.start,draft.sender());
  await draft.handler(launchMessage,draft.sender(2));
  draft.tabs.get(2).url=origin+'/c/WEB:'+target;
  const draftClaim=await draft.handler(claimMessage(draft.tabs.get(2).url),draft.sender(2));
  assert.equal(draftClaim.job?.messageId,mid,'native WEB branch must claim before its first prompt creates a canonical URL');
  assert.equal((await draft.handler({...authorize,token:draftClaim.job.token,currentUrl:draft.tabs.get(2).url},draft.sender(2))).ok,true,'the exact bound WEB route can authorize one send');
  assert.equal((await draft.handler({...authorize,token:draftClaim.job.token,currentUrl:draft.tabs.get(2).url},draft.sender(2))).ok,false);
  // The SPA has replaced its visible URL while runtime sender metadata still
  // identifies the original document that loaded the native branch route.
  const spa=fixture();await spa.handler(spa.start,spa.sender());
  const spaLaunch=await spa.handler(launchMessage,spa.sender(2));
  spa.tabs.get(2).url=spaLaunch.branchUrl;
  assert.equal((await spa.handler(claimMessage(spaLaunch.branchUrl),spa.sender(2))).wait,true,'the exact initial native branch route may wait for hydration');
  const spaUrl=origin+'/c/WEB:'+target;spa.tabs.get(2).url=spaUrl;
  const spaSender=spa.sender(2,spaLaunch.branchUrl);
  const spaClaim=await spa.handler({type:'gpt2obs-branch-claim',version,currentUrl:spaUrl},spaSender);
  assert.equal(spaClaim.job?.messageId,mid,'a ready native branch must not wait forever on the original sender document URL');
  const spaAuthorize={...authorize,token:spaClaim.job.token,currentUrl:spaUrl};
  assert.equal((await spa.handler(spaAuthorize,{...spaSender,url:sourceUrl})).ok,false,'another document must not borrow the original branch document proof');
  assert.equal((await spa.handler({...spaAuthorize,currentUrl:targetUrl},spaSender)).ok,false,'a forged current URL must not replace the frozen destination');
  spa.tabs.get(2).url=targetUrl;
  assert.equal((await spa.handler(spaAuthorize,spaSender)).ok,false,'browser URL drift must reject an otherwise valid original sender URL');
  spa.tabs.get(2).url=spaUrl;
  assert.equal((await spa.handler(spaAuthorize,spaSender)).ok,true,'the original document and exact current native draft can authorize once');
  assert.equal((await spa.handler(spaAuthorize,spaSender)).ok,false);
  for(const mode of ['wrong-document','payload-url','other-origin','missing-url']) {
    const invalid=fixture();await invalid.handler(invalid.start,invalid.sender());
    const initial=await invalid.handler(launchMessage,invalid.sender(2));invalid.tabs.get(2).url=spaUrl;
    const metadata=invalid.sender(2,mode==='wrong-document'?sourceUrl:initial.branchUrl);
    const currentUrl=mode==='payload-url'?targetUrl:mode==='other-origin'?spaUrl.replace('chatgpt.com','chat.openai.com'):mode==='missing-url'?undefined:spaUrl;
    const outcome=await invalid.handler({...claimMessage(),currentUrl},metadata);
    assert.equal(outcome.ok,false,mode+' cannot claim an attempt');
    assert.equal(outcome.intent,true,'a known attempt failure must be reportable');
    assert.equal(invalid.data.gpt2obsBranchIntents[0].phase,'pending','a rejected claim must never consume send authorization');
  }
  const changedDraft=fixture();await changedDraft.handler(changedDraft.start,changedDraft.sender());await changedDraft.handler(launchMessage,changedDraft.sender(2));changedDraft.tabs.get(2).url=origin+'/c/WEB:'+target;
  const beforeCommit=await changedDraft.handler(claimMessage(changedDraft.tabs.get(2).url),changedDraft.sender(2));changedDraft.tabs.get(2).url=targetUrl;
  assert.equal((await changedDraft.handler({...authorize,token:beforeCommit.job.token},changedDraft.sender(2))).ok,false,'a route transition before sending must not silently rebind authorization');
  const draftSource=fixture();draftSource.tabs.get(1).url=origin+'/c/WEB:'+id;
  assert.equal((await draftSource.handler({...draftSource.start,sourceUrl:draftSource.tabs.get(1).url},draftSource.sender())).ok,false,'WEB routes must never become branch sources');
  const expired=fixture(); await expired.handler(expired.start,expired.sender()); expired.expire();
  assert.equal((await expired.handler(launchMessage,expired.sender(2))).ok,false,'expired intent must not grant navigation');
  expired.tabs.get(2).url=targetUrl;
  assert.equal((await expired.handler(claimMessage(),expired.sender(2))).job,undefined);
  for(const change of [s=>({...s,frameId:1}),s=>({...s,id:'foreign'}),s=>({...s,url:targetUrl})]) {
    const g=fixture(); assert.equal((await g.handler(g.start,change(g.sender()))).ok,false); assert.equal(g.effects.length,0);
  }
  const stale=fixture(); assert.equal((await stale.handler({...stale.start,version:'old'},stale.sender())).ok,false); assert.equal(stale.effects.length,0);
  const concurrent=fixture(); const results=await Promise.all([concurrent.handler(concurrent.start,concurrent.sender()),concurrent.handler(concurrent.start,concurrent.sender())]);
  assert.equal(results.filter(r=>r.ok).length,1,'parallel requests share one source lock');
  const fast=fixture();const createFast=fast.api.tabs.create;let fastLaunch;
  fast.api.tabs.create=async opts=>{const tab=await createFast(opts);fastLaunch=fast.handler(launchMessage,fast.sender(tab.id));return tab;};
  await fast.handler(fast.start,fast.sender());
  assert.equal((await fastLaunch).ok,true,'a fast staging page waits behind the serialized intent write');
  const restart=fixture();await restart.handler(restart.start,restart.sender());
  const restarted=createBackground(restart.api,version,()=>1000,webcrypto);
  assert.equal((await restarted(launchMessage,restart.sender(2))).ok,true,'launching intent survives service worker replacement');
  restart.tabs.get(2).url=targetUrl;
  const resumed=await restarted(claimMessage(),restart.sender(2));
  assert.equal(resumed.job.messageId,mid,'pending intent survives service worker replacement');
  restart.tabs.get(2).url=origin+'/c/'+mid;
  assert.equal((await restarted({...authorize,token:resumed.job.token},restart.sender(2))).ok,false,'navigation after claim must block send');
  const persisted=createBackground(f.api,version,()=>1000,webcrypto);
  assert.equal((await persisted(claimMessage(),f.sender(2))).job,undefined,'worker restart must not replay consumed intent');
  for(const change of [s=>({...s,frameId:1}),s=>({...s,id:'foreign'}),s=>({...s,url:targetUrl}),s=>({...s,tab:{id:99}}),s=>({...s,url:s.url+'?injected=1'})]) {
    const g=fixture(); await g.handler(g.start,g.sender());
    assert.equal((await g.handler(launchMessage,change(g.sender(2)))).ok,false,'only the exact own top-frame page in the recorded destination may launch');
  }
  const beforeLaunch=fixture();await beforeLaunch.handler(beforeLaunch.start,beforeLaunch.sender());beforeLaunch.tabs.get(2).url=targetUrl;
  assert.equal((await beforeLaunch.handler(claimMessage(),beforeLaunch.sender(2))).job,undefined,'canonical navigation alone must not bypass launcher authorization');
  for(const mutate of [tab=>{tab.url=targetUrl;},tab=>{tab.pendingUrl=targetUrl;},tab=>{tab.status='loading';tab.pendingUrl='https://ungranted.example/';}]) {
    const changed=fixture();await changed.handler(changed.start,changed.sender());mutate(changed.tabs.get(1));
    assert.equal((await changed.handler(launchMessage,changed.sender(2))).ok,false,'source navigation during staging must stop launch');
    assert.equal(changed.effects.filter(e=>e[0]==='update').length,0);
  }
  function launchFixture() {
    let current='chrome-extension://synthetic-extension/branch-launch.html', stop;
    const calls=[];
    const view={url:()=>current,watch:fn=>{stop=fn;return()=>calls.push('dispose');},navigate:url=>calls.push(url)};
    const api={runtime:{getURL:path=>'chrome-extension://synthetic-extension/'+path,sendMessage:async()=>({ok:true,branchUrl:origin+'/branch/'+id+'/'+mid})}};
    return {view,api,calls,stop:()=>stop(),change:()=>{current='https://ungranted.example/';}};
  }
  const opened=launchFixture();assert.equal((await runBranchLaunch(opened.api,opened.view,version)).ok,true);
  assert.deepEqual(opened.calls,[origin+'/branch/'+id+'/'+mid,'dispose']);
  for(const mode of ['pagehide','route','denied','invalid-url','transport']) {
    const stopped=launchFixture();const send=stopped.api.runtime.sendMessage;
    stopped.api.runtime.sendMessage=async()=>{if(mode==='pagehide')stopped.stop();if(mode==='route')stopped.change();if(mode==='denied')return {ok:false,stage:'launch'};if(mode==='invalid-url')return {ok:true,branchUrl:sourceUrl};if(mode==='transport')throw Error('private transport detail');return send();};
    const outcome=await runBranchLaunch(stopped.api,stopped.view,version);
    assert.equal(outcome.ok,false,mode+' must stop navigation');
    assert.deepEqual(stopped.calls,['dispose'],'an old document must not navigate after interruption or a rejected grant');
    assert(!JSON.stringify(outcome).includes('private transport detail'));
  }

  function uiFixture(failAt) {
    const calls=[];
    const ui={};
    for(const step of ['ready','insert','select','verify','send','confirm']) ui[step]=async()=>{calls.push(step);if(failAt===step)throw Error(step);};
    return {ui,calls};
  }
  const success=uiFixture();
  await runVisualizeJob({},success.ui,async()=>{success.calls.push('authorize');return {ok:true};});
  assert.deepEqual(success.calls,['ready','insert','select','verify','authorize','verify','send','confirm']);
  for(const step of ['ready','insert','select','verify']) {
    const failed=uiFixture(step);
    await assert.rejects(runVisualizeJob({},failed.ui,async()=>({ok:true})));
    assert(!failed.calls.includes('send'),step+' failure must not send a prompt');
  }
  const denied=uiFixture(); await assert.rejects(runVisualizeJob({},denied.ui,async()=>({ok:false})));
  assert(!denied.calls.includes('send'));
  const uncertain=uiFixture('confirm'); await assert.rejects(runVisualizeJob({},uncertain.ui,async()=>({ok:true})));
  assert.equal(uncertain.calls.filter(x=>x==='send').length,1,'unconfirmed sends must never retry');
  console.log('branch Visualize self-test ok');
})().catch(error=>{console.error(error);process.exitCode=1;});
