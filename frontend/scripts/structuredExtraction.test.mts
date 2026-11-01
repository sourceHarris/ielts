import test from 'node:test'
import assert from 'node:assert/strict'
import { extractModule, identifyAudio, matchAudio, numberedCandidates, questionRanges, questionType, validateProvenance } from './structuredExtraction.mts'
import type { DocumentPlan, Page, TestPlan } from './structuredExtraction.mts'
import { discoverTests } from './discoverTests.mts'
import { columnLines, consolidateVisuals, keyColumnCandidates, visualRegions } from './extractionLayout.mts'
import type { Word } from './extractionLayout.mts'

// Original synthetic extraction fixtures only; no private publisher text/keys.
const page = (text: string, number = 1): Page => ({ page: number, text, method: 'text', confidence: null })
const document: DocumentPlan = { assetId: 'a'.repeat(64), bookNumber: 99, role: 'academic-tests', tests: [] }
const scope: TestPlan = { number: 1, modules: { reading: { pages: [1], keyPages: [2] } } }
const source = 'Preface\nREADING PASSAGE 1\nA QA passage; strange grammar stay.\nQuestions 1–2\nChoose the correct letter, A, B or C.\n1 First QA prompt?\nA One\nB Two\n2 Second QA prompt?\n'
const extract = () => extractModule([page(source), page('1 A\n2 B', 2)], document, scope, 'reading', [])

test('preserves exact extracted characters and section coverage, including preamble and punctuation', () => {
  const draft = extract()
  assert.equal(validateProvenance(draft), true)
  assert.equal(draft.sourceText[0].text, source)
  assert.equal(draft.sections.flatMap(section => section.spans).map(span => span.text).join(''), source)
  assert.equal(draft.questions[0].stemCandidates[0].source.text, '1 First QA prompt?')
  assert.equal(draft.questions[0].answerCandidates[0].valueRaw, 'A')
  assert.equal(draft.questionGroups[0].typeCandidate, 'multiple-choice')
  assert.equal(draft.questionGroups[0].optionCandidates.length, 2)
})

test('detects rewritten or missing spans and never treats provenance as original-page verification', () => {
  const draft = extract()
  draft.sections[1].spans[0].text = 'rewritten'
  assert.throws(() => validateProvenance(draft))
  assert.equal(draft.activationAllowed, false)
  assert.equal(draft.counts.verifiedQuestions, 0)
  assert.equal(draft.answerKey.approved, false)
  assert.ok(draft.questions.every(question => question.approvedAnswer === null))
})

test('detects missing cached pages instead of exporting a partial test', () => {
  assert.throws(() => extractModule([page(source)], document, scope, 'reading', []), /Missing cached key/)
  assert.throws(() => extractModule([], document, scope, 'reading', []), /Missing cached source/)
})

test('recognizes printed range variants without forcing historical counts to forty', () => {
  assert.deepEqual(questionRanges('Questions 1—12\nQuestions 13 = 23\nQuestions 24-32\nQuestions 33–42').map(range => [range.start, range.end]), [[1, 12], [13, 23], [24, 32], [33, 42]])
  assert.deepEqual(questionRanges('Questions 11 and 12\nQuestion 19').map(range => [range.start, range.end]), [[11, 12], [19, 19]])
  assert.equal(questionRanges('Questions I–13\nQuestions 30–21\nQuestions 1–999').length, 0)
  const draft = extractModule([page('SECTION 1\nQuestions 1-42')], document, { number: 1, modules: { listening: { pages: [1] } } }, 'listening', [])
  assert.equal(draft.counts.printedRangeNumbers, 42)
  assert.equal(draft.questions.length, 42)
  assert.ok(draft.issues.some(issue => issue.code === 'question-count-review'))
})

test('range coverage does not invent unresolved inline prompts or answers', () => {
  const draft = extractModule([page('READING PASSAGE 1\nQuestions 1-40\nA sentence with an inline (1) .... blank.')], document,
    { number: 1, modules: { reading: { pages: [1] } } }, 'reading', [])
  assert.equal(draft.counts.printedRangeNumbers, 40)
  assert.equal(draft.counts.isolatedStemNumbers, 0)
  assert.equal(draft.counts.isolatedKeyNumbers, 0)
  assert.ok(draft.issues.some(issue => issue.code === 'question-stem-unresolved' && issue.question === 1))
  assert.ok(draft.issues.some(issue => issue.code === 'key-source-missing'))
})

