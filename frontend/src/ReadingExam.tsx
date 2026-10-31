
import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'

import { cityShadeTest } from './reading/miniTest'
import { gradeReadingTest } from './reading/grading'
import PassageNavigator from './reading/PassageNavigator'
import {
  clearDraft, freshDraft, readDraft, remainingSeconds as getRemainingSeconds,
  sameHeadingSet, saveDraft,
} from './reading/sessionStorage'
import type { ReadingDraft, StorageResult } from './reading/sessionStorage'
import type {
  ReadingQuestion,
  ReadingTest,
} from './reading/types'

import './ReadingPractice.css'

export type ReadingAttempt = {
  completedAt: string
  correct: number
  total: number
  kind: 'reading-mini' | 'reading-two-passage'
}

const kindLabels: Record<
  ReadingQuestion['type'],
  string
> = {
  tfng: 'TRUE / FALSE / NOT GIVEN',
  choice: 'MULTIPLE CHOICE',
  short: 'SHORT ANSWERS',
  'matching-headings': 'MATCHING HEADINGS',
}

function lastQuestionInGroup(
  questions: ReadingQuestion[],
  index: number
): number {
  let end = index

  while (
    end + 1 < questions.length &&
    questions[end + 1].type === questions[index].type
  ) {
    end++
  }

  return questions[end].number
}

// Green review styling uses the existing success theme color.
const correctAnswerStyle = {
  borderColor: 'var(--success, #16803c)',
  backgroundColor:
    'color-mix(in srgb, var(--success, #16803c) 10%, var(--surface))',
}

