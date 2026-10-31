import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearDraft, DRAFT_RETENTION_MS, draftKey, freshDraft, readDraft,
  remainingSeconds, sameHeadingSet, saveDraft, sessionInfo,
} from '../src/reading/sessionStorage.ts'
import type { DraftStorage, ReadingDraft } from '../src/reading/sessionStorage.ts'
import type { ReadingTest } from '../src/reading/types.ts'
import { matchingHeadingsTest } from '../src/reading/matchingHeadingsTest.ts'

const now = Date.UTC(2026, 10, 1, 12)
const mini: ReadingTest = {
  id: 'city-shade-mini-v1', title: 'Storage fixture', durationMinutes: 15,
  passages: [{ id: 'p1', title: 'Fixture', paragraphs: ['Original test fixture.'], questions: [
    { id: 'city-shade-q1', number: 1, type: 'tfng', prompt: 'Statement',
      correctAnswers: ['TRUE'], explanation: 'Fixture explanation.' },
    { id: 'city-shade-q7', number: 7, type: 'short', prompt: 'Material',
      correctAnswers: ['mulch'], explanation: 'Fixture explanation.' },
  ] }],
}
const other: ReadingTest = { ...mini, id: 'reading-two-passage-pilot-v1' }

class MemoryStorage implements DraftStorage {
  data = new Map<string, string>()
  writes = 0
  removals = 0
  fail: 'read' | 'write' | 'clear' | null = null
  getItem(key: string) {
    if (this.fail === 'read') throw new Error('Read denied')
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.fail === 'write') throw new Error('Quota exceeded')
    this.writes++
    this.data.set(key, value)
  }
  removeItem(key: string) {
    if (this.fail === 'clear') throw new Error('Clear denied')
    this.removals++
    this.data.delete(key)
  }
}

function saved(draft: ReadingDraft = freshDraft(now), exam = mini) {
  const storage = new MemoryStorage()
  storage.data.set(draftKey(exam), JSON.stringify(draft))
  return storage
}

test('preserves the mini alias and existing per-test keys', () => {
  assert.equal(draftKey(mini), 'practice-room-reading-mini-draft-v1')
  assert.equal(draftKey(other), 'practice-room-reading-reading-two-passage-pilot-v1-draft-v1')
  assert.equal(draftKey(matchingHeadingsTest), 'practice-room-reading-night-sky-headings-v1-draft-v1')
})

test('missing storage is distinct from an unavailable storage API', () => {
  const storage = new MemoryStorage()
  assert.deepEqual(readDraft(mini, now, storage), { kind: 'missing' })
  assert.deepEqual(sessionInfo(readDraft(mini, now, storage)), { status: 'new', answered: 0 })
  assert.equal(storage.writes, 0)
  storage.fail = 'read'
  assert.deepEqual(readDraft(mini, now, storage), { kind: 'unavailable' })
  assert.deepEqual(sessionInfo(readDraft(mini, now, storage)), { status: 'unavailable', answered: 0 })
})

test('a fresh draft round-trips and clearing a missing key performs no write', () => {
  const storage = new MemoryStorage()
  assert.deepEqual(clearDraft(mini, false, now, storage), { kind: 'ok' })
  assert.equal(storage.removals, 0)
  const draft = freshDraft(now)
  assert.deepEqual(saveDraft(mini, draft, now, storage), { kind: 'ok' })
  const result = readDraft(mini, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind === 'valid') assert.deepEqual(result.draft, draft)
})

test('a failed first write is unavailable rather than saved', () => {
  const storage = new MemoryStorage()
  storage.fail = 'write'
  assert.deepEqual(saveDraft(mini, freshDraft(now), now, storage), { kind: 'unavailable' })
  assert.equal(storage.data.has(draftKey(mini)), false)
})

test('an unavailable localStorage getter is caught', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { get localStorage() { throw new Error('SecurityError') } },
  })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  assert.deepEqual(readDraft(mini, now), { kind: 'unavailable' })
  assert.deepEqual(saveDraft(mini, freshDraft(now), now), { kind: 'unavailable' })
  assert.deepEqual(clearDraft(mini, false, now), { kind: 'unavailable' })
})

test('valid drafts restore without changing the stored bytes', () => {
  const draft = { ...freshDraft(now - 2000), answers: { 'city-shade-q1': 'TRUE', 'city-shade-q7': '  Mulch. ' } }
  const storage = saved(draft)
  const before = storage.getItem(draftKey(mini))
  const result = readDraft(mini, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind !== 'valid') return
  assert.deepEqual(result.draft, draft)
  assert.deepEqual(result.session, { status: 'active', answered: 2 })
  assert.equal(remainingSeconds(mini, result.draft, now), 898)
  assert.deepEqual(saveDraft(mini, result.draft, now, storage), { kind: 'ok' })
  assert.equal(storage.getItem(draftKey(mini)), before)
  assert.equal(storage.writes, 0)
  assert.equal(storage.removals, 0)
})

