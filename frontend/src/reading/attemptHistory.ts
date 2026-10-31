import { gradeReadingTest } from './grading.ts'
import type { ReadingResult } from './grading.ts'
import type { ReadingDraft } from './sessionStorage.ts'
import type { ReadingTest } from './types.ts'

export const HISTORY_DATABASE = 'practice-room-history-v1'
export const HISTORY_STORE = 'reading-attempts'
export const HISTORY_CHANGED = 'practice-room-history-changed'

export type ReadingAttemptSnapshot = {
  schemaVersion: 1
  id: string
  testId: string
  startedAt: number
  completedAt: string
  completionReason: 'submitted' | 'timer-expired'
  contentVersion: string
  answerKeyVersion: string
  gradingVersion: 'reading-normalization-v1'
  testSnapshot: ReadingTest
  answers: Record<string, string>
  resultSnapshot: ReadingResult
  integrity: string
}

export type HistoryRead =
  | { kind: 'ok'; attempts: ReadingAttemptSnapshot[]; invalidCount: number }
  | { kind: 'unavailable' }

export type HistoryWrite =
  | { kind: 'ok'; attempt: ReadingAttemptSnapshot }
  | { kind: 'invalid' | 'unavailable' | 'conflict' }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

// Stable serialization makes revisions independent of object property order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (record(value)) return `{${Object.keys(value).sort()
    .filter(key => value[key] !== undefined)
    .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

function validTest(value: unknown): value is ReadingTest {
  if (!record(value) || typeof value.id !== 'string' || !value.id ||
      typeof value.title !== 'string' || typeof value.durationMinutes !== 'number' ||
      !Number.isFinite(value.durationMinutes) || value.durationMinutes <= 0 ||
      !Array.isArray(value.passages) || !value.passages.length) return false
  const ids = new Set<string>()
  const numbers = new Set<number>()
  const passages = new Set<string>()
  return value.passages.every(passage => {
    if (!record(passage) || typeof passage.id !== 'string' || !passage.id ||
        passages.has(passage.id) || typeof passage.title !== 'string' ||
        !strings(passage.paragraphs) || !passage.paragraphs.length ||
        !Array.isArray(passage.questions) || !passage.questions.length) return false
    passages.add(passage.id)
    return passage.questions.every(question => {
      if (!record(question) || typeof question.id !== 'string' || !question.id ||
          ids.has(question.id) || typeof question.number !== 'number' ||
          !Number.isSafeInteger(question.number) || question.number < 1 ||
          numbers.has(question.number) ||
          !['tfng', 'choice', 'short', 'matching-headings'].includes(String(question.type)) ||
          typeof question.prompt !== 'string' || typeof question.explanation !== 'string' ||
          !strings(question.correctAnswers) || !question.correctAnswers.length ||
          question.correctAnswers.some(answer => !answer.trim())) return false
      if (question.options !== undefined && (!Array.isArray(question.options) ||
          !question.options.every(option => record(option) &&
            typeof option.value === 'string' && typeof option.label === 'string'))) return false
      ids.add(question.id)
      numbers.add(question.number)
      return true
    })
  })
}

async function revisions(test: ReadingTest) {
  const content = {
    ...test,
    passages: test.passages.map(passage => ({
      ...passage,
      questions: passage.questions.map(({ correctAnswers: _answers, explanation: _explanation, ...question }) => question),
    })),
  }
  const key = test.passages.flatMap(passage => passage.questions.map(question => ({
    id: question.id, answers: question.correctAnswers, explanation: question.explanation,
  })))
  return { contentVersion: await fingerprint(content), answerKeyVersion: await fingerprint(key) }
}

export async function createReadingAttempt(
  test: ReadingTest,
  draft: ReadingDraft,
  completionReason: ReadingAttemptSnapshot['completionReason'],
  completedAt = Date.now(),
): Promise<ReadingAttemptSnapshot> {
  if (!validTest(test) || !Number.isFinite(draft.startedAt) || draft.startedAt < 0 ||
      !Number.isFinite(completedAt) || completedAt < draft.startedAt ||
      !record(draft.answers) || Object.values(draft.answers).some(answer => typeof answer !== 'string') ||
      !['submitted', 'timer-expired'].includes(completionReason) ||
      (completionReason === 'timer-expired' && completedAt < draft.startedAt + test.durationMinutes * 60_000)) {
    throw new Error('Invalid Reading attempt')
  }
  // Detach everything before the first await: a later edit must not change history.
  const testSnapshot: ReadingTest = JSON.parse(JSON.stringify(test))
  const answers = { ...draft.answers }
  const payload = {
    schemaVersion: 1 as const,
    id: `${encodeURIComponent(test.id)}:${draft.startedAt}`,
    testId: test.id,
    startedAt: draft.startedAt,
    completedAt: new Date(completedAt).toISOString(),
    completionReason,
    ...await revisions(testSnapshot),
    gradingVersion: 'reading-normalization-v1' as const,
    testSnapshot,
    answers,
    resultSnapshot: gradeReadingTest(testSnapshot, answers),
  }
  return { ...payload, integrity: await fingerprint(payload) }
}

