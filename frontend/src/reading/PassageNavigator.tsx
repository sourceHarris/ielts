
import type { ReadingTest } from './types'

type PassageNavigatorProps = {
  test: ReadingTest
  activeIndex: number
  answers: Record<string, string>
  onChange: (index: number) => void
}

export default function PassageNavigator({
  test,
  activeIndex,
  answers,
  onChange,
}: PassageNavigatorProps) {
  return (
    <div
      className="reading-navigator"
      role="group"
      aria-label="Choose reading passage"
    >
      {test.passages.map((passage, index) => {
        const answered = passage.questions.filter(
          (question) => (answers[question.id] ?? '').trim() !== ''
        ).length

        return (
          <button
            key={passage.id}
            type="button"
            className={`reading-nav-number ${
              activeIndex === index ? 'is-answered' : ''
            }`}
            aria-pressed={activeIndex === index}
            onClick={() => onChange(index)}
          >
            Passage {index + 1}
            {' · '}
            {answered}/{passage.questions.length}
          </button>
        )
      })}
    </div>
  )
}
