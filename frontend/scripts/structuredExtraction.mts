// Draft extraction only. A detected number or OCR confidence never approves content.
import { createHash } from 'node:crypto'

export type Module = 'reading' | 'listening' | 'writing' | 'speaking'
export type Page = { page: number; text: string; method: string; confidence: number | null }
export type Span = { page: number; start: number; end: number; text: string }
export type Issue = { code: string; detail: string; page?: number; question?: number }
export type ModulePlan = { pages: number[]; keyPages?: number[] }
export type TestPlan = { number: number; track?: 'academic' | 'general-training'; label?: string; detectionIssues?: Issue[]; modules: Partial<Record<Module, ModulePlan>> }
export type DocumentPlan = { assetId: string; bookNumber: number; role: 'academic-tests' | 'transcript'; tests: TestPlan[] }
export type AudioAsset = { id: string; label: string; type: string }

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const span = (page: Page, start = 0, end = page.text.length): Span => ({ page: page.page, start, end, text: page.text.slice(start, end) })

export function questionRanges(text: string) {
  const ranges: { start: number; end: number; offset: number; raw: string }[] = []
  // Do not silently substitute OCR I/l for a digit, or repair damaged headings.
  const pattern = /\bQuestions?\s+(\d{1,2})(?:\s*[-–—=~]\s*(\d{1,2})|\s+and\s+(\d{1,2}))?\b/gi
  for (const match of text.matchAll(pattern)) {
    if (!match[2] && !match[3] && /^\s*(?:[-–—=~]|and\b)/i.test(text.slice(match.index + match[0].length))) continue
    const first = Number(match[1]), last = Number(match[2] ?? match[3] ?? match[1])
    if (first >= 1 && last >= first && last <= 60) ranges.push({ start: first, end: last, offset: match.index, raw: match[0] })
  }
  return ranges
}

export function questionType(instructions: string): string | null {
  if (/TRUE[\s\S]*FALSE[\s\S]*NOT\s+GIVEN/i.test(instructions)) return 'true-false-not-given'
  if (/\bYES\b[\s\S]*\bNO\b[\s\S]*NOT\s+GIVEN/i.test(instructions)) return 'yes-no-not-given'
  if (/list\s+of\s+headings|correct\s+heading/i.test(instructions)) return 'matching-headings'
  if (/(?:which|choose).*paragraph|paragraph\s+contains/i.test(instructions)) return 'matching-information'
  if (/correct\s+ending/i.test(instructions)) return 'matching-sentence-endings'
  if (/(?:choose|circle)\s+(?:TWO|THREE|FOUR|FIVE|SIX)\s+letters/i.test(instructions)) return 'multiple-selection'
  if (/choose\s+the\s+correct\s+letter|circle\s+(?:the\s+)?(?:appropriate|correct)\s+(?:letter|answer)/i.test(instructions)) return 'multiple-choice'
  if (/label\s+(?:the\s+)?(?:map|plan)/i.test(instructions)) return 'map-plan-labelling'
  if (/label\s+(?:the\s+)?diagram/i.test(instructions)) return 'diagram-labelling'
  if (/complete\s+(?:the\s+)?flow\s*chart/i.test(instructions)) return 'flow-chart-completion'
  if (/complete\s+(?:the\s+)?table/i.test(instructions)) return 'table-completion'
  if (/complete\s+(?:the\s+)?form/i.test(instructions)) return 'form-completion'
  if (/complete\s+(?:the\s+)?(?:following\s+)?summary/i.test(instructions)) return 'summary-completion'
  if (/complete\s+(?:the\s+)?(?:following\s+)?(?:notes|sentences)/i.test(instructions)) return 'text-completion'
  if (/answer\s+the\s+(?:following\s+)?questions/i.test(instructions)) return 'short-answer'
  if (/classify|list\s+of\s+(?:researchers|people)|matching/i.test(instructions)) return 'matching-features'
  return null
}

export function identifyAudio(label: string) {
  const book = /Cambridge(?:\s+IELTS|[.\s])?\s*(\d{1,2})(?=\D|$)/i.exec(label) ?? /剑桥\s*(\d{1,2})/.exec(label)
  const test = /(?:Test|Tape)[\s._-]*([1-4])(?=\D|$)/i.exec(label)
  const section = /(?:section|[\s_-]s)[\s._-]*([1-4])(?=\D|$)/i.exec(label)
  if (!book || !test) return null
  return { book: Number(book[1]), test: Number(test[1]), section: section ? Number(section[1]) : null }
}

