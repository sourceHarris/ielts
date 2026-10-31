
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Headphones,
  LayoutDashboard,
  Mic2,
  Moon,
  Sun,
  PenLine,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import PracticeLibrary from './PracticeLibrary'
import { PrivateLibrary, PrivateProgress } from './practice/PrivateLibrary'
import type { PracticeSkill } from './practice/privatePractice'
import ReadingHistoryReview from './ReadingHistoryReview'
import { HISTORY_CHANGED, readReadingAttempts } from './reading/attemptHistory'
import type { HistoryRead } from './reading/attemptHistory'
import ReadingPractice from './ReadingPractice'
import type { ReadingAttempt } from './ReadingPractice'
import { twoPassageTest } from './reading/twoPassageTest'
import { matchingHeadingsTest } from './reading/matchingHeadingsTest'
import './App.css'

const ImportReview = lazy(() => import('./practice/ImportReview'))
const PracticeWorkspace = lazy(() => import('./practice/PracticeWorkspace'))

type Theme = 'light' | 'dark'
type SkillId = 'reading' | 'listening' | 'writing' | 'speaking'
type Answer = 'TRUE' | 'FALSE' | 'NOT GIVEN'

type Page =
  | 'overview'
  | 'practice'
  | 'progress'
  | 'reading-demo'
  | 'reading-mini'
  | 'reading-two-passage'
  | 'reading-headings'
  | `reading-review/${string}`
  | `import/${string}`
  | `private-test/${string}`
  | `private-review/${string}`
  | `skill-${SkillId}`

type DemoAttempt = {
  archiveId?: string
  testTitle?: string
  completedAt: string
  correct: number
  total: number
  kind?:
    | 'reading-demo'
    | 'reading-mini'
    | 'reading-two-passage'
    | 'reading-headings'
}

const STORAGE_KEY = 'practice-room-reading-demo-v1'
const THEME_STORAGE_KEY = 'practice-room-theme'

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
      ? 'dark'
      : 'light'
  } catch {
    return 'light'
  }
}

const skills: Array<{
  id: SkillId
  title: string
  summary: string
  detail: string
  icon: LucideIcon
  note: string
}> = [
  {
    id: 'reading',
    title: 'Reading',
    summary: 'Understand passages. Find evidence. Answer with confidence.',
    detail:
      'Read a passage alongside its questions, record answers, and review the evidence behind each result.',
    icon: BookOpen,
    note: 'Mini-test available',
  },
  {
    id: 'listening',
    title: 'Listening',
    summary: 'Follow conversations and catch important details.',
    detail:
      'Practice with audio, questions, transcripts, and clear explanations after submission.',
    icon: Headphones,
    note: 'Audio & answer sheet',
  },
  {
    id: 'writing',
    title: 'Writing',
    summary: 'Develop arguments and describe information clearly.',
    detail:
      'Work on Task 1 and Task 2 in a focused editor, then receive carefully labelled AI-assisted feedback.',
    icon: PenLine,
    note: 'Task 1 & Task 2 editor',
  },
  {
    id: 'speaking',
    title: 'Speaking',
    summary: 'Practise speaking with time and structure.',
    detail:
      'Record answers, review transcripts, and explore evidence-based language feedback.',
    icon: Mic2,
    note: 'Record & play back',
  },
]

const readingPassage = [
  'The courtyard garden at Westfield Library opened to visitors in April. Volunteers water its plants every morning except Sunday.',
  'On Saturdays, a free gardening workshop begins at 10 a.m. The garden closes at 5 p.m. every day.',
]

const questions: Array<{
  id: number
  prompt: string
  correct: Answer
  explanation: string
}> = [
  {
    id: 1,
    prompt: 'The courtyard garden opened to visitors in April.',
    correct: 'TRUE',
    explanation:
      'The first sentence says that the garden opened to visitors in April.',
  },
  {
    id: 2,
    prompt: 'Volunteers water the plants every Sunday.',
    correct: 'FALSE',
    explanation:
      'The passage states that volunteers water the plants every morning except Sunday.',
  },
  {
    id: 3,
    prompt: 'Residents donated the plants in the garden.',
    correct: 'NOT GIVEN',
    explanation:
      'The passage describes opening hours and care, but gives no information about who donated plants.',
  },
]

const answerOptions: Answer[] = ['TRUE', 'FALSE', 'NOT GIVEN']

