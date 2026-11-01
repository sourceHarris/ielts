import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Expand, Clock3 } from 'lucide-react'
import { CURATED_READING_SLUG, gradeStructuredTest, validStructuredTest } from './reading/structuredTest'
import type { ReadingGroup, StructuredReadingTest } from './reading/structuredTest'
import { clearDraft, freshDraft, readDraft, remainingSeconds, saveDraft } from './reading/sessionStorage'
import type { DraftRead, ReadingDraft } from './reading/sessionStorage'
import './CambridgeReading.css'

const route = `#/${CURATED_READING_SLUG}`
const clock = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

export function CambridgeReadingCard() {
  return <a className="cambridge-test-card" href={route}>
    <div><p className="eyebrow">ACADEMIC READING</p><h2>Cambridge IELTS 1 · Reading · Test 1</h2>
      <p>3 passages <span aria-hidden="true">·</span> 40 questions <span aria-hidden="true">·</span> 60 minutes</p></div>
    <span className="button button-primary">Take Test <ArrowRight size={18} aria-hidden="true" /></span>
  </a>
}

export default function CambridgeReading() {
  const [test, setTest] = useState<StructuredReadingTest | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/private/reading-tests/${CURATED_READING_SLUG}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error(); const data: unknown = await response.json(); if (!validStructuredTest(data)) throw Error(); return data })
      .then(data => { if (!controller.signal.aborted) { setTest(data); setError('') } })
      .catch(() => { if (!controller.signal.aborted) setError('This local test could not be opened. Your saved answers have not been changed.') })
    return () => controller.abort()
  }, [retry])
  if (!test) return <main className="cambridge-opening"><a href="#/practice">← Practice</a><h1>Cambridge IELTS 1 · Reading · Test 1</h1>
    {error ? <><p role="alert">{error}</p><button className="button button-primary" onClick={() => setRetry(retry + 1)}>Try again</button></> : <p role="status">Opening your test…</p>}</main>
  return <Exam key={test.id} test={test} />
}

