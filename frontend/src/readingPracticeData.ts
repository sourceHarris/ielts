/** Original practice material. Not an official IELTS test or calibrated exam. */
export type ExamOption = 'TRUE' | 'FALSE' | 'NOT GIVEN'
export type ReadingQuestion = {
  id: number
  prompt: string
  kind: 'tfng' | 'choice' | 'short'
  options?: { value: string; label: string }[]
  correct: string
  explanation: string
}

export const MINI_TEST_MINUTES = 15
export const miniPassage = [
  'When the council of Bellford began a project to make its streets cooler, it chose to measure the shade already provided by trees before ordering any new ones. During the summer, small teams walked every residential street and recorded the size of each tree and the width of its shadow at midday. The council considered using drones for the entire survey but decided that ground teams could also notice damaged branches and narrow pavements.',
  'The first map showed a surprising pattern. Two neighbourhoods with similar numbers of trees had very different amounts of useful shade. In one, large trees stood in private gardens; in the other, smaller trees lined the pavements where people walked. The team therefore decided to measure shade where people actually spent time outdoors, rather than simply count trees. Bus stops became an early priority because passengers often waited there without shelter.',
  'Residents were invited to check the preliminary map. Some reported that the roots of older street trees were trapped beneath hard paving, leaving little space for rainwater to reach the soil. In response, the council removed small sections of paving and spread mulch around selected trees. Mulch is a layer of natural material that helps soil retain moisture. These changes were less expensive than replacing healthy trees, although they would take time to have an effect.',
  'The final plan combined maintenance with new planting. Rather than repeating the full survey each month, the council scheduled an annual review and asked local schools to record seasonal changes near their buildings. Officials said that the map was a starting point, not proof that every street would become cooler. They would need to compare future measurements with the original records to find out whether the work was effective.',
]

export const miniQuestions: ReadingQuestion[] = [
  { id: 1, kind: 'tfng', prompt: 'The council measured existing shade before buying new trees.', correct: 'TRUE', explanation: 'Paragraph 1 says the council measured shade before ordering new trees.' },
  { id: 2, kind: 'tfng', prompt: 'Drones were used to complete the entire survey.', correct: 'FALSE', explanation: 'Paragraph 1 says the council considered drones but chose ground teams.' },
  { id: 3, kind: 'tfng', prompt: 'An international charity paid for the survey.', correct: 'NOT GIVEN', explanation: 'The passage does not identify who funded the project.' },
  { id: 4, kind: 'tfng', prompt: 'The council planned to repeat the full survey every month.', correct: 'FALSE', explanation: 'Paragraph 4 states that a full review was planned annually, not monthly.' },
  { id: 5, kind: 'choice', prompt: 'Why did the council give bus stops early priority?', options: [
    { value: 'A', label: 'They already had the largest trees.' },
    { value: 'B', label: 'Passengers often waited outside without shelter.' },
    { value: 'C', label: 'They were easier to photograph from the air.' },
    { value: 'D', label: 'Residents asked to remove them.' },
  ], correct: 'B', explanation: 'Paragraph 2 says passengers often waited at bus stops without shelter.' },
  { id: 6, kind: 'choice', prompt: 'What problem did residents identify with some older trees?', options: [
    { value: 'A', label: 'Their roots were restricted by paving.' },
    { value: 'B', label: 'They had been planted too recently.' },
    { value: 'C', label: 'They attracted too many birds.' },
    { value: 'D', label: 'Their leaves blocked traffic signs.' },
  ], correct: 'A', explanation: 'Paragraph 3 describes tree roots trapped beneath hard paving.' },
  { id: 7, kind: 'short', prompt: 'What natural material was placed around selected trees? Write ONE WORD.', correct: 'mulch', explanation: 'Paragraph 3: the council spread mulch around selected trees.' },
  { id: 8, kind: 'short', prompt: 'Which group was asked to record seasonal changes? Write TWO WORDS.', correct: 'local schools', explanation: 'Paragraph 4 says local schools were asked to record seasonal changes.' },
]

export function normalizeAnswer(value: string) {
  return value.toLocaleLowerCase('en').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '')
}

export function isCorrectAnswer(id: number, value?: string) {
  const question = miniQuestions.find((item) => item.id === id)
  return Boolean(question && value && normalizeAnswer(value) === normalizeAnswer(question.correct))
}
