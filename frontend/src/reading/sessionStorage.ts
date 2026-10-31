import type { ReadingQuestion, ReadingTest } from './types.ts'

// Drafts are mutable working sessions, not historical attempts. Keep this v1
// shape and its keys compatible; content/key versions need a separate migration.
export type ReadingDraft = {
  startedAt: number
  answers: Record<string, string>
  submitted: boolean
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type InvalidDraftReason = 'json' | 'structure' | 'timestamp' | 'retention'
export type SessionInfo = {
  status: 'new' | 'active' | 'finished' | 'expired' | 'invalid' | 'unavailable'
  answered: number
}

export type DraftRead =
  | { kind: 'missing' }
  | { kind: 'valid'; draft: ReadingDraft; raw: string; session: SessionInfo }
  | { kind: 'invalid'; reason: InvalidDraftReason }
  | { kind: 'unavailable' }

export type StorageResult =
  | { kind: 'ok' }
  | { kind: 'invalid'; reason: InvalidDraftReason }
  | { kind: 'unavailable' }
  | { kind: 'conflict' }

export const DRAFT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function draftKey(test: Pick<ReadingTest, 'id'>): string {
  return test.id === 'city-shade-mini-v1'
    ? 'practice-room-reading-mini-draft-v1'
    : `practice-room-reading-${test.id}-draft-v1`
}

export function freshDraft(now = Date.now()): ReadingDraft {
  return { startedAt: now, answers: {}, submitted: false }
}

export function remainingSeconds(
  test: ReadingTest,
  draft: ReadingDraft,
  now: number
): number {
  return Math.max(0, Math.ceil(
    (draft.startedAt + test.durationMinutes * 60_000 - now) / 1000
  ))
}

export function sameHeadingSet(a: ReadingQuestion, b: ReadingQuestion): boolean {
  return a.type === 'matching-headings' && b.type === 'matching-headings' &&
    Boolean(a.options?.length) && a.options?.length === b.options?.length &&
    a.options!.every((option, index) =>
      option.value === b.options![index].value &&
      option.label === b.options![index].label
    )
}

function restoreAnswers(test: ReadingTest, draft: ReadingDraft): ReadingDraft {
  const answers: Record<string, string> = {}
  for (const passage of test.passages) {
    for (const question of passage.questions) {
      const answer = draft.answers[question.id] ?? draft.answers[String(question.number)]
      if (typeof answer === 'string') answers[question.id] = answer
    }

    // Preserve the existing rule: later questions win in old unfinished drafts.
    // Submitted answers are historical evidence and must not be cleaned up.
    if (!draft.submitted) {
      const headings = passage.questions.filter(q => q.type === 'matching-headings')
      headings.forEach((current, index) => {
        if (!answers[current.id]) return
        for (const previous of headings.slice(0, index)) {
          if (sameHeadingSet(current, previous) &&
              answers[previous.id] === answers[current.id]) {
            delete answers[previous.id]
          }
        }
      })
    }
  }
  return { startedAt: draft.startedAt, answers, submitted: draft.submitted }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidReason(value: unknown, now: number): InvalidDraftReason | null {
  if (!isRecord(value) || !isRecord(value.answers) ||
      typeof value.submitted !== 'boolean' ||
      Object.values(value.answers).some(answer => typeof answer !== 'string')) {
    return 'structure'
  }
  if (typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt) ||
      value.startedAt > now) return 'timestamp'
  if (value.startedAt <= now - DRAFT_RETENTION_MS) return 'retention'
  return null
}

export function sessionInfo(result: DraftRead): SessionInfo {
  if (result.kind === 'valid') return result.session
  return { status: result.kind === 'missing' ? 'new' : result.kind, answered: 0 }
}

// All reads are side-effect free, including malformed and out-of-retention data.
// Accessing window.localStorage can itself throw, so acquire it inside the try.
export function readDraft(
  test: ReadingTest,
  now = Date.now(),
  storage?: DraftStorage
): DraftRead {
  let raw: string | null
  try {
    raw = (storage ?? window.localStorage).getItem(draftKey(test))
  } catch {
    return { kind: 'unavailable' }
  }
  if (raw === null) return { kind: 'missing' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { kind: 'invalid', reason: 'json' }
  }
  const reason = invalidReason(parsed, now)
  if (reason) return { kind: 'invalid', reason }
  const draft = restoreAnswers(test, parsed as ReadingDraft)
  const answered = Object.values(draft.answers).filter(answer => answer.trim()).length
  return {
    kind: 'valid', draft, raw,
    session: {
      status: draft.submitted ? 'finished'
        : remainingSeconds(test, draft, now) === 0 ? 'expired' : 'active',
      answered,
    },
  }
}

export function saveDraft(
  test: ReadingTest,
  draft: ReadingDraft,
  now = Date.now(),
  storage?: DraftStorage
): StorageResult {
  const reason = invalidReason(draft, now)
  if (reason) return { kind: 'invalid', reason }
  const current = readDraft(test, now, storage)
  if (current.kind === 'invalid' || current.kind === 'unavailable') return current
  if (current.kind === 'valid' &&
      (current.draft.startedAt !== draft.startedAt ||
       (current.draft.submitted && !draft.submitted))) return { kind: 'conflict' }

  let saved: ReadingDraft = draft
  if (current.kind === 'valid') {
    const old = current.draft
    if (old.submitted === draft.submitted &&
        Object.keys(old.answers).length === Object.keys(draft.answers).length &&
        Object.keys(old.answers).every(id => old.answers[id] === draft.answers[id])) {
      return { kind: 'ok' }
    }
    // Preserve extra fields, untouched legacy keys, and original answer text.
    // Only changed/cleared questions lose their numeric alias.
    const original = JSON.parse(current.raw) as ReadingDraft
    const answers = { ...original.answers }
    for (const question of test.passages.flatMap(passage => passage.questions)) {
      const answer = draft.answers[question.id]
      const previous = original.answers[question.id] ?? original.answers[String(question.number)]
      if (answer === previous) continue
      delete answers[question.id]
      delete answers[String(question.number)]
      if (typeof answer === 'string') answers[question.id] = answer
    }
    saved = { ...original, startedAt: draft.startedAt, answers, submitted: draft.submitted }
  }
  try {
    (storage ?? window.localStorage).setItem(draftKey(test), JSON.stringify(saved))
    return { kind: 'ok' }
  } catch {
    return { kind: 'unavailable' }
  }
}

export function clearDraft(
  test: ReadingTest,
  discardInvalid = false,
  now = Date.now(),
  storage?: DraftStorage
): StorageResult {
  const current = readDraft(test, now, storage)
  if (current.kind === 'unavailable') return current
  if (current.kind === 'invalid' && !discardInvalid) return current
  if (current.kind === 'missing') return { kind: 'ok' }
  try {
    (storage ?? window.localStorage).removeItem(draftKey(test))
    return { kind: 'ok' }
  } catch {
    return { kind: 'unavailable' }
  }
}
