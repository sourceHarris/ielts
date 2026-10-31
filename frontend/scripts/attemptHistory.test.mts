import test from 'node:test'
import assert from 'node:assert/strict'
import { createReadingAttempt, readReadingAttempts, saveReadingAttempt, validateReadingAttempt } from '../src/reading/attemptHistory.ts'
import { readDraft, draftKey } from '../src/reading/sessionStorage.ts'
import { cityShadeTest } from '../src/reading/miniTest.ts'
import { matchingHeadingsTest } from '../src/reading/matchingHeadingsTest.ts'

const startedAt = 1_800_000_000_000
const draft = () => ({ startedAt, answers: { 'city-shade-q1': ' TRUE ', 'city-shade-q7': '  mulch.  ' }, submitted: false })
const create = () => createReadingAttempt(cityShadeTest, draft(), 'submitted', startedAt + 5_000)

test('captures the full test, exact responses, raw result and provenance', async () => {
  const attempt = await create()
  assert.equal(attempt.testId, cityShadeTest.id)
  assert.equal(attempt.schemaVersion, 1)
  assert.equal(attempt.gradingVersion, 'reading-normalization-v1')
  assert.deepEqual(attempt.testSnapshot, cityShadeTest)
  assert.deepEqual(attempt.answers, draft().answers)
  assert.equal(attempt.resultSnapshot.total, 8)
  assert.equal(attempt.resultSnapshot.unanswered, 6)
  assert.equal(attempt.resultSnapshot.questions[0].userAnswer, ' TRUE ')
  assert.equal(attempt.completionReason, 'submitted')
  assert.equal(attempt.completedAt, new Date(startedAt + 5_000).toISOString())
  assert.match(attempt.contentVersion, /^sha256:[a-f0-9]{64}$/)
  assert.match(attempt.answerKeyVersion, /^sha256:[a-f0-9]{64}$/)
  assert.equal(await validateReadingAttempt(attempt), true)
})

test('detaches mutable input before hashing and leaves existing drafts unchanged', async () => {
  const source = structuredClone(cityShadeTest)
  const answers = draft()
  const original = structuredClone(answers)
  const pending = createReadingAttempt(source, answers, 'submitted', startedAt + 5_000)
  source.passages[0].paragraphs[0] = 'Changed later'
  source.passages[0].questions[0].correctAnswers[0] = 'FALSE'
  answers.answers['city-shade-q1'] = 'FALSE'
  const attempt = await pending
  assert.deepEqual(attempt.testSnapshot, cityShadeTest)
  assert.deepEqual(attempt.answers, original.answers)
  assert.equal(await validateReadingAttempt(attempt), true)
})

test('content and answer-key revisions change independently', async () => {
  const original = await create()
  const editedText = structuredClone(cityShadeTest)
  editedText.passages[0].paragraphs[0] += ' An editorial revision.'
  const text = await createReadingAttempt(editedText, draft(), 'submitted', startedAt + 5_000)
  assert.notEqual(text.contentVersion, original.contentVersion)
  assert.equal(text.answerKeyVersion, original.answerKeyVersion)
  const editedKey = structuredClone(cityShadeTest)
  editedKey.passages[0].questions[0].correctAnswers = ['FALSE']
  editedKey.passages[0].questions[0].explanation = 'Corrected explanation.'
  const key = await createReadingAttempt(editedKey, draft(), 'submitted', startedAt + 5_000)
  assert.equal(key.contentVersion, original.contentVersion)
  assert.notEqual(key.answerKeyVersion, original.answerKeyVersion)
  assert.deepEqual(original.testSnapshot, cityShadeTest)
  assert.notEqual(original.resultSnapshot.correct, key.resultSnapshot.correct)
})

test('property insertion order does not change content/key revisions', async () => {
  const original = await create()
  const reordered = Object.fromEntries(Object.entries(cityShadeTest).reverse()) as typeof cityShadeTest
  const attempt = await createReadingAttempt(reordered, draft(), 'submitted', startedAt + 5_000)
  assert.equal(attempt.contentVersion, original.contentVersion)
  assert.equal(attempt.answerKeyVersion, original.answerKeyVersion)
})

test('attempt identity isolates tests and repeat sessions', async () => {
  const first = await create()
  const second = await createReadingAttempt(cityShadeTest, { ...draft(), startedAt: startedAt + 1 }, 'submitted', startedAt + 5_000)
  const otherTest = await createReadingAttempt({ ...cityShadeTest, id: 'another/test' }, draft(), 'submitted', startedAt + 5_000)
  const retry = await createReadingAttempt(cityShadeTest, draft(), 'submitted', startedAt + 10_000)
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.id, otherTest.id)
  assert.equal(first.id, retry.id)
  assert.equal(first.contentVersion, retry.contentVersion)
})

