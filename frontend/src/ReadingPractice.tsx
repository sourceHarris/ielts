
import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Clock3,
  RotateCcw,
} from 'lucide-react'

import ReadingExam from './ReadingExam'
import type { ReadingAttempt } from './ReadingExam'
import { cityShadeTest } from './reading/miniTest'
import type { ReadingTest } from './reading/types'
import { clearDraft, readDraft, saveDraft, sessionInfo } from './reading/sessionStorage'
import type { DraftRead, StorageResult } from './reading/sessionStorage'
import './ReadingPractice.css'

export type { ReadingAttempt } from './ReadingExam'

type Props = {
  onComplete: (attempt: ReadingAttempt) => void
  test?: ReadingTest
}

export default function ReadingPractice({
  onComplete,
  test = cityShadeTest,
}: Props) {
  const [saved, setSaved] = useState(() => readDraft(test))
  const session = sessionInfo(saved)
  const [openExam, setOpenExam] = useState<'new' | 'saved' | null>(null)
  const [error, setError] = useState('')

  const totalQuestions = test.passages.reduce(
    (total, passage) => total + passage.questions.length, 0
  )

  function revalidate(): DraftRead {
    const current = readDraft(test)
    setSaved(current)
    setError('')
    return current
  }

  function reportFailure(result: StorageResult) {
    setError(result.kind === 'invalid'
      ? 'The saved draft changed or is invalid. It has not been removed.'
      : 'Browser storage could not be accessed. The saved draft has not been cleared or replaced. Try again.')
  }

  function startNew() {
    const current = revalidate()
    if (current.kind === 'unavailable') {
      reportFailure(current)
      return
    }
    if (current.kind === 'invalid' && !window.confirm(
      'This saved draft is invalid or outside the 30-day retention period. Discard it and start a new test?'
    )) return
    if (current.kind === 'valid' && current.session.status === 'active' &&
        current.session.answered > 0 && !window.confirm(
          'Start over? Your unfinished answers will be cleared.'
        )) return

    const cleared = clearDraft(test, current.kind === 'invalid')
    if (cleared.kind !== 'ok') {
      reportFailure(cleared)
      return
    }
    setOpenExam('new')
  }

  function resumeOrReview() {
    const current = revalidate()
    if (current.kind !== 'valid') {
      setError(current.kind === 'missing'
        ? 'The previous attempt was not found. Start a new test when ready.'
        : 'The saved attempt could not be opened. It has not been replaced.')
      return
    }
    if (current.session.status === 'expired') {
      setError('The timer has expired. You can review saved answers or start a new attempt.')
      return
    }
    setOpenExam('saved')
  }

  function reviewExpired() {
    const current = revalidate()
    if (current.kind !== 'valid') {
      setError('The saved attempt could not be opened. It has not been replaced.')
      return
    }
    if (current.session.status === 'active') {
      setError('The saved session has changed. Resume the active test instead.')
      return
    }
    if (current.session.status === 'expired') {
      // Freeze for review without adding an automatic result to Progress.
      const result = saveDraft(test, { ...current.draft, submitted: true })
      if (result.kind !== 'ok') {
        setError('Could not save the review state. Your previous answers have not been replaced.')
        return
      }
    }
    setOpenExam('saved')
  }

  if (openExam) {
    return (
      <ReadingExam
        test={test}
        onComplete={onComplete}
        allowNewDraft={openExam === 'new'}
      />
    )
  }

  return (
    <div className="page-section exam-page reading-mini">
      <a
        className="back-link"
        href="#/practice"
      >
        <ArrowLeft size={17} aria-hidden="true" />
        All practice
      </a>

      <header className="page-intro">
        <p className="eyebrow">
          READING · ORIGINAL PRACTICE
        </p>

        <h1>{test.title}</h1>

        <p className="intro-description">
          Choose how you want to continue.
          Practice and review your answers in this browser.
        </p>
      </header>

      <section
        className="paper-panel session-panel"
      >
        <div
          className="session-metadata"
        >
          <span className="answered-pill">
            <BookOpen
              size={15}
              aria-hidden="true"
            />
            {test.passages.length} passage
            {test.passages.length !== 1 ? 's' : ''}
          </span>

          <span className="answered-pill">
            {totalQuestions} questions
          </span>

          <span className="answered-pill">
            <Clock3
              size={15}
              aria-hidden="true"
            />
            {test.durationMinutes} minutes
          </span>
        </div>

        {session.status === 'new' && (
          <>
            <h2>Ready to begin?</h2>

            <p>
              Your timer starts when you select
              Start test. You can leave and return
              while your time is still running.
            </p>
          </>
        )}

        {session.status === 'active' && (
          <>
            <h2>You have an unfinished test</h2>

            <p>
              {session.answered} of {totalQuestions}
              {' '}questions answered.
              Resume with your original timer,
              or start a new attempt.
            </p>
          </>
        )}

        {session.status === 'finished' && (
          <>
            <h2>Previous attempt completed</h2>

            <p>
              Your previous attempt has{' '}
              {session.answered} answered questions.
              You can review its answers and
              explanations or start again.
            </p>
          </>
        )}

        {session.status === 'expired' && (
          <>
            <h2>Your previous timer expired</h2>

            <p>
              The old test period has ended.
              You can begin a fresh attempt
              {session.answered > 0
                ? ' or review your saved answers.'
                : '.'}
            </p>
          </>
        )}

        {session.status === 'invalid' && (
          <>
            <h2>Saved test needs attention</h2>
            <p role="alert">
              The saved draft is invalid or outside the 30-day retention period.
              It has been kept unchanged. Discard it only if you want to start again.
            </p>
          </>
        )}
        {session.status === 'unavailable' && (
          <>
            <h2>Browser storage is unavailable</h2>
            <p role="alert">We cannot check your saved answers. Restore storage access and try again.</p>
          </>
        )}

        <div
          className="session-actions"
        >
          {session.status === 'invalid' && (
            <button type="button" className="button button-secondary" onClick={startNew}>
              Discard saved draft and start new
            </button>
          )}
          {session.status === 'unavailable' && (
            <button type="button" className="button button-secondary" onClick={revalidate}>
              Try again
            </button>
          )}
          {session.status === 'new' && (
            <button
              type="button"
              className="button button-primary"
              onClick={startNew}
            >
              Start test
            </button>
          )}

          {session.status === 'active' && (
            <>
              <button
                type="button"
                className="button button-primary"
                onClick={resumeOrReview}
              >
                Resume test
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={startNew}
              >
                <RotateCcw
                  size={17}
                  aria-hidden="true"
                />
                Start over
              </button>
            </>
          )}

          {session.status === 'finished' && (
            <>
              <button
                type="button"
                className="button button-primary"
                onClick={resumeOrReview}
              >
                Review previous attempt
              </button>

              <button
                type="button"
                className="button button-secondary"
                onClick={startNew}
              >
                <RotateCcw
                  size={17}
                  aria-hidden="true"
                />
                Start new attempt
              </button>
            </>
          )}

          {session.status === 'expired' && (
            <>
              <button
                type="button"
                className="button button-primary"
                onClick={startNew}
              >
                Start new attempt
              </button>

              {session.answered > 0 && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={reviewExpired}
                >
                  Review saved answers
                </button>
              )}
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="session-error"
          >
            {error}
          </p>
        )}

        <p
          className="source-label session-note"
        >
          Original practice material. Results are
          not official IELTS band scores.
        </p>
      </section>
    </div>
  )
}
