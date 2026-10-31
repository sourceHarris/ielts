// Production UI + real IndexedDB regression checks, in a disposable browser context.
// Run a production preview on 5178 and a test Chrome with remote debugging on 9229.
// Overrides: IELTS_PREVIEW_URL, IELTS_BROWSER_PORT. No personal browser data is used.
const assert = require('node:assert/strict')

;(async () => {
  const { build } = await import('vite')
  const { cityShadeTest } = await import('../src/reading/miniTest.ts')
  const bundle = await build({ configFile: false, logLevel: 'silent', build: {
    write: false, minify: false,
    lib: { entry: 'src/reading/attemptHistory.ts', formats: ['es'] },
  } })
  const output = Array.isArray(bundle) ? bundle[0] : bundle
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(output.output[0].code).toString('base64')
  const version = await fetch(`http://127.0.0.1:${process.env.IELTS_BROWSER_PORT || 9229}/json/version`).then(r => r.json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
  const pending = new Map()
  const errors = []
  let id = 0, sessionId, context
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  })
  const call = (method, params = {}, browser = false) => new Promise((resolve, reject) => {
    const next = ++id
    const timer = setTimeout(() => { pending.delete(next); reject(Error(`CDP timeout: ${method}`)) }, 15_000)
    pending.set(next, message => {
      clearTimeout(timer)
      if (message.error) reject(message.error)
      else resolve(message.result)
    })
    ws.send(JSON.stringify({ id: next, method, params, ...(!browser && sessionId ? { sessionId } : {}) }))
  })
  let checks = 0
  const check = (condition, label) => { assert.ok(condition, label); checks++; console.log(`PASS ${label}`) }
  const wait = (ms = 140) => new Promise(resolve => setTimeout(resolve, ms))
  const ev = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const until = async expression => {
    for (let i = 0; i < 60; i++) { if (await ev(expression)) return; await wait(100) }
    throw Error(`UI condition timed out: ${expression}`)
  }
  const route = async page => { await ev(`location.hash=${JSON.stringify('#/' + page)}`); await wait() }
  const click = async text => {
    await ev(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw Error('Button missing: ' + ${JSON.stringify(text)}); button.click() })()`)
    await wait()
  }
  const saved = () => until(`document.body.textContent.includes('Attempt saved to history.')`)
  const count = () => ev(`__api.readReadingAttempts().then(r => r.attempts.length)`)
  const key = 'practice-room-reading-mini-draft-v1'
  const legacyKey = 'practice-room-reading-demo-v1'
  try {
    context = await call('Target.createBrowserContext', {}, true)
    const target = await call('Target.createTarget', { url: 'about:blank', browserContextId: context.browserContextId }, true)
    sessionId = (await call('Target.attachToTarget', { targetId: target.targetId, flatten: true }, true)).sessionId
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__historyMode = ''; window.__confirm = true; window.confirm = () => window.__confirm;
      const factory = window.indexedDB;
      Object.defineProperty(window, 'indexedDB', { configurable: true, get() {
        if (window.__historyMode === 'open') throw Error('Simulated blocked IndexedDB'); return factory;
      }});
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function(...args) {
        if (window.__historyMode === 'transaction') throw Error('Simulated failed transaction');
        const tx = transaction.apply(this, args);
        if (window.__historyMode === 'abort' && args[1] === 'readwrite') queueMicrotask(() => tx.abort());
        return tx;
      };
    ` })
    const base = process.env.IELTS_PREVIEW_URL || 'http://127.0.0.1:5178'
    await call('Page.navigate', { url: base + '/#/practice' })
    await until(`!!document.querySelector('.app-frame')`)
    const installApi = () => ev(`(async () => {
      window.__api = await import(${JSON.stringify(moduleUrl)});
      window.__fixture = ${JSON.stringify(cityShadeTest)};
      window.__readRaw = () => new Promise((resolve, reject) => {
        const request = indexedDB.open(__api.HISTORY_DATABASE, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; const tx = db.transaction(__api.HISTORY_STORE);
          const read = tx.objectStore(__api.HISTORY_STORE).getAll();
          tx.oncomplete = () => { db.close(); resolve(read.result) }; tx.onabort = () => { db.close(); reject(tx.error) };
        };
      });
      window.__putRaw = value => new Promise((resolve, reject) => {
        const request = indexedDB.open(__api.HISTORY_DATABASE, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; const tx = db.transaction(__api.HISTORY_STORE, 'readwrite');
          tx.objectStore(__api.HISTORY_STORE).put(value);
          tx.oncomplete = () => { db.close(); resolve(true) }; tx.onabort = () => { db.close(); reject(tx.error) };
        };
      });
      return true;
    })()`)
    await installApi()

    check(await count() === 0, 'empty real IndexedDB history loads successfully')
    await ev(`(async () => { const start = Date.now()-10000; window.__sample = await __api.createReadingAttempt(__fixture,
      {startedAt:start,answers:{'city-shade-q1':'TRUE'},submitted:true},'submitted',start+5000) })()`)
    check(await ev(`__api.saveReadingAttempt(__sample).then(r => r.kind === 'ok')`), 'real IndexedDB commits a complete attempt')
    check(await ev(`__api.saveReadingAttempt(__sample).then(r => r.kind === 'ok')`) && await count() === 1,
      'duplicate submission is idempotent')
    check(await ev(`(async () => { const retry = await __api.createReadingAttempt(__fixture,
      {startedAt:__sample.startedAt,answers:__sample.answers,submitted:true},'submitted',__sample.startedAt+6000);
      const result = await __api.saveReadingAttempt(retry); return result.kind === 'ok' && result.attempt.completedAt === __sample.completedAt })()`),
      'retry retains the original submission time')
    check(await ev(`(async () => { const different = await __api.createReadingAttempt(__fixture,
      {startedAt:__sample.startedAt,answers:{'city-shade-q1':'FALSE'},submitted:true},'submitted',__sample.startedAt+6000);
      return (await __api.saveReadingAttempt(different)).kind === 'conflict' })()`) && await count() === 1,
      'conflicting submissions never overwrite the original')
    check(await ev(`(async () => { const start=Date.now()-5000;
      const attempts=await Promise.all(['TRUE','FALSE'].map(answer=>__api.createReadingAttempt(__fixture,
        {startedAt:start,answers:{'city-shade-q1':answer},submitted:true},'submitted',start+1000)));
      const results=await Promise.all(attempts.map(__api.saveReadingAttempt));
      return results.filter(r=>r.kind==='ok').length===1 && results.filter(r=>r.kind==='conflict').length===1 })()`),
      'concurrent write transactions allow one result per session')
    await ev(`__putRaw({...__sample,integrity:'damaged'})`)
    check(await ev(`__api.readReadingAttempts().then(r=>r.kind==='ok' && r.invalidCount===1)`),
      'corrupted records are reported and excluded from review')
    check(await ev(`__api.saveReadingAttempt(__sample).then(r=>r.kind==='conflict')`) &&
      await ev(`__readRaw().then(rows=>rows.some(r=>r.id===__sample.id && r.integrity==='damaged'))`),
      'saving cannot repair or overwrite a corrupted record silently')
    await ev(`window.__historyMode='open'`)
    check(await ev(`__api.readReadingAttempts().then(r=>r.kind==='unavailable')`), 'blocked IndexedDB access is explicit')
    await ev(`window.__historyMode='transaction'`)
    check(await ev(`__api.readReadingAttempts().then(r=>r.kind==='unavailable')`), 'transaction creation failure is explicit')
    await ev(`window.__historyMode='';`)

    // Start a fresh disposable context for the production UI journeys.
    await call('Target.disposeBrowserContext', { browserContextId: context.browserContextId }, true)
    context = await call('Target.createBrowserContext', {}, true)
    const ui = await call('Target.createTarget', { url: base + '/#/practice', browserContextId: context.browserContextId }, true)
    sessionId = (await call('Target.attachToTarget', { targetId: ui.targetId, flatten: true }, true)).sessionId
    await call('Page.enable'); await call('Runtime.enable')
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__confirm = true; window.confirm=()=>window.__confirm; window.__historyMode='';
      const transaction=IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction=function(...args){const tx=transaction.apply(this,args);
        if(window.__historyMode==='abort' && args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx};
    ` })
    await call('Page.reload')
    await until(`!!document.querySelector('.app-frame')`)
    await installApi()
    const legacy = JSON.stringify([{ completedAt: '2026-10-01T10:00:00.000Z', correct: 2, total: 3, kind: 'reading-demo' }])
    await ev(`localStorage.setItem('${legacyKey}',${JSON.stringify(legacy)})`)
    await call('Page.reload'); await until(`!!document.querySelector('.app-frame')`); await installApi()
    await route('reading-mini'); await click('Start test')
    await ev(`document.querySelector('.reading-answer-option input').click()`); await click('Submit practice'); await saved()
    check(await count() === 1, 'manual submission archives exactly once')
    const first = await ev(`__api.readReadingAttempts().then(r=>r.attempts[0])`)
    await click('New attempt')
    check(await ev(`document.querySelectorAll('.reading-answer-option input:checked').length===0`) && await count() === 1,
      'restart clears the working draft and preserves the completed attempt')
    await ev(`document.querySelectorAll('.reading-answer-option input')[1].click()`); await click('Submit practice'); await saved()
    check(await count() === 2, 'a new session creates a separate historical record')
    await route('progress'); await until(`document.querySelectorAll('.history-row').length===3`)
    check(await ev(`document.querySelectorAll('.history-row a').length===2 && document.body.textContent.includes('Score summary only')`),
      'Progress combines archived attempts with honest legacy summaries')
    check(await ev(`localStorage.getItem('${legacyKey}')===${JSON.stringify(legacy)}`), 'new attempts preserve legacy progress bytes')
    const currentDraft = await ev(`localStorage.getItem('${key}')`)
    await route('reading-review/' + encodeURIComponent(first.id))
    await until(`document.body.textContent.includes('historical attempt is read only')`)
    check(await ev(`document.querySelector('.reading-answer-option input:checked')?.value==='TRUE' && [...document.querySelectorAll('fieldset')].every(f=>f.disabled)`),
      'historical review restores the original answers with disabled controls')
    check(await ev(`localStorage.getItem('${key}')===${JSON.stringify(currentDraft)}`), 'historical review never reads back into or overwrites the current draft')
    await call('Page.reload'); await until(`document.body.textContent.includes('historical attempt is read only')`); await installApi()
    check(await count() === 2 && await ev(`localStorage.getItem('${key}')===${JSON.stringify(currentDraft)}`),
      'historical review survives refresh without duplicate results or draft writes')

    const revisedId = await ev(`(async()=>{const t=structuredClone(__fixture);t.title='Archived edition title';
      t.passages[0].paragraphs[0]='A historical passage absent from the current library.';
      t.passages[0].questions[0].explanation='Explanation from the saved edition.';
      const start=Date.now()-2000;const a=await __api.createReadingAttempt(t,{startedAt:start,answers:{'city-shade-q1':'TRUE'},submitted:true},'submitted',start+1000);
      await __api.saveReadingAttempt(a);return a.id})()`)
    await route('reading-review/' + encodeURIComponent(revisedId)); await until(`document.body.textContent.includes('Explanation from the saved edition.')`)
    check(await ev(`document.body.textContent.includes('A historical passage absent from the current library.')`),
      'review uses the saved content and explanation instead of the current test fixture')

    const beforeTimer = await count()
    await route('practice')
    await ev(`localStorage.setItem('${key}',JSON.stringify({startedAt:Date.now()-15*60000+1400,answers:{'city-shade-q1':'TRUE'},submitted:false}))`)
    await route('reading-mini'); await click('Resume test'); await saved()
    check(await count() === beforeTimer + 1 && await ev(`__api.readReadingAttempts().then(r=>r.attempts.at(-1).completionReason==='timer-expired')`),
      'live timer expiry archives one result with its completion reason')
    await wait(1300)
    check(await count() === beforeTimer + 1, 'timer ticks do not duplicate historical submissions')

    await route('reading-headings'); await click('Start test')
    await ev(`document.querySelector('input[name="reading-question-night-sky-q1"][value="iv"]').click()`)
    await ev(`document.querySelector('input[name="reading-question-night-sky-q2"][value="iv"]').click()`)
    check(await ev(`!document.querySelector('input[name="reading-question-night-sky-q1"]:checked') && document.querySelector('input[name="reading-question-night-sky-q2"]:checked')?.value==='iv'`),
      'Matching Headings uniqueness remains unchanged')
    await call('Page.reload'); await until(`!!document.querySelector('.session-panel')`); await click('Resume test'); await installApi()
    check(await ev(`document.querySelector('input[name="reading-question-night-sky-q2"]:checked')?.value==='iv'`), 'Matching Headings restores answers after refresh')
    await click('Submit practice'); await saved()
    check(await ev(`__api.readReadingAttempts().then(r=>r.attempts.at(-1).testId==='night-sky-headings-v1')`), 'Matching Headings archives under its own test identity')

    await route('reading-mini'); await click('Start new attempt')
    await ev(`document.querySelector('.reading-answer-option input').click();window.__historyMode='abort'`)
    const beforeFailure = await count()
    await click('Submit practice'); await until(`document.body.textContent.includes('This result has not been saved to history.')`)
    check(await count() === beforeFailure && await ev(`!!document.querySelector('.reading-result')`),
      'an aborted history write shows a failure while retaining the result for retry')
    await ev(`window.__confirm=false`); await click('New attempt')
    check(await ev(`!!document.querySelector('.reading-result')`), 'cancelled restart preserves a result that failed to archive')
    await ev(`window.__historyMode='';window.__confirm=true`); await click('Retry saving history'); await saved()
    check(await count() === beforeFailure + 1, 'retry persists the original pending attempt exactly once')
    await route('progress'); await until(`document.querySelectorAll('.history-row a').length>0`)
    await ev(`__api.readReadingAttempts().then(r=>__putRaw({...r.attempts[0],id:'unsupported-record',schemaVersion:99}))`)
    await route('practice'); await route('progress')
    await until(`document.body.textContent.includes('could not be verified. They have been preserved.')`)
    check(await ev(`__readRaw().then(rows=>rows.some(r=>r.id==='unsupported-record'))`), 'unsupported history remains stored and is reported')
    await route('reading-review/missing-attempt'); await until(`document.body.textContent.includes('Saved attempt unavailable')`)
    check(await ev(`!document.querySelector('.reading-clock')`), 'missing historical records never fall back to a new working test')
    await route('progress')
    await ev(`(async()=>{for(let i=0;i<4;i++){const start=Date.now()+i-1000;
      const a=await __api.createReadingAttempt(__fixture,{startedAt:start,answers:{},submitted:true},'submitted',start+500);
      await __api.saveReadingAttempt(a)}})()`)
    await until(`document.querySelectorAll('.history-row').length===8`)
    await click('Show more attempts')
    check(await ev(`document.querySelectorAll('.history-row').length>8`), 'older attempts remain accessible beyond the initial eight rows')
    for (const width of [390, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 })
      await wait()
      check(await ev(`document.documentElement.scrollWidth<=innerWidth`), `Progress fits a ${width}px viewport`)
    }
    await ev(`document.querySelector('button[aria-label*="dark"]').click()`)
    check(await ev(`document.documentElement.dataset.theme==='dark' && document.documentElement.scrollWidth<=innerWidth`),
      'history remains usable in the charcoal dark theme')
    check(errors.length === 0, 'no uncaught browser exceptions during history journeys')
    console.log(`Passed ${checks} browser/history checks.`)
  } finally {
    if (context) await call('Target.disposeBrowserContext', { browserContextId: context.browserContextId }, true)
    ws.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
