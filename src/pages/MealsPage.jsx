import { useEffect, useRef, useState } from 'react'
import {
  addMeal,
  defaultQuantityForUnit,
  deleteMeal,
  getMeals,
  getProducts,
  GRAMS_UNIT,
  MEAL_TAG_OPTIONS,
  quantityToGrams,
  updateMeal,
} from '../services/storage.js'
import { getSessionGeneration } from '../services/localState.js'
import {
  isMealIngredient,
} from '../utils/mealTree.js'
import {
  calculateMealNutrition,
  roundForDisplay,
} from '../utils/nutrition.js'

const MEAL_TAGS = [
  { id: 'breakfast', label: 'ארוחת בוקר' },
  { id: 'lunch', label: 'ארוחת צהריים' },
  { id: 'dinner', label: 'ארוחת ערב' },
  { id: 'snack', label: 'נשנוש' },
  { id: 'dessert', label: 'קינוח' },
].filter((tag) => MEAL_TAG_OPTIONS.includes(tag.id))

const TAG_LABELS = Object.fromEntries(
  MEAL_TAGS.map((tag) => [tag.id, tag.label]),
)

const DEFAULT_PRODUCT_QUANTITY = defaultQuantityForUnit(GRAMS_UNIT)

const EMPTY_INGREDIENT = {
  kind: 'product',
  productId: '',
  mealId: '',
  quantity: DEFAULT_PRODUCT_QUANTITY,
  multiplier: '1',
  unitId: GRAMS_UNIT.id,
}

const EMPTY_FORM = {
  name: '',
  tags: [],
  ingredients: [{ ...EMPTY_INGREDIENT }],
}

const PICKER_PREFIX_PRODUCT = 'product:'
const PICKER_PREFIX_MEAL = 'meal:'

/**
 * Survives MealsPage unmount when switching bottom-nav tabs, but never outlives
 * the data session, so a signed-out user's draft can't reach the next user.
 */
let mealFormDraft = null

function clearMealFormDraft() {
  mealFormDraft = null
}

function readMealFormDraft() {
  if (mealFormDraft?.generation !== getSessionGeneration()) return null
  return mealFormDraft.draft
}

function writeMealFormDraft(draft) {
  mealFormDraft = { generation: getSessionGeneration(), draft }
}

function formatMacro(value) {
  const decimals = value % 1 === 0 ? 0 : 1
  const rounded = roundForDisplay(value, decimals)
  return rounded.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })
}

function mealTagsList(meal) {
  if (Array.isArray(meal.tags) && meal.tags.length > 0) {
    return meal.tags
  }
  if (typeof meal.tag === 'string' && meal.tag.trim() !== '') {
    return [meal.tag]
  }
  return []
}

function mealHasTag(meal, tagId) {
  return mealTagsList(meal).includes(tagId)
}

function getProductUnits(product) {
  const custom = Array.isArray(product?.units) ? product.units : []
  return [GRAMS_UNIT, ...custom]
}

function resolveUnit(product, unitId) {
  const units = getProductUnits(product)
  return units.find((unit) => unit.id === unitId) || GRAMS_UNIT
}

/**
 * Select the full quantity so the next keypress replaces it.
 * Defer past click caret placement; text inputs support selection reliably.
 */
function selectQuantityOnFocus(event) {
  const input = event.currentTarget
  const selectAll = () => {
    if (typeof input.select === 'function') {
      input.select()
    }
  }
  selectAll()
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(selectAll)
  } else {
    window.setTimeout(selectAll, 0)
  }
}

/** Keep focus-select from being cleared by the mouseup that follows click. */
function preserveQuantitySelectionOnMouseUp(event) {
  event.preventDefault()
}

