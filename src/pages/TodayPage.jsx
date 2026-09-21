import { useState } from 'react'
import {
  addMealToToday,
  addProductToToday,
  getGoals,
  getMeals,
  getProducts,
  getTodayPlanner,
  removeTodayItem,
  updateTodayItemQuantity,
} from '../services/storage.js'
import {
  calculateMealNutrition,
  calculatePlannerNutrition,
  calculateProductNutrition,
  remainingNutrition,
  roundForDisplay,
} from '../utils/nutrition.js'

const NUTRITION_CARDS = [
  { key: 'calories', label: 'קלוריות', unit: 'קל׳', accent: 'green' },
  { key: 'protein', label: 'חלבון', unit: 'גרם', accent: 'blue' },
  { key: 'carbs', label: 'פחמימות', unit: 'גרם', accent: 'orange' },
  { key: 'fat', label: 'שומן', unit: 'גרם', accent: 'yellow' },
]

const MEAL_FILTER_TAGS = [
  { id: 'breakfast', label: 'ארוחת בוקר' },
  { id: 'lunch', label: 'ארוחת צהריים' },
  { id: 'dinner', label: 'ארוחת ערב' },
  { id: 'snack', label: 'נשנוש' },
]

const TAG_LABELS = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'נשנוש',
  other: 'אחר',
}

function formatDisplay(value) {
  const decimals = value !== 0 && Math.abs(value) < 10 ? 1 : 0
  return String(roundForDisplay(value, decimals))
}

function formatMacro(value) {
  return String(roundForDisplay(value, value % 1 === 0 ? 0 : 1))
}

function Num({ children }) {
  return <span className="num">{children}</span>
}

function NutritionSummary({ nutrition }) {
  return (
    <span className="today-item__nutrition">
      <Num>{formatMacro(nutrition.calories)}</Num>
      {' קל׳ · '}
      <Num>{formatMacro(nutrition.protein)}</Num>
      {'ג חלבון · '}
      <Num>{formatMacro(nutrition.carbs)}</Num>
      {'ג פחמימות · '}
      <Num>{formatMacro(nutrition.fat)}</Num>
      {'ג שומן'}
    </span>
  )
}

function ingredientLabel(ingredient, productsById) {
  if (
    typeof ingredient.productName === 'string' &&
    ingredient.productName.trim() !== ''
  ) {
    return ingredient.productName
  }

  const product = productsById.get(ingredient.productId)
  if (product) {
    return product.name
  }

  return 'מוצר לא זמין'
}

