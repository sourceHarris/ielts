import { useState } from 'react'
import { ArrowLeft, CheckCircle2, ShieldCheck } from 'lucide-react'
import type { PracticeConfig, PracticeSkill } from './privatePractice'
import { assetUrl, parseAnswerKey, practiceLabels, validateConfig } from './privatePractice'
import { localData } from './privateStore'
import { usePrivateLibrary } from './usePrivateLibrary'
import PdfPage from './PdfPage'
import './workspaces.css'

export default function ImportReview({ skill, bookId }: { skill: PracticeSkill; bookId?: string }) {
  const { library, error: loadError } = usePrivateLibrary()
  const [chosen, setChosen] = useState(bookId ?? '')
  const [requestedTest, setTestNumber] = useState<number | null>(null)
  const [firstPage, setFirstPage] = useState<number | null>(null)
  const [lastPage, setLastPage] = useState<number | null>(null)
  const [previewPage, setPreviewPage] = useState<number | null>(null)
  const [durationMinutes, setDuration] = useState(skill === 'reading' || skill === 'writing' ? 60 : skill === 'listening' ? 40 : 15)
  const [count, setCount] = useState<number | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [selectedAudioIds, setAudioIds] = useState<string[] | null>(null)
  const [candidate, setCandidate] = useState<PracticeConfig | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const book = library?.books.find(item => item.id === chosen) ?? library?.books[0]
  const testNumber = requestedTest ?? book?.sections?.find(section => section.skill === skill)?.testNumber ?? 1
  const suggested = book?.sections?.find(section => section.skill === skill && section.testNumber === testNumber)
  const audioIds = selectedAudioIds ?? suggested?.audioIds ?? []
  const start = firstPage ?? suggested?.firstPage ?? 1
  const end = lastPage ?? suggested?.lastPage ?? 1
  const questionCount = count ?? suggested?.questionCount ?? 40
  const keyText = key ?? suggested?.keyDraft ?? ''
  const objective = skill === 'reading' || skill === 'listening'

  function review(event: React.FormEvent) {
    event.preventDefault()
    if (!book || !library) return
    try {
      const config: PracticeConfig = {
        id: crypto.randomUUID(), skill, title: `${book.title} · Test ${testNumber} · ${practiceLabels[skill]}`,
        book, testNumber, firstPage: start, lastPage: end, durationMinutes, audioIds,
        questions: objective ? parseAnswerKey(keyText, questionCount) : [], reviewedAt: '',
      }
      const problem = validateConfig(config, library)
      if (problem) throw Error(problem)
      setError(''); setConfirmed(false); setCandidate(config)
    } catch (error) { setError((error as Error).message) }
  }

  async function activate() {
    if (!candidate || !confirmed || !library || saving) return
    const problem = validateConfig(candidate, library)
    if (problem) { setError(problem); return }
    setSaving(true)
    try {
      await localData('configs', 'add', { ...candidate, reviewedAt: new Date().toISOString() })
      location.hash = `#/private-test/${candidate.id}`
    } catch { setError('This test was not saved. Restore browser storage access and try again.') }
    finally { setSaving(false) }
  }

  return <div className="page-section workspace-page">
    <a className="back-link" href="#/practice"><ArrowLeft size={16} /> All practice</a>
    <header className="workspace-header"><div><p className="eyebrow">YOUR MATERIAL · {practiceLabels[skill].toUpperCase()}</p>
      <h1>{candidate ? 'Check it once. Practise with confidence.' : `Set up ${practiceLabels[skill].toLowerCase()} practice.`}</h1>
      <p className="intro-description">Use the original pages from your private library. Check the source before adding a test.</p></div></header>
    {loadError && <p role="alert">{loadError}</p>}
    {!library && !loadError && <p role="status">Loading your books...</p>}
    {book && library && <div className="workspace-split import-layout">
      <section className="workspace-sheet">
        {candidate ? <>
          <p className="eyebrow">REVIEW BEFORE ACTIVATING</p><h2>{candidate.title}</h2>
          <p>Source pages {candidate.firstPage}–{candidate.lastPage} · {candidate.durationMinutes} minutes</p>
          {objective && <><p>Check every accepted answer, any-order group and word limit against the original key.</p>
            <div className="key-review">{candidate.questions.map(question => <div key={question.number}><strong>{question.number}</strong>
              <span>{question.accepted.join(' / ')}</span><small>{question.maxWords ? `${question.maxWords} words maximum` : 'Exact key match'}</small></div>)}</div></>}
          {candidate.audioIds.map(id => <div key={id}><p>{library.assets.find(asset => asset.id === id)?.name}</p><audio controls preload="metadata" src={assetUrl(id)} /></div>)}
          <label className="review-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            I checked the test number, module, pages{objective ? ', answer key and marking instructions' : ''}{skill === 'listening' ? ', and audio order' : ''} against the original material.</label>
          <div className="workspace-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setCandidate(null)}>Edit setup</button>
            <button type="button" className="button button-primary" disabled={!confirmed || saving} onClick={activate}><CheckCircle2 size={17} />{saving ? 'Saving...' : 'Add test and open workspace'}</button></div>
        </> : <form onSubmit={review} className="workspace-form">
          <label>Source document<select value={book.id} onChange={event => { setChosen(event.target.value); setTestNumber(null); setFirstPage(null); setLastPage(null); setPreviewPage(null); setCount(null); setKey(null); setAudioIds(null) }}>
            {library.books.map(item => <option key={item.id} value={item.id}>{item.title} · {item.pages} pages</option>)}</select></label>
          <div className="form-columns"><label>Test number<input type="number" min={1} max={99} value={testNumber} onChange={event => { setTestNumber(Number(event.target.value)); setFirstPage(null); setLastPage(null); setPreviewPage(null); setCount(null); setKey(null) }} /></label>
            <label>Minutes<input type="number" min={1} max={180} value={durationMinutes} onChange={event => setDuration(Number(event.target.value))} /></label></div>
          <div className="form-columns"><label>First source page<input type="number" min={1} max={book.pages} value={start} onChange={event => { setFirstPage(Number(event.target.value)); setPreviewPage(Number(event.target.value)) }} /></label>
            <label>Last source page<input type="number" min={start} max={book.pages} value={end} onChange={event => setLastPage(Number(event.target.value))} /></label></div>
          <p className="workspace-muted">Use PDF page numbers, which may differ from printed page numbers. Browse the original on the right.</p>
          {skill === 'listening' && <label>Original audio, in playback order<select multiple size={7} value={audioIds} onChange={event => setAudioIds(Array.from(event.target.selectedOptions, option => option.value))}>
            {library.assets.filter(asset => asset.type === 'audio').map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}</select><small>Select the matching test or its numbered sections. Audio is never generated.</small></label>}
          {objective && <><label>Question count<input type="number" min={1} max={60} value={questionCount} onChange={event => setCount(Number(event.target.value))} /></label>
            {suggested?.keyPage && <button type="button" className="button button-secondary" onClick={() => setPreviewPage(suggested.keyPage!)}>View original answer-key page</button>}
            <label>Original answer key<textarea rows={10} value={keyText} onChange={event => setKey(event.target.value)} placeholder={'1: TRUE\n2: verified answer | accepted variant ; limit=3\n3: B'} /></label>
            <p className="workspace-muted">Use | for alternatives, ; limit=3 for word limits, ; number=1 when a number is permitted in addition to the words, ; case=exact for required capitalization, and 26-28: A + D + E for an explicitly any-order group. Check prefilled keys against the original.</p></>}
          <button type="submit" className="button button-primary">Review this import</button>
        </form>}
        {error && <p role="alert" className="session-error">{error}</p>}
        <p className="workspace-privacy"><ShieldCheck size={16} /> Private in-app practice. Your documents stay on this computer.</p>
      </section>
      <section className="workspace-source" aria-label="Original document preview">
        <div className="source-toolbar"><strong>Original pages</strong><label>Page <input aria-label="Preview source page" type="number" min={1} max={book.pages} value={previewPage ?? start} onChange={event => setPreviewPage(Math.max(1, Math.min(book.pages, Number(event.target.value) || 1)))} /> / {book.pages}</label></div>
        <PdfPage key={book.id} assetId={book.assetId} page={previewPage ?? start} title={book.title} />
      </section>
    </div>}
  </div>
}