export function matchAudio(assets: AudioAsset[], book: number, test: number) {
  const matches = assets.filter(asset => asset.type === 'audio').flatMap(asset => {
    const identity = identifyAudio(asset.label)
    return identity?.book === book && identity.test === test ? [{ assetId: asset.id, section: identity.section,
      basis: 'filename-and-folder' as const, verifiedByListening: false }] : []
  })
  const sectioned = matches.filter(match => match.section !== null)
  const whole = matches.filter(match => match.section === null)
  const issues: Issue[] = []
  if (!matches.length) issues.push({ code: 'audio-missing', detail: 'No matching original audio was found.' })
  else if (whole.length === 1 && !sectioned.length) issues.push({ code: 'audio-unsplit', detail: 'One whole-test recording matched. Section timestamps have not been verified; do not invent four clips.' })
  else if (whole.length || [1, 2, 3, 4].some(number => sectioned.filter(item => item.section === number).length !== 1)) {
    issues.push({ code: 'audio-ambiguous', detail: 'Missing/duplicate sections or overlapping whole-test and section recordings require review.' })
  }
  if (matches.length) issues.push({ code: 'audio-content-unverified', detail: 'Identity was matched automatically by filename/folder, not by verifying recorded speech.' })
  return { matches: matches.sort((a, b) => (a.section ?? 0) - (b.section ?? 0)), issues }
}

function lines(page: Page) {
  const result: Span[] = []
  for (const match of page.text.matchAll(/[^\n]+/g)) result.push(span(page, match.index, match.index + match[0].length))
  return result
}

export function numberedCandidates(pages: Page[], allowed?: Set<number>) {
  return pages.flatMap(page => lines(page).flatMap(line => {
    // Position is evidence, not proof of a question or answer association.
    const match = /^\s*(\d{1,2})[.)]?\s+(\S[\s\S]*)$/.exec(line.text)
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 60 || (allowed && !allowed.has(Number(match[1])))) return []
    return [{ numberCandidate: Number(match[1]), valueRaw: match[2], source: line,
      ambiguousColumns: /\s\d{1,2}\s+\S/.test(match[2]) }]
  }))
}