function TodayPage() {
  const [goals] = useState(() => getGoals())
  const [products] = useState(() => getProducts())
  const [meals] = useState(() => getMeals())
  const [plannerItems, setPlannerItems] = useState(() => getTodayPlanner())

  const [view, setView] = useState('today')
  const [addTab, setAddTab] = useState('meals')
  const [mealQuery, setMealQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [productQuery, setProductQuery] = useState('')
  const [productQuantities, setProductQuantities] = useState({})
  const [quantityDrafts, setQuantityDrafts] = useState({})
  const [productErrors, setProductErrors] = useState({})
  const [itemErrors, setItemErrors] = useState({})

  const productsById = new Map(products.map((product) => [product.id, product]))

  function refreshPlanner() {
    setPlannerItems(getTodayPlanner())
  }

  function openAdd() {
    setAddTab('meals')
    setMealQuery('')
    setTagFilter('all')
    setProductQuery('')
    setProductQuantities({})
    setProductErrors({})
    setView('add')
  }

  function closeAdd() {
    setView('today')
    setProductErrors({})
  }

  function handleAddMeal(meal) {
    const result = addMealToToday(meal, products)
    if (!result.ok) {
      return
    }
    refreshPlanner()
    closeAdd()
  }

  function getProductQuantity(productId) {
    const draft = productQuantities[productId]
    if (draft !== undefined) {
      return draft
    }
    return '100'
  }

  function handleProductQuantityChange(productId, value) {
    setProductQuantities((current) => ({ ...current, [productId]: value }))
    setProductErrors((current) => {
      if (!current[productId]) {
        return current
      }
      const next = { ...current }
      delete next[productId]
      return next
    })
  }

  function handleAddProduct(product) {
    const quantityValue = getProductQuantity(product.id)
    const result = addProductToToday(product, quantityValue)

    if (!result.ok) {
      setProductErrors((current) => ({
        ...current,
        [product.id]:
          result.errors.quantityGrams ||
          result.errors.product ||
          result.errors.name ||
          'לא ניתן להוסיף את המוצר',
      }))
      return
    }

    refreshPlanner()
    closeAdd()
  }

  function draftKey(itemId, ingredientIndex) {
    return `${itemId}:${ingredientIndex}`
  }

  function getQuantityDraft(item, ingredientIndex) {
    const key = draftKey(item.id, ingredientIndex)
    if (Object.prototype.hasOwnProperty.call(quantityDrafts, key)) {
      return quantityDrafts[key]
    }
    return String(item.ingredients[ingredientIndex].quantityGrams)
  }

  function getEffectiveQuantity(item, ingredientIndex) {
    const draft = getQuantityDraft(item, ingredientIndex)
    const parsed = Number(typeof draft === 'string' ? draft.trim() : draft)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
    return item.ingredients[ingredientIndex].quantityGrams
  }

  function plannerWithDrafts(items) {
    return items.map((item) => ({
      ...item,
      ingredients: item.ingredients.map((ingredient, ingredientIndex) => ({
        ...ingredient,
        quantityGrams: getEffectiveQuantity(item, ingredientIndex),
      })),
    }))
  }

  function clearQuantityDraft(key) {
    setQuantityDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        return current
      }
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function clearItemError(key) {
    setItemErrors((current) => {
      if (!current[key]) {
        return current
      }
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function handleQuantityDraftChange(itemId, ingredientIndex, value) {
    const key = draftKey(itemId, ingredientIndex)
    setQuantityDrafts((current) => ({ ...current, [key]: value }))
    clearItemError(key)
  }

  function commitQuantity(itemId, ingredientIndex, rawValue) {
    const key = draftKey(itemId, ingredientIndex)
    const result = updateTodayItemQuantity(itemId, ingredientIndex, rawValue)

    if (!result.ok) {
      setItemErrors((current) => ({
        ...current,
        [key]: result.errors.quantityGrams || 'כמות לא תקינה',
      }))
      return
    }

    clearQuantityDraft(key)
    clearItemError(key)
    refreshPlanner()
  }

  const displayPlanner = plannerWithDrafts(plannerItems)
  const current = calculatePlannerNutrition(displayPlanner, products)
  const remaining = remainingNutrition(current, goals)

  function handleRemoveItem(itemId) {
    const confirmed = window.confirm('להסיר מהיום?')
    if (!confirmed) {
      return
    }

    removeTodayItem(itemId)
    setQuantityDrafts((current) => {
      const next = { ...current }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${itemId}:`)) {
          delete next[key]
        }
      }
      return next
    })
    setItemErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${itemId}:`)) {
          delete next[key]
        }
      }
      return next
    })
    refreshPlanner()
  }

  const normalizedMealQuery = mealQuery.trim().toLowerCase()
  const visibleMeals = meals.filter((meal) => {
    const matchesTag = tagFilter === 'all' || meal.tag === tagFilter
    if (!matchesTag) {
      return false
    }
    if (!normalizedMealQuery) {
      return true
    }
    return meal.name.toLowerCase().includes(normalizedMealQuery)
  })

  const normalizedProductQuery = productQuery.trim().toLowerCase()
  const visibleProducts = normalizedProductQuery
    ? products.filter((product) =>
        product.name.toLowerCase().includes(normalizedProductQuery),
      )
    : products

  if (view === 'add') {
    return (
      <section className="page">
        <header className="product-form__header">
          <button
            type="button"
            className="product-form__close"
            onClick={closeAdd}
            aria-label="סגירה"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <h1>הוספה להיום</h1>
          <span className="today-add__header-spacer" aria-hidden="true" />
        </header>

        <div className="today-tabs" role="tablist" aria-label="סוג הוספה">
          <button
            type="button"
            role="tab"
            className={
              addTab === 'meals' ? 'today-tab today-tab--active' : 'today-tab'
            }
            aria-selected={addTab === 'meals'}
            onClick={() => setAddTab('meals')}
          >
            ארוחות
          </button>
          <button
            type="button"
            role="tab"
            className={
              addTab === 'products'
                ? 'today-tab today-tab--active'
                : 'today-tab'
            }
            aria-selected={addTab === 'products'}
            onClick={() => setAddTab('products')}
          >
            מוצרים
          </button>
        </div>

        {addTab === 'meals' ? (
          <>
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
                value={mealQuery}
                onChange={(event) => setMealQuery(event.target.value)}
                placeholder="חיפוש ארוחות..."
                aria-label="חיפוש ארוחות"
              />
            </div>

            <div
              className="meal-filter-chips"
              role="group"
              aria-label="סינון לפי סוג"
            >
              <button
                type="button"
                className={
                  tagFilter === 'all'
                    ? 'meal-chip meal-chip--active'
                    : 'meal-chip'
                }
                onClick={() => setTagFilter('all')}
                aria-pressed={tagFilter === 'all'}
              >
                הכל
              </button>
              {MEAL_FILTER_TAGS.map((tag) => (
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
                    ? 'עדיין אין ארוחות שמורות. צרו ארוחות בעמוד הארוחות.'
                    : 'לא נמצאו ארוחות התואמות לחיפוש או לסינון.'}
                </p>
              </div>
            ) : (
              <ul className="today-pick-list">
                {visibleMeals.map((meal) => {
                  const nutrition = calculateMealNutrition(meal, products)

                  return (
                    <li key={meal.id} className="today-pick-card">
                      <div className="today-pick-card__info">
                        <span className="today-pick-card__name">{meal.name}</span>
                        <span className="today-pick-card__tag">
                          {TAG_LABELS[meal.tag] || meal.tag}
                        </span>
                        <NutritionSummary nutrition={nutrition} />
                      </div>
                      <button
                        type="button"
                        className="today-pick-card__add"
                        onClick={() => handleAddMeal(meal)}
                        aria-label={`הוספת ${meal.name}`}
                      >
                        +
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : (
          <>
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
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="חיפוש מוצרים..."
                aria-label="חיפוש מוצרים"
              />
            </div>

            {visibleProducts.length === 0 ? (
              <div className="products-empty">
                <p>
                  {products.length === 0
                    ? 'עדיין אין מוצרים. הוסיפו מוצרים בעמוד המוצרים.'
                    : 'לא נמצאו מוצרים התואמים לחיפוש.'}
                </p>
              </div>
            ) : (
              <ul className="today-pick-list">
                {visibleProducts.map((product) => {
                  const quantityValue = getProductQuantity(product.id)
                  const previewNutrition = calculateProductNutrition(
                    product,
                    quantityValue,
                  )
                  const error = productErrors[product.id]
                  const quantityId = `today-product-qty-${product.id}`
                  const errorId = `${quantityId}-error`

                  return (
                    <li key={product.id} className="today-pick-card today-pick-card--product">
                      <div className="today-pick-card__info">
                        <span className="today-pick-card__name">
                          {product.name}
                        </span>
                        <span className="today-pick-card__meta">
                          <Num>{formatMacro(product.caloriesPer100g)}</Num>
                          {' קל׳ ל־100 גרם'}
                        </span>
                        <div className="today-product-qty">
                          <label htmlFor={quantityId}>כמות</label>
                          <input
                            id={quantityId}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            className="input-ltr today-product-qty__input"
                            value={quantityValue}
                            onChange={(event) =>
                              handleProductQuantityChange(
                                product.id,
                                event.target.value,
                              )
                            }
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                          />
                          <span className="today-product-qty__unit">גרם</span>
                        </div>
                        <NutritionSummary nutrition={previewNutrition} />
                        {error ? (
                          <p id={errorId} className="product-field__error">
                            {error}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="today-pick-card__add"
                        onClick={() => handleAddProduct(product)}
                        aria-label={`הוספת ${product.name}`}
                      >
                        +
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </section>
    )
  }

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

      <section className="today-meals" aria-label="הארוחות שלי להיום">
        <div className="today-meals__header">
          <h2 className="today-meals__title">הארוחות שלי להיום</h2>
          <button type="button" className="today-meals__add" onClick={openAdd}>
            <span aria-hidden="true">+</span>
            הוספה
          </button>
        </div>

        {plannerItems.length === 0 ? (
          <div className="products-empty">
            <p>עדיין אין פריטים להיום. לחצו על הוספה כדי להתחיל.</p>
          </div>
        ) : (
          <ul className="today-item-list">
            {plannerItems.map((item, itemIndex) => {
              const displayItem = displayPlanner[itemIndex] || item
              const nutrition = calculatePlannerNutrition(
                [displayItem],
                products,
              )

              return (
                <li key={item.id} className="today-item-card">
                  <div className="today-item-card__top">
                    <div className="today-item-card__info">
                      {item.type === 'meal' && item.tag ? (
                        <span className="today-item-card__tag">
                          {TAG_LABELS[item.tag] || item.tag}
                        </span>
                      ) : item.type === 'product' ? (
                        <span className="today-item-card__tag">מוצר</span>
                      ) : null}
                      <span className="today-item-card__name">{item.name}</span>
                      <NutritionSummary nutrition={nutrition} />
                    </div>
                    <button
                      type="button"
                      className="today-item-card__delete"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      מחיקה
                    </button>
                  </div>

                  <ul className="today-ingredient-list">
                    {item.ingredients.map((ingredient, ingredientIndex) => {
                      const key = draftKey(item.id, ingredientIndex)
                      const draftValue = getQuantityDraft(item, ingredientIndex)
                      const error = itemErrors[key]
                      const inputId = `today-qty-${item.id}-${ingredientIndex}`
                      const errorId = `${inputId}-error`
                      const ingredientNutrition = calculateProductNutrition(
                        productsById.get(ingredient.productId) || {
                          caloriesPer100g: ingredient.caloriesPer100g,
                          proteinPer100g: ingredient.proteinPer100g,
                          carbsPer100g: ingredient.carbsPer100g,
                          fatPer100g: ingredient.fatPer100g,
                        },
                        getEffectiveQuantity(item, ingredientIndex),
                      )

                      return (
                        <li key={key} className="today-ingredient-row">
                          <div className="today-ingredient-row__main">
                            <span className="today-ingredient-row__name">
                              {ingredientLabel(ingredient, productsById)}
                            </span>
                            <div className="today-ingredient-row__qty">
                              <label
                                className="visually-hidden"
                                htmlFor={inputId}
                              >
                                כמות בגרם
                              </label>
                              <input
                                id={inputId}
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="any"
                                className="input-ltr today-ingredient-row__qty-input"
                                value={draftValue}
                                onChange={(event) =>
                                  handleQuantityDraftChange(
                                    item.id,
                                    ingredientIndex,
                                    event.target.value,
                                  )
                                }
                                onBlur={(event) =>
                                  commitQuantity(
                                    item.id,
                                    ingredientIndex,
                                    event.target.value,
                                  )
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.currentTarget.blur()
                                  }
                                }}
                                aria-invalid={Boolean(error)}
                                aria-describedby={
                                  error ? errorId : undefined
                                }
                              />
                              <span className="today-ingredient-row__unit">
                                גרם
                              </span>
                            </div>
                            <span className="today-ingredient-row__kcal num">
                              {formatMacro(ingredientNutrition.calories)} קל׳
                            </span>
                          </div>
                          {error ? (
                            <p id={errorId} className="product-field__error">
                              {error}
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}

export default TodayPage