test('a conflicting single-question OCR label does not inflate the printed ranges', () => {
  const draft = extractModule([page('READING PASSAGE 1\nQuestions 1-40\nQuestion 41)\nWrite it in box 40.')], document,
    { number: 1, modules: { reading: { pages: [1] } } }, 'reading', [])
  assert.equal(draft.counts.printedRangeNumbers, 40)
  assert.equal(draft.counts.highestPrintedNumber, 40)
  assert.ok(draft.issues.some(issue => issue.code === 'outlying-question-marker' && issue.question === 41))
  assert.ok(draft.rangeEvidence.some(range => range.raw === 'Question 41'))
})

test('flags multi-column key lines and duplicate stems rather than choosing answers', () => {
  assert.equal(numberedCandidates([page('1 alpha 21 beta')])[0].ambiguousColumns, true)
  const draft = extractModule([page(source + '\n1 repeated candidate'), page('1 A\n2 B', 2)], document, scope, 'reading', [])
  assert.ok(draft.issues.some(issue => issue.code === 'question-stem-ambiguous' && issue.question === 1))
})

test('OCR confidence never approves text and sparse pages need explicit review', () => {
  const draft = extractModule([{ ...page('tiny'), method: 'ocr', confidence: 20 }], document,
    { number: 1, modules: { speaking: { pages: [1] } } }, 'speaking', [])
  assert.ok(draft.issues.some(issue => issue.code === 'low-confidence-ocr'))
  assert.ok(draft.issues.some(issue => issue.code === 'sparse-page'))
  assert.ok(draft.issues.some(issue => issue.code === 'historical-speaking-format'))
  assert.equal(draft.activationAllowed, false)
})

test('duplicate section scans are preserved and flagged rather than deleted', () => {
  const draft = extractModule([page('SECTION 1\nQuestions 1-10'), page('SECTION 1\nQuestions 1-10', 2)], document,
    { number: 1, modules: { listening: { pages: [1, 2] } } }, 'listening', [])
  assert.equal(draft.sourceText.length, 2)
  assert.ok(draft.issues.some(issue => issue.code === 'duplicate-section'))
  assert.equal(validateProvenance(draft), true)
})

test('distinguishes explicit instruction types while unknown text stays unknown', () => {
  assert.equal(questionType('TRUE FALSE NOT GIVEN'), 'true-false-not-given')
  assert.equal(questionType('YES NO NOT GIVEN'), 'yes-no-not-given')
  assert.equal(questionType('Choose TWO letters, A–E'), 'multiple-selection')
  assert.equal(questionType('Choose the correct heading'), 'matching-headings')
  assert.equal(questionType('Complete each sentence with the correct ending'), 'matching-sentence-endings')
  assert.equal(questionType('Complete the flow chart'), 'flow-chart-completion')
  assert.equal(questionType('Label the map'), 'map-plan-labelling')
  assert.equal(questionType('Complete the table'), 'table-completion')
  assert.equal(questionType('illegible instruction'), null)
})

test('matches audio by book, test and section across known filename styles', () => {
  assert.deepEqual(identifyAudio('folder/Cambridge IELTS 6 Test1-s3.mp3'), { book: 6, test: 1, section: 3 })
  assert.deepEqual(identifyAudio('Cambridge IELTS Audio/Cambridge IELTS 5 Tape 2/section4.mp3'), { book: 5, test: 2, section: 4 })
  assert.deepEqual(identifyAudio('剑桥4-test1_section2.mp3'), { book: 4, test: 1, section: 2 })
  assert.deepEqual(identifyAudio('[剑桥雅思2].Cambridge.2.test1.mp3'), { book: 2, test: 1, section: null })
  assert.equal(identifyAudio('unknown.mp3'), null)
})

test('does not fabricate section clips from whole-test audio or leak audio across tests', () => {
  const audio = [{ id: 'one', type: 'audio', label: 'Cambridge IELTS 1 Tape 1.mp3' },
    { id: 'two', type: 'audio', label: 'Cambridge IELTS 1 Tape 2.mp3' }]
  const matched = matchAudio(audio, 1, 1)
  assert.deepEqual(matched.matches.map(match => match.assetId), ['one'])
  assert.ok(matched.issues.some(issue => issue.code === 'audio-unsplit'))
  assert.equal(matched.matches[0].verifiedByListening, false)
  assert.ok(matchAudio(audio, 7, 1).issues.some(issue => issue.code === 'audio-missing'))
})

test('flags missing or duplicate audio sections', () => {
  const audio = [1, 2, 3, 3].map((section, i) => ({ id: String(i), type: 'audio', label: `Cambridge IELTS 4 Test1-s${section}.mp3` }))
  assert.ok(matchAudio(audio, 4, 1).issues.some(issue => issue.code === 'audio-ambiguous'))
})

