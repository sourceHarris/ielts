// Local-only structured drafts and verification report. No UI activation or network.
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { extractModule, identifyAudio, validateProvenance } from './structuredExtraction.mts'
import { discoverTests } from './discoverTests.mts'

const directory = fileURLToPath(new URL('../../private-content/', import.meta.url))
const args = process.argv.slice(2)
if (args.length) throw Error('Usage: npm run extract:private (automatic source discovery; no page plan required)')
const catalog = JSON.parse(await readFile(join(directory, 'catalog.local.json'), 'utf8'))
if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.books)) throw Error('Unsupported local catalog.')
const modules = ['reading', 'listening', 'writing', 'speaking']
const documents = []
const assetsRoot = await realpath(join(directory, 'assets'))
const audioIds = new Set()
for (const asset of catalog.assets.filter(asset => asset.type === 'audio')) {
  if (!/^[a-f0-9]{64}$/.test(asset.id) || audioIds.has(asset.id) || typeof asset.label !== 'string') throw Error('Invalid/duplicate audio asset.')
  audioIds.add(asset.id)
  const path = await realpath(asset.path), within = relative(assetsRoot, path)
  if (isAbsolute(within) || within.startsWith('..') || createHash('sha256').update(await readFile(path)).digest('hex') !== asset.id) throw Error('Invalid audio cache provenance.')
}
// Validate the complete input before writing an output. Existing caches never change.
for (const book of catalog.books) {
  const asset = catalog.assets.find(item => item.id === book.id && item.type === 'pdf')
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.id) || book.fingerprint !== asset.id) throw Error('Invalid source fingerprint.')
  const assetPath = await realpath(asset.path)
  const within = relative(await realpath(join(directory, 'assets')), assetPath)
  if (isAbsolute(within) || within.startsWith('..')) throw Error('Source asset must stay in the private cache.')
  if (createHash('sha256').update(await readFile(assetPath)).digest('hex') !== asset.id) throw Error('PDF bytes no longer match the source hash.')
  const cached = JSON.parse(await readFile(join(directory, 'pages', `${book.id}.local.json`), 'utf8'))
  if (cached.fingerprint !== asset.id || !Array.isArray(cached.pages) || cached.pages.length !== book.pages ||
    cached.pages.some((page, index) => page?.page !== index + 1 || typeof page.text !== 'string' || !['ocr', 'text', 'scan'].includes(page.method) ||
      !(page.confidence === null || Number.isFinite(page.confidence)))) throw Error('Invalid/incomplete extraction cache. Preserve it and rerun OCR separately.')
  const discovery = discoverTests(book.id, book.title, cached.pages)
  const mapping = discovery.plan
  const used = new Set(), numbers = new Set()
  for (const test of mapping.tests) {
    const identity = `${test.track}:${test.number}`
    if (!Number.isInteger(test.number) || test.number < 1 || test.number > 99 || numbers.has(identity) || !test.modules ||
      Object.keys(test.modules).some(module => !modules.includes(module))) throw Error('Invalid/duplicate test identity.')
    numbers.add(identity)
    for (const scope of Object.values(test.modules)) {
      if (!scope || !Array.isArray(scope.pages) || !scope.pages.length || !Array.isArray(scope.keyPages ?? [])) throw Error('Invalid module boundary plan.')
      for (const number of [...scope.pages, ...(scope.keyPages ?? [])]) if (!Number.isInteger(number) || number < 1 || number > book.pages) throw Error('Invalid page reference.')
      for (const number of scope.pages) {
        if (used.has(number)) throw Error('Overlapping module/test boundaries. Resolve them before extraction.')
        used.add(number)
      }
    }
  }
  if (mapping.role === 'transcript' && mapping.tests.length) throw Error('A transcript cannot masquerade as a question paper.')
  documents.push({ book, mapping, discovery, pages: cached.pages, assignedPages: [...used] })
}
const drafts = []
for (const document of documents) for (const test of document.mapping.tests) for (const module of modules) {
  if (!test.modules[module]) continue
  const draft = extractModule(document.pages, document.mapping, test, module, catalog.assets)
  validateProvenance(draft)
  const inferredKeys = document.discovery.keyCandidates.filter(key => key.testNumber === test.number && key.track === test.track && key.module === module && key.inferredIdentity)
  if (inferredKeys.length) draft.issues.push({ code: 'key-identity-inferred', detail: `Source key pages ${inferredKeys.map(key => key.page).join(', ')} were associated by heading/order. Confirm identity before marking answers.` })
  const layoutPages = [], missingLayoutPages = []
  for (const number of [...test.modules[module].pages, ...(test.modules[module].keyPages ?? [])]) {
    if (module === 'speaking') continue
    let layout
    try { layout = JSON.parse(await readFile(join(directory, 'layout-v3', document.book.id, `${number}.json`), 'utf8')) }
    catch (error) { if (error.code === 'ENOENT') { missingLayoutPages.push(number); continue } throw error }
    if (layout.schemaVersion !== 1 || layout.sourceAssetId !== document.book.id || layout.page !== number || !Array.isArray(layout.visuals) || !Array.isArray(layout.words)) throw Error('Invalid layout evidence; preserved unchanged.')
    layoutPages.push(layout)
  }
  const visuals = layoutPages.flatMap(page => page.visuals.map(crop => ({ ...crop, page: page.page, renderScale: page.renderScale, sourceAssetId: document.book.id })))
  const geometryKeys = layoutPages.flatMap(page => page.keyCandidates.map(key => ({ ...key, page: page.page })))
  if (missingLayoutPages.length) draft.issues.push({ code: 'layout-evidence-missing', detail: `Layout OCR not available for source pages ${missingLayoutPages.join(', ')}. Run the local layout pass.` })
  if (visuals.length) draft.issues.push({ code: 'image-crops-review', detail: `${visuals.length} original crop candidates retained. Verify boundaries and map each to its question/task; none is an approved full-page substitute.` })
  const broad = layoutPages.filter(page => page.issues.some(issue => issue.includes('broad regions'))).map(page => page.page)
  if (broad.length) draft.issues.push({ code: 'visual-region-unresolved', detail: `Overly broad pixel regions on source pages ${broad.join(', ')} were rejected instead of showing full pages. Required visuals may still be missing.` })
  drafts.push({ ...draft, layoutEvidence: { pages: layoutPages, missingPages: missingLayoutPages, visuals, geometryKeys,
    geometryKeyNumberCount: new Set(geometryKeys.map(key => key.numberCandidate)).size,
    uncertainWordCount: layoutPages.reduce((total, page) => total + page.uncertainWords.length, 0) } })
}
drafts.sort((a, b) => a.identity.bookNumberCandidate - b.identity.bookNumberCandidate || a.identity.track.localeCompare(b.identity.track) || a.identity.testNumber - b.identity.testNumber ||
  modules.indexOf(a.identity.module) - modules.indexOf(b.identity.module))
