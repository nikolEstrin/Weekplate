import { useState } from 'react'
import {
  addMeal,
  deleteMeal,
  getMeals,
  getProducts,
  updateMeal,
} from '../services/storage.js'
import {
  calculateMealNutrition,
  roundForDisplay,
} from '../utils/nutrition.js'

const MEAL_TAGS = [
  { id: 'breakfast', label: 'ארוחת בוקר' },
  { id: 'lunch', label: 'ארוחת צהריים' },
  { id: 'dinner', label: 'ארוחת ערב' },
  { id: 'snack', label: 'נשנוש' },
  { id: 'other', label: 'אחר' },
]

const TAG_LABELS = Object.fromEntries(
  MEAL_TAGS.map((tag) => [tag.id, tag.label]),
)

const EMPTY_INGREDIENT = { productId: '', quantityGrams: '' }

const EMPTY_FORM = {
  name: '',
  tag: 'breakfast',
  ingredients: [{ ...EMPTY_INGREDIENT }],
}

function formatMacro(value) {
  return String(roundForDisplay(value, value % 1 === 0 ? 0 : 1))
}

function mealToForm(meal) {
  return {
    name: meal.name,
    tag: meal.tag,
    ingredients:
      Array.isArray(meal.ingredients) && meal.ingredients.length > 0
        ? meal.ingredients.map((item) => ({
            productId: item.productId,
            quantityGrams: String(item.quantityGrams),
          }))
        : [{ ...EMPTY_INGREDIENT }],
  }
}

