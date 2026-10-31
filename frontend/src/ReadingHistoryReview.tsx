import ReadingExam from './ReadingExam'
import type { HistoryRead } from './reading/attemptHistory'

export default function ReadingHistoryReview({
  encodedId, history, onRetry,
}: {
  encodedId: string
  history: HistoryRead | null
  onRetry: () => void
}) {
  let id = ''
  try { id = decodeURIComponent(encodedId) } catch { /* Invalid URL: show unavailable. */ }
  const attempt = history?.kind === 'ok' ? history.attempts.find(item => item.id === id) : undefined

  if (attempt) {
    return <ReadingExam key={attempt.id} reviewAttempt={attempt} onComplete={() => {}} />
  }
  return (
    <div className="page-section">
      <a className="back-link" href="#/progress">Back to progress</a>
      <section className="paper-panel">
        <h1>{history === null ? 'Loading saved attempt...' : 'Saved attempt unavailable'}</h1>
        {history !== null && <>
          <p role="alert">This historical attempt could not be loaded or verified. Your current test has not been changed.</p>
          <button type="button" className="button button-secondary" onClick={onRetry}>Try again</button>
        </>}
      </section>
    </div>
  )
}
