import { useEffect, useState } from 'react'
import { BookOpen, Headphones, PenLine, Mic2, ArrowUpRight } from 'lucide-react'
import { localData } from './privateStore'
import { practiceLabels, validPrivateAttempt } from './privatePractice'
import type { PracticeSkill, PrivateAttempt } from './privatePractice'
import { CambridgeReadingCard } from '../CambridgeReading'
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
  if (skill && skill !== 'reading') return <p className="workspace-muted">This milestone adds Cambridge IELTS 1 Reading Test 1. Other tests will follow separately.</p>
  if (!'cambridge ielts 1 reading test 1 academic'.includes(query.trim().toLowerCase())) return null
  return <section aria-label="Cambridge Reading tests"><CambridgeReadingCard /></section>
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