test('Writing exports exact prompts as task sections and flags missing chart extraction', () => {
  const draft = extractModule([page('WRITING TASK 1\nQA chart prompt.\nWRITING TASK 2\nQA essay prompt.')], document,
    { number: 1, modules: { writing: { pages: [1] } } }, 'writing', [])
  assert.deepEqual(draft.sections.filter(section => section.numberCandidate !== null).map(section => section.numberCandidate), [1, 2])
  assert.equal(draft.counts.printedRangeNumbers, null)
  assert.ok(draft.issues.some(issue => issue.code === 'visual-extraction-required'))
  assert.equal(validateProvenance(draft), true)
})

test('different test identities produce independent package IDs', () => {
  const first = extract()
  const second = extractModule([page(source), page('1 A\n2 B', 2)], document, { ...scope, number: 2 }, 'reading', [])
  assert.notEqual(first.id, second.id)
})

test('automatically discovers tests and back-of-book keys without a page plan', () => {
  const pages = ['Contents\nTest 1', 'Test 1\nLISTENING\nSECTION 1\nQuestions 1-10',
    'READING PASSAGE 1\nQuestions 1-13', 'WRITING TASK 1\nQA task\nWRITING TASK 2', 'SPEAKING\nPART 1',
    'General Training\nSECTION 1\nRead the text below. Questions 1-14', 'WRITING TASK 1\nQA letter',
    'Tapescripts\nSECTION 1\nMAN: QA speech', 'TEST 1\nLISTENING\nEach question answered scores 1 mark.\n1 alpha',
    'Answer key\nACADEMIC READING\n1 B', 'GENERAL TRAINING TEST A\nREADING\nSection 1 Questions 1-14\n1 C',
    'Model and sample answers\nWRITING TASK 1'].map((text, i) => page(text, i + 1))
  const result = discoverTests(document.assetId, 'Cambridge IELTS 99', pages)
  const academic = result.plan.tests.find(test => test.track === 'academic')!
  const general = result.plan.tests.find(test => test.track === 'general-training')!
  assert.deepEqual(academic.modules.listening, { pages: [2], keyPages: [9] })
  assert.deepEqual(academic.modules.reading, { pages: [3], keyPages: [10] })
  assert.deepEqual(general.modules.reading, { pages: [6], keyPages: [11] })
  assert.deepEqual(general.modules.writing?.pages, [7])
  assert.equal(result.plan.tests.length, 2)
})

test('running key headers do not mix Listening, Academic Reading or General Training', () => {
  const texts = ['Test 1\nLISTENING\nSECTION 1', 'READING PASSAGE 1\nQuestions 1-13', 'WRITING TASK 1', 'SPEAKING\nPART 1',
    'Tapescripts\nMAN: QA speech', 'TEST 1\nLISTENING\nSection 1, Questions 1-10 Section 3, Questions 21-30\n1 alpha',
    'Listening and Reading Answer keys\nACADEMIC READING\nReading Passage 1, Questions 1-13\n1 B']
  const result = discoverTests(document.assetId, 'Cambridge IELTS 99', texts.map((text, i) => page(text, i + 1)))
  assert.deepEqual(result.plan.tests[0].modules.listening?.keyPages, [6])
  assert.deepEqual(result.plan.tests[0].modules.reading?.keyPages, [7])
})

test('damaged partial-book headings produce explicit uncertainty and no page-range input', () => {
  const texts = ['Test 2\nLISTENING\nSECTION 1', 'READ ING PASSE\nQuestions 1-13 on the following pages',
    'You should spend about 20 minutes on this task. The table below shows QA.', 'PART 1\nThe examiner asks the candidate about QA.']
  const result = discoverTests(document.assetId, 'Cambridge IELTS 99-2', texts.map((text, i) => page(text, i + 1)))
  assert.deepEqual(result.plan.tests[0].modules.reading?.pages, [2])
  assert.deepEqual(result.plan.tests[0].modules.writing?.pages, [3])
  assert.deepEqual(result.plan.tests[0].modules.speaking?.pages, [4])
  assert.ok(result.plan.tests[0].detectionIssues!.some(issue => issue.code === 'uncertain-module-boundary'))
})

test('dialogue following General Training is a transcript rather than an invented fifth test', () => {
  const texts = ['Test 4\nLISTENING\nSECTION 1', 'READING PASSAGE 1', 'WRITING TASK 1', 'SPEAKING\nPART 1',
    'General Training\nSECTION 1\nRead the text below', 'WRITING TASK 1', 'SECTION 1\nMAN: QA dialogue', 'Tapescripts\nMore dialogue']
  const result = discoverTests(document.assetId, 'Cambridge IELTS 99', texts.map((text, i) => page(text, i + 1)))
  assert.deepEqual(result.plan.tests.map(test => test.number), [4, 1])
  assert.ok(!result.plan.tests.some(test => test.number === 5))
  assert.deepEqual(result.plan.tests[1].modules.writing?.pages, [6])
})

