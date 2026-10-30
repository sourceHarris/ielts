import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, RotateCcw, ShieldCheck } from 'lucide-react'
import { cityShadeTest } from './reading/miniTest'
import { normalizeAnswer } from './readingPracticeData'
import './ReadingPractice.css'


const firstPassage = cityShadeTest.passages[0]

const MINI_TEST_MINUTES = cityShadeTest.durationMinutes
const miniPassage = firstPassage.paragraphs

// Temporary adapter: lets the existing interface use our new test format.
const miniQuestions = firstPassage.questions.map((question) => ({
  id: question.number,
  kind: question.type,
  prompt: question.prompt,
  options: question.options,
  correct: question.correctAnswers[0] ?? '',
  explanation: question.explanation,
}))

function isCorrectAnswer(id: number, answer?: string): boolean {
  const question = miniQuestions.find((item) => item.id === id)

  if (!question || !answer) return false

  return normalizeAnswer(answer) === normalizeAnswer(question.correct)
}


type Draft = { startedAt: number; answers: Record<number, string>; submitted: boolean }
export type ReadingAttempt = { completedAt: string; correct: number; total: number; kind: 'reading-mini' }
const DRAFT_KEY = 'practice-room-reading-mini-draft-v1'
const TEST_DURATION = MINI_TEST_MINUTES * 60 * 1000

function freshDraft(): Draft { return { startedAt: Date.now(), answers: {}, submitted: false } }
function loadDraft(): Draft {
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY)
    if (!stored) return freshDraft()
    const parsed: unknown = JSON.parse(stored)
    if (typeof parsed === 'object' && parsed !== null && 'startedAt' in parsed && 'answers' in parsed && 'submitted' in parsed) {
      const candidate = parsed as Draft
      if (typeof candidate.startedAt === 'number' && Number.isFinite(candidate.startedAt) &&
        candidate.startedAt <= Date.now() && candidate.startedAt > Date.now() - 30 * 24 * 60 * 60 * 1000 &&
        typeof candidate.answers === 'object' && candidate.answers !== null && typeof candidate.submitted === 'boolean') return candidate
    }
  } catch { /* A private browser or corrupted storage shouldn't block practice. */ }
  return freshDraft()
}

