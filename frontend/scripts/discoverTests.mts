// Discovery uses source headings and ordering, never a user-entered page plan.
// Fuzzy/sequence-based identities remain explicit review issues.
import type { DocumentPlan, Issue, Module, Page, TestPlan } from './structuredExtraction.mts'

export function discoverTests(assetId: string, title: string, pages: Page[]) {
  const bookMatch = /Cambridge(?:\s+IELTS|[.\s])?\s*(\d{1,2})(?=\D|$)/i.exec(title)
  if (!bookMatch) throw Error('Cannot identify book from source metadata. Refusing an invented book identity.')
  const bookNumber = Number(bookMatch[1])
  const events: { page: number; kind: string; basis: string }[] = []
  const issues: Issue[] = []
  const tests: TestPlan[] = []
  const plan: DocumentPlan = { assetId, bookNumber, role: /transcripts?/i.test(title) ? 'transcript' : 'academic-tests', tests }
  if (plan.role === 'transcript') return { plan, events, issues, keyCandidates: [] }
  let region: 'front' | 'tests' | 'transcripts' | 'keys' | 'samples' = 'front'
  let current: TestPlan | null = null, module: Module | null = null
  let academicNumber = Number(/-([1-4])$/.exec(title)?.[1] ?? 0), generalNumber = 0
  let track: 'academic' | 'general-training' = 'academic'
  let keyTest = 0, keyTrack: 'academic' | 'general-training' = 'academic', keyModule: 'reading' | 'listening' | null = null
  const keyCandidates: { page: number; testNumber: number; track: 'academic' | 'general-training'; module: 'reading' | 'listening'; inferredIdentity: boolean }[] = []
  const getTest = (number: number, variant: typeof track) => {
    let test = tests.find(item => item.number === number && item.track === variant)
    if (!test) { test = { number, track: variant, label: variant === 'academic' ? `Test ${number}` : `Test ${String.fromCharCode(64 + number)}`,
      modules: {}, detectionIssues: [] }; tests.push(test) }
    return test
  }
  for (const page of pages) {
    const head = page.text.slice(0, 700), top = head.slice(0, 220)
    const explicitTest = /\b(?:PRACTICE\s+)?TEST\s*[-:]?\s*([1-4])\b/i.exec(head.slice(0, 180))
    const explicitGT = /TRAINING\s*(?::|MODULE)?[\s\S]{0,60}?TEST\s*([AB])\b/i.exec(head)
    const intro = /\b(?:Introduction|Contents|Acknowledgements)\b/i.test(top)
    if (region === 'front' && intro) continue
    const keyHeading = /\bANS[WIV]ER\s*KEYS?\b/i.test(top) || /Each question.{0,30}(?:answered|scores)/i.test(head)
    const keyMatrix = /Section\s*[1I][\s\S]{0,85}?Questions[\s\S]{0,70}?Section\s*3/i.test(head.slice(0, 350))
    const sampleHeading = /(?:MODEL|SAMPLE)\s+ANSWERS?|WRITING:\s*MODEL\s+ANSWERS/i.test(head.slice(0, 450))
    if (region === 'keys' && sampleHeading) { region = 'samples'; events.push({ page: page.page, kind: 'samples', basis: 'model/sample answer heading' }) }
    if (region === 'samples') continue
    if (region !== 'front' && (keyHeading || ((region === 'transcripts' || region === 'keys') && keyMatrix))) {
      if (region !== 'keys') events.push({ page: page.page, kind: 'keys', basis: keyHeading ? 'answer-key heading/marking instruction' : 'answer-key matrix after transcripts' })
      region = 'keys'; module = null
    }
    if (region === 'keys') {
      const keyHead = head.replace(/Listening\s+and\s+Reading\s+Answer\s+keys?/gi, '')
      const generalKey = /\bREADING\b/i.test(keyHead.slice(0, 180)) && /Section\s*1.{0,20}Questions/i.test(keyHead) &&
        !/ACADEMIC\s+READING|READING\s+PASSAGE\s*1|\bLISTENING\b/i.test(keyHead)
      if (explicitGT || /GENERAL\s+TRAINING/i.test(top) || generalKey) {
        const wasGeneral = keyTrack === 'general-training'
        keyTrack = 'general-training'
        if (explicitGT) keyTest = explicitGT[1].toUpperCase().charCodeAt(0) - 64
        else if (generalKey) keyTest = wasGeneral ? keyTest + 1 : 1
        else if (!keyTest || !tests.some(test => test.track === keyTrack && test.number === keyTest)) keyTest = 1
      }
      if (/ACADEMIC\s+READING/i.test(head.slice(0, 350)) || generalKey || explicitGT) keyModule = 'reading'
      else if (/\bLISTENING\b/i.test(keyHead.slice(0, 350))) {
        keyModule = 'listening'; keyTrack = 'academic'
        keyTest = explicitTest ? Number(explicitTest[1]) : keyTest + 1
      } else if (/ACADEMIC\s+READING|\bREADING\b|\bPART\s*(?:2|3|TWO|THREE)\b/i.test(head.slice(0, 260))) keyModule = 'reading'
      if (keyModule && keyTest) keyCandidates.push({ page: page.page, testNumber: keyTest, track: keyTrack, module: keyModule, inferredIdentity: !explicitTest && !explicitGT })
      else issues.push({ code: 'unassigned-key-page', page: page.page, detail: 'Detected a key chapter, but the module/test identity is unresolved.' })
      continue
    }
    const transcriptDialogue = module === 'writing' && /\bSECTION\s*1\b/i.test(top) && /\b[A-Z]{2,15}:\s/.test(head)
    if (region !== 'front' && (/\bTAPESCRIPTS?\b/i.test(top) || transcriptDialogue)) {
      if (region !== 'transcripts') events.push({ page: page.page, kind: 'transcripts', basis: 'tapescript heading' })
      region = 'transcripts'; module = null
    }
    if (region === 'transcripts') continue
    const readingStart = /\bREAD\s*ING\s+PASS(?:AGE|E)\s*(?:1|I)\b/.test(head.slice(0, 350))
    const damagedReadingStart: boolean = module === 'listening' && /READ\s*ING\s+PASS/.test(head.slice(0, 350)) && /(?:1\s*[-=–—]\s*13|following\s+pass)/i.test(head)
    const writingStart = /\bWR\s*ITING\s+TASK\s*1\b/i.test(head.slice(0, 350))
    const writingContext: boolean = module === 'reading' && /(?:spend|about)[\s\S]{0,35}?20\s+minutes[\s\S]{0,20}?this task/i.test(head) && /table|chart|graph|diagram|map/i.test(head)
    const writingTwo = /\bWR\s*ITING\s+TASK\s*2\b/i.test(head.slice(0, 450))
    const speakingStart = !writingTwo && ((/\bSPEAKING\b/i.test(top) && /\bPART\s*1|CUE\s*CARD|The candidate is to/i.test(head)) ||
      (/\bPART\s*1\b/i.test(head) && /examiner asks|candidate about/i.test(head)))
    const gtReadingStart = /\b(?:SECTION\s*1|PART\s+ONE)\b/i.test(head.slice(0, 250)) &&
      /General\s+Training|Read the (?:text|information)|Match the pictures/i.test(head)
    const listeningStart = !gtReadingStart && (/\bSEC[\s|]*TION\s*1\b/i.test(head.slice(0, 400)) ||
      (/\bLISTENING\b/i.test(top) && /\bExample\b/i.test(head) && region === 'front'))
    let nextModule: Module | null = writingStart || writingContext ? 'writing' : speakingStart ? 'speaking' :
      gtReadingStart ? 'reading' : readingStart || damagedReadingStart ? 'reading' : listeningStart ? 'listening' : null
    // A passage reference in a question block is not a new module.
    if (nextModule === 'reading' && track === 'academic' && module === 'reading' && !gtReadingStart) nextModule = null
    if (nextModule === 'listening') {
      const number = explicitTest ? Number(explicitTest[1]) : module === 'listening' ? academicNumber : academicNumber ? academicNumber + (region === 'front' ? 0 : 1) : 1
      if (module !== 'listening' || number !== academicNumber) {
        academicNumber = number; track = 'academic'; current = getTest(number, track)
        if (!explicitTest) current.detectionIssues!.push({ code: 'test-identity-inferred', page: page.page, detail: 'Test number inferred from source-file suffix or ordered Listening starts; verify original identity.' })
      }
    } else if (gtReadingStart && module !== 'reading') {
      track = 'general-training'; generalNumber = explicitGT ? explicitGT[1].toUpperCase().charCodeAt(0) - 64 : generalNumber + 1
      current = getTest(generalNumber, track)
      if (!explicitGT) current.detectionIssues!.push({ code: 'general-label-inferred', page: page.page, detail: 'General Training test label inferred from ordered reading blocks; verify the printed label.' })
    }
    if (nextModule && !current) {
      // A partial document can start at Reading/Writing without a Listening start.
      if (!explicitTest && !academicNumber) { issues.push({ code: 'unassigned-test-start', page: page.page, detail: 'Module heading found without a reliable test identity.' }); continue }
      current = getTest(Number(explicitTest?.[1] ?? academicNumber), track)
    }
    if (nextModule && current) {
      if (nextModule !== module) events.push({ page: page.page, kind: `${track}:${current.label}:${nextModule}`, basis:
        writingContext && !writingStart ? 'task timing and visual prompt; damaged heading' : damagedReadingStart && !readingStart ? 'damaged reading heading; needs source review' : 'module/section heading' })
      if ((writingContext && !writingStart) || (damagedReadingStart && !readingStart)) current.detectionIssues!.push({ code: 'uncertain-module-boundary', page: page.page, detail: 'Detected from a damaged heading/context; source comparison is required.' })
      module = nextModule; region = 'tests'
      current.modules[module] ??= { pages: [], keyPages: [] }
    }
    if (region === 'tests' && current && module) current.modules[module]!.pages.push(page.page)
  }
  for (const key of keyCandidates) {
    const scope = tests.find(test => test.number === key.testNumber && test.track === key.track)?.modules[key.module]
    if (scope) (scope.keyPages ??= []).push(key.page)
    else issues.push({ code: 'unmatched-key', page: key.page, detail: `Key candidate for ${key.track} test ${key.testNumber}, ${key.module} has no matching question block.` })
  }
  return { plan, events, issues, keyCandidates }
}
