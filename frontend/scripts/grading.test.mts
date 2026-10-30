
import test from 'node:test'
import assert from 'node:assert/strict'

import { gradeReadingTest } from '../src/reading/grading.ts'
import type { ReadingTest } from '../src/reading/types.ts'

const sampleTest: ReadingTest = {
  id: 'grading-check',
  title: 'Grading Check',
  durationMinutes: 15,
  passages: [
    {
      id: 'passage-1',
      title: 'Sample Passage',
      paragraphs: ['This is a sample passage.'],
      questions: [
        {
          id: 'q1',
          number: 1,
          type: 'short',
          prompt: 'What material was used?',
          correctAnswers: ['mulch', 'wood mulch'],
          explanation: 'The passage identifies mulch.',
        },
        {
          id: 'q2',
          number: 2,
          type: 'tfng',
          prompt: 'The statement is supported.',
          correctAnswers: ['TRUE'],
          explanation: 'The statement is true.',
        },
      ],
    },
  ],
}

test('accepts alternative answers and ignores case and spaces', () => {
  const result = gradeReadingTest(sampleTest, {
    q1: '  WOOD   mulch. ',
    q2: 'true',
  })

  assert.equal(result.correct, 2)
  assert.equal(result.total, 2)
  assert.equal(result.unanswered, 0)
})

test('counts unanswered questions correctly', () => {
  const result = gradeReadingTest(sampleTest, {
    q1: '',
    q2: 'TRUE',
  })

  assert.equal(result.correct, 1)
  assert.equal(result.unanswered, 1)
  assert.equal(result.questions[0].isCorrect, false)
})

test('rejects wrong answers and returns explanations', () => {
  const result = gradeReadingTest(sampleTest, {
    q1: 'soil',
    q2: 'FALSE',
  })

  assert.equal(result.correct, 0)
  assert.equal(result.unanswered, 0)
  assert.equal(
    result.questions[0].explanation,
    'The passage identifies mulch.'
  )
})


test('grades questions across multiple passages', () => {
  const multiPassageTest: ReadingTest = {
    ...sampleTest,
    id: 'multi-passage-check',
    passages: [
      ...sampleTest.passages,
      {
        id: 'passage-2',
        title: 'Second Passage',
        paragraphs: ['The library opened in 1995.'],
        questions: [
          {
            id: 'q3',
            number: 3,
            type: 'short',
            prompt: 'In what year did the library open?',
            correctAnswers: ['1995'],
            explanation: 'The passage states that it opened in 1995.',
          },
        ],
      },
    ],
  }

  const result = gradeReadingTest(multiPassageTest, {
    q1: 'mulch',
    q2: 'TRUE',
    q3: '1995',
  })

  assert.equal(result.total, 3)
  assert.equal(result.correct, 3)
  assert.equal(result.unanswered, 0)
  assert.equal(result.questions[2].questionNumber, 3)
})