export default function ReadingPractice({ onComplete }: { onComplete: (attempt: ReadingAttempt) => void }) {
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [now, setNow] = useState(Date.now)
  const completed = useRef(draft.submitted)
  const [saveOk, setSaveOk] = useState(true)
  const remainingSeconds = Math.max(0, Math.ceil((draft.startedAt + TEST_DURATION - now) / 1000))
  const answered = miniQuestions.filter(q => (draft.answers[q.id] ?? '').trim() !== '').length
  const correct = miniQuestions.filter(q => isCorrectAnswer(q.id, draft.answers[q.id])).length
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60

  useEffect(() => {
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); setSaveOk(true) }
    catch { setSaveOk(false) }
  }, [draft])

  useEffect(() => {
    if (draft.submitted) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [draft.submitted])

  // A fixed start time means the clock remains honest after a refresh or another browser tab.
  useEffect(() => {
    if (draft.submitted || remainingSeconds > 0 || completed.current) return
    completed.current = true
    setDraft(current => ({ ...current, submitted: true }))
    onComplete({ completedAt: new Date().toISOString(), correct, total: miniQuestions.length, kind: 'reading-mini' })
  }, [draft.submitted, remainingSeconds, correct, onComplete])

  function choose(id: number, answer: string) {
    if (draft.submitted) return
    setDraft(previous => ({ ...previous, answers: { ...previous.answers, [id]: answer } }))
  }

  function finish() {
    if (draft.submitted || completed.current) return
    if (answered < miniQuestions.length && !window.confirm(`${miniQuestions.length - answered} question(s) are unanswered. Submit anyway?`)) return
    completed.current = true
    setDraft(previous => ({ ...previous, submitted: true }))
    onComplete({ completedAt: new Date().toISOString(), correct, total: miniQuestions.length, kind: 'reading-mini' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function restart() {
    if (!window.confirm('Start a new mini-test? This clears your answers for this attempt.')) return
    completed.current = false
    setDraft(freshDraft())
    setNow(Date.now())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="page-section exam-page reading-mini">
      <a className="back-link" href="#/practice"><ArrowLeft size={17} aria-hidden="true" /> All practice</a>
      <header className="reading-mini-header">
        <div>
          <p className="eyebrow">READING · ORIGINAL MINI-TEST</p>
          <h1>{draft.submitted ? 'Review your answers' : 'A City Measured in Shade'}</h1>
          <p className="reading-mini-subtitle">8 questions · {MINI_TEST_MINUTES} minutes · Not an official IELTS test</p>
        </div>
        <div className={`reading-clock ${remainingSeconds <= 120 && !draft.submitted ? 'reading-clock-urgent' : ''}`} role="timer" aria-label={draft.submitted ? 'Test finished' : `${minutes} minutes and ${seconds} seconds remaining`}>
          <Clock3 size={19} aria-hidden="true" /><span>{draft.submitted ? 'Finished' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}</span>
        </div>
      </header>
      {draft.submitted && (
        <section className="reading-result" aria-live="polite">
          <div><p className="eyebrow">MINI-TEST RESULT</p><h2>{correct} / {miniQuestions.length} correct</h2><p>This is a raw practice score, not an official IELTS band. Review the evidence beside each answer.</p></div>
          <button type="button" className="button button-secondary" onClick={restart}><RotateCcw size={17} aria-hidden="true" /> New attempt</button>
        </section>
      )}
      <div className="reading-mini-grid">
        <section className="paper-panel reading-passage" aria-labelledby="reading-passage-title">
          <p className="eyebrow">PASSAGE 1</p>
          <h2 id="reading-passage-title">A City Measured in Shade</h2>
          {miniPassage.map((paragraph, index) => <p key={index} className="passage-text">{paragraph}</p>)}
          <p className="source-label">Original practice passage created for this website.</p>
        </section>
        <section className="paper-panel reading-questions" aria-labelledby="reading-questions-title">
          <div className="reading-questions-head"><div><p className="eyebrow">ANSWER SHEET</p><h2 id="reading-questions-title">Questions 1–8</h2></div><span className="answered-pill">{answered} / 8 answered</span></div>
          <div className="reading-navigator" aria-label="Jump to question">
            {miniQuestions.map(question => (
              <button type="button" key={question.id} className={`reading-nav-number ${draft.answers[question.id]?.trim() ? 'is-answered' : ''}`} aria-label={`Question ${question.id}, ${draft.answers[question.id]?.trim() ? 'answered' : 'unanswered'}`} onClick={() => document.getElementById(`reading-question-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>{question.id}</button>
            ))}
          </div>
          {miniQuestions.map(question => (
            <div key={question.id}>
            {question.id === 1 && <div className="reading-group-heading"><strong>Questions 1–4</strong><span>TRUE / FALSE / NOT GIVEN</span></div>}
            {question.id === 5 && <div className="reading-group-heading reading-inline-group"><strong>Questions 5–6</strong><span>MULTIPLE CHOICE</span></div>}
            {question.id === 7 && <div className="reading-group-heading reading-inline-group"><strong>Questions 7–8</strong><span>SHORT ANSWERS</span></div>}
            <fieldset className="reading-question" id={`reading-question-${question.id}`} disabled={draft.submitted}>
              <legend><span className="question-number">{question.id}</span>{question.prompt}</legend>
              {question.kind === 'short' ? (
                <div className="reading-short-wrap">
                  <label htmlFor={`short-answer-${question.id}`}>Your answer</label>
                  <input id={`short-answer-${question.id}`} autoComplete="off" className="reading-short-answer" type="text" value={draft.answers[question.id] ?? ''} onChange={event => choose(question.id, event.target.value)} placeholder="Type your answer" />
                </div>
              ) : (
                <div className="reading-answer-options">
                  {(question.kind === 'tfng' ? ['TRUE', 'FALSE', 'NOT GIVEN'].map(value => ({ value, label: value })) : question.options ?? []).map(option => (
                    <label key={option.value} className={`reading-answer-option ${draft.answers[question.id] === option.value ? 'selected' : ''}`}>
                      <input type="radio" name={`mini-question-${question.id}`} value={option.value} checked={draft.answers[question.id] === option.value} onChange={() => choose(question.id, option.value)}/>
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              )}
              {draft.submitted && <div className={`reading-explanation ${isCorrectAnswer(question.id, draft.answers[question.id]) ? 'is-correct' : ''}`}>
                <strong>{isCorrectAnswer(question.id, draft.answers[question.id]) ? 'Correct' : 'Needs review'} · Answer: {question.correct}</strong>
                <p>{question.explanation}</p>
              </div>}
            </fieldset>
            </div>
          ))}
          <div className="reading-actions">
            {draft.submitted ? <button className="button button-secondary" type="button" onClick={restart}><RotateCcw size={17} aria-hidden="true" /> Try again</button> :
              <button className="button button-primary" type="button" onClick={finish}>Submit mini-test <ArrowRight size={18} aria-hidden="true" /></button>}
            <span className="reading-save"><ShieldCheck size={16} aria-hidden="true" /> {saveOk ? 'Answers stored in this browser' : 'Browser storage unavailable — keep this tab open'}</span>
          </div>
        </section>
      </div>
    </div>
  )
}
