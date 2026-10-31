import { gradeReadingTest, normalizeAnswer } from '../reading/grading.ts'
import type { ReadingResult } from '../reading/grading.ts'

export type PracticeSkill = 'reading' | 'listening' | 'writing' | 'speaking'
export type SourceSection = { skill: PracticeSkill; testNumber: number; firstPage: number; lastPage: number; questionCount?: number; keyDraft?: string; keyPage?: number; audioIds?: string[] }
export type PrivateBook = { id: string; assetId: string; title: string; fingerprint: string; pages: number; extractedPages: number; sections?: SourceSection[] }
export type PrivateAsset = { id: string; name: string; type: 'pdf' | 'audio'; label: string }
export type PrivateLibrary = { books: PrivateBook[]; assets: PrivateAsset[] }
export type PracticeConfig = {
  id: string; skill: PracticeSkill; title: string; book: PrivateBook; testNumber: number
  firstPage: number; lastPage: number; durationMinutes: number; audioIds: string[]
  questions: { number: number; accepted: string[]; maxWords: number | null; group?: string; caseSensitive?: boolean; allowNumber?: boolean }[]
  reviewedAt: string
}
export type PracticeWork = {
  id: string; startedAt: number | null; submittedAt: number | null
  answers: Record<string, string>; essays: [string, string]; notes: string
  recordings: { id: string; part: number; durationSeconds: number; type: string }[]
}
export type PrivateAttempt = { schemaVersion: 1; gradingVersion: 'private-objective-v1'; id: string; config: PracticeConfig; work: PracticeWork; resultSnapshot: ReadingResult | null }

export const practiceLabels: Record<PracticeSkill, string> = {
  reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking',
}
export const assetUrl = (id: string) => `/api/private/assets/${id}`

export function parseAnswerKey(text: string, count: number): PracticeConfig['questions'] {
  if (!Number.isInteger(count) || count < 1 || count > 60) throw Error('Choose between 1 and 60 questions, preserving the original paper count.')
  const questions = text.split(/\r?\n/).filter(line => line.trim()).flatMap(line => {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*[:.)]\s*(.+)$/.exec(line)
    if (!match) throw Error('Use one numbered answer per line, such as 1: TRUE. Separate accepted alternatives with |.')
    const [answer, ...rules] = match[3].split(/\s*;\s*/)
    if (rules.some(rule => !/^(limit=\d+|case=exact|number=1)$/.test(rule))) throw Error('Supported marking rules are limit=3, case=exact and number=1.')
    const limit = rules.find(rule => rule.startsWith('limit='))?.slice(6)
    const first = Number(match[1]), last = Number(match[2] ?? match[1])
    const accepted = answer.split(match[2] ? '+' : '|').map(value => value.trim())
    const maxWords = limit === undefined ? null : Number(limit)
    if (accepted.some(value => !value) || (maxWords !== null && (!Number.isInteger(maxWords) || maxWords < 1 || maxWords > 20))) {
      throw Error('Check the accepted answers and word limits.')
    }
    if (last < first || last > count || (match[2] && (answer.includes('|') || last - first + 1 !== accepted.length ||
        new Set(accepted.map(normalizeAnswer)).size !== accepted.length))) throw Error('An any-order group needs one different accepted choice per question, such as 26-28: A + D + E.')
    return Array.from({ length: last - first + 1 }, (_, index) => ({ number: first + index, accepted, maxWords,
      ...(match[2] ? { group: `${first}-${last}` } : {}), ...(rules.includes('case=exact') ? { caseSensitive: true } : {}),
      ...(rules.includes('number=1') ? { allowNumber: true } : {}) }))
  }).sort((a, b) => a.number - b.number)
  if (questions.length !== count || questions.some((question, index) => question.number !== index + 1)) {
    throw Error(`Provide each answer from 1 to ${count} exactly once. No missing or duplicate question numbers.`)
  }
  return questions
}

