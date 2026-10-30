
export type QuestionType = 'tfng' | 'choice' | 'short'

export type QuestionOption = {
  value: string
  label: string
}

export type ReadingQuestion = {
  id: string
  number: number
  type: QuestionType
  prompt: string
  options?: QuestionOption[]
  correctAnswers: string[]
  explanation: string
}

export type ReadingPassage = {
  id: string
  title: string
  paragraphs: string[]
  questions: ReadingQuestion[]
}

export type ReadingTest = {
  id: string
  title: string
  durationMinutes: number
  passages: ReadingPassage[]
}
