import { useState } from 'react'
import { ArrowRight, BookOpen, ExternalLink, Headphones, Mic2, PenLine } from 'lucide-react'
import './PracticeLibrary.css'

type Skill = 'Reading' | 'Listening' | 'Writing' | 'Speaking'
type Filter = 'All' | Skill

type LibraryEntry = {
  id: string
  title: string
  description: string
  skills: Skill[]
  source: string
  details: string[]
  href: string
  action: string
  publisherHosted: boolean
}

const entries: LibraryEntry[] = [
  {
    id: 'city-shade',
    title: 'A City Measured in Shade',
    description: 'A reading passage with True / False / Not Given, multiple choice and short-answer questions.',
    skills: ['Reading'],
    source: 'Reading · Timed',
    details: ['8 questions', '15 minutes', 'Saved answers'],
    href: '#/reading-mini',
    action: 'Start mini-test',
    publisherHosted: false,
  },
  {
    id: 'idp',
    title: 'Computer familiarisation tests',
    description: 'Explore the IELTS computer format, with sample Reading and Listening tests and Writing tasks.',
    skills: ['Reading', 'Listening', 'Writing'],
    source: 'IDP IELTS',
    details: ['Reading', 'Listening', 'Writing'],
    href: 'https://ielts.idp.com/about/ielts-familiarisation-tests',
    action: 'Visit source',
    publisherHosted: true,
  },
  {
    id: 'library-garden',
    title: 'The Library Garden',
    description: 'A quick introduction to True / False / Not Given questions with explanations for each answer.',
    skills: ['Reading'],
    source: 'Reading · Quick demo',
    details: ['3 questions', 'Untimed', 'Instant review'],
    href: '#/reading-demo',
    action: 'Try demo',
    publisherHosted: false,
  },
  {
    id: 'ielts-org',
    title: 'Academic sample test questions',
    description: 'Practice materials and answer guidance for all four IELTS Academic skills.',
    skills: ['Reading', 'Listening', 'Writing', 'Speaking'],
    source: 'IELTS.org',
    details: ['Reading', 'Listening', 'Writing', 'Speaking'],
    href: 'https://www.ielts.org/take-a-test/preparation-resources/sample-test-questions/academic-test',
    action: 'Visit source',
    publisherHosted: true,
  },
  {
    id: 'british-council',
    title: 'IELTS Academic practice by skill',
    description: 'Free Academic practice activities across Reading, Listening, Writing, and Speaking.',
    skills: ['Reading', 'Listening', 'Writing', 'Speaking'],
    source: 'British Council',
    details: ['Reading', 'Listening', 'Writing', 'Speaking'],
    href: 'https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests/academic',
    action: 'Visit source',
    publisherHosted: true,
  },
  {
    id: 'cambridge',
    title: 'IELTS preparation and sample paper',
    description: 'Sample preparation materials provided by Cambridge English.',
    skills: ['Reading', 'Listening', 'Writing', 'Speaking'],
    source: 'Cambridge English',
    details: ['Sample materials', 'Preparation'],
    href: 'https://www.cambridgeenglish.org/exams-and-tests/ielts/preparation/',
    action: 'Visit source',
    publisherHosted: true,
  },
  {
    id: 'ready',
    title: 'IELTS Ready preparation',
    description: 'Free signup for practice activities, mock exercises, and guided preparation.',
    skills: ['Reading', 'Listening', 'Writing', 'Speaking'],
    source: 'British Council',
    details: ['Practice activities', 'Free signup available'],
    href: 'https://takeielts.britishcouncil.org/prepare',
    action: 'Visit source',
    publisherHosted: true,
  },
]

const filters: Filter[] = ['All', 'Reading', 'Listening', 'Writing', 'Speaking']
const filterIcons = { Reading: BookOpen, Listening: Headphones, Writing: PenLine, Speaking: Mic2 }

export default function PracticeLibrary() {
  const [filter, setFilter] = useState<Filter>('All')
  const visible = entries.filter((item) => filter === 'All' || item.skills.includes(filter))

  return (
    <div className="page-section unified-practice-page">
      <header className="page-intro">
        <p className="eyebrow">PRACTICE LIBRARY</p>
        <h1>Choose your next test.</h1>
        <p className="intro-description">Browse IELTS-style exercises and free practice resources. Choose a skill to narrow the list.</p>
      </header>

      <div className="unified-skill-filters" role="group" aria-label="Filter practice by IELTS skill">
        {filters.map((option) => {
          const Icon = option === 'All' ? null : filterIcons[option]
          return (
            <button
              key={option}
              type="button"
              className={`unified-filter ${filter === option ? 'unified-filter-active' : ''}`}
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
            >
              {Icon && <Icon size={17} strokeWidth={1.9} aria-hidden="true" />}
              {option}
            </button>
          )
        })}
      </div>

      <section className="unified-practice-list" aria-label="Practice tests and resources">
        {visible.map((item) => (
          <article key={item.id} className="unified-practice-card">
            <div className="unified-practice-content">
              <div className="unified-practice-heading">
                <span
                  className={`unified-source-dot ${item.publisherHosted ? 'unified-source-dot-cyan' : 'unified-source-dot-dark'}`}
                  role="img"
                  aria-label={item.publisherHosted ? 'Publisher-hosted resource' : 'Original exercise'}
                />
                <div className="unified-practice-titles">
                  <p className="unified-practice-source">{item.source}</p>
                  <h2>{item.title}</h2>
                </div>
              </div>
              <p className="unified-practice-description">{item.description}</p>
              <div className="unified-practice-details">
                {item.details.map((detail) => <span key={detail}>{detail}</span>)}
              </div>
            </div>
            <a
              className={`button ${item.publisherHosted ? 'button-secondary' : 'button-primary'} unified-practice-action`}
              href={item.href}
              {...(item.publisherHosted ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              aria-label={item.publisherHosted ? `${item.action}: ${item.title} (opens new tab)` : `${item.action}: ${item.title}`}
            >
              {item.action}
              {item.publisherHosted ? <ExternalLink size={17} aria-hidden="true" /> : <ArrowRight size={17} aria-hidden="true" />}
            </a>
          </article>
        ))}
      </section>
      <p className="unified-practice-footnote">External resources open on their publisher's website. Their results aren't automatically saved in this app.</p>
    </div>
  )
}
