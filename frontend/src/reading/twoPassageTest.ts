
import type { ReadingTest } from './types'
import { cityShadeTest } from './miniTest'

export const twoPassageTest: ReadingTest = {
  id: 'reading-two-passage-pilot-v1',
  title: 'Reading Practice — Two Passages',
  durationMinutes: 25,

  passages: [
    ...cityShadeTest.passages,

    {
      id: 'wetlands-passage',
      title: 'The Return of Urban Wetlands',

      paragraphs: [
        'For decades, the Oakmere wetland received less water because drainage projects diverted a nearby stream. As the ground became drier, many plants that depended on seasonal flooding disappeared. Local conservationists proposed restoring the natural movement of water through the area.',

        'Rather than planting new trees immediately, ecologists first cleared blocked drainage channels to reconnect the wetland to the seasonal stream. After periods of rainfall, shallow pools began to return. The team continued monitoring water levels to understand how the landscape was changing.',

        'During spring, local volunteers conducted weekly walks to record bird species. The researchers explained that these observations would help them monitor changes, although the early results could not prove that restoration alone was responsible for every increase in wildlife.',

        'The council also raised several footpaths using gravel to reduce damage caused by visitors walking across wet ground. Information signs encouraged people to stay on the designated routes. Conservationists planned to review the project over five years before making a final assessment of its success.',
      ],

      questions: [
        {
          id: 'wetlands-q9',
          number: 9,
          type: 'tfng',
          prompt:
            'Ecologists planted new trees before clearing the blocked drainage channels.',
          correctAnswers: ['FALSE'],
          explanation:
            'Paragraph 2 explains that ecologists cleared blocked channels rather than planting trees immediately.',
        },
        {
          id: 'wetlands-q10',
          number: 10,
          type: 'tfng',
          prompt:
            'The restored wetland now supports more bird species than any nearby reserve.',
          correctAnswers: ['NOT GIVEN'],
          explanation:
            'The passage mentions recording bird species, but makes no comparison with nearby reserves.',
        },
        {
          id: 'wetlands-q11',
          number: 11,
          type: 'choice',
          prompt:
            'What action helped shallow pools return to the wetland?',
          options: [
            { value: 'A', label: 'Installing sprinklers' },
            { value: 'B', label: 'Planting large trees' },
            { value: 'C', label: 'Clearing blocked drainage channels' },
            { value: 'D', label: 'Removing all footpaths' },
          ],
          correctAnswers: ['C'],
          explanation:
            'Paragraph 2 identifies the clearing of blocked drainage channels as the action that helped restore water flow.',
        },
        {
          id: 'wetlands-q12',
          number: 12,
          type: 'short',
          prompt:
            'What material was used to raise the footpaths? Write ONE WORD.',
          correctAnswers: ['gravel'],
          explanation:
            'Paragraph 4 states that the council raised several footpaths using gravel.',
        },
      ],
    },
  ],
}
