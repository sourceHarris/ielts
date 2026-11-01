import { gradeReadingTest, normalizeAnswer } from './grading.ts'
import type { ReadingAnswers } from './grading.ts'
import type { QuestionOption, ReadingPassage, ReadingTest } from './types.ts'

export const CURATED_READING_SLUG = 'cambridge-1-reading-test-1'

export type ReadingGroup = {
  id: string
  kind: 'summary' | 'matching' | 'yes-no-not-given' | 'choice' | 'multi-select' | 'table'
  heading: string
  numbers: number[]
  instructions: string[]
  title?: string
  example?: string
  text?: string[]
  options?: QuestionOption[]
  optionTitle?: string
  columns?: string[]
  rows?: string[][]
  shadedCells?: [number, number][]
  maxWords?: number
}

export type StructuredPassage = ReadingPassage & {
  instruction: string
  groups: ReadingGroup[]
  image?: { assetId: string; alt: string }
}

export type StructuredReadingTest = Omit<ReadingTest, 'passages'> & {
  schemaVersion: 1
  reviewStatus: 'source-compared'
  sourceAssetId: string
  passages: StructuredPassage[]
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string')
const options = (value: unknown): value is QuestionOption[] => Array.isArray(value) && value.length > 0 && value.every(item =>
  record(item) && typeof item.value === 'string' && !!item.value && typeof item.label === 'string') &&
  new Set(value.map(item => item.value)).size === value.length

// This milestone intentionally admits one complete 3-passage, 40-question paper.
// Unreviewed extraction candidates and arbitrary imported JSON cannot enter it.
export function validStructuredTest(value: unknown): value is StructuredReadingTest {
  if (!record(value) || value.schemaVersion !== 1 || value.reviewStatus !== 'source-compared' ||
      typeof value.id !== 'string' || !value.id || typeof value.title !== 'string' || !value.title ||
      value.durationMinutes !== 60 || !/^[a-f0-9]{64}$/.test(String(value.sourceAssetId)) ||
      !Array.isArray(value.passages) || value.passages.length !== 3) return false
  const ids = new Set<string>(), numbers: number[] = [], groupIds = new Set<string>(), passageIds = new Set<string>()
  for (const passage of value.passages) {
    if (!record(passage) || typeof passage.id !== 'string' || !passage.id || passageIds.has(passage.id) ||
        typeof passage.title !== 'string' || typeof passage.instruction !== 'string' ||
        !strings(passage.paragraphs) || !passage.paragraphs.length || !Array.isArray(passage.questions) || !passage.questions.length ||
        !Array.isArray(passage.groups) || !passage.groups.length) return false
    passageIds.add(passage.id)
    const passageQuestions = passage.questions
    if (passage.image !== undefined && (!record(passage.image) || !/^[a-f0-9]{64}$/.test(String(passage.image.assetId)) || typeof passage.image.alt !== 'string')) return false
    for (const question of passage.questions) {
      if (!record(question) || typeof question.id !== 'string' || !question.id || ids.has(question.id) ||
          !Number.isInteger(question.number) || typeof question.prompt !== 'string' || typeof question.explanation !== 'string' ||
          !['short', 'choice', 'tfng', 'matching-headings'].includes(String(question.type)) ||
          !strings(question.correctAnswers) || !question.correctAnswers.length || question.correctAnswers.some(answer => !answer.trim()) ||
          (question.options !== undefined && !options(question.options))) return false
      ids.add(question.id); numbers.push(question.number as number)
    }
    const covered: number[] = []
    for (const group of passage.groups) {
      if (!record(group) || typeof group.id !== 'string' || !group.id || groupIds.has(group.id) ||
          !['summary', 'matching', 'yes-no-not-given', 'choice', 'multi-select', 'table'].includes(String(group.kind)) ||
          typeof group.heading !== 'string' || !strings(group.instructions) || !Array.isArray(group.numbers) || !group.numbers.length ||
          group.numbers.some(number => !Number.isInteger(number) || !passageQuestions.some((question: { number: number }) => question.number === number)) ||
          (group.maxWords !== undefined && (!Number.isInteger(group.maxWords) || (group.maxWords as number) < 1)) ||
          ['title', 'example', 'optionTitle'].some(key => group[key] !== undefined && typeof group[key] !== 'string') ||
          (group.options !== undefined && !options(group.options))) return false
      groupIds.add(group.id)
      covered.push(...group.numbers as number[])
      if (['summary', 'matching', 'multi-select'].includes(String(group.kind)) && !options(group.options)) return false
      if (group.kind === 'summary' && (!strings(group.text) || !group.text.length)) return false
      if (group.kind === 'table' && (!strings(group.columns) || !Array.isArray(group.rows) ||
          group.rows.some(row => !strings(row) || row.length !== (group.columns as string[]).length))) return false
      if (group.shadedCells !== undefined && (!Array.isArray(group.shadedCells) || group.shadedCells.some(cell => !Array.isArray(cell) || cell.length !== 2 ||
          !cell.every(Number.isInteger) || cell[0] < 0 || cell[1] < 0 || !Array.isArray(group.rows) || cell[0] >= group.rows.length ||
          !strings(group.columns) || cell[1] >= group.columns.length))) return false
      if (['choice', 'yes-no-not-given'].includes(String(group.kind)) &&
          passageQuestions.filter((question: { number: number }) => (group.numbers as number[]).includes(question.number))
            .some((question: { options?: unknown }) => !options(question.options))) return false
      if (group.kind === 'summary' || group.kind === 'table') {
        const content = group.kind === 'summary' ? group.text as string[] : (group.rows as string[][]).flat()
        const blanks = content.flatMap(text => [...text.matchAll(/\.\.\.\s*\((\d+)\)\s*\.\.\./g)].map(match => Number(match[1])))
        if (JSON.stringify([...blanks].sort((a, b) => a - b)) !== JSON.stringify([...(group.numbers as number[])].sort((a, b) => a - b))) return false
      }
    }
    if (JSON.stringify(covered.sort((a, b) => a - b)) !== JSON.stringify(passage.questions.map((question: { number: number }) => question.number).sort((a: number, b: number) => a - b))) return false
  }
  return numbers.length === 40 && numbers.every((number, index) => number === index + 1)
}

// The existing grader still owns normalization and accepted alternatives. These
// explicit source instructions add only word limits and distinct any-order credit.
export function gradeStructuredTest(test: StructuredReadingTest, answers: ReadingAnswers) {
  const result = gradeReadingTest(test, answers)
  for (const passage of test.passages) for (const group of passage.groups) {
    const seen = new Set<string>()
    for (const number of group.numbers) {
      const item = result.questions.find(item => item.questionNumber === number)!
      if (group.maxWords && item.userAnswer.trim().split(/\s+/).filter(Boolean).length > group.maxWords) item.isCorrect = false
      if (group.kind === 'multi-select') {
        const normalized = normalizeAnswer(item.userAnswer)
        item.isCorrect = item.isCorrect && !seen.has(normalized)
        if (normalized) seen.add(normalized)
      }
    }
  }
  result.correct = result.questions.filter(question => question.isCorrect).length
  return result
}