export function validateConfig(config: PracticeConfig, library: PrivateLibrary): string | null {
  const book = library.books.find(item => item.id === config.book.id && item.fingerprint === config.book.fingerprint)
  if (!book) return 'The source document changed or is unavailable. Review the import again.'
  if (!config.title.trim() || !Number.isInteger(config.testNumber) || config.testNumber < 1 || config.testNumber > 99) return 'Enter a title and valid test number.'
  if (!Number.isInteger(config.firstPage) || !Number.isInteger(config.lastPage) || config.firstPage < 1 ||
      config.lastPage > book.pages || config.firstPage > config.lastPage) return 'Check the source page range.'
  if (!Number.isFinite(config.durationMinutes) || config.durationMinutes < 1 || config.durationMinutes > 180) return 'Choose a duration between 1 and 180 minutes.'
  if (config.skill === 'listening' && !config.audioIds.length) return 'Select the original Listening audio.'
  if (new Set(config.audioIds).size !== config.audioIds.length || config.audioIds.some(id => !library.assets.some(asset => asset.id === id && asset.type === 'audio'))) return 'Check the audio files.'
  if ((config.skill === 'reading' || config.skill === 'listening') && !config.questions.length) return 'Review an answer key before activating objective marking.'
  return null
}

export function emptyWork(id: string): PracticeWork {
  return { id, startedAt: null, submittedAt: null, answers: {}, essays: ['', ''], notes: '', recordings: [] }
}

export function validPrivateConfig(value: unknown): value is PracticeConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as PracticeConfig
  return typeof config.id === 'string' && !!config.id && typeof config.title === 'string' &&
    ['reading', 'listening', 'writing', 'speaking'].includes(config.skill) &&
    !!config.book && /^[a-f0-9]{64}$/.test(config.book.id) && /^[a-f0-9]{64}$/.test(config.book.assetId) &&
    /^[a-f0-9]{64}$/.test(config.book.fingerprint) && typeof config.book.title === 'string' && Number.isInteger(config.book.pages) &&
    Number.isInteger(config.firstPage) && config.firstPage >= 1 && Number.isInteger(config.lastPage) &&
    config.lastPage >= config.firstPage && config.lastPage <= config.book.pages &&
    Number.isInteger(config.testNumber) && config.testNumber > 0 && Number.isFinite(config.durationMinutes) &&
    config.durationMinutes > 0 && config.durationMinutes <= 180 &&
    typeof config.reviewedAt === 'string' && Number.isFinite(Date.parse(config.reviewedAt)) &&
    Array.isArray(config.audioIds) && (config.skill !== 'listening' || config.audioIds.length > 0) && config.audioIds.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)) &&
    Array.isArray(config.questions) && config.questions.length <= 60 &&
    (!(config.skill === 'reading' || config.skill === 'listening') || config.questions.length > 0) &&
    config.questions.every((question, index) => !!question && question.number === index + 1 &&
      Array.isArray(question.accepted) && question.accepted.length > 0 && question.accepted.every(answer => typeof answer === 'string' && !!answer.trim()) &&
      (question.maxWords === null || (Number.isInteger(question.maxWords) && question.maxWords > 0 && question.maxWords <= 20)) &&
      (question.caseSensitive === undefined || typeof question.caseSensitive === 'boolean') &&
      (question.allowNumber === undefined || typeof question.allowNumber === 'boolean') &&
      (question.group === undefined || typeof question.group === 'string'))
}

