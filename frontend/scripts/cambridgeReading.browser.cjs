// One real local paper; private source/keys are fetched at runtime, never fixtures.
// Every check runs in a disposable browser context, never learner browser storage.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
;(async () => {
  const base = process.env.IELTS_PREVIEW_URL || 'http://127.0.0.1:5194'
  const slug = 'cambridge-1-reading-test-1'
  const paper = await fetch(`${base}/api/private/reading-tests/${slug}`).then(r => { assert.equal(r.status,200); return r.json() })
  const key = `practice-room-reading-${paper.id}-draft-v1`
  const version = await fetch(`http://127.0.0.1:${process.env.IELTS_BROWSER_PORT || 9229}/json/version`).then(r => r.json())
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise(resolve => ws.addEventListener('open',resolve,{once:true}))
  const pending=new Map(), errors=[]
  let counter=0, sessionId, context, checks=0
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data)
    if(message.id){pending.get(message.id)?.(message);pending.delete(message.id)}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text)
  })
  const call=(method,params={},browser=false)=>new Promise((resolve,reject)=>{
    const id=++counter, timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},15000)
    pending.set(id,message=>{clearTimeout(timer);if(message.error)reject(Error(JSON.stringify(message.error)));else resolve(message.result)})
    ws.send(JSON.stringify({id,method,params,...(!browser&&sessionId?{sessionId}:{})}))
  })
  const ev=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value}
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
  const until=async expression=>{for(let i=0;i<100;i++){if(await ev(expression))return;await wait(80)}throw Error('Condition timed out: '+expression)}
  const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label)}
  const route=async hash=>{await ev(`location.hash=${JSON.stringify('#/'+hash)}`);await wait(180)}
  const button=async text=>{await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing button');b.click()})()`);await wait(80)}
  const navigate=async number=>{await ev(`document.getElementById('c1-nav-${number}').click()`);await wait(120)}
  const select=async(number,value)=>ev(`(()=>{const e=document.querySelector('select[aria-label="Question ${number}"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  const reload=async()=>{await call('Page.reload');await until(`!!document.querySelector('.cambridge-exam')`)}
  const fresh=async()=>{await route('practice');await ev(`localStorage.removeItem(${JSON.stringify(key)})`);await route(slug);await until(`!!document.querySelector('.cambridge-question-nav')`)}
  const screenshot=async name=>{const shot=await call('Page.captureScreenshot',{format:'png'});const file=path.join(os.tmpdir(),name);fs.writeFileSync(file,Buffer.from(shot.data,'base64'));return file}
  try {
    context=await call('Target.createBrowserContext',{},true)
    const target=await call('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId},true)
    sessionId=(await call('Target.attachToTarget',{targetId:target.targetId,flatten:true},true)).sessionId
    await call('Page.enable');await call('Runtime.enable')
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.confirm=()=>true;window.__failWrite=false;window.__failRead=false;window.__failClear=false;const set=Storage.prototype.setItem,get=Storage.prototype.getItem,remove=Storage.prototype.removeItem;Storage.prototype.setItem=function(k,v){if(window.__failWrite&&k===${JSON.stringify(key)})throw Error('QA persistence failure');return set.call(this,k,v)};Storage.prototype.getItem=function(k){if(window.__failRead&&k===${JSON.stringify(key)})throw Error('QA read failure');return get.call(this,k)};Storage.prototype.removeItem=function(k){if(window.__failClear&&k===${JSON.stringify(key)})throw Error('QA clear failure');return remove.call(this,k)}`})
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
    await call('Page.navigate',{url:base+'/'})
    await until(`!!document.querySelector('.cambridge-test-card')`)
    check(await ev(`document.querySelector('.cambridge-test-card').textContent.includes('Cambridge IELTS 1')`),'home page has a direct Take Test card')
    await ev(`document.querySelector('.cambridge-test-card').click()`)
    await until(`!!document.querySelector('.cambridge-question-nav')`)
    check(await ev(`document.querySelectorAll('.cambridge-question-nav button').length===40`),'direct click opens forty question boxes without setup')
    check(await ev(`!document.querySelector('.sidebar,.mobile-header,.bottom-nav,canvas,iframe,object,embed')`),'exam has no sidebar or PDF viewer')
    check(await ev(`!document.querySelector('input[type=number],textarea')&&!/Set up|Review this import|Enlarge original page|Read extracted text/.test(document.body.textContent)`),'no page/count/key fields or import actions')
    check(await ev(`Math.abs(document.querySelector('.cambridge-exam').getBoundingClientRect().width-innerWidth)<1&&document.documentElement.scrollWidth<=innerWidth`),'exam fills the viewport without side margins or page overflow')
    check(await ev(`/^(60:00|59:[0-5][0-9])$/.test(document.querySelector('.cambridge-timer').innerText)`),'sixty-minute countdown starts on entry')
    await until(`!!document.querySelector('.cambridge-passage-photo')?.naturalWidth`)
    check(await ev(`document.querySelector('.cambridge-passage-photo').naturalWidth<800`),'original illustration is a cropped image, not a document page')
    await select(1,paper.passages[0].questions[0].correctAnswers[0])
    await until(`document.getElementById('c1-nav-1').classList.contains('is-answered')`)
    check(await ev(`document.getElementById('c1-nav-1').getAttribute('aria-label').includes('answered')`),'answer state has both visible and accessible indicators')
    const oldQuestionsScroll=await ev(`document.querySelector('.cambridge-questions').scrollTop`)
    await ev(`document.querySelector('.cambridge-passage').scrollTop=160`)
    check(await ev(`document.querySelector('.cambridge-passage').scrollTop>0&&document.querySelector('.cambridge-questions').scrollTop===${oldQuestionsScroll}`),'passage and questions scroll independently')
    const divider=await ev(`(()=>{const r=document.querySelector('.cambridge-divider').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+80}})()`)
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...divider})
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:divider.x+120,y:divider.y})
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:divider.x+120,y:divider.y})
    await wait(100)
    check(await ev(`Number(document.querySelector('.cambridge-divider').getAttribute('aria-valuenow'))>55`),'pointer drag resizes the split')
    await ev(`document.querySelector('.cambridge-divider').focus();document.querySelector('.cambridge-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`)
    await wait(60)
    check(await ev(`document.querySelector('.cambridge-divider').getAttribute('aria-valuenow')==='30'`),'divider is keyboard operable with bounded sizing')
    await ev(`document.querySelector('.cambridge-divider').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`)
    await wait(60)
    check(await ev(`document.querySelector('.cambridge-divider').getAttribute('aria-valuenow')==='32'`),'keyboard arrows adjust the divider')
    await navigate(16)
    check(await ev(`document.querySelectorAll('input[type=radio][name="c1r1-q16"]').length===3`),'writer-view questions use real Yes/No/Not Given radios')
    await navigate(23)
    check(await ev(`document.querySelectorAll('input[type=radio][name="c1r1-q23"]').length===4`),'multiple choice uses four source options')
    await navigate(26)
    const multi=paper.passages[1].groups.find(g=>g.kind==='multi-select')
    for(const option of multi.options.slice(0,3)){await ev(`document.querySelector('input[type=checkbox][aria-label^="${option.value}:"]').click()`);await wait(30)}
    check(await ev(`document.querySelectorAll('.cambridge-multiple input:checked').length===3&&document.querySelectorAll('.cambridge-multiple input:disabled').length===3`),'three-answer selection prevents duplicate or fourth choices')
    await navigate(29)
    check(await ev(`document.querySelectorAll('.cambridge-completion-table input').length===7`),'table completion has seven inline answer inputs')
    check(await ev(`document.querySelector('[aria-label="Question 29"]').getBoundingClientRect().top<document.querySelector('.cambridge-bottom-bar').getBoundingClientRect().top`),'question navigator scrolls its target into view')
    const start=await ev(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).startedAt`)
    await reload()
    check(await ev(`document.body.textContent.includes('Would you like to restore your answers?')`),'refresh offers explicit answer restoration')
    await button('Yes');await until(`!!document.querySelector('.cambridge-question-nav')`)
    check(await ev(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).startedAt===${start}&&document.getElementById('c1-nav-1').classList.contains('is-answered')`),'restore preserves answers and the original timer')
    await ev(`window.__failWrite=true`);await navigate(2);await select(2,paper.passages[0].questions[1].correctAnswers[0])
    await until(`document.body.textContent.includes('could not be saved')`)
    check(await ev(`!document.querySelector('.cambridge-save-state').textContent.includes('Answers saved')`),'persistence failure never claims answers were saved')
    await ev(`window.__failWrite=false`);await button('Retry saving')
    await until(`document.querySelector('.cambridge-save-state').textContent.includes('Answers saved')`)
    check(true,'failed persistence can be retried')
    await ev(`localStorage.setItem('qa-independent-test','untouched')`);await reload()
    const beforeClear=await ev(`localStorage.getItem(${JSON.stringify(key)})`)
    await ev(`window.__failClear=true`);await button('No, start again')
    check(await ev(`localStorage.getItem(${JSON.stringify(key)})===${JSON.stringify(beforeClear)}&&document.body.textContent.includes('could not be cleared')`),'failed clearing preserves the original answers')
    await ev(`window.__failClear=false`);await button('No, start again')
    await until(`!!document.querySelector('.cambridge-question-nav')`)
    check(await ev(`!document.querySelector('.cambridge-question-nav .is-answered')&&localStorage.getItem('qa-independent-test')==='untouched'`),'starting again clears only this paper')
    // Fill all forty through real controls. Answer material stays runtime-only.
    for(const passage of paper.passages){
      await navigate(passage.questions[0].number)
      for(const group of passage.groups){
        if(group.kind==='multi-select'){
          const choices=passage.questions.find(q=>q.number===group.numbers[0]).correctAnswers.slice().reverse()
          for(const value of choices){await ev(`document.querySelector('input[type=checkbox][aria-label^="${value}:"]').click()`);await wait(20)}
          continue
        }
        for(const q of passage.questions.filter(q=>group.numbers.includes(q.number))){
          const value=q.correctAnswers[0]
          if(['matching','summary'].includes(group.kind))await select(q.number,value)
          else if(group.kind==='table')await ev(`(()=>{const e=document.querySelector('input[aria-label="Question ${q.number}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
          else await ev(`document.querySelector('input[name="${q.id}"][value=${JSON.stringify(value)}]').click()`)
          await wait(10)
        }
      }
    }
    check(await ev(`document.querySelectorAll('.cambridge-question-nav .is-answered').length===40`),'all forty controls save and update navigation')
    await button('Submit');await until(`!!document.querySelector('.cambridge-results')`)
    check(await ev(`document.querySelector('.cambridge-score').textContent.includes('40 / 40')`),'verified key grades a correct paper forty out of forty')
    check(await ev(`document.querySelectorAll('.cambridge-result-table tbody tr').length===40`),'results show every answer and correct alternative')
    await reload();await until(`!!document.querySelector('.cambridge-results')`)
    check(await ev(`document.querySelector('.cambridge-score').textContent.includes('40 / 40')`),'submitted result survives refresh')
    await fresh()
    await ev(`localStorage.setItem('practice-room-theme','dark')`);await reload();await button('Yes')
    const darkFile=await screenshot('ielts-cambridge-reading-desktop.png')
    check(await ev(`document.documentElement.dataset.theme==='dark'&&getComputedStyle(document.querySelector('.cambridge-exam')).backgroundColor==='rgb(23, 23, 26)'`),'charcoal theme is applied to the complete exam')
    await call('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false})
    check(await ev(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.cambridge-passage').clientWidth>250&&document.querySelector('.cambridge-questions').clientWidth>250`),'tablet retains readable independent panes without page overflow')
    await navigate(29)
    check(await ev(`document.querySelector('.cambridge-completion-table')!==null&&document.querySelector('.cambridge-table-wrap').scrollWidth>=document.querySelector('.cambridge-table-wrap').clientWidth`),'table remains available in a narrow question pane')
    await screenshot('ielts-cambridge-reading-tablet.png')
    await route('practice');await ev(`localStorage.setItem(${JSON.stringify(key)},'{broken')`);await route(slug)
    await until(`document.body.textContent.includes('Saved answers could not be loaded')`)
    check(await ev(`localStorage.getItem(${JSON.stringify(key)})==='{broken'&&!document.querySelector('.cambridge-question-nav')`),'corrupted drafts are preserved and blocked')
    await button('Discard unreadable answers and start');await until(`!!document.querySelector('.cambridge-question-nav')`)
    check(await ev(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).submitted===false`),'corrupted draft recovery requires an explicit discard')
    await route('practice');await ev(`window.__failRead=true`);await route(slug)
    await until(`document.body.textContent.includes('Saved answers could not be loaded')`)
    check(await ev(`!document.querySelector('.cambridge-question-nav')`),'storage read failure blocks replacement of saved answers')
    await ev(`window.__failRead=false`);await button('Retry loading');await until(`!!document.querySelector('.cambridge-question-nav')`)
    check(await ev(`!!document.querySelector('.cambridge-question-nav')`),'storage reads recover through an explicit retry')
    await route('practice')
    await ev(`localStorage.setItem(${JSON.stringify(key)},JSON.stringify({startedAt:Date.now()-1800000,submitted:false,answers:{}}))`)
    await route(slug);await until(`document.body.textContent.includes('Would you like to restore')`)
    check(await ev(`/^(30:00|29:[0-5][0-9])$/.test(document.querySelector('.cambridge-timer').innerText)`),'restore prompt shows the existing countdown rather than a fresh hour')
    await route('practice')
    await ev(`localStorage.setItem(${JSON.stringify(key)},JSON.stringify({startedAt:Date.now()-3600000+1800,submitted:false,answers:{}}))`)
    await route(slug);await until(`document.body.textContent.includes('Would you like to restore')`);await button('Yes')
    await until(`!!document.querySelector('.cambridge-results')`)
    check(await ev(`JSON.parse(localStorage.getItem(${JSON.stringify(key)})).submitted===true&&document.querySelector('.cambridge-score').textContent.includes('0 / 40')`),'deadline automatically submits and marks the saved answers')
    await ev(`document.documentElement.requestFullscreen=undefined`);await button('Focus')
    check(await ev(`document.body.textContent.includes('Fullscreen is unavailable')`),'unsupported fullscreen produces visible feedback without an exception')
    for(const oldRoute of ['import/reading','private-test/legacy','skill-reading','practice']){
      await route(oldRoute)
      check(await ev(`!document.querySelector('a[href^="#/import/"]')&&!/Set up a test|Review this import|Enlarge original page|Read extracted text/.test(document.body.textContent)`),`removed import flow is unreachable from ${oldRoute}`)
    }
    check(errors.length===0,'no uncaught browser exceptions')
    console.log(JSON.stringify({checks,screenshot:darkFile,source:'Owner-provided local material; no private fixtures committed.'}))
  } finally {
    if(context)await call('Target.disposeBrowserContext',{browserContextId:context.browserContextId},true)
    ws.close()
  }
})().catch(error=>{console.error(error);process.exitCode=1})