function MealsPage() {
  const [products] = useState(() => getProducts())
  const [meals, setMeals] = useState(() => getMeals())
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [view, setView] = useState('list')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  function refreshMeals() {
    setMeals(getMeals())
  }

  function openAdd() {
    setEditingId(null)
    setForm({
      name: '',
      tag: 'breakfast',
      ingredients: [{ ...EMPTY_INGREDIENT }],
    })
    setErrors({})
    setView('form')
  }

  function openEdit(meal) {
    setEditingId(meal.id)
    setForm(mealToForm(meal))
    setErrors({})
    setView('form')
  }

  function closeForm() {
    setView('list')
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  function handleNameChange(event) {
    setForm((current) => ({ ...current, name: event.target.value }))
  }

  function handleTagChange(tag) {
    setForm((current) => ({ ...current, tag }))
  }

  function handleAddIngredient() {
    setForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, { ...EMPTY_INGREDIENT }],
    }))
  }

  function handleIngredientChange(index, field, value) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  function handleRemoveIngredient(index) {
    setForm((current) => {
      const next = current.ingredients.filter(
        (_, itemIndex) => itemIndex !== index,
      )
      return {
        ...current,
        ingredients: next.length > 0 ? next : [{ ...EMPTY_INGREDIENT }],
      }
    })
  }

  function handleSubmit(event) {
    event.preventDefault()

    const payload = {
      name: form.name,
      tag: form.tag,
      ingredients: form.ingredients.map((item) => ({
        productId: item.productId,
        quantityGrams: item.quantityGrams,
      })),
    }

    const result = editingId
      ? updateMeal(editingId, payload, products)
      : addMeal(payload, products)

    if (!result.ok) {
      setErrors(result.errors)
      return
    }

    refreshMeals()
    closeForm()
  }

  function handleDeleteMeal(mealId) {
    const confirmed = window.confirm('למחוק את הארוחה?')
    if (!confirmed) {
      return
    }

    deleteMeal(mealId)
    refreshMeals()

    if (editingId === mealId) {
      closeForm()
    }
  }

  const liveNutrition = calculateMealNutrition(
    {
      ingredients: form.ingredients.map((item) => ({
        productId: item.productId,
        quantityGrams: item.quantityGrams,
      })),
    },
    products,
  )

  const normalizedQuery = query.trim().toLowerCase()
  const visibleMeals = meals.filter((meal) => {
    const matchesTag = tagFilter === 'all' || meal.tag === tagFilter
    if (!matchesTag) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }
    return meal.name.toLowerCase().includes(normalizedQuery)
  })

  if (view === 'form') {
    const isEdit = Boolean(editingId)
    const ingredientErrors = Array.isArray(errors.ingredients)
      ? errors.ingredients
      : []

    return (
      <section className="page">
        <form className="meal-form" onSubmit={handleSubmit} noValidate>
          <header className="product-form__header">
            <button
              type="button"
              className="product-form__close"
              onClick={closeForm}
              aria-label="ביטול"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <h1>{isEdit ? 'עריכת ארוחה' : 'יצירת ארוחה'}</h1>
            <button type="submit" className="product-form__save">
              שמירה
            </button>
          </header>

          {errors.id ? (
            <p className="product-field__error">{errors.id}</p>
          ) : null}

          <div className="product-field">
            <label htmlFor="meal-name">שם הארוחה</label>
            <input
              id="meal-name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleNameChange}
              placeholder="לדוגמה: קערת שיבולת שועל"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'meal-name-error' : undefined}
            />
            {errors.name ? (
              <p id="meal-name-error" className="product-field__error">
                {errors.name}
              </p>
            ) : null}
          </div>

          <div className="product-field">
            <span id="meal-tag-label" className="meal-field__label">
              סוג ארוחה
            </span>
            <div
              className="meal-tag-chips"
              role="group"
              aria-labelledby="meal-tag-label"
            >
              {MEAL_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={
                    form.tag === tag.id
                      ? 'meal-chip meal-chip--active'
                      : 'meal-chip'
                  }
                  onClick={() => handleTagChange(tag.id)}
                  aria-pressed={form.tag === tag.id}
                >
                  {tag.label}
                </button>
              ))}
            </div>
            {errors.tag ? (
              <p className="product-field__error">{errors.tag}</p>
            ) : null}
          </div>

          <div className="meal-ingredients">
            <div className="meal-ingredients__header">
              <h2 className="meal-ingredients__title">מרכיבים</h2>
              <button
                type="button"
                className="meal-ingredients__add"
                onClick={handleAddIngredient}
              >
                + הוספת מרכיב
              </button>
            </div>

            {typeof errors.ingredients === 'string' ? (
              <p className="product-field__error">{errors.ingredients}</p>
            ) : null}

            {products.length === 0 ? (
              <p className="meal-ingredients__hint">
                אין מוצרים זמינים. הוסיפו מוצרים בעמוד המוצרים תחילה.
              </p>
            ) : null}

            <ul className="meal-ingredient-list">
              {form.ingredients.map((ingredient, index) => {
                const itemErrors = ingredientErrors[index] || {}
                const productErrorId = `meal-ingredient-product-${index}-error`
                const quantityErrorId = `meal-ingredient-qty-${index}-error`

                return (
                  <li key={index} className="meal-ingredient-row">
                    <div className="meal-ingredient-row__main">
                      <label className="visually-hidden" htmlFor={`meal-ingredient-product-${index}`}>
                        מוצר
                      </label>
                      <select
                        id={`meal-ingredient-product-${index}`}
                        className="meal-ingredient-row__product"
                        value={ingredient.productId}
                        onChange={(event) =>
                          handleIngredientChange(
                            index,
                            'productId',
                            event.target.value,
                          )
                        }
                        aria-invalid={Boolean(itemErrors.productId)}
                        aria-describedby={
                          itemErrors.productId ? productErrorId : undefined
                        }
                      >
                        <option value="">בחרו מוצר</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>

                      <div className="meal-ingredient-row__qty">
                        <label
                          className="visually-hidden"
                          htmlFor={`meal-ingredient-qty-${index}`}
                        >
                          כמות
                        </label>
                        <input
                          id={`meal-ingredient-qty-${index}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          className="input-ltr meal-ingredient-row__qty-input"
                          value={ingredient.quantityGrams}
                          onChange={(event) =>
                            handleIngredientChange(
                              index,
                              'quantityGrams',
                              event.target.value,
                            )
                          }
                          placeholder="150"
                          aria-invalid={Boolean(itemErrors.quantityGrams)}
                          aria-describedby={
                            itemErrors.quantityGrams
                              ? quantityErrorId
                              : undefined
                          }
                        />
                        <span className="meal-ingredient-row__unit">גרם</span>
                      </div>

                      <button
                        type="button"
                        className="meal-ingredient-row__remove"
                        onClick={() => handleRemoveIngredient(index)}
                        aria-label="הסרת מרכיב"
                      >
                        ×
                      </button>
                    </div>

                    {itemErrors.productId ? (
                      <p id={productErrorId} className="product-field__error">
                        {itemErrors.productId}
                      </p>
                    ) : null}
                    {itemErrors.quantityGrams ? (
                      <p id={quantityErrorId} className="product-field__error">
                        {itemErrors.quantityGrams}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="meal-totals">
            <h2 className="meal-totals__title">סה״כ ערכים תזונתיים</h2>
            <div className="meal-totals__grid">
              <div className="meal-totals__item">
                <span className="meal-totals__value num">
                  {formatMacro(liveNutrition.calories)}
                </span>
                <span className="meal-totals__label">קלוריות</span>
              </div>
              <div className="meal-totals__item">
                <span className="meal-totals__value num">
                  {formatMacro(liveNutrition.protein)}
                </span>
                <span className="meal-totals__label">חלבון</span>
              </div>
              <div className="meal-totals__item">
                <span className="meal-totals__value num">
                  {formatMacro(liveNutrition.carbs)}
                </span>
                <span className="meal-totals__label">פחמימות</span>
              </div>
              <div className="meal-totals__item">
                <span className="meal-totals__value num">
                  {formatMacro(liveNutrition.fat)}
                </span>
                <span className="meal-totals__label">שומן</span>
              </div>
            </div>
          </div>

          <div className="product-form__actions">
            <button type="submit" className="btn-primary">
              שמירה
            </button>
            <button type="button" className="btn-secondary" onClick={closeForm}>
              ביטול
            </button>
          </div>

          {isEdit ? (
            <button
              type="button"
              className="product-form__delete"
              onClick={() => handleDeleteMeal(editingId)}
            >
              מחיקת ארוחה
            </button>
          ) : null}
        </form>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="products-header">
        <h1>ארוחות</h1>
        <button type="button" className="products-add" onClick={openAdd}>
          <span aria-hidden="true">+</span>
          ארוחה חדשה
        </button>
      </header>

      <div className="products-search-wrap">
        <svg
          className="products-search__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="products-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש ארוחות..."
          aria-label="חיפוש ארוחות"
        />
      </div>

      <div className="meal-filter-chips" role="group" aria-label="סינון לפי סוג">
        <button
          type="button"
          className={
            tagFilter === 'all' ? 'meal-chip meal-chip--active' : 'meal-chip'
          }
          onClick={() => setTagFilter('all')}
          aria-pressed={tagFilter === 'all'}
        >
          הכל
        </button>
        {MEAL_TAGS.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className={
              tagFilter === tag.id
                ? 'meal-chip meal-chip--active'
                : 'meal-chip'
            }
            onClick={() => setTagFilter(tag.id)}
            aria-pressed={tagFilter === tag.id}
          >
            {tag.label}
          </button>
        ))}
      </div>

      {visibleMeals.length === 0 ? (
        <div className="products-empty">
          <p>
            {meals.length === 0
              ? 'עדיין אין ארוחות. צרו את הארוחה הראשונה.'
              : 'לא נמצאו ארוחות התואמות לחיפוש או לסינון.'}
          </p>
        </div>
      ) : (
        <ul className="meal-list">
          {visibleMeals.map((meal) => {
            const nutrition = calculateMealNutrition(meal, products)

            return (
              <li key={meal.id} className="meal-card">
                <div className="meal-card__body">
                  <div className="meal-card__info">
                    <span className="meal-card__name">{meal.name}</span>
                    <span className="meal-card__tag">
                      {TAG_LABELS[meal.tag] || meal.tag}
                    </span>
                    <span className="meal-card__nutrition">
                      <span className="num">{formatMacro(nutrition.calories)}</span>
                      {' קל׳ · '}
                      <span className="num">{formatMacro(nutrition.protein)}</span>
                      {'ג חלבון · '}
                      <span className="num">{formatMacro(nutrition.carbs)}</span>
                      {'ג פחמימות · '}
                      <span className="num">{formatMacro(nutrition.fat)}</span>
                      {'ג שומן'}
                    </span>
                  </div>
                  <div className="meal-card__actions">
                    <button
                      type="button"
                      className="meal-card__action"
                      onClick={() => openEdit(meal)}
                    >
                      עריכה
                    </button>
                    <button
                      type="button"
                      className="meal-card__action meal-card__action--danger"
                      onClick={() => handleDeleteMeal(meal.id)}
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default MealsPage
