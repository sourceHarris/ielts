// Local integration checks. Requires an imported private library and isolated Chrome
// debugging on 9229. Uses disposable contexts; never modifies learner browser data.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
;(async () => {
  const base = process.env.IELTS_PREVIEW_URL || 'http://127.0.0.1:5190'
  const { build } = await import('vite')
  const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/practice/privateStore.ts', formats: ['es'] } } })
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from((Array.isArray(built) ? built[0] : built).output[0].code).toString('base64')
  const version = await fetch('http://127.0.0.1:9229/json/version').then(response => response.json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
  let id = 0, session, context, checks = 0
  const pending = new Map(), errors = []
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  })
  const call = (method, params = {}, browser = false) => new Promise((resolve, reject) => {
    const next = ++id, timeout = setTimeout(() => { pending.delete(next); reject(Error('Timeout: ' + method)) }, 20_000)
    pending.set(next, message => { clearTimeout(timeout); if (message.error) reject(message.error); else resolve(message.result) })
    ws.send(JSON.stringify({ id: next, method, params, ...(!browser && session ? { sessionId: session } : {}) }))
  })
  const ev = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
  const until = async expression => { for (let i = 0; i < 100; i++) { if (await ev(expression)) return; await wait(100) }; throw Error('UI timeout: ' + expression) }
  const check = (condition, text) => { assert.ok(condition, text); checks++; console.log('PASS ' + text) }
  const click = async text => { await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button missing: '+${JSON.stringify(text)});b.click()})()`); await wait(100) }
  const route = async value => { await ev(`location.hash=${JSON.stringify('#/' + value)}`); await wait(150) }
  const set = async (selector, value) => {
    await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Input missing');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(25)
  }
  const install = () => ev(`(async()=>{window.__store=await import(${JSON.stringify(moduleUrl)});window.confirm=()=>true;return true})()`)
  const ready = () => until(`document.querySelector('.workspace-save')?.textContent.includes('Saved in this browser')`)
  const archived = () => until(`document.body.textContent.includes('Saved to your private practice history.')`)
  const openImport = async skill => {
    await route('import/' + skill + '/' + book.id)
    await until(`!!document.querySelector('.workspace-form')`)
    await click('Review this import')
    await until(`!!document.querySelector('.review-confirm')`)
    check(await ev(`document.querySelector('.review-confirm').nextElementSibling.querySelector('.button-primary').disabled`), skill + ' activation requires explicit source confirmation')
    await ev(`document.querySelector('.review-confirm input').click()`)
    await click('Add test and open workspace')
    await until(`!!document.querySelector('.workspace-start')`)
    const configId = await ev(`decodeURIComponent(location.hash.split('/').at(-1))`)
    await click('Start ' + skill + ' practice')
    await ready()
    return configId
  }
  const libraryResponse = await fetch(base + '/api/private/library')
  if (!libraryResponse.ok) throw Error('Import your legitimate source material before running local integration checks.')
  const library = await libraryResponse.json()
  const book = library.books.find(book => book.sections?.some(section => section.keyDraft))
  if (!book) throw Error('A source-reviewed key draft is required for the objective integration checks.')
  try {
    context = await call('Target.createBrowserContext', {}, true)
    const target = await call('Target.createTarget', { url: base + '/#/practice', browserContextId: context.browserContextId }, true)
    session = (await call('Target.attachToTarget', { targetId: target.targetId, flatten: true }, true)).sessionId
    await call('Runtime.enable'); await call('Page.enable')
    await until(`document.querySelectorAll('.private-book-card').length>0`)
    await install()
    check(await ev(`document.querySelectorAll('.module-launcher').length===4`), 'all four modules open inside the app')
    check(await ev(`![...document.querySelectorAll('a')].some(a=>a.textContent.includes('Visit source'))`), 'external source cards no longer form the test library')
    check(await ev(`getComputedStyle(document.documentElement).fontFamily.includes('Segoe UI')`), 'system typography is applied')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    const screenshot = await call('Page.captureScreenshot', { format: 'png' })
    const screenshotPath = path.join(os.tmpdir(), 'ielts-private-library-review.png')
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
    console.log('Screenshot: ' + screenshotPath)

    const readingId = await openImport('reading')
    await until(`document.querySelector('canvas')?.width>500`)
    check(await ev(`!!document.querySelector('canvas').getContext('2d').getImageData(10,10,1,1).data[3]`), 'the authentic source PDF renders inside the Reading workspace')
    await until(`!document.querySelector('.document-enlarge').disabled`)
    await click('Enlarge original page')
    check(await ev(`document.querySelector('dialog').open`), 'the original page can be enlarged with an accessible dialog')
    await click('Close large view')
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 950, deviceScaleFactor: 1, mobile: true })
    check(await ev(`document.documentElement.scrollWidth<=innerWidth`), 'Reading workspace fits a phone viewport')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    const config = await ev(`__store.localData('configs','get',${JSON.stringify(readingId)})`)
    const groups = new Map()
    for (const question of config.questions) {
      const index = question.group ? groups.get(question.group) || 0 : 0
      if (question.group) groups.set(question.group, index + 1)
      await set(`input[aria-label="Question ${question.number}"]`, question.accepted[index])
    }
    await ready()
    await click('Finish and check answers'); await archived()
    check(await ev(`document.body.textContent.includes('${config.questions.length} / ${config.questions.length} matched')`), 'the reviewed authentic key grades all answers, including any-order groups')
    const readingAttempt = await ev(`__store.localData('attempts','all').then(items=>items[0])`)
    check(readingAttempt.resultSnapshot.correct === config.questions.length && readingAttempt.gradingVersion === 'private-objective-v1', 'completed objective results are versioned snapshots')
    await click('Start another attempt')
    check(await ev(`__store.localData('attempts','all').then(items=>items.length===1)`) && await ev(`document.querySelector('input[aria-label="Question 1"]').value===''`), 'restart preserves the completed attempt and clears working answers')
    await route('private-review/' + encodeURIComponent(readingAttempt.id))
    await until(`document.body.textContent.includes('Read-only saved attempt')`)
    check(await ev(`document.querySelector('input[aria-label="Question 1"]').disabled`), 'private historical review is read only')

    await openImport('listening')
    await until(`document.querySelector('audio')?.readyState>=1`)
    await ev(`(async()=>{const a=document.querySelector('audio');a.muted=true;await a.play()})()`)
    await wait(500)
    check(await ev(`document.querySelector('audio').currentTime>0`), 'original local Listening audio plays inside the test interface')
    await click('Next audio'); await until(`document.querySelector('audio')?.readyState>=1`)
    check(await ev(`document.querySelector('.workspace-player').textContent.includes('2 / 4')`), 'sectioned original audio navigation works')
    await set('input[aria-label="Question 1"]', 'Saved listening response')
    await ready(); await click('Finish and check answers'); await archived()

    const writingId = await openImport('writing')
    await set('textarea[aria-label="Writing Task 1 response"]', 'Original regression response one.')
    await click('Task 2 0 words')
    await set('textarea[aria-label="Writing Task 2 response"]', 'Original regression response two, with more detail.')
    await ready()
    await call('Page.reload'); await until(`!!document.querySelector('.essay-editor')`); await install()
    check(await ev(`__store.localData('work','get',${JSON.stringify(writingId)}).then(work=>work.essays[0].startsWith('Original regression')&&work.essays[1].includes('more detail'))`), 'both Writing tasks and the timer restore after refresh')
    await ev(`window.__originalTransaction=IDBDatabase.prototype.transaction;window.__failWork=true;IDBDatabase.prototype.transaction=function(...args){const tx=window.__originalTransaction.apply(this,args);if(args[1]==='readwrite'&&((args[0]==='work'&&window.__failWork)||(args[0]==='media'&&window.__failMedia)))queueMicrotask(()=>tx.abort());return tx}`)
    await set('textarea[aria-label="Writing Task 1 response"]', 'Writing kept in memory after a failed save.')
    await until(`document.querySelector('.workspace-save').textContent.includes('Changes are not saved')`)
    check(await ev(`document.querySelector('.essay-editor').value.includes('kept in memory')`), 'a failed Writing save retains the response and never claims persistence')
    await ev(`window.__failWork=false`); await click('Retry save'); await ready()
    check(await ev(`__store.localData('work','get',${JSON.stringify(writingId)}).then(work=>work.essays[0].includes('kept in memory'))`), 'Writing persistence can be retried without losing the response')
    await click('Finish and save session'); await archived()
    check(await ev(`document.body.textContent.includes('AI assessment is not connected')`), 'Writing saves a real submission without fabricating an AI score')

    await openImport('speaking')
    await ev(`navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')}`)
    await click('Record Part 1')
    check(await ev(`document.body.textContent.includes('Microphone access failed')`), 'microphone denial has a recoverable error')
    await ev(`navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext();window.__audioContext=context;const source=context.createOscillator();const destination=context.createMediaStreamDestination();source.connect(destination);source.start();await context.resume();return destination.stream}`)
    await click('Record Part 1'); await wait(700); await click('Stop recording')
    await until(`!!document.querySelector('.recording-clip audio')`)
    check(await ev(`__store.localData('media','all').then(items=>items[0].blob.size>0&&items[0].blob.type.startsWith('audio/'))`), 'real MediaRecorder output from a test signal is saved as a private audio blob')
    await ev(`window.__audioContext.close()`)
    await click('Part 2'); await ev(`window.__failMedia=true`)
    await click('Record Part 2'); await wait(700); await click('Stop recording')
    await until(`document.body.textContent.includes('The recording is still in memory')`)
    check(await ev(`document.querySelector('.workspace-save').textContent.includes('Recording not saved')`), 'failed audio persistence retains the recording and reports failure')
    await ev(`window.__failMedia=false`); await click('Retry saving recording')
    await until(`document.querySelectorAll('.recording-clip').length===2`)
    check(await ev(`__store.localData('media','all').then(items=>items.length===2&&items.every(item=>item.blob.size>0))`), 'a failed recording can be saved again without replacing the first clip')
    await ev(`window.__audioContext.close()`)
    await click('Finish and save session'); await archived()
    await route('progress'); await until(`document.querySelectorAll('.private-progress .history-row').length===4`)
    check(await ev(`document.querySelectorAll('.private-progress .history-row a').length===4`), 'all four module sessions are available for historical review')
    const beforeExpiry = await ev(`__store.localData('attempts','all').then(items=>items.length)`)
    const expiryId = await ev(`(async()=>{const source=await __store.localData('configs','get',${JSON.stringify(readingId)});const id=crypto.randomUUID();await __store.localData('configs','add',{...source,id,title:'QA expiry check',durationMinutes:1});await __store.localData('work','put',{id,startedAt:Date.now()-59000,submittedAt:null,answers:{},essays:['',''],notes:'',recordings:[]});return id})()`)
    await route('private-test/' + expiryId); await archived()
    await wait(1100)
    check(await ev(`__store.localData('attempts','all').then(items=>items.length===${beforeExpiry + 1})`), 'live private-test timer expiry archives once without duplicate results')
    await route('practice'); await until(`document.querySelectorAll('.private-book-card').length>0`)
    for (const width of [390, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 }); await wait(150)
      check(await ev(`document.documentElement.scrollWidth<=innerWidth`), 'private library fits ' + width + 'px')
    }
    await ev(`document.querySelector('button[aria-label*="dark"]').click()`)
    check(await ev(`document.documentElement.dataset.theme==='dark'`), 'the charcoal dark theme is preserved')
    check(errors.length === 0, 'no uncaught exceptions in the four-module browser journeys')
    console.log('Passed ' + checks + ' module integration checks.')
  } finally {
    if (context) await call('Target.disposeBrowserContext', { browserContextId: context.browserContextId }, true)
    ws.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