export function extractModule(pages: Page[], document: DocumentPlan, test: TestPlan, module: Module,
  assets: AudioAsset[]) {
  const plan = test.modules[module]
  if (!plan) throw Error('A module needs explicit source boundaries.')
  const issues: Issue[] = [...(test.detectionIssues ?? []), { code: 'unreviewed-source-text', detail: 'Text is preserved exactly from extraction, not certified character-for-character against the original. No test is activated.' }]
  const sourcePages = plan.pages.map(number => {
    const page = pages.find(item => item.page === number)
    if (!page) throw Error(`Missing cached source page ${number}. Refusing partial extraction.`)
    return page
  })
  const keyPages = (plan.keyPages ?? []).map(number => {
    const page = pages.find(item => item.page === number)
    if (!page) throw Error(`Missing cached key page ${number}.`)
    return page
  })
  for (const page of [...sourcePages, ...keyPages]) {
    if (page.method === 'ocr') issues.push({ code: page.confidence === null || page.confidence < 80 ? 'low-confidence-ocr' : 'ocr-proofreading',
      page: page.page, detail: `OCR confidence ${page.confidence ?? 'unknown'}; compare every instruction, name, number and option with the original.` })
    if (page.text.trim().length < 40) issues.push({ code: 'sparse-page', page: page.page, detail: 'Too little extracted text. Inspect the original for missing visual/text content.' })
  }
  const objective = module === 'reading' || module === 'listening'
  const headerPattern = module === 'reading' ? /\bREADING\s+PASSAGE\s+([1-3])\b/g
    : module === 'listening' ? /\bSECTION\s+([1-4])\b/g
      : module === 'writing' ? /\bWRITING\s+TASK\s+([12])\b/g : /\bPART\s+([1-3])\b/g
  const sections: { numberCandidate: number | null; heading: Span | null; spans: Span[] }[] = []
  for (const page of sourcePages) {
    let offset = 0
    for (const marker of page.text.matchAll(headerPattern)) {
      if (!sections.length) sections.push({ numberCandidate: null, heading: null, spans: [] })
      if (marker.index > offset) sections.at(-1)!.spans.push(span(page, offset, marker.index))
      sections.push({ numberCandidate: Number(marker[1]), heading: span(page, marker.index, marker.index + marker[0].length), spans: [] })
      offset = marker.index
    }
    if (!sections.length) sections.push({ numberCandidate: null, heading: null, spans: [] })
    if (offset < page.text.length) sections.at(-1)!.spans.push(span(page, offset))
  }
  // Keep introductory material, but do not count it as a numbered section.
  const expectedSections = module === 'listening' ? 4 : module === 'writing' ? 2 : 3
  for (let n = 1; n <= expectedSections; n++) {
    const count = sections.filter(section => section.numberCandidate === n).length
    if (count !== 1) issues.push({ code: count ? 'duplicate-section' : 'section-not-detected', detail: `Section/passage/task/part ${n}: ${count} exact heading matches. Resolve OCR or duplicate pages before use.` })
  }
  const rangeEvidence = objective ? sourcePages.flatMap(page => questionRanges(page.text).map(range => ({ ...range,
    source: span(page, range.offset, range.offset + range.raw.length) }))) : []
  // A damaged single-question label must not inflate an otherwise complete range
  // (for example OCR "Question 41)" beside an instruction to answer in box 40).
  const declaredNumbers = new Set(rangeEvidence.filter(range => range.end > range.start)
    .flatMap(range => Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start + i)))
  const maxNumber = Math.max(0, ...declaredNumbers)
  const uncoveredModernNumbers = objective ? Array.from({ length: 40 }, (_, i) => i + 1).filter(n => !declaredNumbers.has(n)) : []
  for (const marker of rangeEvidence.filter(range => range.start === range.end && !declaredNumbers.has(range.start))) {
    issues.push({ code: 'outlying-question-marker', page: marker.source.page, question: marker.start,
      detail: 'Single-question label lies outside the detected multi-question ranges. It may be damaged OCR; retain it for source review without inflating the count.' })
  }
  if (objective && (maxNumber !== 40 || Array.from({ length: maxNumber }, (_, i) => i + 1).some(n => !declaredNumbers.has(n)))) {
    issues.push({ code: 'question-count-review', detail: `Printed range candidates cover ${declaredNumbers.size} distinct numbers; highest ${maxNumber}. Modern reference numbers not covered: ${uncoveredModernNumbers.join(', ') || 'none'}. This may be a historical format or failed OCR, not missing original questions. Inspect the source instead of forcing 40.` })
  }
  const stems = objective ? numberedCandidates(sourcePages, declaredNumbers) : []
  const keyCandidates = objective ? numberedCandidates(keyPages) : []
  const questions = [...declaredNumbers].sort((a, b) => a - b).map(number => {
    const candidates = stems.filter(item => item.numberCandidate === number)
    const answerCandidates = keyCandidates.filter(item => item.numberCandidate === number)
    if (!candidates.length) issues.push({ code: 'question-stem-unresolved', question: number, detail: 'Question number occurs in a range, but a standalone stem was not isolated. It may be an inline blank, table, diagram or damaged OCR.' })
    if (candidates.length > 1) issues.push({ code: 'question-stem-ambiguous', question: number, detail: 'Multiple numbered text candidates; none has been selected automatically.' })
    if (!answerCandidates.length) issues.push({ code: 'answer-not-isolated', question: number, detail: 'No unambiguous numbered key line was isolated. Inspect key source; do not infer an answer.' })
    return { number, stemCandidates: candidates, answerCandidates, approvedAnswer: null, status: 'needs-review' }
  })
  const groups = sourcePages.flatMap(page => {
    const ranges = questionRanges(page.text)
    return ranges.map((range, index) => {
      const end = ranges[index + 1]?.offset ?? page.text.length
      const content = span(page, range.offset, end)
      const typeCandidate = questionType(content.text.slice(0, 650))
      const options = lines(page).filter(line => line.start >= content.start && line.end <= content.end).flatMap(line => {
        const match = /^\s*([A-Z]|[ivx]{1,5})[.)]?\s+(\S.*)$/.exec(line.text)
        return match ? [{ labelCandidate: match[1], textRaw: match[2], source: line }] : []
      })
      return { numbers: [range.start, range.end], heading: span(page, range.offset, range.offset + range.raw.length),
        content, typeCandidate, optionCandidates: options, status: 'needs-review',
        continuesOnNextPage: index === ranges.length - 1 }
    })
  })
  if (objective) issues.push({ code: 'question-layout-review', detail: 'Range groups, question types and options are candidates. Continuation pages, columns, examples, inline blanks and option-to-question associations require validation.' })
  if (objective && !keyPages.length) issues.push({ code: 'key-source-missing', detail: 'No answer-key page for this test is present in its mapped source. Marking must remain disabled.' })
  if (objective && keyPages.length) issues.push({ code: 'key-rules-review', detail: 'Preserve raw key text, grouped answers, alternatives and spelling/word-count rules. Numbered key lines are not approved marking rules.' })
  if (module === 'writing') issues.push({ code: 'visual-extraction-required', detail: 'Task 1 charts/maps/tables need a source crop and checked caption. Text alone cannot preserve the task.' })
  if (module === 'speaking' && !sections.some(section => section.numberCandidate !== null)) issues.push({ code: 'historical-speaking-format', detail: 'No modern Part 1/2/3 headings were detected. Preserve historical task format; do not invent modern questions.' })
  const audio = module === 'listening' ? matchAudio(assets, document.bookNumber, test.number) : null
  if (audio) issues.push(...audio.issues)
  return {
    schemaVersion: 1, extractorVersion: 'structured-draft-v1',
    id: `cambridge-${document.bookNumber}-${test.track ?? 'academic'}-test-${test.number}-${module}-${document.assetId.slice(0, 12)}`,
    title: `Cambridge IELTS ${document.bookNumber} — ${test.label ?? `Test ${test.number}`} — ${module}`,
    identity: { publisher: 'Cambridge', bookNumberCandidate: document.bookNumber, testNumber: test.number, module,
      sourceAssetId: document.assetId, track: test.track ?? 'academic', testLabel: test.label ?? `Test ${test.number}`, editionVerified: false },
    status: 'needs-review', activationAllowed: false,
    sourceText: sourcePages.map(page => ({ ...page, textSha256: hash(page.text) })),
    sections, rangeEvidence, questionGroups: groups, questions,
    counts: { printedRangeNumbers: objective ? declaredNumbers.size : null, highestPrintedNumber: objective ? maxNumber : null,
      uncoveredModernReferenceNumbers: uncoveredModernNumbers,
      isolatedStemNumbers: new Set(stems.map(item => item.numberCandidate)).size,
      isolatedKeyNumbers: new Set(keyCandidates.map(item => item.numberCandidate)).size,
      sectionHeadings: sections.filter(section => section.numberCandidate !== null).length, verifiedQuestions: 0 },
    answerKey: { sourceText: keyPages.map(page => ({ ...page, textSha256: hash(page.text) })), candidates: keyCandidates,
      approved: false }, audio, issues,
  }
}

