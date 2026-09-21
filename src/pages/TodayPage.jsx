import { useState } from 'react'
import { getGoals } from '../services/storage.js'
import { remainingNutrition, roundForDisplay } from '../utils/nutrition.js'

const EMPTY_INTAKE = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
}

const NUTRITION_CARDS = [
  { key: 'calories', label: 'קלוריות', unit: 'קל׳', accent: 'green' },
  { key: 'protein', label: 'חלבון', unit: 'גרם', accent: 'blue' },
  { key: 'carbs', label: 'פחמימות', unit: 'גרם', accent: 'orange' },
  { key: 'fat', label: 'שומן', unit: 'גרם', accent: 'yellow' },
]

function formatDisplay(value) {
  const decimals = value !== 0 && Math.abs(value) < 10 ? 1 : 0
  return String(roundForDisplay(value, decimals))
}

function Num({ children }) {
  return <span className="num">{children}</span>
}

function TodayPage() {
  const [goals] = useState(() => getGoals())
  const current = EMPTY_INTAKE
  const remaining = remainingNutrition(current, goals)

  return (
    <section className="page">
      <header className="page-header">
        <h1>היום</h1>
      </header>

      <div className="nutrition-grid">
        {NUTRITION_CARDS.map((card) => (
          <article
            key={card.key}
            className={`nutrition-card nutrition-card--${card.accent}`}
          >
            <h2 className="nutrition-card__label">{card.label}</h2>
            <p className="nutrition-card__values">
              <Num>
                {formatDisplay(current[card.key])} / {formatDisplay(goals[card.key])}
              </Num>
              <span className="nutrition-card__unit"> {card.unit}</span>
            </p>
          </article>
        ))}
      </div>

      <section className="remaining-card" aria-label="נשאר להיום">
        <h2 className="remaining-card__title">נשאר להיום</h2>
        <div className="remaining-card__grid">
          {NUTRITION_CARDS.map((card) => (
            <div key={card.key} className="remaining-card__item">
              <span className="remaining-card__label">{card.label}</span>
              <span className="remaining-card__value">
                <Num>
                  {formatDisplay(remaining[card.key])} {card.unit}
                </Num>
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="placeholder-card">
        <p>תכנון הארוחות להיום יתווסף בהמשך.</p>
      </div>
    </section>
  )
}

export default TodayPage
