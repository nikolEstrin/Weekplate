import { useState } from 'react'
import { getGoals, saveGoals } from '../services/storage.js'

const GOAL_FIELDS = [
  { name: 'calories', label: 'Calories (kcal)', id: 'goal-calories' },
  { name: 'protein', label: 'Protein (g)', id: 'goal-protein' },
  { name: 'carbs', label: 'Carbs (g)', id: 'goal-carbs' },
  { name: 'fat', label: 'Fat (g)', id: 'goal-fat' },
]

function goalsToForm(goals) {
  return {
    calories: String(goals.calories),
    protein: String(goals.protein),
    carbs: String(goals.carbs),
    fat: String(goals.fat),
  }
}

function Settings() {
  const [form, setForm] = useState(() => goalsToForm(getGoals()))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setSaved(false)
  }

  function handleSubmit(event) {
    event.preventDefault()

    const result = saveGoals(form)
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(false)
      return
    }

    setForm(goalsToForm(result.goals))
    setErrors({})
    setSaved(true)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>

      <form className="goals-form" onSubmit={handleSubmit}>
        <p className="goals-form__hint">Daily nutrition targets</p>

        {GOAL_FIELDS.map((field) => (
          <div className="product-field" key={field.name}>
            <label htmlFor={field.id}>{field.label}</label>
            <input
              id={field.id}
              name={field.name}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={form[field.name]}
              onChange={handleChange}
              aria-invalid={errors[field.name] ? 'true' : 'false'}
            />
            {errors[field.name] ? (
              <span className="product-field__error">{errors[field.name]}</span>
            ) : null}
          </div>
        ))}

        <button type="submit" className="goals-form__save">
          Save
        </button>

        {saved ? <p className="goals-form__status">Goals saved.</p> : null}
      </form>
    </section>
  )
}

export default Settings