function readHistory(): DemoAttempt[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    if (!value) return []

    const parsed: unknown = JSON.parse(value)

    return Array.isArray(parsed)
      ? parsed.filter((item): item is DemoAttempt =>
          typeof item === 'object' && item !== null &&
          typeof item.completedAt === 'string' && Number.isFinite(Date.parse(item.completedAt)) &&
          Number.isInteger(item.correct) && Number.isInteger(item.total) &&
          item.total > 0 && item.correct >= 0 && item.correct <= item.total &&
          (item.testTitle === undefined || typeof item.testTitle === 'string') &&
          (item.archiveId === undefined || typeof item.archiveId === 'string'))
      : []
  } catch {
    return []
  }
}

function routeFromHash(): Page {
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash.startsWith('reading-review/')) return hash as Page
  if (/^import\/(reading|listening|writing|speaking)(\/[a-f0-9]{64})?$/.test(hash) ||
      /^private-(test|review)\/.+$/.test(hash)) return hash as Page

  if (
    hash === 'practice-ai' ||
    hash === 'practice-official'
  ) {
    return 'practice'
  }

  if (
    hash === 'practice' ||
    hash === 'progress' ||
    hash === 'reading-demo' ||
    hash === 'reading-mini' ||
    hash === 'reading-two-passage' ||
    hash === 'reading-headings'
  ) {
    return hash
  }

  const skill = hash.match(
    /^skill-(reading|listening|writing|speaking)$/
  )

  if (skill) {
    return `skill-${skill[1] as SkillId}`
  }

  return 'overview'
}

const navItems: Array<{
  id: Page
  title: string
  icon: LucideIcon
}> = [
  {
    id: 'overview',
    title: 'Overview',
    icon: LayoutDashboard,
  },
  {
    id: 'practice',
    title: 'Practice',
    icon: BookOpen,
  },
  {
    id: 'progress',
    title: 'Progress',
    icon: TrendingUp,
  },
]

function Nav({
  page,
  mobile = false,
}: {
  page: Page
  mobile?: boolean
}) {
  const selected =
    page.startsWith('reading-review/') || page.startsWith('private-review/') ? 'progress' :
    page.startsWith('import/') || page.startsWith('private-test/') ? 'practice' :
    page === 'reading-demo' ||
    page === 'reading-mini' ||
    page === 'reading-two-passage' ||
    page === 'reading-headings' ||
    page.startsWith('skill-')
      ? 'practice'
      : page

  return (
    <nav
      className={mobile ? 'bottom-nav' : 'sidebar-nav'}
      aria-label="Main navigation"
    >
      {navItems.map(({ id, title, icon: Icon }) => (
        <a
          key={id}
          href={`#/${id}`}
          className={`nav-item ${
            selected === id ? 'nav-item-active' : ''
          }`}
          aria-current={selected === id ? 'page' : undefined}
        >
          <Icon
            size={20}
            strokeWidth={1.9}
            aria-hidden="true"
          />
          <span>{title}</span>
        </a>
      ))}
    </nav>
  )
}

function ThemeToggle({
  theme,
  onToggle,
  compact = false,
}: {
  theme: Theme
  onToggle: () => void
  compact?: boolean
}) {
  const next = theme === 'light' ? 'dark' : 'light'
  const Icon = theme === 'light' ? Moon : Sun

  return (
    <button
      type="button"
      className={`theme-toggle${
        compact ? ' theme-toggle-compact' : ''
      }`}
      onClick={onToggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      <Icon
        size={18}
        strokeWidth={1.9}
        aria-hidden="true"
      />

      {!compact && (
        <span>
          {theme === 'light' ? 'Dark mode' : 'Light mode'}
        </span>
      )}
    </button>
  )
}

function Brand() {
  return (
    <a
      className="brand"
      href="#/overview"
      aria-label="Practice Room, back to overview"
    >
      <span className="brand-symbol" aria-hidden="true">
        <BookOpen size={21} strokeWidth={2} />
      </span>

      <span className="brand-copy">
        <strong>Practice Room</strong>
        <small>IELTS preparation</small>
      </span>
    </a>
  )
}

function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="intro-description">
        {description}
      </p>
    </header>
  )
}

