// Suggestions only. OCR headings never authorize a test or an answer key.
import type { SourceSection } from '../src/practice/privatePractice.ts'
export function detectSections(pages: { page: number; text: string }[], fallbackTest: number | null = null): SourceSection[] {
  const sections: SourceSection[] = []
  let testNumber = fallbackTest
  let active: SourceSection | null = null
  for (const page of pages) {
    const head = page.text.slice(0, 350)
    if (/^\s*(?:\d+\s*)?(?:Contents|Introduction|Acknowledgements)\b/i.test(head)) continue
    if (active && /\b(TAPESCRIPTS|ANSWER KEYS?|GENERAL TRAINING)\b/i.test(head.slice(0, 120))) {
      active.lastPage = page.page - 1
      break
    }
    const marker = /\b(?:PRACTICE\s+)?TEST\s+([1-4])\b/i.exec(head)
    if (marker) testNumber = Number(marker[1])
    const skill = /\bLISTENING\b/i.test(head.slice(0, 100)) && /SECTION\s*1\b/i.test(head) ? 'listening'
      : /READING\s+PASSAGE\s*(?:1|I)\b/i.test(head) ? 'reading'
        : /WRITING\s+TASK\s*1\b/i.test(head) ? 'writing'
          : /\bSPEAKING\b/i.test(head.slice(0, 100)) && /PART\s*1|CANDIDATE.{0,25}CUE|CUE\s*CARD/i.test(head) ? 'speaking' : null
    if (!active && skill !== 'listening' && !fallbackTest && !sections.length) continue
    if (skill === 'listening' && !marker && !fallbackTest) {
      if (active) active.lastPage = page.page - 1
      active = null; testNumber = null
      continue
    }
    if (skill && testNumber && !sections.some(section => section.skill === skill && section.testNumber === testNumber)) {
      if (active) active.lastPage = page.page - 1
      active = { skill, testNumber, firstPage: page.page, lastPage: page.page }
      sections.push(active)
    }
    if (active) {
      active.lastPage = page.page
      if (active.skill === 'reading' || active.skill === 'listening') {
        const ends = [...page.text.matchAll(/Questions?\s+(\d+)\s*[-–—]\s*(\d+)/gi)].map(match => Number(match[2])).filter(end => end <= 60)
        active.questionCount = Math.max(active.questionCount ?? 0, ...ends)
      }
    }
  }
  return sections
}