function scrollFormToNameField(nameInputId) {
  const content = document.querySelector('.app-content')
  if (content) {
    content.scrollTop = 0
  }

  const input = document.getElementById(nameInputId)
  if (!input) {
    return
  }

  input.focus({ preventScroll: true })
  if (typeof input.scrollIntoView === 'function') {
    input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

function ingredientToForm(item, productsById) {
  if (isMealIngredient(item)) {
    return {
      kind: 'meal',
      productId: '',
      mealId: item.mealId,
      quantity: '',
      multiplier: String(item.mealMultiplier ?? 1),
      unitId: GRAMS_UNIT.id,
    }
  }

  const product = productsById.get(item.productId)
  const storedUnitId =
    typeof item.unitId === 'string' ? item.unitId.trim() : ''
  const hasCustomUnit =
    storedUnitId !== '' && storedUnitId !== GRAMS_UNIT.id

  // Prefer live product.units for qty↔grams so open→save without edits
  // keeps quantityGrams stable if unit grams were later changed on the product.
  // If the unit was removed, fall back to showing grams.
  if (hasCustomUnit) {
    const unitStillExists = getProductUnits(product).some(
      (unit) => unit.id === storedUnitId,
    )
    if (unitStillExists) {
      const liveUnit = resolveUnit(product, storedUnitId)
      const quantity = item.quantityGrams / liveUnit.grams
      return {
        kind: 'product',
        productId: item.productId,
        mealId: '',
        quantity: String(quantity),
        multiplier: '1',
        unitId: storedUnitId,
      }
    }
  }

  return {
    kind: 'product',
    productId: item.productId,
    mealId: '',
    quantity: String(item.quantityGrams),
    multiplier: '1',
    unitId: GRAMS_UNIT.id,
  }
}

function mealToForm(meal, productsById) {
  const tags = mealTagsList(meal).filter((tag) =>
    MEAL_TAG_OPTIONS.includes(tag),
  )
  return {
    name: meal.name,
    tags: tags.length > 0 ? tags : [],
    ingredients:
      Array.isArray(meal.ingredients) && meal.ingredients.length > 0
        ? meal.ingredients.map((item) => ingredientToForm(item, productsById))
        : [{ ...EMPTY_INGREDIENT }],
  }
}

function TagChips({ tags }) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null
  }

  return (
    <span className="tag-chip-row">
      {tags.map((tag) => (
        <span key={tag} className={`tag-chip tag-chip--${tag}`}>
          {TAG_LABELS[tag] || tag}
        </span>
      ))}
    </span>
  )
}

function pickerValueForIngredient(ingredient) {
  if (ingredient.kind === 'meal' && ingredient.mealId) {
    return `${PICKER_PREFIX_MEAL}${ingredient.mealId}`
  }
  if (ingredient.kind === 'product' && ingredient.productId) {
    return `${PICKER_PREFIX_PRODUCT}${ingredient.productId}`
  }
  return ''
}

function pickerLabelForValue(value, productsById, mealsById) {
  if (!value) {
    return ''
  }
  if (value.startsWith(PICKER_PREFIX_MEAL)) {
    const meal = mealsById.get(value.slice(PICKER_PREFIX_MEAL.length))
    return meal ? `🍽️ ${meal.name}` : ''
  }
  if (value.startsWith(PICKER_PREFIX_PRODUCT)) {
    const product = productsById.get(value.slice(PICKER_PREFIX_PRODUCT.length))
    return product ? product.name : ''
  }
  return ''
}