for (const [label, raw] of [
  ['malformed JSON', '{broken'], ['empty string', ''], ['null', 'null'],
  ['array', '[]'], ['number', '42'], ['missing fields', '{}'],
  ['array answers', JSON.stringify({ ...freshDraft(now), answers: [] })],
  ['null answers', JSON.stringify({ ...freshDraft(now), answers: null })],
  ['non-string answer', JSON.stringify({ ...freshDraft(now), answers: { 1: 7 } })],
  ['non-boolean submission', JSON.stringify({ ...freshDraft(now), submitted: 'false' })],
  ['non-number timestamp', JSON.stringify({ ...freshDraft(now), startedAt: '123' })],
]) {
  test('preserves invalid draft: ' + label, () => {
    const storage = new MemoryStorage()
    storage.data.set(draftKey(mini), raw)
    const result = readDraft(mini, now, storage)
    assert.equal(result.kind, 'invalid')
    assert.equal(sessionInfo(result).status, 'invalid')
    assert.equal(saveDraft(mini, freshDraft(now), now, storage).kind, 'invalid')
    assert.equal(clearDraft(mini, false, now, storage).kind, 'invalid')
    assert.equal(storage.getItem(draftKey(mini)), raw)
    assert.equal(storage.writes, 0)
    assert.equal(storage.removals, 0)
  })
}

test('invalid recovery requires explicit discard and clears only that test', () => {
  const storage = new MemoryStorage()
  storage.data.set(draftKey(mini), '{broken')
  storage.data.set(draftKey(other), 'another draft')
  assert.equal(clearDraft(mini, false, now, storage).kind, 'invalid')
  assert.deepEqual(clearDraft(mini, true, now, storage), { kind: 'ok' })
  assert.equal(storage.getItem(draftKey(mini)), null)
  assert.equal(storage.getItem(draftKey(other)), 'another draft')
  assert.deepEqual(saveDraft(mini, freshDraft(now), now, storage), { kind: 'ok' })
})

test('legacy numeric answers restore and remain numeric until that answer changes', () => {
  const storage = saved({ ...freshDraft(now), answers: { 1: 'TRUE', 7: '  mulch ', unused: 'keep' } })
  const result = readDraft(mini, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind !== 'valid') return
  assert.deepEqual(result.draft.answers, { 'city-shade-q1': 'TRUE', 'city-shade-q7': '  mulch ' })
  saveDraft(mini, result.draft, now, storage)
  assert.equal(storage.writes, 0)
  saveDraft(mini, { ...result.draft, answers: { ...result.draft.answers, 'city-shade-q1': 'FALSE' } }, now, storage)
  const persisted = JSON.parse(storage.getItem(draftKey(mini))!)
  assert.deepEqual(persisted.answers, { 'city-shade-q1': 'FALSE', 7: '  mulch ', unused: 'keep' })
})

test('stable IDs take precedence over numeric aliases without rewriting on read', () => {
  const storage = saved({ ...freshDraft(now), answers: { 1: 'FALSE', 'city-shade-q1': 'TRUE' } })
  const result = readDraft(mini, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind === 'valid') assert.equal(result.draft.answers['city-shade-q1'], 'TRUE')
  assert.equal(storage.writes, 0)
})

test('saving a cleared question removes its legacy alias so it cannot reappear', () => {
  const storage = saved({ ...freshDraft(now), answers: { 1: 'TRUE' } })
  assert.deepEqual(saveDraft(mini, freshDraft(now), now, storage), { kind: 'ok' })
  const result = readDraft(mini, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind === 'valid') assert.deepEqual(result.draft.answers, {})
})

test('saving preserves extra metadata and untouched answer text', () => {
  const storage = saved()
  storage.data.set(draftKey(mini), JSON.stringify({ ...freshDraft(now), note: 'legacy metadata', answers: { 7: '  mulch.  ' } }))
  saveDraft(mini, { ...freshDraft(now), answers: { 'city-shade-q7': '  mulch.  ' }, submitted: true }, now, storage)
  const persisted = JSON.parse(storage.getItem(draftKey(mini))!)
  assert.equal(persisted.note, 'legacy metadata')
  assert.equal(persisted.answers['7'], '  mulch.  ')
  assert.equal(persisted.submitted, true)
})