export default function ReadingPractice({
  onComplete,
  test = cityShadeTest,
  allowNewDraft = false,
}: {
  onComplete: (attempt: ReadingAttempt) => void
  test?: ReadingTest
  allowNewDraft?: boolean
}) {
  const [initial] = useState(() => readDraft(test))
  // A draft disappearing between Resume and mounting must not start a new test.
  const canRun = initial.kind === 'valid' ||
    (initial.kind === 'missing' && allowNewDraft)
  const [draft, setDraft] = useState<ReadingDraft>(
    () => initial.kind === 'valid' ? initial.draft : freshDraft()
  )

  const [now, setNow] = useState(Date.now)
  const [activeIndex, setActiveIndex] = useState(0)
  const [saveResult, setSaveResult] = useState<StorageResult>(
    initial.kind === 'valid' ? { kind: 'ok' } : { kind: 'unavailable' }
  )
  const [storageError, setStorageError] = useState('')

  const completed = useRef(draft.submitted)

  const activePassage = test.passages[activeIndex]

  const result = gradeReadingTest(
    test,
    draft.answers
  )

  const resultsById = new Map(
    result.questions.map((question) => [
      question.questionId,
      question,
    ])
  )

  const answered =
    result.total - result.unanswered

  const remainingSeconds = getRemainingSeconds(test, draft, now)

  const minutes = Math.floor(
    remainingSeconds / 60
  )

  const seconds = remainingSeconds % 60

  // Revalidate before every save. Invalid drafts are never replaced by autosave.
  useEffect(() => {
    if (canRun) setSaveResult(saveDraft(test, draft))
  }, [draft, test, canRun])

  // Update countdown.
  useEffect(() => {
    if (!canRun || draft.submitted) return

    const interval = window.setInterval(
      () => setNow(Date.now()),
      1000
    )

    return () => window.clearInterval(interval)
  }, [draft.submitted, canRun])

  // Submit automatically when time expires.
  useEffect(() => {
    if (
      !canRun ||
      draft.submitted ||
      remainingSeconds > 0 ||
      completed.current
    ) {
      return
    }

    completed.current = true

    setDraft((previous) => ({
      ...previous,
      submitted: true,
    }))

    onComplete({
      completedAt: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
      kind:
        test.id === cityShadeTest.id
          ? 'reading-mini'
          : 'reading-two-passage',
    })
  }, [
    canRun,
    draft.submitted,
    remainingSeconds,
    result.correct,
    result.total,
    onComplete,
    test.id,
  ])

  // Save a student's answer.
  function choose(
    questionId: string,
    value: string
  ) {
    if (
      draft.submitted ||
      remainingSeconds === 0
    ) {
      return
    }

    const passage = test.passages.find(
      (passage) =>
        passage.questions.some(
          (question) => question.id === questionId
        )
    )

    const question = passage?.questions.find(
      (question) => question.id === questionId
    )

    setDraft((previous) => {
      const answers = {
        ...previous.answers,
        [questionId]: value,
      }

      // Matching Headings: move an already-used
      // heading to the newly selected question.
      if (
        question?.type === 'matching-headings' &&
        passage
      ) {
        for (const other of passage.questions) {
          if (
            other.id !== questionId &&
            sameHeadingSet(question, other) &&
            answers[other.id] === value
          ) {
            delete answers[other.id]
          }
        }
      }

      return {
        ...previous,
        answers,
      }
    })
  }

  function revalidateAction(): boolean {
    const current = readDraft(test)
    if (current.kind === 'invalid' || current.kind === 'unavailable') {
      setSaveResult(current)
      setStorageError('The saved draft could not be verified. It has not been replaced. Keep this tab open and restore storage access, or return to test options for recovery.')
      return false
    }
    if (current.kind === 'valid' &&
        (current.draft.startedAt !== draft.startedAt ||
         current.draft.submitted !== draft.submitted)) {
      setSaveResult({ kind: 'conflict' })
      setStorageError('The saved session has changed in another tab. Reload to check it before continuing.')
      return false
    }
    setStorageError('')
    return true
  }

  function finish() {
    if (
      draft.submitted ||
      completed.current
    ) {
      return
    }

    if (!revalidateAction()) return

    if (
      result.unanswered > 0 &&
      !window.confirm(
        `${result.unanswered} question(s) are unanswered. Submit anyway?`
      )
    ) {
      return
    }

    completed.current = true

    setDraft((previous) => ({
      ...previous,
      submitted: true,
    }))

    onComplete({
      completedAt: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
      kind:
        test.id === cityShadeTest.id
          ? 'reading-mini'
          : 'reading-two-passage',
    })

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  function restart() {
    const current = readDraft(test)
    if (current.kind === 'unavailable') {
      setSaveResult(current)
      setStorageError('Could not check browser storage. Your current answers have not been cleared.')
      return
    }
    const message = current.kind === 'invalid'
      ? 'The stored draft is invalid or outside the 30-day retention period. Discard it and your current answers to start again?'
      : 'Start a new test? This clears your answers for this attempt.'
    if (!window.confirm(message)) return
    const cleared = clearDraft(test, current.kind === 'invalid')
    if (cleared.kind !== 'ok') {
      setSaveResult(cleared)
      setStorageError('Could not clear the saved draft. Your current answers have not been reset.')
      return
    }
    completed.current = false
    const fresh = freshDraft()
    setDraft(fresh)
    setNow(fresh.startedAt)
    setActiveIndex(0)
    setSaveResult({ kind: 'unavailable' })
    setStorageError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!canRun) {
    return (
      <div className="page-section exam-page reading-mini">
        <section className="paper-panel session-panel">
          <h1>Saved test needs attention</h1>
          <p role="alert">The saved draft could not be loaded. Nothing has been cleared or replaced.</p>
          <a className="button button-secondary" href="#/practice">All practice</a>
        </section>
      </div>
    )
  }

  return (
    <div className="page-section exam-page reading-mini">

      <a
        className="back-link"
        href="#/practice"
      >
        <ArrowLeft
          size={17}
          aria-hidden="true"
        />
        All practice
      </a>

      <header className="reading-mini-header">
        <div>
          <p className="eyebrow">
            READING · ORIGINAL PRACTICE
          </p>

          <h1>
            {draft.submitted
              ? 'Review your answers'
              : test.title}
          </h1>

          <p className="reading-mini-subtitle">
            {result.total} questions ·{' '}
            {test.durationMinutes} minutes ·{' '}
            Not an official IELTS test
          </p>
        </div>

        <div
          className={`reading-clock ${
            remainingSeconds <= 120 &&
            !draft.submitted
              ? 'reading-clock-urgent'
              : ''
          }`}
          role="timer"
          aria-label={
            draft.submitted
              ? 'Test finished'
              : `${minutes} minutes and ${seconds} seconds remaining`
          }
        >
          <Clock3
            size={19}
            aria-hidden="true"
          />

          <span>
            {draft.submitted
              ? 'Finished'
              : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
          </span>
        </div>
      </header>

      {draft.submitted && (
        <section
          className="reading-result"
          aria-live="polite"
        >
          <div>
            <p className="eyebrow">
              PRACTICE RESULT
            </p>

            <h2>
              {result.correct} / {result.total} correct
            </h2>

            <p>
              This is a raw practice score,
              not an official IELTS band.
              Review the explanations beside each answer.
            </p>
          </div>

          <button
            type="button"
            className="button button-secondary"
            onClick={restart}
          >
            <RotateCcw
              size={17}
              aria-hidden="true"
            />
            New attempt
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

      {storageError && <p role="alert" className="session-error">{storageError}</p>}

      <div className="reading-mini-grid">

        {/* Reading passage */}
        <section
          className="paper-panel reading-passage"
          aria-labelledby="reading-passage-title"
        >
          <p className="eyebrow">
            PASSAGE {activeIndex + 1}
          </p>

          <h2 id="reading-passage-title">
            {activePassage.title}
          </h2>

          {activePassage.paragraphs.map(
            (paragraph, index) => (
              <p
                key={`${activePassage.id}-${index}`}
                className="passage-text"
              >
                {paragraph}
              </p>
            )
          )}

          <p className="source-label">
            Original practice passage created for this website.
          </p>
        </section>

        {/* Questions */}
        <section
          className="paper-panel reading-questions"
          aria-labelledby="reading-questions-title"
        >
          <div className="reading-questions-head">
            <div>
              <p className="eyebrow">
                ANSWER SHEET
              </p>

              <h2 id="reading-questions-title">
                Questions{' '}
                {activePassage.questions[0]?.number ?? '–'}
                –
                {activePassage.questions.at(-1)?.number ?? '–'}
              </h2>
            </div>

            <span className="answered-pill">
              {answered} / {result.total} answered
            </span>
          </div>

          {/* Question navigator with review colors */}
          <div
            className="reading-navigator"
            aria-label="Jump to question"
          >
            {activePassage.questions.map((question) => {
              const isAnswered = Boolean(
                draft.answers[question.id]?.trim()
              )

              const graded = resultsById.get(
                question.id
              )

              return (
                <button
                  type="button"
                  key={question.id}
                  className={`reading-nav-number ${
                    isAnswered ? 'is-answered' : ''
                  }`}
                  style={
                    draft.submitted &&
                    graded?.isCorrect
                      ? correctAnswerStyle
                      : undefined
                  }
                  aria-label={`Question ${question.number}, ${
                    draft.submitted
                      ? graded?.isCorrect
                        ? 'correct'
                        : isAnswered
                          ? 'incorrect'
                          : 'unanswered'
                      : isAnswered
                        ? 'answered'
                        : 'unanswered'
                  }`}
                  onClick={() =>
                    document
                      .getElementById(
                        `reading-question-${question.id}`
                      )
                      ?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      })
                  }
                >
                  {question.number}
                </button>
              )
            })}
          </div>

          {/* Matching Headings instructions */}
          {activePassage.questions.some(
            (question) =>
              question.type === 'matching-headings'
          ) &&
            !draft.submitted && (
              <p
                className="reading-save"
                style={{ marginBottom: 20 }}
              >
                Each heading can be used once.
                Choosing a heading already used elsewhere
                moves it to this question.
              </p>
            )}

          {/* Render questions */}
          {activePassage.questions.map(
            (question, index) => {
              const graded = resultsById.get(
                question.id
              )

              const selected =
                draft.answers[question.id] ?? ''

              const startsGroup =
                index === 0 ||
                activePassage.questions[index - 1].type !==
                  question.type

              const options =
                question.type === 'tfng'
                  ? ['TRUE', 'FALSE', 'NOT GIVEN'].map(
                      (value) => ({
                        value,
                        label: value,
                      })
                    )
                  : question.options ?? []

              return (
                <div key={question.id}>

                  {startsGroup && (
                    <div
                      className={`reading-group-heading ${
                        index > 0
                          ? 'reading-inline-group'
                          : ''
                      }`}
                    >
                      <strong>
                        Questions {question.number}–
                        {lastQuestionInGroup(
                          activePassage.questions,
                          index
                        )}
                      </strong>

                      <span>
                        {kindLabels[question.type]}
                      </span>
                    </div>
                  )}

                  <fieldset
                    className="reading-question"
                    id={`reading-question-${question.id}`}
                    disabled={draft.submitted}
                  >
                    <legend>
                      <span className="question-number">
                        {question.number}
                      </span>

                      {question.prompt}
                    </legend>

                    {question.type === 'short' ? (
                      <div className="reading-short-wrap">
                        <label
                          htmlFor={`short-answer-${question.id}`}
                        >
                          Your answer
                        </label>

                        <input
                          id={`short-answer-${question.id}`}
                          autoComplete="off"
                          className="reading-short-answer"
                          type="text"
                          value={selected}
                          style={
                            draft.submitted &&
                            selected.trim() &&
                            graded?.isCorrect
                              ? correctAnswerStyle
                              : undefined
                          }
                          onChange={(event) =>
                            choose(
                              question.id,
                              event.target.value
                            )
                          }
                          placeholder="Type your answer"
                        />
                      </div>
                    ) : (
                      <div className="reading-answer-options">
                        {options.map((option) => {
                          const isSelected =
                            selected === option.value

                          const correctSelection =
                            draft.submitted &&
                            isSelected &&
                            graded?.isCorrect

                          const usedIn =
                            question.type === 'matching-headings'
                              ? activePassage.questions.find(
                                  (other) =>
                                    other.id !== question.id &&
                                    sameHeadingSet(
                                      question,
                                      other
                                    ) &&
                                    draft.answers[other.id] ===
                                      option.value
                                )
                              : undefined

                          return (
                            <label
                              key={option.value}
                              className={`reading-answer-option ${
                                isSelected ? 'selected' : ''
                              }`}
                              style={
                                correctSelection
                                  ? correctAnswerStyle
                                  : undefined
                              }
                            >
                              <input
                                type="radio"
                                name={`reading-question-${question.id}`}
                                value={option.value}
                                checked={isSelected}
                                style={
                                  correctSelection
                                    ? {
                                        accentColor:
                                          'var(--success, #16803c)',
                                      }
                                    : undefined
                                }
                                onChange={() =>
                                  choose(
                                    question.id,
                                    option.value
                                  )
                                }
                              />

                              <span>
                                {option.label}
                              </span>

                              {draft.submitted &&
                                isSelected && (
                                  <span
                                    style={{
                                      marginLeft: 'auto',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      color: graded?.isCorrect
                                        ? 'var(--success, #16803c)'
                                        : 'var(--accent-ink)',
                                    }}
                                  >
                                    {graded?.isCorrect
                                      ? 'Correct'
                                      : 'Incorrect'}
                                  </span>
                                )}

                              {!draft.submitted &&
                                usedIn && (
                                  <span
                                    style={{
                                      marginLeft: 'auto',
                                      color: 'var(--muted)',
                                      fontSize: 12,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    Used in Q{usedIn.number}
                                  </span>
                                )}
                            </label>
                          )
                        })}
                      </div>
                    )}

                    {draft.submitted && graded && (
                      <div
                        className={`reading-explanation ${
                          graded.isCorrect
                            ? 'is-correct'
                            : ''
                        }`}
                      >
                        <strong>
                          {graded.isCorrect
                            ? 'Correct'
                            : 'Needs review'}
                          {' · '}Answer:{' '}
                          {graded.correctAnswers.join(' / ')}
                        </strong>

                        <p>
                          {graded.explanation}
                        </p>
                      </div>
                    )}
                  </fieldset>
                </div>
              )
            }
          )}

          <div className="reading-actions">
            {draft.submitted ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={restart}
              >
                <RotateCcw
                  size={17}
                  aria-hidden="true"
                />
                Try again
              </button>
            ) : (
              <button
                className="button button-primary"
                type="button"
                onClick={finish}
              >
                Submit practice
                <ArrowRight
                  size={18}
                  aria-hidden="true"
                />
              </button>
            )}

            <span className="reading-save">
              <ShieldCheck
                size={16}
                aria-hidden="true"
              />

              {saveResult.kind === 'ok'
                ? 'Answers stored in this browser'
                : saveResult.kind === 'invalid' || saveResult.kind === 'conflict'
                  ? 'Saved draft changed or is invalid. Current answers are not saved — keep this tab open'
                  : 'Answers are not saved. Browser storage is unavailable — keep this tab open'}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