const byModule = Object.fromEntries(modules.map(module => [module, drafts.filter(draft => draft.identity.module === module).length]))
const matchedAudio = new Set(drafts.flatMap(draft => draft.audio?.matches.map(match => match.assetId) ?? []))
const report = {
  schemaVersion: 1, generatedAt: new Date().toISOString(),
  status: 'drafts-only-review-required', activatedTests: 0, moduleCounts: byModule,
  discoveryMode: 'automatic-headings-and-sequence-no-page-plan',
  countsByBook: [...new Set(documents.filter(doc => doc.mapping.role !== 'transcript').map(doc => doc.mapping.bookNumber))].sort((a, b) => a - b).map(book => ({
    book, academic: Object.fromEntries(modules.map(module => [module, drafts.filter(draft => draft.identity.bookNumberCandidate === book && draft.identity.track === 'academic' && draft.identity.module === module).length])),
    generalTraining: Object.fromEntries(modules.map(module => [module, drafts.filter(draft => draft.identity.bookNumberCandidate === book && draft.identity.track === 'general-training' && draft.identity.module === module).length])),
  })),
  pdfCount: documents.length, pageCount: documents.reduce((total, doc) => total + doc.pages.length, 0),
  audioCount: catalog.assets.filter(asset => asset.type === 'audio').length,
  audioMatchedByName: matchedAudio.size,
  unmatchedAudio: catalog.assets.filter(asset => asset.type === 'audio' && !matchedAudio.has(asset.id)).map(asset => ({ assetId: asset.id,
    label: asset.label, identityCandidate: identifyAudio(asset.label), reason: 'No corresponding question-paper test in this PDF corpus.' })),
  documents: documents.map(doc => ({ assetId: doc.book.id, title: doc.book.title, role: doc.mapping.role, pages: doc.pages.length,
    discoveryEvents: doc.discovery.events, discoveryIssues: doc.discovery.issues, keyDiscovery: doc.discovery.keyCandidates,
    nativeTextPages: doc.pages.filter(page => page.method === 'text').length,
    ocrPages: doc.pages.filter(page => page.method === 'ocr').length,
    lowConfidencePages: doc.pages.filter(page => page.method === 'ocr' && (page.confidence === null || page.confidence < 80)).map(page => page.page),
    outsideTestScopes: doc.pages.filter(page => !doc.assignedPages.includes(page.page)).map(page => page.page) })),
  tests: drafts.map(draft => ({ id: draft.id, book: draft.identity.bookNumberCandidate, test: draft.identity.testNumber,
    track: draft.identity.track, label: draft.identity.testLabel, module: draft.identity.module, counts: draft.counts, sourcePages: draft.sourceText.map(page => page.page),
    cropCandidates: draft.layoutEvidence.visuals.length, geometryKeyNumberCount: draft.layoutEvidence.geometryKeyNumberCount,
    uncertainWordCount: draft.layoutEvidence.uncertainWordCount, missingLayoutPages: draft.layoutEvidence.missingPages,
    keyPages: draft.answerKey.sourceText.map(page => page.page), audio: draft.audio,
    issueCount: draft.issues.length, issues: draft.issues })),
}
const run = new Date().toISOString().replaceAll(/[:.]/g, '-')
const output = join(directory, 'structured', run)
await mkdir(output, { recursive: true })
for (const draft of drafts) await writeFile(join(output, `${draft.id}.json`), JSON.stringify(draft, null, 2), { flag: 'wx' })
// Keep all non-test content as evidence too: introductions, keys, transcripts,
// General Training pages and sample essays must never leak into Academic prompts.
for (const doc of documents) await writeFile(join(output, `${doc.book.id}.source.json`), JSON.stringify({
  schemaVersion: 1, assetId: doc.book.id, title: doc.book.title, role: doc.mapping.role, pages: doc.pages,
}, null, 2), { flag: 'wx' })
await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
const csv = value => '"' + String(value ?? '').replaceAll('"', '""') + '"'
await writeFile(join(output, 'UNCERTAIN_TEXT.csv'), [
  ['Book', 'Track', 'Test', 'Module', 'Source page', 'Confidence', 'x0', 'y0', 'x1', 'y1', 'OCR candidate — not corrected'].map(csv).join(','),
  ...drafts.flatMap(draft => draft.layoutEvidence.pages.flatMap(page => page.uncertainWords.map(word => [draft.identity.bookNumberCandidate,
    draft.identity.track, draft.identity.testLabel, draft.identity.module, page.page, word.confidence,
    word.bbox.x0, word.bbox.y0, word.bbox.x1, word.bbox.y1, word.text].map(csv).join(',')))),
].join('\r\n'), { flag: 'wx' })
await writeFile(join(output, 'REVIEW_QUEUE.csv'), [
  ['Book', 'Test', 'Module', 'PDF page', 'Question', 'Issue', 'Review required'].map(csv).join(','),
  ...report.tests.flatMap(test => test.issues.map(issue => [test.book, test.test, test.module, issue.page, issue.question, issue.code, issue.detail].map(csv).join(','))),
].join('\r\n'), { flag: 'wx' })
const md = [
  '# Private structured extraction — verification report', '',
  `Generated: ${report.generatedAt}`, '',
  '**These are blocked extraction drafts, not verified playable tests. Activated: 0.**', '',
  'Source wording was not rewritten. Every exported text span is checked against the cached extraction and its offsets. OCR/native text can still differ from the printed original. High OCR confidence is not proof of accuracy.', '',
  `Inventory: ${report.pdfCount} PDFs, ${report.pageCount} pages; ${report.audioCount} audio assets, ${report.audioMatchedByName} matched by filename/folder.`, '',
  ...modules.map(module => `- ${module}: ${byModule[module]} module drafts; 0 approved.`), '',
  '## Tests found automatically by book', '',
  '| Book | Academic R / L / W / S | General Training R / W |', '| --- | --- | --- |',
  ...report.countsByBook.map(row => `| ${row.book} | ${modules.map(module => row.academic[module]).join(' / ')} | ${row.generalTraining.reading} / ${row.generalTraining.writing} |`), '',
  'Boundaries and keys are detected without the old page plan. Sequence-based identities and damaged headings remain review issues. A detected module is not proof of a complete test.', '',
  '## Per-test question verification', '',
  'Range coverage means detected printed question ranges, not 40 verified prompts. Isolated stems/keys are unapproved numbered-line candidates. Missing/ambiguous questions, options and key rules are listed below. Writing/Speaking have tasks/parts, not 40 objective questions.', '',
  '| Book | Track / test | Module | Range coverage / highest | Stem numbers | Key numbers: text / layout OCR | Key pages | Crop candidates | Audio files | Issues |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...report.tests.map(test => `| ${test.book} | ${test.track} / ${test.label} | ${test.module} | ${test.counts.printedRangeNumbers === null ? 'n/a' : `${test.counts.printedRangeNumbers} / ${test.counts.highestPrintedNumber}`} | ${test.counts.isolatedStemNumbers} | ${test.counts.isolatedKeyNumbers} / ${test.geometryKeyNumberCount} | ${test.keyPages.join(', ') || 'absent / n/a'} | ${test.cropCandidates} | ${test.audio ? test.audio.matches.length + ', unverified' : 'n/a'} | ${test.issueCount} |`), '',
  '## Original image crops and uncertain words', '',
  `Retained ${report.tests.reduce((n, test) => n + test.cropCandidates, 0)} crop associations as unapproved candidates. Source pixels are retained without redrawing. Broad page-sized regions are rejected. Completeness and crop-to-question mapping remain unresolved until source review.`, '',
  'UNCERTAIN_TEXT.csv lists low-confidence OCR words with source coordinates. No spelling, grammar, labels, questions or keys were invented or repaired. New layout OCR is separate from the original extraction cache.', '',
  '## Missing keys and audio', '',
  ...report.tests.filter(test => test.issues.some(issue => issue.code === 'key-source-missing')).map(test => `- Missing key source: Book ${test.book}, ${test.track}, ${test.label}, ${test.module}.`),
  ...report.tests.filter(test => test.audio && !test.audio.matches.length).map(test => `- Missing audio: Book ${test.book}, ${test.label}.`),
  ...report.tests.filter(test => test.issues.some(issue => issue.code === 'audio-unsplit')).map(test => `- Whole-test audio only: Book ${test.book}, ${test.label}. Section boundaries are not verified; no artificial section clips were created.`), '',
  '## Document coverage and OCR review', '',
  ...report.documents.flatMap(doc => [`### ${doc.title}`, '', `Role: ${doc.role}. ${doc.pages} pages; ${doc.nativeTextPages} native-text, ${doc.ocrPages} OCR.`,
    ...doc.discoveryIssues.map(issue => `Discovery issue: ${issue.code} on source ${issue.page}: ${issue.detail}`),
    `Low-confidence OCR pages (<80): ${doc.lowConfidencePages.join(', ') || 'none'}.`,
    `Pages outside Academic module scopes (retained in source JSON): ${doc.outsideTestScopes.join(', ') || 'none'}.`, '']),
  '## Audio without a matching PDF test', '',
  ...report.unmatchedAudio.map(asset => `- ${asset.label}`), '',
  '## Review queue', '',
  ...report.tests.flatMap(test => [`### Book ${test.book} — ${test.track} — ${test.label} — ${test.module}`, '',
    ...test.issues.map(issue => `- ${issue.code}${issue.page ? ` — PDF page ${issue.page}` : ''}${issue.question ? ` — question ${issue.question}` : ''}: ${issue.detail}`), '']),
  '## Release gate', '',
  'Compare source text and source crops; resolve module/section boundaries, duplicate scans, inline blanks, option associations, answer alternatives/grouping and instruction-specific marking rules. Verify Listening identity by actual audio and section timestamps. Approve exact content/key versions before exposing a test in the library. No application UI, saved attempts or originals were changed.', '',
]
await writeFile(join(output, 'VERIFICATION.md'), md.join('\n'), { flag: 'wx' })
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
await writeFile(join(output, 'CROP_REVIEW.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private extraction crop review</title>
<style>body{margin:32px;background:#161616;color:#eee;font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}figure{margin:0;padding:16px;background:#252525;border-radius:12px}img{display:block;max-width:100%;max-height:650px;margin:12px auto;object-fit:contain;background:white}figcaption{line-height:1.6}code{overflow-wrap:anywhere}</style>
<h1>Private original-image crop review</h1><p>Extraction evidence only. These crops are unapproved; check complete labels, boundaries and question associations. Noise/heading fragments may be false positives. No full source PDF pages are displayed.</p><main>
${drafts.flatMap(draft => draft.layoutEvidence.visuals.map(crop => `<figure><figcaption>${escapeHtml(draft.title)} (${escapeHtml(draft.identity.track)})<br>Source ${crop.page}; bounds ${escapeHtml(JSON.stringify(crop.bbox))}; question association unresolved</figcaption><img loading="lazy" src="../../layout-v3/crops/${crop.sha256}.png" alt="Unapproved original source crop"><code>${crop.sha256}</code></figure>`)).join('\n')}
</main></html>`, { flag: 'wx' })
console.log(JSON.stringify({ output: resolve(output), pdfCount: report.pdfCount, pageCount: report.pageCount,
  moduleCounts: byModule, audioCount: report.audioCount, audioMatchedByName: report.audioMatchedByName,
  activatedTests: 0, draftCount: drafts.length, provenanceChecks: 'passed' }, null, 2))