export function validateProvenance(draft: ReturnType<typeof extractModule>) {
  const pages = [...draft.sourceText, ...draft.answerKey.sourceText]
  const check = (value: Span) => {
    const page = pages.find(page => page.page === value.page)
    if (!page || !Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end < value.start ||
      value.end > page.text.length || page.text.slice(value.start, value.end) !== value.text) throw Error('Extraction changed source text or its offsets.')
  }
  for (const section of draft.sections) { if (section.heading) check(section.heading); section.spans.forEach(check) }
  for (const range of draft.rangeEvidence) check(range.source)
  for (const group of draft.questionGroups) { check(group.heading); check(group.content); group.optionCandidates.forEach(option => check(option.source)) }
  for (const question of draft.questions) { question.stemCandidates.forEach(item => check(item.source)); question.answerCandidates.forEach(item => check(item.source)) }
  draft.answerKey.candidates.forEach(item => check(item.source))
  for (const page of pages) if (hash(page.text) !== page.textSha256) throw Error('Source text hash mismatch.')
  // Every source character remains represented once in the section stream, in order.
  for (const page of draft.sourceText) {
    const pieces = draft.sections.flatMap(section => section.spans).filter(item => item.page === page.page)
    let offset = 0
    for (const piece of pieces) { if (piece.start !== offset) throw Error('Overlapping or missing source span.'); offset = piece.end }
    if (offset !== page.text.length || pieces.map(item => item.text).join('') !== page.text) throw Error('Source coverage/integrity check failed.')
  }
  return true
}
