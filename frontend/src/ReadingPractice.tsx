import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, RotateCcw, ShieldCheck } from 'lucide-react'
import { cityShadeTest } from './reading/miniTest'
import { gradeReadingTest } from './reading/grading'
import PassageNavigator from './reading/PassageNavigator'
import type { ReadingQuestion, ReadingTest } from './reading/types'
import './ReadingPractice.css'

// Keeping this shape preserves the existing App.tsx onComplete callback.
export type ReadingAttempt = {
  completedAt: string
  correct: number
  total: number
  kind: 'reading-mini' | 'reading-two-passage'
}

type Draft = {
  startedAt: number
  answers: Record<string, string>
  submitted: boolean
}

const OLD_MINI_DRAFT_KEY = 'practice-room-reading-mini-draft-v1'

function draftKey(test: ReadingTest): string {
  return test.id === cityShadeTest.id
    ? OLD_MINI_DRAFT_KEY
    : `practice-room-reading-${test.id}-draft-v1`
}

function freshDraft(): Draft {
  return { startedAt: Date.now(), answers: {}, submitted: false }
}

function loadDraft(test: ReadingTest): Draft {
  try {
    const saved = window.localStorage.getItem(draftKey(test))
    if (!saved) return freshDraft()
    const parsed: unknown = JSON.parse(saved)
    if (typeof parsed !== 'object' || parsed === null) return freshDraft()

    const candidate = parsed as Partial<Draft>
    const startedAt = candidate.startedAt
    if (
      typeof startedAt !== 'number' ||
      !Number.isFinite(startedAt) ||
      startedAt > Date.now() ||
      startedAt <= Date.now() - 30 * 24 * 60 * 60 * 1000 ||
      typeof candidate.answers !== 'object' ||
      candidate.answers === null ||
      typeof candidate.submitted !== 'boolean'
    ) return freshDraft()

    // Convert older mini-test answers (keyed as "1", "2", etc.) into the
    // stable question IDs used by the reusable grading engine.
    const storedAnswers = candidate.answers as Record<string, unknown>
    const answers: Record<string, string> = {}
    for (const question of test.passages.flatMap(passage => passage.questions)) {
      const savedAnswer = storedAnswers[question.id] ?? storedAnswers[String(question.number)]
      if (typeof savedAnswer === 'string') answers[question.id] = savedAnswer
    }
    return { startedAt, answers, submitted: candidate.submitted }
  } catch {
    // Storage might be unavailable or contain an older invalid draft.
    return freshDraft()
  }
}

const kindLabels: Record<ReadingQuestion['type'], string> = {
  tfng: 'TRUE / FALSE / NOT GIVEN',
  choice: 'MULTIPLE CHOICE',
  short: 'SHORT ANSWERS',
}

function lastQuestionInGroup(questions: ReadingQuestion[], index: number): number {
  let end = index
  while (end + 1 < questions.length && questions[end + 1].type === questions[index].type) end++
  return questions[end].number
}

