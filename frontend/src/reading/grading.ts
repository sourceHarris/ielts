
import type { ReadingTest } from './types'

export type ReadingAnswers = Record<string, string>

export type QuestionResult = {
  questionId: string
  questionNumber: number
  userAnswer: string
  correctAnswers: string[]
  isCorrect: boolean
  explanation: string
}

export type ReadingResult = {
  correct: number
  total: number
  unanswered: number
  questions: QuestionResult[]
}

export function normalizeAnswer(value: string): string {
  return value
    .toLocaleLowerCase('en')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
}

export function gradeReadingTest(
  test: ReadingTest,
  answers: ReadingAnswers
): ReadingResult {
  const questions = test.passages.flatMap(
    passage => passage.questions
  )

  const results: QuestionResult[] = questions.map(question => {
    const userAnswer = answers[question.id] ?? ''
    const normalized = normalizeAnswer(userAnswer)

    const isCorrect =
      normalized.length > 0 &&
      question.correctAnswers.some(
        accepted => normalizeAnswer(accepted) === normalized
      )

    return {
      questionId: question.id,
      questionNumber: question.number,
      userAnswer,
      correctAnswers: question.correctAnswers,
      isCorrect,
      explanation: question.explanation,
    }
  })

  return {
    correct: results.filter(result => result.isCorrect).length,
    total: results.length,
    unanswered: results.filter(
      result => !result.userAnswer.trim()
    ).length,
    questions: results,
  }
}