test('future and non-finite timestamps are rejected without replacing data', () => {
  const storage = saved(freshDraft(now + 1))
  assert.deepEqual(readDraft(mini, now, storage), { kind: 'invalid', reason: 'timestamp' })
  assert.equal(saveDraft(mini, freshDraft(now), now, storage).kind, 'invalid')
  for (const startedAt of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(saveDraft(mini, freshDraft(startedAt), now, new MemoryStorage()), { kind: 'invalid', reason: 'timestamp' })
  }
  assert.equal(storage.writes, 0)
})

test('retention is valid just before 30 days, rejected at 30 days, without deletion', () => {
  for (const submitted of [false, true]) {
    const draft = { ...freshDraft(now - DRAFT_RETENTION_MS + 1), submitted }
    const storage = saved(draft)
    assert.equal(readDraft(mini, now, storage).kind, 'valid')
    const raw = storage.getItem(draftKey(mini))
    assert.deepEqual(readDraft(mini, now + 1, storage), { kind: 'invalid', reason: 'retention' })
    assert.equal(saveDraft(mini, freshDraft(now + 1), now + 1, storage).kind, 'invalid')
    assert.equal(storage.getItem(draftKey(mini)), raw)
    assert.equal(storage.writes, 0)
    assert.equal(storage.removals, 0)
  }
})

test('timer and session status agree at the exact expiry boundary', () => {
  const draft = freshDraft(now)
  const storage = saved(draft)
  const deadline = now + mini.durationMinutes * 60_000
  assert.equal(remainingSeconds(mini, draft, deadline - 1001), 2)
  assert.equal(remainingSeconds(mini, draft, deadline - 1), 1)
  assert.equal(remainingSeconds(mini, draft, deadline), 0)
  assert.equal(remainingSeconds(mini, draft, deadline + 1), 0)
  assert.equal(sessionInfo(readDraft(mini, deadline - 1, storage)).status, 'active')
  assert.equal(sessionInfo(readDraft(mini, deadline, storage)).status, 'expired')
  assert.equal(sessionInfo(readDraft(mini, deadline + 1, storage)).status, 'expired')
})

test('submitted drafts stay finished even after the timer expires', () => {
  const storage = saved({ ...freshDraft(now), submitted: true })
  assert.equal(sessionInfo(readDraft(mini, now + 16 * 60_000, storage)).status, 'finished')
})

test('expired review freezes the draft without changing original time or answers', () => {
  const storage = saved({ ...freshDraft(now), answers: { 7: 'mulch' } })
  const later = now + 16 * 60_000
  const result = readDraft(mini, later, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind !== 'valid') return
  assert.equal(result.session.status, 'expired')
  assert.deepEqual(saveDraft(mini, { ...result.draft, submitted: true }, later, storage), { kind: 'ok' })
  const persisted = JSON.parse(storage.getItem(draftKey(mini))!)
  assert.equal(persisted.startedAt, now)
  assert.deepEqual(persisted.answers, { 7: 'mulch' })
  assert.equal(sessionInfo(readDraft(mini, later, storage)).status, 'finished')
})

test('test IDs isolate loading, saving and clearing despite shared question IDs', () => {
  const storage = new MemoryStorage()
  const draft = { ...freshDraft(now), answers: { 'city-shade-q1': 'TRUE' } }
  saveDraft(mini, draft, now, storage)
  assert.equal(readDraft(other, now, storage).kind, 'missing')
  saveDraft(other, { ...draft, answers: { 'city-shade-q1': 'FALSE' } }, now, storage)
  const rawOther = storage.getItem(draftKey(other))
  clearDraft(mini, false, now, storage)
  assert.equal(readDraft(mini, now, storage).kind, 'missing')
  assert.equal(storage.getItem(draftKey(other)), rawOther)
})

test('read failures block saving and clearing, including explicit recovery', () => {
  const storage = saved()
  const before = storage.data.get(draftKey(mini))
  storage.fail = 'read'
  assert.deepEqual(saveDraft(mini, freshDraft(now), now, storage), { kind: 'unavailable' })
  assert.deepEqual(clearDraft(mini, true, now, storage), { kind: 'unavailable' })
  assert.equal(storage.data.get(draftKey(mini)), before)
  assert.equal(storage.writes, 0)
  assert.equal(storage.removals, 0)
})

