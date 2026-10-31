import test from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import { emptyWork, markPrivatePractice, parseAnswerKey, validateConfig, validPrivateAttempt, validPrivateConfig, validWork, wordCount } from '../src/practice/privatePractice.ts'
import type { PracticeConfig, PrivateLibrary } from '../src/practice/privatePractice.ts'
import { localData } from '../src/practice/privateStore.ts'
import privateLibrary, { byteRange, trustedLocalRequest } from '../server/privateLibrary.ts'
import { detectSections } from './sourceSections.mts'

const book = { id: 'a'.repeat(64), assetId: 'a'.repeat(64), title: 'Original QA document', fingerprint: 'b'.repeat(64), pages: 8, extractedPages: 8 }
const library: PrivateLibrary = { books: [book], assets: [{ id: 'c'.repeat(64), name: 'qa.mp3', label: 'qa.mp3', type: 'audio' }] }
const config = (key = '1: alpha\n2: bravo'): PracticeConfig => ({ id: 'qa-test', skill: 'reading', title: 'Original QA exercise',
  book, firstPage: 1, lastPage: 2, testNumber: 1, durationMinutes: 60, audioIds: [], questions: parseAnswerKey(key, 2), reviewedAt: '2026-11-01T00:00:00.000Z' })

test('parses reviewed alternatives without treating slashes inside dates as separators', () => {
  const parsed = parseAnswerKey('2: 12/10\n1: alpha | accepted variant ; limit=3', 2)
  assert.deepEqual(parsed[0].accepted, ['alpha', 'accepted variant'])
  assert.equal(parsed[0].maxWords, 3)
  assert.deepEqual(parsed[1].accepted, ['12/10'])
})

for (const value of ['1: alpha', '1: alpha\n1: bravo', '1: alpha\n3: bravo', 'alpha\nbravo',
  '1: alpha |\n2: bravo', '1: alpha ; limit=0\n2: bravo', '1: alpha ; unsupported=1\n2: bravo',
  '1-2: alpha + alpha', '1-2: alpha', '1-2: alpha | alternative + bravo']) {
  test(`rejects an incomplete or ambiguous key: ${value.replaceAll('\n', ' / ')}`, () => assert.throws(() => parseAnswerKey(value, 2)))
}

test('preserves the question count of historical source papers', () => {
  const questions = parseAnswerKey(Array.from({ length: 42 }, (_, index) => `${index + 1}: value`).join('\n'), 42)
  assert.equal(questions.length, 42)
  assert.throws(() => parseAnswerKey('', 61))
})

test('any-order groups accept permutations and never award duplicate credit', () => {
  const source = config('1-2: alpha + bravo')
  assert.equal(markPrivatePractice(source, { '1': 'bravo', '2': 'alpha' }).correct, 2)
  const duplicated = markPrivatePractice(source, { '1': 'alpha', '2': 'alpha' })
  assert.equal(duplicated.correct, 1)
  assert.match(duplicated.questions[1].explanation, /only once/)
  assert.equal(markPrivatePractice(source, { '1': 'incorrect', '2': 'alpha' }).correct, 1)
})

test('question-specific word limits and exact capitalization are enforced', () => {
  const source = config('1: alpha bravo ; limit=1\n2: Named ; case=exact')
  assert.equal(markPrivatePractice(source, { '1': 'alpha bravo', '2': 'named' }).correct, 0)
  assert.equal(markPrivatePractice(source, { '2': 'Named' }).correct, 1)
})

test('words-and-a-number instructions differ from a plain word limit', () => {
  const source = config('1: by 5 per cent ; limit=3 ; number=1\n2: by 5 per cent ; limit=3')
  const result = markPrivatePractice(source, { '1': 'by 5 per cent', '2': 'by 5 per cent' })
  assert.equal(result.questions[0].isCorrect, true)
  assert.equal(result.questions[1].isCorrect, false)
})

test('validation rejects changed source revisions and missing Listening audio', () => {
  assert.equal(validateConfig(config(), library), null)
  assert.match(validateConfig({ ...config(), book: { ...book, fingerprint: 'changed' } }, library)!, /source document changed/)
  assert.match(validateConfig({ ...config(), skill: 'listening' }, library)!, /original Listening audio/)
  assert.equal(validateConfig({ ...config(), skill: 'listening', audioIds: [library.assets[0].id] }, library), null)
  assert.match(validateConfig({ ...config(), firstPage: 0 }, library)!, /page range/)
  assert.match(validateConfig({ ...config(), lastPage: 9 }, library)!, /page range/)
  assert.match(validateConfig({ ...config(), durationMinutes: Number.NaN }, library)!, /duration/)
  assert.match(validateConfig({ ...config(), questions: [] }, library)!, /answer key/)
})

test('work restoration rejects malformed records and preserves exact writing text', () => {
  const work = { ...emptyWork('qa-test'), essays: ['  My exact writing.\n', 'Second task'] as [string, string] }
  assert.equal(validWork(work, 'qa-test'), true)
  assert.equal(validWork(work, 'different-test'), false)
  for (const invalid of [null, [], {}, { ...work, recordings: [null] }, { ...work, answers: [] },
    { ...work, essays: ['one'] }, { ...work, essays: [1, 2] }, { ...work, submittedAt: 5 }]) assert.equal(validWork(invalid, 'qa-test'), false)
  assert.equal(work.essays[0], '  My exact writing.\n')
  assert.equal(wordCount('  one\n two  three '), 3)
  assert.equal(wordCount('  '), 0)
})