function SkillCard({
  skill,
}: {
  skill: (typeof skills)[number]
}) {
  const Icon = skill.icon

  return (
    <a
      className="skill-card"
      href={`#/skill-${skill.id}`}
    >
      <span className="skill-icon" aria-hidden="true">
        <Icon size={25} strokeWidth={1.7} />
      </span>

      <span className="skill-card-text">
        <strong>{skill.title}</strong>
        <span>{skill.summary}</span>
      </span>

      <span className="skill-card-foot">
        <small>{skill.note}</small>
        <ArrowUpRight
          size={19}
          aria-hidden="true"
        />
      </span>
    </a>
  )
}

function Overview({
  history,
}: {
  history: DemoAttempt[]
}) {
  return (
    <div className="page-section">
      <PageIntro
        eyebrow="YOUR PRACTICE SPACE"
        title="A little practice. A clearer path."
        description="A calmer way to prepare for IELTS. Choose a skill, focus on the work, and learn from what you miss."
      />

      <section
        className="focus-panel"
        aria-labelledby="focus-title"
      >
        <div className="focus-main">
          <p className="eyebrow">
            YOUR NEXT SESSION
          </p>

          <h2 id="focus-title">
            Find your focus.
          </h2>

          <p>
            Open your private test library. Read, listen, write,
            or record a speaking session in one focused workspace.
          </p>

          <a
            className="button button-primary"
            href="#/practice"
          >
            Open your test library
            <ArrowRight
              size={18}
              aria-hidden="true"
            />
          </a>

          <small>
            Original material · Timed workspaces · Private session history
          </small>
        </div>

        <ol className="practice-method" aria-label="How practice works">
          <li>
            <BookOpen size={20} aria-hidden="true" />
            <div><strong>Read closely</strong><span>Find the details that matter.</span></div>
          </li>
          <li>
            <PenLine size={20} aria-hidden="true" />
            <div><strong>Make your choice</strong><span>Work at your own pace, within the timer.</span></div>
          </li>
          <li>
            <CheckCircle2 size={20} aria-hidden="true" />
            <div><strong>Understand why</strong><span>Review the evidence for each answer.</span></div>
          </li>
        </ol>
      </section>

      <div className="section-heading">
        <div>
          <h2>Four skills. One clear path.</h2>
          <p>Pick the area you want to improve.</p>
        </div>

        <a
          className="text-link"
          href="#/practice"
        >
          All practice
          <ArrowRight
            size={17}
            aria-hidden="true"
          />
        </a>
      </div>

      <section
        className="skill-grid"
        aria-label="IELTS practice skills"
      >
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
          />
        ))}
      </section>

      <section className="quiet-note">
        <div>
          <ShieldCheck
            size={21}
            aria-hidden="true"
          />
        </div>

        <p>
          <strong>
            Practice results, not official IELTS scores.
          </strong>{' '}
          Objective practice checks answers against a reviewed key.
          AI-assisted evaluation will be clearly identified
          when added.
        </p>
      </section>

      {history.length > 0 && (
        <section className="recent-strip">
          <div>
            <strong>
              Your Reading practice progress
            </strong>

            <p>
              {history.length} completed{' '}
              {history.length === 1
                ? 'attempt'
                : 'attempts'}{' '}
              saved in this browser.
            </p>
          </div>

          <a
            className="text-link"
            href="#/progress"
          >
            View progress
            <ChevronRight
              size={17}
              aria-hidden="true"
            />
          </a>
        </section>
      )}
    </div>
  )
}

function Practice() {
  return <PracticeLibrary />
}

function SkillDetail({ skillId }: { skillId: SkillId }) {
  const skill = skills.find(item => item.id === skillId)!
  return <div className="page-section">
    <a href="#/practice" className="back-link"><ArrowLeft size={16} /> All practice</a>
    <header className="workspace-header"><div><p className="eyebrow">IELTS ACADEMIC</p>
      <h1>{skill.title}. Make it your strength.</h1><p className="intro-description">{skill.summary}</p></div>
      <a className="button button-primary" href={`#/import/${skillId}`}>Set up a test <ArrowRight size={17} /></a>
    </header>
    <PrivateLibrary skill={skillId} />
    {skillId === 'reading' && <a className="button button-secondary" href="#/reading-mini">Try the built-in Reading mini-test</a>}
  </div>
}

