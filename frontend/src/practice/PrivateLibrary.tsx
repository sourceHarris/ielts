import { useEffect, useState } from 'react'
import { BookOpen, Headphones, PenLine, Mic2, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { localData } from './privateStore'
import { usePrivateLibrary } from './usePrivateLibrary'
import { practiceLabels, validPrivateAttempt, validPrivateConfig } from './privatePractice'
import type { PracticeConfig, PracticeSkill, PrivateAttempt } from './privatePractice'
import './workspaces.css'

const icons = { reading: BookOpen, listening: Headphones, writing: PenLine, speaking: Mic2 }
const skills = Object.keys(icons) as PracticeSkill[]

export function ModuleLaunchers({ selected }: { selected?: PracticeSkill }) {
  return <div className="module-launchers" aria-label="Open a practice workspace">{skills.filter(skill => !selected || selected === skill).map(skill => {
    const Icon = icons[skill]
    return <a className="module-launcher" href={`#/skill-${skill}`} key={skill}><Icon size={23} strokeWidth={1.6} />
      <span><strong>{practiceLabels[skill]}</strong><small>{skill === 'reading' ? 'Read & review' : skill === 'listening' ? 'Listen & answer' : skill === 'writing' ? 'Write & refine' : 'Record & reflect'}</small></span><ArrowUpRight size={17} /></a>
  })}</div>
}

export function PrivateLibrary({ skill, query = '' }: { skill?: PracticeSkill; query?: string }) {
  const { library, error } = usePrivateLibrary()
  const [configs, setConfigs] = useState<PracticeConfig[]>([])
  const [storageError, setStorageError] = useState('')
  useEffect(() => {
    let active = true
    localData<PracticeConfig[]>('configs', 'all').then(items => { if (active) {
      setConfigs(items.filter(validPrivateConfig))
      if (items.some(item => !validPrivateConfig(item))) setStorageError('An invalid test setup was preserved and excluded from the ready list.')
    } })
      .catch(() => { if (active) setStorageError('Saved test setups could not be loaded. They have not been replaced.') })
    return () => { active = false }
  }, [])
  const matches = (value: string) => value.toLowerCase().includes(query.trim().toLowerCase())
  const ready = configs.filter(item => (!skill || item.skill === skill) && matches(item.title))
  const books = library?.books.filter(book => matches(book.title) && !/transcript/i.test(book.title)) ?? []
  const prepared = books.find(book => book.sections?.some(section => section.keyDraft))
  return <section className="private-library" aria-label="Private in-app test library">
    <div className="workspace-section-title"><div><p className="eyebrow">YOUR PRIVATE LIBRARY</p><h2>Real material. Your own space.</h2></div>
      <span className="private-badge"><ShieldCheck size={14} /> Local only</span></div>
    {storageError && <p role="alert">{storageError}</p>}
    {ready.length > 0 && <div className="ready-tests">{ready.map(config => <a className="ready-test" href={`#/private-test/${config.id}`} key={config.id}>
      <span><small>{practiceLabels[config.skill]} · Reviewed source</small><strong>{config.title}</strong><small>{config.durationMinutes} minutes · {config.questions.length ? `${config.questions.length} questions` : 'Saved work & review'}</small></span>
      <span className="button button-primary">Open test <ArrowUpRight size={16} /></span></a>)}</div>}
    {error && <div className="private-connection"><h3>Connect your study material.</h3><p>{error} Your existing Reading exercises are available below.</p></div>}
    {!library && !error && <p role="status">Loading your private books...</p>}
    {prepared && !query && <div className="prepared-source"><p className="eyebrow">PREPARED FROM YOUR ORIGINAL</p><h3>{prepared.title} · Test 1</h3>
      <p>Original pages, matching audio and a prefilled key draft. Check the source once before you begin.</p>
      <div className="workspace-actions">{skills.filter(value => !skill || value === skill).map(value => <a className={`button ${value === 'reading' ? 'button-primary' : 'button-secondary'}`} key={value} href={`#/import/${value}/${prepared.id}`}>
        Review {practiceLabels[value]} <ArrowUpRight size={15} /></a>)}</div></div>}
    {library && <><p className="workspace-muted">{books.length} source documents · {library.assets.filter(asset => asset.type === 'audio').length} original audio files. Review a test once, then practise inside the app.</p>
      <div className="private-book-grid">{books.map(book => <article key={book.id} className="private-book-card">
        <div className="private-book-spine" aria-hidden="true"><span>ACADEMIC</span><strong>{book.title.match(/\d+/)?.[0] ?? 'IELTS'}</strong><span>YOUR EDITION</span></div>
        <div className="private-book-info"><p className="eyebrow">ORIGINAL PDF</p><h3>{book.title.replaceAll('.', ' ')}</h3><p>{book.pages} pages · {book.extractedPages} converted</p>
          <div className="book-module-links">{skills.filter(value => !skill || value === skill).map(value => <a key={value} href={`#/import/${value}/${book.id}`} aria-label={`Set up ${practiceLabels[value]} from ${book.title}`}>
            {practiceLabels[value]} <ArrowUpRight size={13} /></a>)}</div></div>
      </article>)}</div>
      {books.length === 0 && <p>No source documents match this search.</p>}
      <p className="workspace-muted">Source files and OCR are available here; a test becomes ready after its pages, instructions, audio and answer key have been reviewed.</p>
    </>}
  </section>
}

export function PrivateProgress() {
  const [attempts, setAttempts] = useState<PrivateAttempt[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    localData<PrivateAttempt[]>('attempts', 'all').then(items => {
      if (active) {
        setAttempts(items.filter(validPrivateAttempt).sort((a, b) => (b.work.submittedAt ?? 0) - (a.work.submittedAt ?? 0)))
        if (items.some(item => !validPrivateAttempt(item))) setError('An invalid saved attempt was preserved and excluded from review.')
      }
    }).catch(() => { if (active) setError('Private practice history could not be loaded. Existing records have not been changed.') })
    return () => { active = false }
  }, [])
  if (!attempts?.length && !error) return null
  return <section className="history-panel private-progress"><h2>Your private practice</h2>{error && <p role="alert">{error}</p>}
    {attempts?.map(attempt => <div key={attempt.id} className="history-row"><div><strong>{attempt.config.title}</strong><small>{new Date(attempt.work.submittedAt!).toLocaleString()}</small>
      <a className="text-link" href={`#/private-review/${encodeURIComponent(attempt.id)}`}>Review {practiceLabels[attempt.config.skill].toLowerCase()} session</a></div><span>{attempt.config.skill === 'writing'
        ? 'Writing saved' : attempt.config.skill === 'speaking' ? `${attempt.work.recordings.length} recordings` : 'Answers saved'}</span></div>)}
  </section>
}
