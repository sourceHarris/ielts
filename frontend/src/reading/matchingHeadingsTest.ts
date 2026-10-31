
import type { ReadingTest, QuestionOption } from './types'

const headings: QuestionOption[] = [
  { value: 'i', label: 'i. Effects on migrating wildlife' },
  { value: 'ii', label: 'ii. Improvements to lighting equipment' },
  { value: 'iii', label: 'iii. Measuring the problem and planning a response' },
  { value: 'iv', label: 'iv. Changes to the visibility of the night sky' },
  { value: 'v', label: 'v. The history of electricity production' },
  { value: 'vi', label: 'vi. The development of public transport' },
]

export const matchingHeadingsTest: ReadingTest = {
  id: 'night-sky-headings-v1',
  title: 'Saving the Night Sky',
  durationMinutes: 10,

  passages: [
    {
      id: 'night-sky-passage',
      title: 'Saving the Night Sky',

      paragraphs: [
        'A. As towns and cities grow, outdoor lighting becomes more widespread. Streetlights, advertising signs and illuminated buildings brighten the surroundings after sunset. However, light from these sources often spreads upwards, creating a glow that makes stars increasingly difficult to see. Astronomers describe this as one effect of light pollution.',

        'B. Artificial light also affects animals. Some migrating birds use natural light from the stars and moon to navigate during their journeys. Bright buildings can confuse them, sometimes leading to collisions or changes in their flight paths. Researchers are investigating how different lighting conditions influence this behaviour.',

        'C. Engineers have developed several ways to limit unnecessary outdoor light. Shielded lamps direct illumination towards the ground instead of the sky. Motion sensors allow lights to operate only when needed, while lower-intensity bulbs can reduce excessive brightness. These measures may also save electricity.',

        'D. Before changing an entire city’s lighting system, local authorities can measure existing light levels and identify areas where improvements are possible. Small pilot projects allow residents to comment on visibility and safety. Officials can then compare the results before deciding whether to introduce wider changes.',
      ],

      questions: [
        {
          id: 'night-sky-q1',
          number: 1,
          type: 'matching-headings',
          prompt: 'Choose the best heading for Paragraph A.',
          options: headings,
          correctAnswers: ['iv'],
          explanation:
            'Paragraph A focuses on how artificial light makes stars harder to see.',
        },
        {
          id: 'night-sky-q2',
          number: 2,
          type: 'matching-headings',
          prompt: 'Choose the best heading for Paragraph B.',
          options: headings,
          correctAnswers: ['i'],
          explanation:
            'Paragraph B describes how artificial light affects migrating birds.',
        },
        {
          id: 'night-sky-q3',
          number: 3,
          type: 'matching-headings',
          prompt: 'Choose the best heading for Paragraph C.',
          options: headings,
          correctAnswers: ['ii'],
          explanation:
            'Paragraph C describes equipment changes such as shielded lamps and sensors.',
        },
        {
          id: 'night-sky-q4',
          number: 4,
          type: 'matching-headings',
          prompt: 'Choose the best heading for Paragraph D.',
          options: headings,
          correctAnswers: ['iii'],
          explanation:
            'Paragraph D explains measuring light levels, running pilot projects and planning changes.',
        },
      ],
    },
  ],
}