function Progress({
  history,
  archive,
  onRetry,
}: {
  history: DemoAttempt[]
  archive: HistoryRead | null
  onRetry: () => void
}) {
  const [visibleCount, setVisibleCount] = useState(8)
  const bestPercent = history.reduce(
    (n, a) =>
      Math.max(
        n,
        Math.round((a.correct / a.total) * 100)
      ),
    0
  )

  return (
    <div className="page-section">
      <PageIntro
        eyebrow="YOUR PROGRESS"
        title="See the work add up."
        description="A quiet record of practice, built around learning rather than competing with other students."
      />

      <PrivateProgress />

      {archive === null && <p role="status">Loading saved attempt history...</p>}
      {archive?.kind === 'unavailable' && <div role="alert">
        <p>Saved attempt history could not be loaded. Existing records have not been changed.</p>
        <button className="button button-secondary" type="button" onClick={onRetry}>Retry history</button>
      </div>}
      {archive?.kind === 'ok' && archive.invalidCount > 0 && (
        <p role="alert">{archive.invalidCount} saved history record(s) could not be verified. They have been preserved.</p>
      )}

      {history.length === 0 ? (archive?.kind === 'ok' ? (
        <div className="empty-state">
          <span className="empty-symbol">
            <TrendingUp
              size={29}
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>

          <h3>
            Original Reading practice
          </h3>

          <p>
            Results from built-in Reading exercises appear here.
            Your private test sessions are listed above.
          </p>

          <a
            className="button button-primary"
            href="#/reading-mini"
          >
            Start Reading Mini-Test
            <ArrowRight
              size={17}
              aria-hidden="true"
            />
          </a>
        </div>
      ) : null) : (
        <>
          <div className="metrics-grid">
            <div className="metric">
              <small>Reading attempts</small>
              <strong>{history.length}</strong>
            </div>

            <div className="metric">
              <small>Best accuracy</small>

              <strong>
                {bestPercent}
                <span>%</span>
              </strong>
            </div>
          </div>

          <section
            className="history-panel"
            aria-labelledby="history-title"
          >
            <h2 id="history-title">
              Recent Reading practice
            </h2>

            {history
              .slice()
              .reverse()
              .slice(0, visibleCount)
              .map((item, index) => (
                <div
                  className="history-row"
                  key={item.archiveId ?? `${item.completedAt}-${index}`}
                >
                  <div>
                    <strong>
                      {item.testTitle ?? (item.kind === 'reading-headings'
                        ? 'Matching Headings practice'
                        : item.kind === 'reading-two-passage'
                          ? 'Two-passage Reading practice'
                          : item.kind === 'reading-mini'
                            ? 'Reading mini-test'
                            : 'Reading demo')}
                    </strong>

                    <small>
                      {new Date(
                        item.completedAt
                      ).toLocaleString()}
                    </small>
                    {item.archiveId ? (
                      <a className="text-link" href={`#/reading-review/${encodeURIComponent(item.archiveId)}`}
                        aria-label={`Review ${item.testTitle ?? 'Reading'} attempt from ${new Date(item.completedAt).toLocaleString()}`}>
                        Review answers
                      </a>
                    ) : <small>Score summary only · detailed answers were not archived.</small>}
                  </div>

                  <strong>
                    {item.correct} / {item.total}
                  </strong>
                </div>
              ))}
            {history.length > visibleCount && (
              <button className="button button-secondary" type="button"
                onClick={() => setVisibleCount(count => count + 8)}>Show more attempts</button>
            )}
          </section>
        </>
      )}

      <p className="data-note">
        <ShieldCheck
          size={17}
          aria-hidden="true"
        />
        Practice history is stored only in this browser.
        Clearing browser data will remove it.
      </p>
    </div>
  )
}