function Exam({ test }: { test: StructuredReadingTest }) {
  const [initial, setInitial] = useState<DraftRead>(() => readDraft(test))
  const [draft, setDraft] = useState<ReadingDraft>(() => initial.kind === 'valid' ? initial.draft : freshDraft())
  const [mode, setMode] = useState<'running' | 'restore' | 'blocked'>(() => initial.kind === 'missing' ||
    (initial.kind === 'valid' && initial.draft.submitted) ? 'running' : initial.kind === 'valid' ? 'restore' : 'blocked')
  const [now, setNow] = useState(Date.now)
  const [part, setPart] = useState(0)
  const [activeNumber, setActiveNumber] = useState(1)
  const [split, setSplit] = useState(50)
  const [saveStatus, setSaveStatus] = useState('Saving answers…')
  const [saveError, setSaveError] = useState('')
  const [focusError, setFocusError] = useState('')
  const current = useRef(draft)
  const body = useRef<HTMLDivElement>(null)
  const passagePane = useRef<HTMLElement>(null)
  const questionsPane = useRef<HTMLElement>(null)
  const dragging = useRef(false)
  const allQuestions = test.passages.flatMap(passage => passage.questions)
  const passage = test.passages[part]
  const seconds = remainingSeconds(test, draft, now)
  const result = draft.submitted ? gradeStructuredTest(test, draft.answers) : null
  const answered = allQuestions.filter(question => draft.answers[question.id]?.trim()).length

  const persist = useCallback((next: ReadingDraft) => {
    const outcome = saveDraft(test, next)
    if (outcome.kind === 'ok') { setSaveStatus(next.submitted ? 'Result saved in this browser' : 'Answers saved'); setSaveError('') }
    else {
      setSaveStatus('Not saved')
      setSaveError(outcome.kind === 'conflict' ? 'Another session changed the saved attempt. Your answers in this tab have not replaced it.' :
        'Your answers could not be saved. Keep this tab open and retry saving.')
    }
  }, [test])
  const commit = useCallback((next: ReadingDraft) => { current.current = next; setDraft(next); persist(next) }, [persist])

  useEffect(() => {
    if (mode !== 'running') return
    const firstSave = window.setTimeout(() => persist(current.current), 0)
    const timer = window.setInterval(() => {
      if (current.current.submitted) { clearInterval(timer); return }
      const time = Date.now(); setNow(time)
      if (!current.current.submitted && remainingSeconds(test, current.current, time) === 0) commit({ ...current.current, submitted: true })
    }, 250)
    const warn = (event: BeforeUnloadEvent) => { if (saveError) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { clearTimeout(firstSave); clearInterval(timer); window.removeEventListener('beforeunload', warn) }
  }, [mode, test, commit, persist, saveError])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(`c1-question-${activeNumber}`)
      const control = node?.querySelector<HTMLElement>('input,select') ?? node
      control?.focus({ preventScroll: true })
      node?.scrollIntoView({ block: 'nearest' })
      document.getElementById(`c1-nav-${activeNumber}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [activeNumber, part, mode])
  useEffect(() => { if (passagePane.current) passagePane.current.scrollTop = 0; if (questionsPane.current) questionsPane.current.scrollTop = 0 }, [part])
  useEffect(() => {
    if (mode !== 'restore') return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [mode])

  function navigate(number: number) {
    const next = Math.min(40, Math.max(1, number))
    setPart(test.passages.findIndex(passage => passage.questions.some(question => question.number === next)))
    setActiveNumber(next)
  }
  const handleAnswerChange = useCallback((number: number, value: string) => {
    if (current.current.submitted || mode !== 'running') return
    if (remainingSeconds(test, current.current, Date.now()) === 0) { commit({ ...current.current, submitted: true }); return }
    const question = test.passages.flatMap(passage => passage.questions).find(question => question.number === number)!
    commit({ ...current.current, answers: { ...current.current.answers, [question.id]: value } })
  }, [test, mode, commit])
  function restore(useSaved: boolean) {
    const latest = readDraft(test)
    setInitial(latest)
    if (latest.kind === 'invalid' || latest.kind === 'unavailable') { setMode('blocked'); return }
    if (!useSaved) {
      const cleared = clearDraft(test)
      if (cleared.kind !== 'ok') { setSaveError('Saved answers could not be cleared. They have been preserved.'); return }
    }
    const next = useSaved && latest.kind === 'valid' ? latest.draft : freshDraft()
    if (remainingSeconds(test, next, Date.now()) === 0) next.submitted = true
    setNow(Date.now()); setMode('running'); commit(next)
  }
  function blank(number: number, group: ReadingGroup) {
    const question = allQuestions.find(question => question.number === number)!
    return <span className="cambridge-inline-answer" id={`c1-question-${number}`} data-question={number}>
      <span className="cambridge-number" aria-hidden="true">{number}</span>
      {group.kind === 'summary' ? <select aria-label={`Question ${number}`} value={draft.answers[question.id] ?? ''} onChange={event => handleAnswerChange(number, event.target.value)}>
        <option value="">Choose a word</option>{group.options!.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select> : <input aria-label={`Question ${number}`} autoComplete="off" spellCheck={false} value={draft.answers[question.id] ?? ''} onChange={event => handleAnswerChange(number, event.target.value)} />}
    </span>
  }
  function inline(text: string, group: ReadingGroup) {
    return text.split(/(\.\.\.\s*\(\d+\)\s*\.\.\.)/g).map((piece, index) => {
      const match = /^\.\.\.\s*\((\d+)\)\s*\.\.\.$/.exec(piece)
      return <Fragment key={index}>{match ? blank(Number(match[1]), group) : piece}</Fragment>
    })
  }
  function questionGroup(group: ReadingGroup) {
    const questions = passage.questions.filter(question => group.numbers.includes(question.number))
    return <section key={group.id} className="cambridge-question-group" aria-labelledby={group.id}>
      <h2 id={group.id}>{group.heading}</h2>
      {group.instructions.map((text, i) => <p className="cambridge-instruction" key={i}>{text}</p>)}
      {group.example && <p className="cambridge-example">{group.example}</p>}
      {group.title && <h3>{group.title}</h3>}
      {group.kind === 'summary' && group.text!.map((text, i) => <p className="cambridge-summary" key={i}>{inline(text, group)}</p>)}
      {group.kind === 'table' && <div className="cambridge-table-wrap"><table className="cambridge-completion-table"><thead><tr>{group.columns!.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{group.rows!.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={group.shadedCells?.some(([r, c]) => r === i && c === j) ? 'cambridge-shaded-cell' : ''}>{inline(cell, group)}</td>)}</tr>)}</tbody></table></div>}
      {group.kind === 'multi-select' && <fieldset className="cambridge-multiple"><legend className="visually-hidden">{group.heading}</legend>
        <div className="cambridge-group-numbers">{questions.map(question => <span tabIndex={-1} id={`c1-question-${question.number}`} className="cambridge-number" key={question.id}>{question.number}</span>)}</div>
        {group.options!.map(option => {
          const selected = questions.map(question => draft.answers[question.id] ?? '').filter(Boolean)
          return <label className="cambridge-option" key={option.value}><input type="checkbox" aria-label={`${option.value}: ${option.label}`} checked={selected.includes(option.value)}
            disabled={selected.length === questions.length && !selected.includes(option.value)} onChange={event => {
              const values = event.target.checked ? [...selected, option.value] : selected.filter(value => value !== option.value)
              const answers = { ...current.current.answers }; questions.forEach((question, i) => { answers[question.id] = values[i] ?? '' })
              if (remainingSeconds(test, current.current, Date.now()) === 0) { commit({ ...current.current, submitted: true }); return }
              commit({ ...current.current, answers })
            }} /><strong>{option.value}</strong><span>{option.label}</span></label>
        })}</fieldset>}
      {['matching', 'choice', 'yes-no-not-given'].includes(group.kind) && questions.map(question => <fieldset className="cambridge-question" id={`c1-question-${question.number}`} key={question.id} data-question={question.number}>
        <legend><span className="cambridge-number" aria-hidden="true">{question.number}</span> {question.prompt}</legend>
        {group.kind === 'matching' ? <select aria-label={`Question ${question.number}`} value={draft.answers[question.id] ?? ''} onChange={event => handleAnswerChange(question.number, event.target.value)}>
          <option value="">Choose an answer</option>{group.options!.map(option => <option key={option.value} value={option.value}>{option.value} — {option.label}</option>)}
        </select> : question.options!.map(option => <label className="cambridge-option" key={option.value}>
          <input type="radio" name={question.id} aria-label={`Question ${question.number}: ${option.label}`} value={option.value} checked={draft.answers[question.id] === option.value} onChange={() => handleAnswerChange(question.number, option.value)} />
          {group.kind === 'choice' && <strong>{option.value}</strong>}<span>{option.label}</span>
        </label>)}
      </fieldset>)}
      {group.options && group.kind !== 'multi-select' && <div className="cambridge-word-bank"><h3>{group.optionTitle}</h3><ul>{group.options.map(option => <li key={option.value}>
        {group.kind === 'matching' && <strong>{option.value} </strong>}{option.label}</li>)}</ul></div>}
    </section>
  }

  return <main className="cambridge-exam" aria-label="Cambridge Reading exam">
    <header className="cambridge-topbar"><div className="cambridge-test-heading"><a href="#/practice" aria-label="Back to practice"><ArrowLeft size={20} /></a><h1>{test.title}</h1></div>
      <div className="cambridge-timer" role="timer" aria-label="Time remaining"><Clock3 size={18} /><span>{draft.submitted ? 'Finished' : mode === 'blocked' ? '—' : clock(seconds)}</span></div>
      <button className="cambridge-focus" onClick={async () => {
        try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
        catch { setFocusError('Fullscreen is unavailable. You can continue in this window.') }
      }}><Expand size={17} />Focus</button>
    </header>
    {focusError && <p className="cambridge-notice" role="status">{focusError}</p>}
    {mode === 'restore' ? <section className="cambridge-recovery"><h2>Would you like to restore your answers?</h2><p>Your original timer continues from when you began.</p>
      <div><button className="button button-primary" onClick={() => restore(true)}>Yes</button><button className="button button-secondary" onClick={() => restore(false)}>No, start again</button></div>{saveError && <p role="alert">{saveError}</p>}</section>
    : mode === 'blocked' ? <section className="cambridge-recovery"><h2>Saved answers could not be loaded.</h2><p>The existing record has been preserved.</p>
      <button className="button button-secondary" onClick={() => restore(true)}>Retry loading</button>
      {initial.kind === 'invalid' && <button className="button button-secondary" onClick={() => {
        if (!window.confirm('Discard the unreadable saved answers for this test and begin again?')) return
        if (clearDraft(test, true).kind === 'ok') { const next = freshDraft(); setMode('running'); commit(next) } else setSaveError('The saved record could not be cleared.')
      }}>Discard unreadable answers and start</button>}{saveError && <p role="alert">{saveError}</p>}</section>
    : result ? <section className="cambridge-results" aria-label="Test results"><div className="cambridge-score"><div><p>TEST COMPLETE</p><h2>Your score: {result.correct} / {result.total}</h2><p>{result.unanswered} unanswered</p></div>
      <button className="button button-secondary" onClick={() => { if (window.confirm('Start a new attempt? This replaces the saved answers for this test.')) { restore(false); navigate(1) } }}>Take Test Again</button></div>
      <p>Questions 26–28 accept each correct selection once, in any order.</p>
      <table className="cambridge-result-table"><thead><tr><th>Question</th><th>Your answer</th><th>Correct answer(s)</th><th>Result</th></tr></thead><tbody>{result.questions.map(question => <tr key={question.questionId}>
        <th scope="row">{question.questionNumber}</th><td>{question.userAnswer || '—'}</td><td>{question.correctAnswers.join(' / ')}</td><td>{question.isCorrect ? '✓ Correct' : question.userAnswer.trim() ? '✕ Incorrect' : '— Unanswered'}</td>
      </tr>)}</tbody></table></section>
    : <><div className="cambridge-partbar"><div className="cambridge-part-tabs" role="group" aria-label="Reading part">{test.passages.map((p, i) => <button key={p.id} aria-pressed={part === i} onClick={() => navigate(p.questions[0].number)}>Part {i + 1}</button>)}</div>
      <span>Read the text and answer questions {passage.questions[0].number}–{passage.questions.at(-1)!.number}</span></div>
      <div className="cambridge-exam-body" ref={body} style={{ gridTemplateColumns: `minmax(0, ${split}fr) 10px minmax(0, ${100 - split}fr)` }}>
        <section id="cambridge-passage" ref={passagePane} className="cambridge-passage" tabIndex={0} aria-label="Reading passage">
          <p className="cambridge-instruction">{passage.instruction}</p><h2>{passage.title}</h2>
          {passage.image && <img className="cambridge-passage-photo" src={`/api/private/reading-images/${passage.image.assetId}`} alt={passage.image.alt} />}
          {passage.paragraphs.map((text, i) => <p key={i}>{text}</p>)}
        </section>
        <div className="cambridge-divider" role="separator" tabIndex={0} aria-label="Resize passage and questions" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(split)} aria-controls="cambridge-passage cambridge-questions"
          onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }}
          onPointerMove={event => { if (dragging.current && body.current) { const rect = body.current.getBoundingClientRect(); setSplit(Math.max(30, Math.min(70, (event.clientX - rect.left) / rect.width * 100))) } }}
          onPointerUp={() => { dragging.current = false }} onPointerCancel={() => { dragging.current = false }}
          onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); setSplit(value => event.key === 'Home' ? 30 : event.key === 'End' ? 70 : Math.max(30, Math.min(70, value + (event.key === 'ArrowLeft' ? -2 : 2)))) } }}><span aria-hidden="true">⋮</span></div>
        <section id="cambridge-questions" ref={questionsPane} className="cambridge-questions" tabIndex={0} aria-label="Questions">{passage.groups.map(questionGroup)}</section>
      </div>
    </>}
    {mode === 'running' && <footer className="cambridge-bottom-bar">
      {!result && <nav className="cambridge-question-nav" aria-label="Question navigator">{allQuestions.map(question => {
        const complete = !!draft.answers[question.id]?.trim()
        return <button key={question.id} id={`c1-nav-${question.number}`} className={`${complete ? 'is-answered' : ''} ${activeNumber === question.number ? 'is-current' : ''}`}
          aria-label={`Question ${question.number}${complete ? ', answered' : ', unanswered'}`} aria-current={activeNumber === question.number ? 'step' : undefined}
          onClick={() => navigate(question.number)}>{question.number}{complete && <Check size={9} aria-hidden="true" />}</button>
      })}</nav>}
      <div className="cambridge-bottom-actions"><div className="cambridge-step-buttons">{!result && <><button aria-label="Previous question" disabled={activeNumber === 1} onClick={() => navigate(activeNumber - 1)}><ArrowLeft size={18} /></button>
        <button aria-label="Next question" disabled={activeNumber === 40} onClick={() => navigate(activeNumber + 1)}><ArrowRight size={18} /></button></>}<span>{answered} / 40 answered</span></div>
        <div className="cambridge-save-state"><span role={saveError ? 'alert' : 'status'}>{saveError || saveStatus}</span>{saveError && <button onClick={() => persist(current.current)}>Retry saving</button>}</div>
        {!result && <button className="button button-primary" onClick={() => { if (window.confirm('Submit your answers? This attempt will become read-only.')) commit({ ...current.current, submitted: true }) }}>Submit</button>}
      </div>
    </footer>}
  </main>
}