test('a transcript PDF is retained as evidence and never becomes a test', () => {
  assert.equal(discoverTests(document.assetId, 'Cambridge IELTS 99 Tape Transcripts', [page('TEST 1 SECTION 1')]).plan.tests.length, 0)
  assert.throws(() => discoverTests(document.assetId, 'unknown', [page('TEST 1')]), /invented book/)
})

test('two-column key extraction preserves numeric slash answers and column separation', () => {
  const word = (text: string, x: number, y = 50): Word => ({ text, confidence: 95, bbox: { x0: x, x1: x + 35, y0: y, y1: y + 15 } })
  const words = [word('1', 30), word('12/10', 90), word('21', 600), word('B', 660)]
  const lines = columnLines(words, 1000)
  assert.equal(lines[0][0].text, '1 12/10')
  assert.equal(lines[1][0].text, '21 B')
  const keys = keyColumnCandidates(words, 1000)
  assert.deepEqual(keys.map(key => [key.numberCandidate, key.answerRaw]), [[1, '12/10'], [21, 'B']])
  assert.ok(keys.every(key => !key.approved))
})

test('raster figure detection retains a bounded visual and rejects a full-page substitute', () => {
  const width = 400, height = 400, pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  const black = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const n = (y * width + x) * 4; pixels[n] = pixels[n + 1] = pixels[n + 2] = 0 }
  }
  black(90, 90, 94, 220); black(90, 216, 240, 220); black(130, 140, 170, 216)
  const result = visualRegions(pixels, width, height, [])
  assert.ok(result.candidates.some(box => box.x0 <= 90 && box.x1 >= 240 && box.y0 <= 90 && box.y1 >= 220))
  black(5, 5, 395, 395)
  assert.ok(visualRegions(pixels, width, height, []).rejectedBroadRegions > 0)
  assert.throws(() => visualRegions(pixels, 2, 2, []), /Invalid raster/)
})

test('a missing Writing Task 2 is reported rather than synthesized', () => {
  const draft = extractModule([page('WRITING TASK 1\nQA letter only.')], document,
    { number: 1, track: 'general-training', modules: { writing: { pages: [1] } } }, 'writing', [])
  assert.equal(draft.identity.track, 'general-training')
  assert.ok(draft.issues.some(issue => issue.code === 'section-not-detected' && issue.detail.includes('2: 0')))
})

test('chart fragments merge without clipping nearby original labels or changing input boxes', () => {
  const boxes = [{ x0: 100, y0: 200, x1: 350, y1: 340 }, { x0: 100, y0: 345, x1: 350, y1: 480 }]
  const original = structuredClone(boxes)
  const labels: Word[] = [{ text: 'Original QA label', confidence: 95, bbox: { x0: 80, y0: 485, x1: 300, y1: 505 } }]
  const merged = consolidateVisuals(boxes, labels, 800, 1000)
  assert.equal(merged.length, 1)
  assert.ok(merged[0].x0 <= 80 && merged[0].y1 > 505)
  assert.deepEqual(boxes, original)
})

test('distant figures remain separate and broad merged regions are withheld', () => {
  assert.equal(consolidateVisuals([{ x0: 40, y0: 50, x1: 200, y1: 150 }, { x0: 40, y0: 700, x1: 200, y1: 850 }], [], 800, 1000).length, 2)
  assert.equal(consolidateVisuals([{ x0: 1, y0: 1, x1: 799, y1: 999 }], [], 800, 1000).length, 0)
})

test('back-of-book General Training keys without printed labels stay explicitly inferred', () => {
  const texts = ['Test 1\nLISTENING\nSECTION 1', 'READING PASSAGE 1', 'WRITING TASK 1', 'SPEAKING\nPART 1',
    'General Training\nSECTION 1\nRead the text below', 'WRITING TASK 1',
    'Tapescripts\nMAN: QA dialogue', 'TEST 1\nLISTENING\nEach question answered scores 1 mark.\n1 alpha',
    'Answer key\nACADEMIC READING\nReading Passage 1 Questions 1-13\n1 B',
    'Answer key\nREADING\nSection 1 Questions 1-14\n1 C']
  const result = discoverTests(document.assetId, 'Cambridge IELTS 99', texts.map((text, i) => page(text, i + 1)))
  const key = result.keyCandidates.find(key => key.page === 10)!
  assert.equal(key.track, 'general-training')
  assert.equal(key.inferredIdentity, true)
  assert.deepEqual(result.plan.tests.find(test => test.track === 'general-training')!.modules.reading!.keyPages, [10])
})
