
import type { ReadingTest } from './types'

import {
  MINI_TEST_MINUTES,
  miniPassage,
  miniQuestions,
} from '../readingPracticeData.ts'

export const cityShadeTest: ReadingTest = {
  id: 'city-shade-mini-v1',
  title: 'A City Measured in Shade',
  durationMinutes: MINI_TEST_MINUTES,

  passages: [
    {
      id: 'city-shade-passage-1',
      title: 'A City Measured in Shade',
      paragraphs: miniPassage,

      questions: miniQuestions.map((question) => ({
        id: `city-shade-q${question.id}`,
        number: question.id,
        type: question.kind,
        prompt: question.prompt,
        ...(question.options
          ? { options: question.options }
          : {}),
        correctAnswers: [question.correct],
        explanation: question.explanation,
      })),
    },
  ],
}