export default function ReadingPractice({
  onComplete,
  test = cityShadeTest,
}: {
  onComplete: (attempt: ReadingAttempt) => void
  test?: ReadingTest
}) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(test))
  const [now, setNow] = useState(Date.now)
  const [activeIndex, setActiveIndex] = useState(0)
  const completed = useRef(draft.submitted)
  const [saveOk, setSaveOk] = useState(true)

  const activePassage = test.passages[activeIndex]
  const result = gradeReadingTest(test, draft.answers)
  const resultsById = new Map(result.questions.map(question => [question.questionId, question]))
  const answered = result.total - result.unanswered
  const remainingSeconds = Math.max(
    0,
    Math.ceil((draft.startedAt + test.durationMinutes * 60_000 - now) / 1000)
  )
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60

  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey(test), JSON.stringify(draft))
      setSaveOk(true)
    } catch {
      setSaveOk(false)
    }
  }, [draft, test])

  useEffect(() => {
    if (draft.submitted) return
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [draft.submitted])

  // The start timestamp is saved so refreshing the tab never resets the clock.
  useEffect(() => {
    if (draft.submitted || remainingSeconds > 0 || completed.current) return
    completed.current = true
    setDraft(previous => ({ ...previous, submitted: true }))
    onComplete({
      completedAt: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
      kind: test.id === cityShadeTest.id ? 'reading-mini' : 'reading-two-passage',
    })
  }, [draft.submitted, remainingSeconds, result.correct, result.total, onComplete])

  function choose(questionId: string, value: string) {
    if (draft.submitted || remainingSeconds === 0) return
    setDraft(previous => ({
      ...previous,
      answers: { ...previous.answers, [questionId]: value },
    }))
  }

  function finish() {
    if (draft.submitted || completed.current) return
    if (
      result.unanswered > 0 &&
      !window.confirm(`${result.unanswered} question(s) are unanswered. Submit anyway?`)
    ) return

    completed.current = true
    setDraft(previous => ({ ...previous, submitted: true }))
    onComplete({
      completedAt: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
      kind: test.id === cityShadeTest.id ? 'reading-mini' : 'reading-two-passage',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function restart() {
    if (!window.confirm('Start a new test? This clears your answers for this attempt.')) return
    completed.current = false
    setDraft(freshDraft())
    setNow(Date.now())
    setActiveIndex(0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="page-section exam-page reading-mini">
      <a className="back-link" href="#/practice">
        <ArrowLeft size={17} aria-hidden="true" /> All practice
      </a>

      <header className="reading-mini-header">
        <div>
          <p className="eyebrow">READING · ORIGINAL PRACTICE</p>
          <h1>{draft.submitted ? 'Review your answers' : test.title}</h1>
          <p className="reading-mini-subtitle">
            {result.total} questions · {test.durationMinutes} minutes · Not an official IELTS test
          </p>
        </div>
        <div
          className={`reading-clock ${remainingSeconds <= 120 && !draft.submitted ? 'reading-clock-urgent' : ''}`}
          role="timer"
          aria-label={draft.submitted ? 'Test finished' : `${minutes} minutes and ${seconds} seconds remaining`}
        >
          <Clock3 size={19} aria-hidden="true" />
          <span>
            {draft.submitted ? 'Finished' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
          </span>
        </div>
      </header>

      {draft.submitted && (
        <section className="reading-result" aria-live="polite">
          <div>
            <p className="eyebrow">PRACTICE RESULT</p>
            <h2>{result.correct} / {result.total} correct</h2>
            <p>This is a raw practice score, not an official IELTS band. Review the explanations beside each answer.</p>
          </div>
          <button type="button" className="button button-secondary" onClick={restart}>
            <RotateCcw size={17} aria-hidden="true" /> New attempt
          </button>
        </section>
      )}

      {test.passages.length > 1 && (
        <PassageNavigator
          test={test}
          activeIndex={activeIndex}
          answers={draft.answers}
          onChange={setActiveIndex}
        />
      )}

      <div className="reading-mini-grid">
        <section className="paper-panel reading-passage" aria-labelledby="reading-passage-title">
          <p className="eyebrow">PASSAGE {activeIndex + 1}</p>
          <h2 id="reading-passage-title">{activePassage.title}</h2>
          {activePassage.paragraphs.map((paragraph, index) => (
            <p key={`${activePassage.id}-${index}`} className="passage-text">{paragraph}</p>
          ))}
          <p className="source-label">Original practice passage created for this website.</p>
        </section>

        <section className="paper-panel reading-questions" aria-labelledby="reading-questions-title">
          <div className="reading-questions-head">
            <div>
              <p className="eyebrow">ANSWER SHEET</p>
              <h2 id="reading-questions-title">
                Questions {activePassage.questions[0]?.number ?? '–'}–{activePassage.questions.at(-1)?.number ?? '–'}
              </h2>
            </div>
            <span className="answered-pill">{answered} / {result.total} answered</span>
          </div>

          <div className="reading-navigator" aria-label="Jump to question">
            {activePassage.questions.map(question => (
              <button
                type="button"
                key={question.id}
                className={`reading-nav-number ${draft.answers[question.id]?.trim() ? 'is-answered' : ''}`}
                aria-label={`Question ${question.number}, ${draft.answers[question.id]?.trim() ? 'answered' : 'unanswered'}`}
                onClick={() => document.getElementById(`reading-question-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                {question.number}
              </button>
            ))}
          </div>

          {activePassage.questions.map((question, index) => {
            const graded = resultsById.get(question.id)
            const selected = draft.answers[question.id] ?? ''
            const startsGroup = index === 0 || activePassage.questions[index - 1].type !== question.type
            const options = question.type === 'tfng'
              ? ['TRUE', 'FALSE', 'NOT GIVEN'].map(value => ({ value, label: value }))
              : question.options ?? []

            return (
              <div key={question.id}>
                {startsGroup && (
                  <div className={`reading-group-heading ${index > 0 ? 'reading-inline-group' : ''}`}>
                    <strong>Questions {question.number}–{lastQuestionInGroup(activePassage.questions, index)}</strong>
                    <span>{kindLabels[question.type]}</span>
                  </div>
                )}

                <fieldset
                  className="reading-question"
                  id={`reading-question-${question.id}`}
                  disabled={draft.submitted}
                >
                  <legend><span className="question-number">{question.number}</span>{question.prompt}</legend>
                  {question.type === 'short' ? (
                    <div className="reading-short-wrap">
                      <label htmlFor={`short-answer-${question.id}`}>Your answer</label>
                      <input
                        id={`short-answer-${question.id}`}
                        autoComplete="off"
                        className="reading-short-answer"
                        type="text"
                        value={selected}
                        onChange={event => choose(question.id, event.target.value)}
                        placeholder="Type your answer"
                      />
                    </div>
                  ) : (
                    <div className="reading-answer-options">
                      {options.map(option => (
                        <label
                          key={option.value}
                          className={`reading-answer-option ${selected === option.value ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`reading-question-${question.id}`}
                            value={option.value}
                            checked={selected === option.value}
                            onChange={() => choose(question.id, option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {draft.submitted && graded && (
                    <div className={`reading-explanation ${graded.isCorrect ? 'is-correct' : ''}`}>
                      <strong>
                        {graded.isCorrect ? 'Correct' : 'Needs review'} · Answer: {graded.correctAnswers.join(' / ')}
                      </strong>
                      <p>{graded.explanation}</p>
                    </div>
                  )}
                </fieldset>
              </div>
            )
          })}

          <div className="reading-actions">
            {draft.submitted ? (
              <button className="button button-secondary" type="button" onClick={restart}>
                <RotateCcw size={17} aria-hidden="true" /> Try again
              </button>
            ) : (
              <button className="button button-primary" type="button" onClick={finish}>
                Submit practice <ArrowRight size={18} aria-hidden="true" />
              </button>
            )}
            <span className="reading-save">
              <ShieldCheck size={16} aria-hidden="true" />
              {saveOk ? 'Answers stored in this browser' : 'Browser storage unavailable — keep this tab open'}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