// Reject damaged/unsupported records without deleting them or regrading history.
export async function validateReadingAttempt(value: unknown): Promise<boolean> {
  try {
    if (!record(value) || value.schemaVersion !== 1 ||
        value.gradingVersion !== 'reading-normalization-v1' || !validTest(value.testSnapshot) ||
        value.testId !== value.testSnapshot.id || typeof value.startedAt !== 'number' ||
        !Number.isFinite(value.startedAt) || value.startedAt < 0 ||
        value.id !== `${encodeURIComponent(value.testId as string)}:${value.startedAt}` ||
        typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt)) ||
        Date.parse(value.completedAt) < value.startedAt ||
        !['submitted', 'timer-expired'].includes(String(value.completionReason)) ||
        !record(value.answers) || Object.values(value.answers).some(answer => typeof answer !== 'string') ||
        !record(value.resultSnapshot) || !Array.isArray(value.resultSnapshot.questions)) return false
    const result = value.resultSnapshot
    if (!Array.isArray(result.questions)) return false
    const questions = value.testSnapshot.passages.flatMap(passage => passage.questions)
    if (result.total !== questions.length || !Number.isInteger(result.correct) ||
        !Number.isInteger(result.unanswered) || result.questions.length !== questions.length) return false
    if (!result.questions.every((item, index) => record(item) &&
        item.questionId === questions[index].id && item.questionNumber === questions[index].number &&
        item.userAnswer === ((value.answers as Record<string, string>)[questions[index].id] ?? '') &&
        typeof item.isCorrect === 'boolean' && item.explanation === questions[index].explanation &&
        canonical(item.correctAnswers) === canonical(questions[index].correctAnswers)) ||
        result.correct !== result.questions.filter(item => (item as Record<string, unknown>).isCorrect).length ||
        result.unanswered !== result.questions.filter(item => !(item as { userAnswer: string }).userAnswer.trim()).length ||
        (value.completionReason === 'timer-expired' && Date.parse(value.completedAt) <
          value.startedAt + value.testSnapshot.durationMinutes * 60_000)) return false
    const { integrity, ...payload } = value
    if (typeof integrity !== 'string' || integrity !== await fingerprint(payload)) return false
    const versions = await revisions(value.testSnapshot)
    return value.contentVersion === versions.contentVersion && value.answerKeyVersion === versions.answerKeyVersion
  } catch {
    return false
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(HISTORY_DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HISTORY_STORE, { keyPath: 'id' })
    }
    request.onblocked = () => { blocked = true; reject(new Error('History database blocked')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

export async function readReadingAttempts(): Promise<HistoryRead> {
  let database: IDBDatabase | undefined
  try {
    database = await openDatabase()
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const transaction = database!.transaction(HISTORY_STORE, 'readonly')
      const request = transaction.objectStore(HISTORY_STORE).getAll()
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
    })
    const attempts: ReadingAttemptSnapshot[] = []
    let invalidCount = 0
    for (const value of values) {
      if (await validateReadingAttempt(value)) attempts.push(value as ReadingAttemptSnapshot)
      else invalidCount++
    }
    attempts.sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.id.localeCompare(b.id))
    return { kind: 'ok', attempts, invalidCount }
  } catch {
    return { kind: 'unavailable' }
  } finally {
    database?.close()
  }
}

export async function saveReadingAttempt(attempt: ReadingAttemptSnapshot): Promise<HistoryWrite> {
  let database: IDBDatabase | undefined
  try {
    attempt = structuredClone(attempt)
    if (!await validateReadingAttempt(attempt)) return { kind: 'invalid' }
    database = await openDatabase()
    const outcome = await new Promise<HistoryWrite>((resolve, reject) => {
      const transaction = database!.transaction(HISTORY_STORE, 'readwrite')
      const store = transaction.objectStore(HISTORY_STORE)
      let result: HistoryWrite = { kind: 'unavailable' }
      const request = store.get(attempt.id)
      request.onsuccess = () => {
        const existing: unknown = request.result
        if (existing !== undefined) {
          // One attempt per test/start time; concurrent submissions cannot replace it.
          // Ignore retry time, but compare all original responses, versions and results.
          const comparable = (value: ReadingAttemptSnapshot) => {
            const { completedAt: _time, integrity: _integrity, ...rest } = value
            return canonical(rest)
          }
          result = record(existing) && comparable(existing as ReadingAttemptSnapshot) === comparable(attempt)
            ? { kind: 'ok', attempt: existing as ReadingAttemptSnapshot }
            : { kind: 'conflict' }
        } else {
          store.add(attempt)
          result = { kind: 'ok', attempt }
        }
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error)
    })
    if (outcome.kind === 'ok') {
      if (!await validateReadingAttempt(outcome.attempt)) return { kind: 'conflict' }
      window.dispatchEvent(new Event(HISTORY_CHANGED))
    }
    return outcome
  } catch {
    return { kind: 'unavailable' }
  } finally {
    database?.close()
  }
}