test('storage unavailability rejects explicitly without modifying other storage', async () => {
  await assert.rejects(localData('configs', 'all'))
})

test('source candidates preserve ranges without mistaking a running header for Speaking', () => {
  const sections = detectSections([
    { page: 1, text: 'Introduction\nTest 1\nSPEAKING\nPART 1' },
    { page: 2, text: 'Test 1\nLISTENING\nSECTION 1 Questions 1-40' },
    { page: 3, text: 'Test 1\nREADING PASSAGE 1\nQuestions 1-40' },
    { page: 4, text: 'WRITING TASK 1' },
    { page: 5, text: 'Speaking\nWRITING TASK 2' },
    { page: 6, text: 'SPEAKING\nPART 1' },
    { page: 7, text: 'Answer key\nLISTENING' },
  ])
  assert.deepEqual(sections.map(section => [section.skill, section.firstPage, section.lastPage]), [
    ['listening', 2, 2], ['reading', 3, 3], ['writing', 4, 5], ['speaking', 6, 6],
  ])
})

test('private content requests reject cross-site, LAN, invalid origins and DNS rebinding hosts', () => {
  const request = (address: string, headers: Record<string, string>) => ({ socket: { remoteAddress: address }, headers }) as unknown as IncomingMessage
  assert.equal(trustedLocalRequest(request('127.0.0.1', { host: '127.0.0.1:5190' })), true)
  assert.equal(trustedLocalRequest(request('::1', { host: 'localhost:5190', origin: 'http://localhost:5190' })), true)
  assert.equal(trustedLocalRequest(request('192.168.1.2', { host: 'localhost:5190' })), false)
  assert.equal(trustedLocalRequest(request('127.0.0.1', { host: 'evil.example:5190', origin: 'http://evil.example:5190' })), false)
  assert.equal(trustedLocalRequest(request('127.0.0.1', { host: 'localhost:5190', origin: 'https://evil.example' })), false)
  assert.equal(trustedLocalRequest(request('127.0.0.1', { host: 'localhost:5190', origin: 'invalid' })), false)
  assert.equal(trustedLocalRequest(request('127.0.0.1', { host: 'localhost:5190', 'sec-fetch-site': 'cross-site' })), false)
})

test('private PDF/audio streaming supports bounded, open and suffix ranges safely', () => {
  assert.deepEqual(byteRange('bytes=0-9', 100), { start: 0, end: 9 })
  assert.deepEqual(byteRange('bytes=90-', 100), { start: 90, end: 99 })
  assert.deepEqual(byteRange('bytes=90-1000', 100), { start: 90, end: 99 })
  assert.deepEqual(byteRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.deepEqual(byteRange('bytes=-1000', 100), { start: 0, end: 99 })
  for (const value of ['bytes=-0', 'bytes=100-', 'bytes=9-1', 'bytes=1-2,4-5', 'bytes=-', 'invalid']) assert.equal(byteRange(value, 100), null)
})

test('the build rejects private imports and bundled source PDF/audio', () => {
  const plugin = privateLibrary()
  if (typeof plugin.resolveId !== 'function' || typeof plugin.generateBundle !== 'function') assert.fail('Build guards unavailable')
  assert.throws(() => Reflect.apply(plugin.resolveId as Function, {}, ['../private-content/book.local.json']))
  for (const name of ['assets/book.pdf', 'assets/audio.mp3']) {
    assert.throws(() => Reflect.apply(plugin.generateBundle as Function, {}, [{}, { [name]: {} }]))
  }
})

test('damaged saved configurations cannot start or overwrite a session', () => {
  assert.equal(validPrivateConfig(config()), true)
  for (const value of [null, [], {}, { ...config(), questions: null }, { ...config(), questions: [null] },
    { ...config(), book: null }, { ...config(), reviewedAt: 'invalid' }, { ...config(), skill: 'unknown' },
    { ...config(), skill: 'listening', audioIds: [] }]) assert.equal(validPrivateConfig(value), false)
})

test('historical results are shape-checked without regrading or changing stored responses', () => {
  const source = config()
  const work = { ...emptyWork(source.id), startedAt: 1000, submittedAt: 2000, answers: { '1': 'alpha', '2': 'bravo' } }
  const attempt = { schemaVersion: 1, gradingVersion: 'private-objective-v1', id: `${source.id}:1000`, config: source, work, resultSnapshot: markPrivatePractice(source, work.answers) }
  assert.equal(validPrivateAttempt(attempt), true)
  for (const value of [{ ...attempt, schemaVersion: 99 }, { ...attempt, resultSnapshot: null },
    { ...attempt, resultSnapshot: { ...attempt.resultSnapshot, correct: 99 } },
    { ...attempt, resultSnapshot: { ...attempt.resultSnapshot, questions: [null] } }]) assert.equal(validPrivateAttempt(value), false)
  assert.deepEqual(attempt.work.answers, { '1': 'alpha', '2': 'bravo' })
})