function ReadingDemo({
  onComplete,
}: {
  onComplete: (attempt: DemoAttempt) => void
}) {
  const [answers, setAnswers] = useState<
    Record<number, Answer | undefined>
  >({})

  const [submitted, setSubmitted] = useState(false)

  const answeredCount = questions.filter(
    (question) => Boolean(answers[question.id])
  ).length

  const correctCount = questions.filter(
    (question) =>
      answers[question.id] === question.correct
  ).length

  function submit() {
    if (
      answeredCount !== questions.length ||
      submitted
    ) {
      return
    }

    setSubmitted(true)

    onComplete({
      completedAt: new Date().toISOString(),
      correct: correctCount,
      total: questions.length,
      kind: 'reading-demo',
    })

    window.scrollTo({
      top: 0,
      behavior: 'instant',
    })
  }

  function reset() {
    setAnswers({})
    setSubmitted(false)

    window.scrollTo({
      top: 0,
      behavior: 'instant',
    })
  }

  return (
    <div className="page-section exam-page">
      <a
        href="#/practice"
        className="back-link"
      >
        <ArrowLeft
          size={17}
          aria-hidden="true"
        />
        Leave demo
      </a>

      <div className="exam-topline">
        <div>
          <p className="eyebrow">
            READING · PRACTICE PREVIEW
          </p>

          <h1>
            {submitted
              ? 'Your answer review'
              : 'The Library Garden'}
          </h1>
        </div>

        <div className="exam-status">
          <Clock3
            size={17}
            aria-hidden="true"
          />
          <span>Untimed demo</span>
        </div>
      </div>

      {submitted && (
        <section
          className="result-banner"
          aria-live="polite"
        >
          <CheckCircle2
            size={24}
            aria-hidden="true"
          />

          <div>
            <h2>
              {correctCount} out of{' '}
              {questions.length} correct
            </h2>

            <p>
              Review the evidence for each answer below.
              This is a sample score, not an IELTS band.
            </p>
          </div>
        </section>
      )}

      <div className="exam-grid">
        <section
          className="paper-panel passage-panel"
          aria-labelledby="passage-title"
        >
          <p className="eyebrow">PASSAGE</p>

          <h2 id="passage-title">
            The Library Garden
          </h2>

          {readingPassage.map((paragraph, index) => (
            <p
              className="passage-text"
              key={index}
            >
              {paragraph}
            </p>
          ))}

          <p className="source-label">
            Original example passage written
            for this interface preview.
          </p>
        </section>

        <section
          className="paper-panel questions-panel"
          aria-labelledby="question-title"
        >
          <div className="questions-heading">
            <div>
              <p className="eyebrow">
                QUESTIONS 1–3
              </p>

              <h2 id="question-title">
                True / False / Not Given
              </h2>
            </div>

            <span className="answered-pill">
              {answeredCount} / 3 answered
            </span>
          </div>

          <p className="question-guidance">
            Choose the option that matches
            the information in the passage.
            If the passage doesn't say,
            choose NOT GIVEN.
          </p>

          {questions.map((question) => (
            <fieldset
              className="question-block"
              key={question.id}
              disabled={submitted}
            >
              <legend>
                <span className="question-number">
                  {question.id}
                </span>
                {question.prompt}
              </legend>

              <div className="answer-options">
                {answerOptions.map((option) => (
                  <label
                    className={`option ${
                      answers[question.id] === option
                        ? 'option-selected'
                        : ''
                    }`}
                    key={option}
                  >
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value={option}
                      checked={
                        answers[question.id] === option
                      }
                      onChange={() =>
                        setAnswers((previous) => ({
                          ...previous,
                          [question.id]: option,
                        }))
                      }
                    />

                    <span>{option}</span>
                  </label>
                ))}
              </div>

              {submitted && (
                <div
                  className="answer-explanation"
                  role="status"
                >
                  <strong>
                    {answers[question.id] ===
                    question.correct
                      ? 'Correct'
                      : 'Needs review'}{' '}
                    · {question.correct}
                  </strong>

                  <p>{question.explanation}</p>
                </div>
              )}
            </fieldset>
          ))}

          <div className="exam-actions">
            {!submitted ? (
              <>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    answeredCount !== questions.length
                  }
                  onClick={submit}
                >
                  Check Answers
                  <Check
                    size={18}
                    aria-hidden="true"
                  />
                </button>

                <small>
                  Answer all three questions to continue.
                </small>
              </>
            ) : (
              <>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={reset}
                >
                  <RotateCcw
                    size={17}
                    aria-hidden="true"
                  />
                  Try Again
                </button>

                <a
                  className="button button-primary"
                  href="#/progress"
                >
                  View Progress
                  <ArrowRight
                    size={17}
                    aria-hidden="true"
                  />
                </a>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function App() {
  const [page, setPage] = useState<Page>(
    routeFromHash
  )

  const [theme, setTheme] = useState<Theme>(
    readTheme
  )

  const [history, setHistory] =
    useState<DemoAttempt[]>(readHistory)
  const [archive, setArchive] = useState<HistoryRead | null>(null)

  useEffect(() => {
    let active = true
    let generation = 0
    const refresh = async () => {
      const current = ++generation
      const saved = await readReadingAttempts()
      if (active && current === generation) setArchive(saved)
    }
    void refresh()
    window.addEventListener(HISTORY_CHANGED, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener(HISTORY_CHANGED, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [page])

  const displayHistory: DemoAttempt[] = [...history, ...(archive?.kind === 'ok'
    ? archive.attempts.map(attempt => ({
        archiveId: attempt.id,
        testTitle: attempt.testSnapshot.title,
        completedAt: attempt.completedAt,
        correct: attempt.resultSnapshot.correct,
        total: attempt.resultSnapshot.total,
      })) : [])].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt))

  const retryHistory = () => window.dispatchEvent(new Event(HISTORY_CHANGED))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme

    try {
      window.localStorage.setItem(
        THEME_STORAGE_KEY,
        theme
      )
    } catch {
      // Storage may be unavailable.
    }
  }, [theme])

  useEffect(() => {
    const onHashChange = () => {
      setPage(routeFromHash())
      window.scrollTo(0, 0)
    }

    window.addEventListener(
      'hashchange',
      onHashChange
    )

    return () => {
      window.removeEventListener(
        'hashchange',
        onHashChange
      )
    }
  }, [])

  function storeAttempt(
    attempt: DemoAttempt | ReadingAttempt
  ) {
    // Full Reading attempts are already committed to IndexedDB. Keep the old
    // score-only key for the legacy demo; never duplicate archived results there.
    if (attempt.archiveId) return
    setHistory((previous) => {
      const next = [...previous, attempt]

      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(next)
        )
      } catch {
        // Storage may be unavailable.
      }

      return next
    })
  }

  return (
    <div className="app-frame">
      <a
        className="skip-link"
        href="#main-content"
      >
        Skip to main content
      </a>

      <aside className="sidebar">
        <Brand />
        <Nav page={page} />

        <div className="sidebar-theme">
          <ThemeToggle
            theme={theme}
            onToggle={() =>
              setTheme(
                theme === 'light'
                  ? 'dark'
                  : 'light'
              )
            }
          />
        </div>

        <div className="sidebar-footer">
          <ShieldCheck
            size={17}
            aria-hidden="true"
          />

          <span>
            Independent practice
            <br />
            Not affiliated with IELTS test owners
          </span>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand />

        <ThemeToggle
          theme={theme}
          onToggle={() =>
            setTheme(
              theme === 'light'
                ? 'dark'
                : 'light'
            )
          }
          compact
        />
      </header>

      <main
        id="main-content"
        className="main-content"
        tabIndex={-1}
      >
        {page === 'overview' && (
          <Overview history={displayHistory} />
        )}

        {page === 'practice' && (
          <Practice />
        )}

        {page === 'progress' && (
          <Progress history={displayHistory} archive={archive} onRetry={retryHistory} />
        )}

        {page.startsWith('reading-review/') && (
          <ReadingHistoryReview encodedId={page.slice('reading-review/'.length)}
            history={archive} onRetry={retryHistory} />
        )}

        <Suspense fallback={<p role="status">Opening your practice workspace...</p>}>
          {page.startsWith('import/') && <ImportReview key={page} skill={page.split('/')[1] as PracticeSkill} bookId={page.split('/')[2]} />}
          {page.startsWith('private-test/') && <PracticeWorkspace key={page} id={decodeURIComponent(page.slice('private-test/'.length))} />}
          {page.startsWith('private-review/') && <PracticeWorkspace key={page} review id={decodeURIComponent(page.slice('private-review/'.length))} />}
        </Suspense>

        {page === 'reading-demo' && (
          <ReadingDemo onComplete={storeAttempt} />
        )}

        {page === 'reading-mini' && (
          <ReadingPractice
            key="mini"
            onComplete={storeAttempt}
          />
        )}

        {page === 'reading-two-passage' && (
          <ReadingPractice
            key="two-passage"
            test={twoPassageTest}
            onComplete={storeAttempt}
          />
        )}

        {page === 'reading-headings' && (
          <ReadingPractice
            key="reading-headings"
            test={matchingHeadingsTest}
            onComplete={(attempt) =>
              storeAttempt({
                ...attempt,
                kind: 'reading-headings',
              })
            }
          />
        )}

        {page.startsWith('skill-') && (
          <SkillDetail
            skillId={
              page.replace(
                'skill-',
                ''
              ) as SkillId
            }
          />
        )}

        <footer className="site-footer">
          <span>
            Practice Room · Private IELTS practice
          </span>

          <span>
            Built for clarity, accessibility, and focused learning.
          </span>
        </footer>
      </main>

      <Nav page={page} mobile />
    </div>
  )
}

export default App