test('write failure is explicit, preserves old answers, and can be retried', () => {
  const storage = saved()
  const before = storage.data.get(draftKey(mini))
  const edited = { ...freshDraft(now), answers: { 'city-shade-q1': 'TRUE' } }
  storage.fail = 'write'
  assert.deepEqual(saveDraft(mini, edited, now, storage), { kind: 'unavailable' })
  assert.equal(storage.data.get(draftKey(mini)), before)
  storage.fail = null
  assert.deepEqual(saveDraft(mini, edited, now, storage), { kind: 'ok' })
})

test('clear failure preserves valid and corrupted drafts', () => {
  for (const raw of [JSON.stringify(freshDraft(now)), '{broken']) {
    const storage = new MemoryStorage()
    storage.data.set(draftKey(mini), raw)
    storage.fail = 'clear'
    assert.deepEqual(clearDraft(mini, true, now, storage), { kind: 'unavailable' })
    assert.equal(storage.data.get(draftKey(mini)), raw)
  }
})

test('revalidation protects corruption introduced after a successful read', () => {
  const storage = saved()
  const initial = readDraft(mini, now, storage)
  assert.equal(initial.kind, 'valid')
  storage.data.set(draftKey(mini), '{new corruption')
  assert.equal(saveDraft(mini, freshDraft(now), now, storage).kind, 'invalid')
  assert.equal(storage.getItem(draftKey(mini)), '{new corruption')
  assert.equal(clearDraft(mini, false, now, storage).kind, 'invalid')
})

test('a stale runner cannot replace a different attempt or reopen a submitted draft', () => {
  const storage = saved(freshDraft(now + 1))
  assert.deepEqual(saveDraft(mini, freshDraft(now), now + 1, storage), { kind: 'conflict' })
  storage.data.set(draftKey(mini), JSON.stringify({ ...freshDraft(now), submitted: true }))
  assert.deepEqual(saveDraft(mini, freshDraft(now), now + 1, storage), { kind: 'conflict' })
  assert.equal(storage.writes, 0)
})

test('unfinished headings restore later-question priority without writing on read', () => {
  const draft = { ...freshDraft(now), answers: { 1: 'i', 2: 'i', 3: 'ii' } }
  const storage = saved(draft, matchingHeadingsTest)
  const raw = storage.getItem(draftKey(matchingHeadingsTest))
  const result = readDraft(matchingHeadingsTest, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind !== 'valid') return
  assert.deepEqual(result.draft.answers, { 'night-sky-q2': 'i', 'night-sky-q3': 'ii' })
  assert.equal(result.session.answered, 2)
  saveDraft(matchingHeadingsTest, result.draft, now, storage)
  assert.equal(storage.getItem(draftKey(matchingHeadingsTest)), raw)
  assert.equal(storage.writes, 0)
})

test('submitted headings are never deduplicated on review', () => {
  const storage = saved({ ...freshDraft(now), submitted: true, answers: { 1: 'i', 2: 'i' } }, matchingHeadingsTest)
  const result = readDraft(matchingHeadingsTest, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind === 'valid') {
    assert.deepEqual(result.draft.answers, { 'night-sky-q1': 'i', 'night-sky-q2': 'i' })
    assert.equal(result.session.answered, 2)
  }
  assert.equal(storage.writes, 0)
})

test('a changed heading removes both old aliases without changing other answers', () => {
  const storage = saved({ ...freshDraft(now), answers: { 1: 'i', 2: 'i', 3: 'ii' } }, matchingHeadingsTest)
  const result = readDraft(matchingHeadingsTest, now, storage)
  assert.equal(result.kind, 'valid')
  if (result.kind !== 'valid') return
  const edited = { ...result.draft, answers: { 'night-sky-q1': 'i', 'night-sky-q3': 'ii' } }
  assert.deepEqual(saveDraft(matchingHeadingsTest, edited, now, storage), { kind: 'ok' })
  const restored = readDraft(matchingHeadingsTest, now, storage)
  assert.equal(restored.kind, 'valid')
  if (restored.kind === 'valid') assert.deepEqual(restored.draft.answers, edited.answers)
  assert.deepEqual(JSON.parse(storage.getItem(draftKey(matchingHeadingsTest))!).answers, { 1: 'i', 3: 'ii' })
})

test('independent heading sets can reuse numerals and missing options are not a set', () => {
  const a = matchingHeadingsTest.passages[0].questions[0]
  const b = matchingHeadingsTest.passages[0].questions[1]
  assert.equal(sameHeadingSet(a, b), true)
  assert.equal(sameHeadingSet(a, { ...b, options: [{ value: 'i', label: 'Different set' }] }), false)
  assert.equal(sameHeadingSet({ ...a, options: undefined }, b), false)
})
