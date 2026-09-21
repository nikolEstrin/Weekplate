import { useState } from 'react'
import { getGoals } from '../services/storage.js'
import { roundForDisplay } from '../utils/nutrition.js'

const CURRENT = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
}

const NUTRITION_ROWS = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

function formatValue(value) {
  return String(roundForDisplay(value, value < 10 ? 1 : 0))
}

function Today() {
  const [goals] = useState(() => getGoals())

  return (
    <section className="page">
      <header className="page-header">
        <h1>Today</h1>
      </header>

      <div className="nutrition-summary">
        {NUTRITION_ROWS.map((row) => {
          const current = CURRENT[row.key]
          const goal = goals[row.key]
          const remaining = goal - current

          return (
            <div className="nutrition-summary__row" key={row.key}>
              <div className="nutrition-summary__label">{row.label}</div>
              <div className="nutrition-summary__values">
                <span className="nutrition-summary__current">
                  {formatValue(current)}
                </span>
                <span className="nutrition-summary__separator">/</span>
                <span className="nutrition-summary__goal">
                  {formatValue(goal)} {row.unit}
                </span>
              </div>
              <div className="nutrition-summary__remaining">
                {formatValue(remaining)} {row.unit} remaining
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default Today