test('timer expiry is accepted at the exact boundary, never before it', async () => {
  const expiry = startedAt + cityShadeTest.durationMinutes * 60_000
  await assert.rejects(createReadingAttempt(cityShadeTest, draft(), 'timer-expired', expiry - 1))
  const attempt = await createReadingAttempt(cityShadeTest, draft(), 'timer-expired', expiry)
  assert.equal(attempt.completionReason, 'timer-expired')
  assert.equal(await validateReadingAttempt(attempt), true)
})

test('legacy numeric draft answers are archived after shared restoration without rewriting storage', async () => {
  const raw = JSON.stringify({ startedAt, answers: { '1': ' TRUE ', '7': '  mulch.  ' }, submitted: false })
  const storage = {
    getItem(key: string) { assert.equal(key, draftKey(cityShadeTest)); return raw },
    setItem() { assert.fail('Reading storage must not be rewritten') },
    removeItem() { assert.fail('Reading storage must not be cleared') },
  }
  const loaded = readDraft(cityShadeTest, startedAt + 1, storage)
  assert.equal(loaded.kind, 'valid')
  if (loaded.kind !== 'valid') return
  const attempt = await createReadingAttempt(cityShadeTest, loaded.draft, 'submitted', startedAt + 5_000)
  assert.deepEqual(attempt.answers, draft().answers)
  assert.equal(await validateReadingAttempt(attempt), true)
})

test('Matching Headings snapshots preserve submitted answers and option sets', async () => {
  const headings = { startedAt, submitted: true, answers: { 'night-sky-q1': 'iv', 'night-sky-q2': 'iv' } }
  const attempt = await createReadingAttempt(matchingHeadingsTest, headings, 'submitted', startedAt + 5_000)
  assert.deepEqual(attempt.answers, headings.answers)
  assert.deepEqual(attempt.testSnapshot.passages[0].questions[0].options,
    matchingHeadingsTest.passages[0].questions[0].options)
  assert.equal(await validateReadingAttempt(attempt), true)
})

for (const field of ['answers', 'testSnapshot', 'resultSnapshot', 'contentVersion', 'answerKeyVersion', 'completedAt', 'integrity'] as const) {
  test(`detects a damaged ${field} without modifying the record`, async () => {
    const attempt = await create()
    const damaged: Record<string, unknown> = structuredClone(attempt)
    damaged[field] = field === 'completedAt' ? new Date(startedAt + 10_000).toISOString() : 'damaged'
    const before = structuredClone(damaged)
    assert.equal(await validateReadingAttempt(damaged), false)
    assert.deepEqual(damaged, before)
  })
}

test('unsupported versions and malformed record shapes are rejected', async () => {
  const attempt = await create()
  for (const value of [null, [], {}, 1, { ...attempt, schemaVersion: 2 },
    { ...attempt, gradingVersion: 'unknown' }, { ...attempt, testId: 'different-test' },
    { ...attempt, resultSnapshot: { total: 8, questions: [null] } },
    { ...attempt, answers: { q1: 1 } }]) {
    assert.equal(await validateReadingAttempt(value), false)
  }
})

test('invalid content and impossible completion times cannot create records', async () => {
  const duplicate = structuredClone(cityShadeTest)
  duplicate.passages[0].questions[1].id = duplicate.passages[0].questions[0].id
  for (const [source, session, end] of [
    [duplicate, draft(), startedAt + 5_000],
    [cityShadeTest, { ...draft(), startedAt: -1 }, startedAt + 5_000],
    [cityShadeTest, draft(), startedAt - 1],
    [cityShadeTest, draft(), Number.NaN],
  ] as const) {
    await assert.rejects(createReadingAttempt(source, session, 'submitted', end))
  }
})

test('unavailable IndexedDB reads and writes are explicit and leave localStorage untouched', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw Error('Access denied') } })
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original)
    else Reflect.deleteProperty(globalThis, 'indexedDB')
  })
  assert.deepEqual(await readReadingAttempts(), { kind: 'unavailable' })
  assert.deepEqual(await saveReadingAttempt(await create()), { kind: 'unavailable' })
  const bad = { ...await create(), schemaVersion: 2 } as unknown as Awaited<ReturnType<typeof create>>
  assert.deepEqual(await saveReadingAttempt(bad), { kind: 'invalid' })
})