export function validPrivateAttempt(value: unknown): value is PrivateAttempt {
  if (!value || typeof value !== 'object') return false
  const attempt = value as PrivateAttempt
  if (attempt.schemaVersion !== 1 || attempt.gradingVersion !== 'private-objective-v1' || !validPrivateConfig(attempt.config) ||
      !validWork(attempt.work, attempt.config.id) || !attempt.work.submittedAt ||
      attempt.id !== `${attempt.config.id}:${attempt.work.startedAt}`) return false
  if (attempt.config.skill === 'writing' || attempt.config.skill === 'speaking') return attempt.resultSnapshot === null
  const result = attempt.resultSnapshot
  return !!result && Number.isInteger(result.correct) && Number.isInteger(result.unanswered) &&
    result.total === attempt.config.questions.length && Array.isArray(result.questions) && result.questions.length === result.total &&
    result.questions.every((question, index) => !!question && question.questionNumber === index + 1 && question.questionId === String(index + 1) &&
      question.userAnswer === (attempt.work.answers[String(index + 1)] ?? '') && typeof question.isCorrect === 'boolean' &&
      typeof question.explanation === 'string' && Array.isArray(question.correctAnswers) &&
      JSON.stringify(question.correctAnswers) === JSON.stringify(attempt.config.questions[index].accepted)) &&
    result.correct === result.questions.filter(question => question.isCorrect).length &&
    result.unanswered === result.questions.filter(question => !question.userAnswer.trim()).length
}

export function validWork(value: unknown, id: string): value is PracticeWork {
  if (!value || typeof value !== 'object') return false
  const work = value as PracticeWork
  return work.id === id && (work.startedAt === null || (Number.isFinite(work.startedAt) && work.startedAt! > 0)) &&
    (work.submittedAt === null || (Number.isFinite(work.submittedAt) && work.startedAt !== null && work.submittedAt! >= work.startedAt)) &&
    !!work.answers && !Array.isArray(work.answers) && typeof work.answers === 'object' &&
    Object.values(work.answers).every(answer => typeof answer === 'string') &&
    Array.isArray(work.essays) && work.essays.length === 2 && work.essays.every(essay => typeof essay === 'string') &&
    typeof work.notes === 'string' && Array.isArray(work.recordings) && work.recordings.every(recording =>
      !!recording && typeof recording === 'object' && typeof recording.id === 'string' && [1, 2, 3].includes(recording.part) && Number.isFinite(recording.durationSeconds) &&
      recording.durationSeconds >= 0 && typeof recording.type === 'string')
}

export function wordCount(value: string): number { return value.trim() ? value.trim().split(/\s+/).length : 0 }

export function markPrivatePractice(config: PracticeConfig, answers: Record<string, string>) {
  const result = gradeReadingTest({
    id: config.id, title: config.title, durationMinutes: config.durationMinutes,
    passages: [{ id: config.book.id, title: config.book.title, paragraphs: [],
      questions: config.questions.map(question => ({ id: String(question.number), number: question.number,
        type: 'short' as const, prompt: `Question ${question.number}`, correctAnswers: question.accepted,
        explanation: 'Checked against the answer key reviewed for this source document.' })) }],
  }, answers)
  result.questions = result.questions.map((question, index) => {
    const rule = config.questions[index], limit = rule.maxWords
    const clean = (value: string) => value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '')
    const tokens = question.userAnswer.trim().split(/\s+/).filter(Boolean)
    const numbers = rule.allowNumber ? tokens.filter(token => /^[£$€]?\d+(?:[.,]\d+)?%?$/.test(token)).length : 0
    const overLimit = limit !== null && (tokens.length - numbers > limit || (rule.allowNumber && numbers > 1))
    return { ...question, isCorrect: question.isCorrect && (!rule.caseSensitive || rule.accepted.some(answer => clean(answer) === clean(question.userAnswer))) && !overLimit,
      explanation: overLimit ? `The answer exceeds the ${limit}-word${rule.allowNumber ? ' and one-number' : ''} limit.` : question.explanation }
  })
  const used = new Map<string, Set<string>>()
  result.questions = result.questions.map((question, index) => {
    const group = config.questions[index].group
    if (!group || !question.isCorrect) return question
    const choices = used.get(group) ?? new Set<string>()
    const answer = normalizeAnswer(question.userAnswer)
    const duplicate = choices.has(answer)
    choices.add(answer); used.set(group, choices)
    return { ...question, isCorrect: !duplicate, explanation: duplicate ? 'Each choice in this any-order group can receive credit only once.' : question.explanation }
  })
  result.correct = result.questions.filter(question => question.isCorrect).length
  return result
}

export { normalizeAnswer }
