// Runs only in the extension-owned staging document; no private API or tab URL read.
(async () => {
  const result = await globalThis.GPT2OBSBranchVisualize.runBranchLaunch(chrome, {
    url: () => location.href,
    navigate: url => location.replace(url),
    watch(stop) {
      const interrupt = event => { if (event.isTrusted) stop(); };
      window.addEventListener('pagehide', stop);
      for (const type of ['keydown', 'pointerdown', 'paste']) document.addEventListener(type, interrupt, true);
      return () => {
        window.removeEventListener('pagehide', stop);
        for (const type of ['keydown', 'pointerdown', 'paste']) document.removeEventListener(type, interrupt, true);
      };
    }
  }, chrome.runtime.getManifest().version);
  if (!result.ok) document.getElementById('launch-status').textContent =
    '분기 열기가 중단되었습니다. 원래 ChatGPT 탭을 확인하세요. / Branch opening stopped. Code: ' + result.stage;
})();
