
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

export type { ReadingAttempt } from './ReadingExam'

type SessionStatus =
  | 'new'
  | 'active'
  | 'finished'
  | 'expired'

type SessionInfo = {
  status: SessionStatus
  answered: number
}

type SavedDraft = {
  startedAt: number
  answers: Record<string, string>
  submitted: boolean
}

type Props = {
  onComplete: (attempt: ReadingAttempt) => void
  test?: ReadingTest
}

function getDraftKey(test: ReadingTest): string {
  if (test.id === cityShadeTest.id) {
    return 'practice-room-reading-mini-draft-v1'
  }

  return `practice-room-reading-${test.id}-draft-v1`
}

function getSessionInfo(test: ReadingTest): SessionInfo {
  const empty: SessionInfo = {
    status: 'new',
    answered: 0,
  }

  try {
    const raw = window.localStorage.getItem(
      getDraftKey(test)
    )

    if (!raw) return empty

    const parsed: unknown = JSON.parse(raw)

    if (
      typeof parsed !== 'object' ||
      parsed === null
    ) {
      return empty
    }

    const draft = parsed as Partial<SavedDraft>

    if (
      typeof draft.startedAt !== 'number' ||
      !Number.isFinite(draft.startedAt) ||
      draft.startedAt > Date.now() ||
      draft.startedAt <=
        Date.now() - 30 * 24 * 60 * 60 * 1000 ||
      typeof draft.answers !== 'object' ||
      draft.answers === null ||
      typeof draft.submitted !== 'boolean'
    ) {
      return empty
    }

    const answers = draft.answers as Record<
      string,
      unknown
    >

    const answered = test.passages
      .flatMap((passage) => passage.questions)
      .filter((question) => {
        const answer =
          answers[question.id] ??
          answers[String(question.number)]

        return (
          typeof answer === 'string' &&
          answer.trim().length > 0
        )
      }).length

    if (draft.submitted) {
      return {
        status: 'finished',
        answered,
      }
    }

    const expiresAt =
      draft.startedAt +
      test.durationMinutes * 60_000

    if (Date.now() >= expiresAt) {
      return {
        status: 'expired',
        answered,
      }
    }

    return {
      status: 'active',
      answered,
    }
  } catch {
    return empty
  }
}

export default function ReadingPractice({
  onComplete,
  test = cityShadeTest,
}: Props) {
  const [session] = useState<SessionInfo>(
    () => getSessionInfo(test)
  )

  const [openExam, setOpenExam] = useState(false)
  const [error, setError] = useState('')

  const totalQuestions = test.passages.reduce(
    (total, passage) =>
      total + passage.questions.length,
    0
  )

  function startNew() {
    if (
      session.status === 'active' &&
      session.answered > 0 &&
      !window.confirm(
        'Start over? Your unfinished answers will be cleared.'
      )
    ) {
      return
    }

    try {
      window.localStorage.removeItem(
        getDraftKey(test)
      )
    } catch {
      if (session.status !== 'new') {
        setError(
          'Could not clear the saved attempt. Check browser storage permissions.'
        )
        return
      }
    }

    setOpenExam(true)
  }

  function resumeOrReview() {
    setOpenExam(true)
  }

  function reviewExpired() {
    try {
      const key = getDraftKey(test)
      const raw = window.localStorage.getItem(key)

      if (!raw) {
        setError('The previous attempt was not found.')
        return
      }

      const draft = JSON.parse(raw) as SavedDraft

      // Freeze the expired draft for review.
      // Do not record an automatic score in Progress.
      window.localStorage.setItem(
        key,
        JSON.stringify({
          ...draft,
          submitted: true,
        })
      )

      setOpenExam(true)
    } catch {
      setError(
        'Could not open the expired attempt for review.'
      )
    }
  }

  if (openExam) {
    return (
      <ReadingExam
        test={test}
        onComplete={onComplete}
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
          Your answers are stored in this browser.
        </p>
      </header>

      <section
        className="paper-panel"
        style={{
          padding: 28,
          maxWidth: 680,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
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

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginTop: 24,
          }}
        >
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
            style={{
              marginTop: 16,
              color: '#b42330',
            }}
          >
            {error}
          </p>
        )}

        <p
          className="source-label"
          style={{ marginTop: 24 }}
        >
          Original practice material. Results are
          not official IELTS band scores.
        </p>
      </section>
    </div>
  )
}