function IngredientComponentPicker({
  id,
  value,
  products,
  meals,
  isMealRow,
  invalid,
  describedBy,
  onPick,
}) {
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const productsById = new Map(products.map((product) => [product.id, product]))
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]))
  const selectedLabel = pickerLabelForValue(value, productsById, mealsById)

  const normalizedQuery = query.trim().toLowerCase()
  const filteredProducts = normalizedQuery
    ? products.filter((item) =>
        item.name.toLowerCase().includes(normalizedQuery),
      )
    : products
  const filteredMeals = normalizedQuery
    ? meals.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
    : meals
  const hasResults = filteredProducts.length > 0 || filteredMeals.length > 0

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  function openPicker() {
    if (!open) {
      setQuery('')
    }
    setOpen(true)
  }

  function handleSelect(nextValue) {
    onPick(nextValue)
    setOpen(false)
    setQuery('')
  }

  const inputClassName = [
    'meal-ingredient-row__product',
    'meal-component-picker__input',
    isMealRow ? 'meal-ingredient-row__product--meal' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="meal-component-picker" ref={rootRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        className={inputClassName}
        value={open ? query : selectedLabel}
        placeholder="בחרו מוצר או ארוחה"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={openPicker}
        onClick={openPicker}
      />
      {open ? (
        <ul
          id={`${id}-listbox`}
          className="meal-component-picker__list"
          role="listbox"
        >
          {!hasResults ? (
            <li className="meal-component-picker__empty">לא נמצאו תוצאות</li>
          ) : null}
          {filteredProducts.length > 0 ? (
            <li className="meal-component-picker__group" role="presentation">
              <span className="meal-component-picker__group-label">מוצרים</span>
              <ul className="meal-component-picker__group-list" role="group">
                {filteredProducts.map((item) => {
                  const optionValue = `${PICKER_PREFIX_PRODUCT}${item.id}`
                  const selected = optionValue === value
                  return (
                    <li key={item.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={
                          selected
                            ? 'meal-component-picker__option meal-component-picker__option--selected'
                            : 'meal-component-picker__option'
                        }
                        onClick={() => handleSelect(optionValue)}
                      >
                        {item.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ) : null}
          {filteredMeals.length > 0 ? (
            <li className="meal-component-picker__group" role="presentation">
              <span className="meal-component-picker__group-label">
                ארוחות שמורות
              </span>
              <ul className="meal-component-picker__group-list" role="group">
                {filteredMeals.map((item) => {
                  const optionValue = `${PICKER_PREFIX_MEAL}${item.id}`
                  const selected = optionValue === value
                  return (
                    <li key={item.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        className={
                          selected
                            ? 'meal-component-picker__option meal-component-picker__option--selected'
                            : 'meal-component-picker__option'
                        }
                        onClick={() => handleSelect(optionValue)}
                      >
                        🍽️ {item.name}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

function buildIngredientPayload(item, productsById) {
  if (item.kind === 'meal') {
    return {
      mealId: item.mealId,
      mealMultiplier: Number(item.multiplier),
    }
  }

  const product = productsById.get(item.productId)
  const unit = resolveUnit(product, item.unitId)
  const quantityGrams = quantityToGrams(item.quantity, unit.grams)

  const payload = {
    productId: item.productId,
    quantityGrams,
  }

  if (unit.id !== GRAMS_UNIT.id) {
    payload.unitId = unit.id
    payload.unitName = unit.name
    payload.unitGrams = unit.grams
  }

  return payload
}

function MealsPage() {
  const [products, setProducts] = useState(() => getProducts())
  const [meals, setMeals] = useState(() => getMeals())
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [view, setView] = useState(() => readMealFormDraft()?.view ?? 'list')
  const [editingId, setEditingId] = useState(
    () => readMealFormDraft()?.editingId ?? null,
  )
  const [form, setForm] = useState(() => {
    const draft = readMealFormDraft()
    if (!draft?.form) {
      return {
        name: '',
        tags: [],
        ingredients: [{ ...EMPTY_INGREDIENT }],
      }
    }
    return {
      name: draft.form.name,
      tags: [...draft.form.tags],
      ingredients: draft.form.ingredients.map((item) => ({ ...item })),
    }
  })
  const [errors, setErrors] = useState(() => readMealFormDraft()?.errors ?? {})

  const productsById = new Map(products.map((product) => [product.id, product]))
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]))

  useEffect(() => {
    if (view !== 'form') {
      return
    }
    writeMealFormDraft({
      view,
      editingId,
      form,
      errors,
    })
  }, [view, editingId, form, errors])

  function refreshMeals() {
    setMeals(getMeals())
  }

  /** Reload products so units added while editing an existing product appear here. */
  function refreshProducts() {
    setProducts(getProducts())
  }

  function openAdd() {
    refreshProducts()
    setMeals(getMeals())
    setEditingId(null)
    setForm({
      name: '',
      tags: [],
      ingredients: [{ ...EMPTY_INGREDIENT }],
    })
    setErrors({})
    setView('form')
  }

  function openEdit(meal) {
    const latestProducts = getProducts()
    const latestMeals = getMeals()
    setProducts(latestProducts)
    setMeals(latestMeals)
    const latestById = new Map(
      latestProducts.map((product) => [product.id, product]),
    )
    setEditingId(meal.id)
    setForm(mealToForm(meal, latestById))
    setErrors({})
    setView('form')
  }

  function closeForm() {
    clearMealFormDraft()
    setView('list')
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  function handleNameChange(event) {
    setForm((current) => ({ ...current, name: event.target.value }))
  }

  function handleTagToggle(tagId) {
    setForm((current) => {
      const hasTag = current.tags.includes(tagId)
      const nextTags = hasTag
        ? current.tags.filter((tag) => tag !== tagId)
        : [...current.tags, tagId]
      return { ...current, tags: nextTags }
    })
    setErrors((current) => {
      if (!current.tags && !current.tag) {
        return current
      }
      const next = { ...current }
      delete next.tags
      delete next.tag
      return next
    })
  }

  function handleAddIngredient() {
    setForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, { ...EMPTY_INGREDIENT }],
    }))
  }

  function handleComponentPick(index, rawValue) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item
        }
        if (!rawValue) {
          return { ...EMPTY_INGREDIENT }
        }
        if (rawValue.startsWith(PICKER_PREFIX_MEAL)) {
          return {
            kind: 'meal',
            productId: '',
            mealId: rawValue.slice(PICKER_PREFIX_MEAL.length),
            quantity: '',
            multiplier: '1',
            unitId: GRAMS_UNIT.id,
          }
        }
        if (rawValue.startsWith(PICKER_PREFIX_PRODUCT)) {
          return {
            kind: 'product',
            productId: rawValue.slice(PICKER_PREFIX_PRODUCT.length),
            mealId: '',
            unitId: GRAMS_UNIT.id,
            quantity: DEFAULT_PRODUCT_QUANTITY,
            multiplier: '1',
          }
        }
        return item
      }),
    }))
  }

  function handleIngredientChange(index, field, value) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item
        }
        if (field === 'unitId') {
          const product = productsById.get(item.productId)
          const unit = resolveUnit(product, value)
          return {
            ...item,
            unitId: value,
            quantity: defaultQuantityForUnit(unit),
          }
        }
        return { ...item, [field]: value }
      }),
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
      tags: form.tags,
      ingredients: form.ingredients.map((item) =>
        buildIngredientPayload(item, productsById),
      ),
    }

    const result = editingId
      ? updateMeal(editingId, payload, products, meals)
      : addMeal(payload, products, meals)

    if (!result.ok) {
      setErrors(result.errors)
      if (result.errors?.name) {
        window.setTimeout(() => scrollFormToNameField('meal-name'), 0)
      }
      return
    }

    clearMealFormDraft()
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
      ingredients: form.ingredients.map((item) =>
        buildIngredientPayload(item, productsById),
      ),
    },
    products,
    meals,
  )

  const normalizedQuery = query.trim().toLowerCase()
  const visibleMeals = meals.filter((meal) => {
    const matchesTag = tagFilter === 'all' || mealHasTag(meal, tagFilter)
    if (!matchesTag) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }
    return meal.name.toLowerCase().includes(normalizedQuery)
  })

  const selectableMeals = meals.filter((meal) => meal.id !== editingId)

  if (view === 'form') {
    const isEdit = Boolean(editingId)
    const ingredientErrors = Array.isArray(errors.ingredients)
      ? errors.ingredients
      : []
    const tagsError = errors.tags || errors.tag
    const hasComponents = products.length > 0 || selectableMeals.length > 0

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
              תגיות ארוחה
            </span>
            <div
              className="meal-tag-chips"
              role="group"
              aria-labelledby="meal-tag-label"
            >
              {MEAL_TAGS.map((tag) => {
                const selected = form.tags.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={
                      selected ? 'meal-chip meal-chip--active' : 'meal-chip'
                    }
                    onClick={() => handleTagToggle(tag.id)}
                    aria-pressed={selected}
                  >
                    {tag.label}
                  </button>
                )
              })}
            </div>
            {tagsError ? (
              <p className="product-field__error">{tagsError}</p>
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

            {!hasComponents ? (
              <p className="meal-ingredients__hint">
                אין מוצרים או ארוחות זמינים. הוסיפו מוצרים בעמוד המוצרים תחילה.
              </p>
            ) : null}

            <ul className="meal-ingredient-list">
              {form.ingredients.map((ingredient, index) => {
                const itemErrors = ingredientErrors[index] || {}
                const productErrorId = `meal-ingredient-product-${index}-error`
                const quantityErrorId = `meal-ingredient-qty-${index}-error`
                const multiplierErrorId = `meal-ingredient-mult-${index}-error`
                const product = productsById.get(ingredient.productId)
                const unitOptions = getProductUnits(product)
                const isMealRow = ingredient.kind === 'meal'
                const nestedMeal = mealsById.get(ingredient.mealId)
                const componentError =
                  itemErrors.productId || itemErrors.mealId

                return (
                  <li
                    key={index}
                    className={
                      isMealRow
                        ? 'meal-ingredient-row meal-ingredient-row--meal'
                        : 'meal-ingredient-row'
                    }
                  >
                    <div className="meal-ingredient-row__main meal-ingredient-row__main--units">
                      <label
                        className="visually-hidden"
                        htmlFor={`meal-ingredient-product-${index}`}
                      >
                        מרכיב
                      </label>
                      <IngredientComponentPicker
                        id={`meal-ingredient-product-${index}`}
                        value={pickerValueForIngredient(ingredient)}
                        products={products}
                        meals={selectableMeals}
                        isMealRow={isMealRow}
                        invalid={Boolean(componentError)}
                        describedBy={
                          componentError ? productErrorId : undefined
                        }
                        onPick={(nextValue) =>
                          handleComponentPick(index, nextValue)
                        }
                      />

                      {isMealRow ? (
                        <div className="meal-ingredient-row__qty meal-ingredient-row__qty--with-select">
                          <label
                            className="visually-hidden"
                            htmlFor={`meal-ingredient-mult-${index}`}
                          >
                            מכפיל ארוחה
                          </label>
                          <input
                            id={`meal-ingredient-mult-${index}`}
                            type="text"
                            inputMode="decimal"
                            className="input-ltr meal-ingredient-row__qty-input"
                            value={ingredient.multiplier}
                            onChange={(event) =>
                              handleIngredientChange(
                                index,
                                'multiplier',
                                event.target.value,
                              )
                            }
                            onFocus={selectQuantityOnFocus}
                            onClick={selectQuantityOnFocus}
                            onMouseUp={preserveQuantitySelectionOnMouseUp}
                            placeholder="1"
                            aria-invalid={Boolean(itemErrors.mealMultiplier)}
                            aria-describedby={
                              itemErrors.mealMultiplier
                                ? multiplierErrorId
                                : undefined
                            }
                          />
                          <span className="meal-ingredient-row__unit">
                            × מכפיל
                          </span>
                        </div>
                      ) : (
                        <div className="meal-ingredient-row__qty meal-ingredient-row__qty--with-select">
                          <label
                            className="visually-hidden"
                            htmlFor={`meal-ingredient-qty-${index}`}
                          >
                            כמות
                          </label>
                          <input
                            id={`meal-ingredient-qty-${index}`}
                            type="text"
                            inputMode="decimal"
                            className="input-ltr meal-ingredient-row__qty-input"
                            value={ingredient.quantity}
                            onChange={(event) =>
                              handleIngredientChange(
                                index,
                                'quantity',
                                event.target.value,
                              )
                            }
                            onFocus={selectQuantityOnFocus}
                            onClick={selectQuantityOnFocus}
                            onMouseUp={preserveQuantitySelectionOnMouseUp}
                            placeholder={DEFAULT_PRODUCT_QUANTITY}
                            aria-invalid={Boolean(itemErrors.quantityGrams)}
                            aria-describedby={
                              itemErrors.quantityGrams
                                ? quantityErrorId
                                : undefined
                            }
                          />
                          <label
                            className="visually-hidden"
                            htmlFor={`meal-ingredient-unit-${index}`}
                          >
                            יחידה
                          </label>
                          <select
                            id={`meal-ingredient-unit-${index}`}
                            className="meal-ingredient-row__unit-select"
                            value={ingredient.unitId}
                            onChange={(event) =>
                              handleIngredientChange(
                                index,
                                'unitId',
                                event.target.value,
                              )
                            }
                            disabled={!ingredient.productId}
                          >
                            {unitOptions.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <button
                        type="button"
                        className="meal-ingredient-row__remove"
                        onClick={() => handleRemoveIngredient(index)}
                        aria-label="הסרת מרכיב"
                      >
                        ×
                      </button>
                    </div>

                    {isMealRow && nestedMeal ? (
                      <p className="meal-ingredient-row__meal-hint">
                        ארוחה שמורה · הערכים התזונתיים מחושבים לפי המכפיל
                      </p>
                    ) : null}

                    {componentError ? (
                      <p id={productErrorId} className="product-field__error">
                        {componentError}
                      </p>
                    ) : null}
                    {itemErrors.quantityGrams ? (
                      <p id={quantityErrorId} className="product-field__error">
                        {itemErrors.quantityGrams}
                      </p>
                    ) : null}
                    {itemErrors.mealMultiplier ? (
                      <p id={multiplierErrorId} className="product-field__error">
                        {itemErrors.mealMultiplier}
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
        <div className="empty-state">
          <span className="empty-state__emoji" aria-hidden="true">
            🍽️
          </span>
          <p>
            {meals.length === 0
              ? 'עוד לא שמרת ארוחות'
              : 'לא נמצאו ארוחות התואמות לחיפוש או לסינון.'}
          </p>
        </div>
      ) : (
        <ul className="meal-list">
          {visibleMeals.map((meal) => {
            const nutrition = calculateMealNutrition(meal, products, meals)
            const tags = mealTagsList(meal)
            const nestedCount = Array.isArray(meal.ingredients)
              ? meal.ingredients.filter((item) => isMealIngredient(item)).length
              : 0

            return (
              <li key={meal.id} className="meal-card">
                <div className="meal-card__body">
                  <div className="meal-card__info">
                    <span className="meal-card__name">{meal.name}</span>
                    <TagChips tags={tags} />
                    {nestedCount > 0 ? (
                      <span className="meal-card__nested">
                        כוללת {nestedCount} ארוחות מקוננות
                      </span>
                    ) : null}
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
