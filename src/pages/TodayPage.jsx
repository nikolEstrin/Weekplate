import { useLayoutEffect, useRef, useState } from 'react'
import BalanceDaySheet from '../components/BalanceDaySheet.jsx'
import MealSwapSheet from '../components/MealSwapSheet.jsx'
import {
  addMealToDayPlan,
  addProductToDayPlan,
  copyDayPlan,
  defaultQuantityForUnit,
  flattenDayPlan,
  getDayPlan,
  getGoals,
  getLocalDateKey,
  getMeals,
  getProducts,
  getRecommendedSlots,
  GRAMS_UNIT,
  isDayPlanEmpty,
  quantityToGrams,
  removePlannerItem,
  replacePlannerMealItem,
  SLOT_IDS,
  summarizeDayPlan,
  tagToRecommendedSlot,
  updatePlannerItemQuantity,
  updatePlannerMealMultiplier,
} from '../services/storage.js'
import {
  BALANCE_ACTION_REDUCE_QUANTITY,
  BALANCE_ACTION_REPLACE_MEAL,
  canReplaceWholeMeal,
  recommendBalanceDaySwaps,
} from '../services/smartMealSwap.js'
import {
  calculateMealNutrition,
  calculatePlannerNutrition,
  calculateProductNutrition,
  getCalorieStatus,
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
  { id: 'dessert', label: 'קינוח' },
]

const TAG_LABELS = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'נשנוש',
  dessert: 'קינוח',
}

const SLOT_LABELS = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'נשנוש',
}

const SLOT_SECTIONS = [
  { id: 'breakfast', title: 'ארוחת בוקר', kind: 'primary', emoji: '🥑' },
  { id: 'lunch', title: 'ארוחת צהריים', kind: 'primary', emoji: '🥗' },
  { id: 'dinner', title: 'ארוחת ערב', kind: 'primary', emoji: '🥦' },
  { id: 'snacks', title: 'נשנושים', kind: 'snacks', emoji: '🍓' },
]

const HEBREW_WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function formatDisplay(value) {
  const decimals = value !== 0 && Math.abs(value) < 10 ? 1 : 0
  const rounded = roundForDisplay(value, decimals)
  return rounded.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })
}

function formatMacro(value) {
  const decimals = value % 1 === 0 ? 0 : 1
  const rounded = roundForDisplay(value, decimals)
  return rounded.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })
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

function parseDateKey(dateKey) {
  const parts = String(dateKey).split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return new Date()
  }
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function getWeekStartKey(dateKey) {
  const date = parseDateKey(dateKey)
  const weekStart = addDays(date, -date.getDay())
  return getLocalDateKey(weekStart)
}

function getWeekDayKeys(weekStartKey) {
  const start = parseDateKey(weekStartKey)
  return Array.from({ length: 7 }, (_, index) =>
    getLocalDateKey(addDays(start, index)),
  )
}

function formatDateLabel(dateKey) {
  const date = parseDateKey(dateKey)
  return date.toLocaleDateString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function mealTags(meal) {
  if (Array.isArray(meal.tags) && meal.tags.length > 0) {
    return meal.tags
  }
  if (typeof meal.tag === 'string' && meal.tag.trim() !== '') {
    return [meal.tag]
  }
  return []
}

/** Slots recommended from tags only (not the full SLOT_IDS padding). */
function highlightedSlotsFromTags(tags) {
  const ordered = []
  const seen = new Set()
  for (const tag of tags) {
    const slot = tagToRecommendedSlot(tag)
    if (!slot || seen.has(slot)) {
      continue
    }
    seen.add(slot)
    ordered.push(slot)
  }
  return ordered
}

function TagChips({ tags, fallback }) {
  if (Array.isArray(tags) && tags.length > 0) {
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

  if (fallback) {
    return (
      <span className={`tag-chip tag-chip--${fallback}`}>
        {TAG_LABELS[fallback] || fallback}
      </span>
    )
  }

  return null
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

function getProductUnits(product) {
  const custom = Array.isArray(product?.units) ? product.units : []
  return [GRAMS_UNIT, ...custom]
}

function resolveUnit(product, unitId) {
  const units = getProductUnits(product)
  return units.find((unit) => unit.id === unitId) || GRAMS_UNIT
}

/**
 * Frozen unit metadata on a planner ingredient (UI only).
 * Falls back to grams when missing or invalid.
 */
function displayUnitForIngredient(ingredient) {
  const unitId =
    typeof ingredient?.unitId === 'string' ? ingredient.unitId.trim() : ''
  const unitGrams = Number(ingredient?.unitGrams)
  const unitName =
    typeof ingredient?.unitName === 'string' ? ingredient.unitName.trim() : ''

  if (
    unitId !== '' &&
    unitId !== GRAMS_UNIT.id &&
    Number.isFinite(unitGrams) &&
    unitGrams > 0
  ) {
    return {
      id: unitId,
      name: unitName || unitId,
      grams: unitGrams,
    }
  }

  return GRAMS_UNIT
}

function formatQuantityInUnit(quantityGrams, unit) {
  const grams = Number(quantityGrams)
  if (!Number.isFinite(grams)) {
    return ''
  }
  if (!unit || unit.id === GRAMS_UNIT.id) {
    return String(grams)
  }
  const quantity = grams / unit.grams
  if (!Number.isFinite(quantity)) {
    return ''
  }
  const rounded = Math.round(quantity * 1000) / 1000
  return String(rounded)
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

function formatMultiplier(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return '1.00'
  }
  return number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function PlannerItemCard({
  item,
  displayItem,
  products,
  productsById,
  quantityDrafts,
  itemErrors,
  multiplierDrafts,
  multiplierErrors,
  expandedMealIds,
  onToggleIngredients,
  onQuantityDraftChange,
  onCommitQuantity,
  onMultiplierDraftChange,
  onCommitMultiplier,
  onStepMultiplier,
  onRemove,
  onSwap,
}) {
  const nutrition = calculatePlannerNutrition([displayItem], products)
  const isMeal = item.type === 'meal'
  const ingredientsExpanded = !isMeal || expandedMealIds.has(item.id)
  const multiplierValue = Object.prototype.hasOwnProperty.call(
    multiplierDrafts,
    item.id,
  )
    ? multiplierDrafts[item.id]
    : formatMultiplier(item.mealMultiplier ?? 1)
  const multiplierError = multiplierErrors[item.id]
  const tags = mealTags(item)

  function draftKey(ingredientIndex) {
    return `${item.id}:${ingredientIndex}`
  }

  function getQuantityDraft(ingredientIndex) {
    const key = draftKey(ingredientIndex)
    if (Object.prototype.hasOwnProperty.call(quantityDrafts, key)) {
      return quantityDrafts[key]
    }
    const ingredient = item.ingredients[ingredientIndex]
    return formatQuantityInUnit(
      ingredient.quantityGrams,
      displayUnitForIngredient(ingredient),
    )
  }

  function getEffectiveQuantityGrams(ingredientIndex) {
    const ingredient = item.ingredients[ingredientIndex]
    const unit = displayUnitForIngredient(ingredient)
    const draft = getQuantityDraft(ingredientIndex)
    const parsed = Number(typeof draft === 'string' ? draft.trim() : draft)
    if (Number.isFinite(parsed) && parsed > 0) {
      return quantityToGrams(parsed, unit.grams)
    }
    return ingredient.quantityGrams
  }

  return (
    <li className="today-item-card">
      <div className="today-item-card__top">
        <div className="today-item-card__info">
          {isMeal && tags.length > 0 ? (
            <TagChips tags={tags} />
          ) : item.type === 'product' ? (
            <span className="tag-chip tag-chip--product">מוצר</span>
          ) : null}
          <span className="today-item-card__name">{item.name}</span>
          {isMeal ? (
            <span className="today-item-card__multiplier-label">
              כמות ארוחה ×{' '}
              <Num>{formatMultiplier(item.mealMultiplier ?? 1)}</Num>
            </span>
          ) : null}
          <NutritionSummary nutrition={nutrition} />
        </div>
        <button
          type="button"
          className="today-item-card__delete"
          onClick={() => onRemove(item.id)}
        >
          מחיקה
        </button>
      </div>

      {isMeal ? (
        <div className="meal-multiplier">
          <label
            className="meal-multiplier__label"
            htmlFor={`meal-multiplier-${item.id}`}
          >
            כמות ארוחה
          </label>
          <div className="meal-multiplier__controls">
            <button
              type="button"
              className="meal-multiplier__step"
              onClick={() => onStepMultiplier(item.id, -0.25)}
              aria-label="הקטנת כמות ארוחה"
            >
              −
            </button>
            <input
              id={`meal-multiplier-${item.id}`}
              type="number"
              inputMode="decimal"
              min="0.25"
              step="0.25"
              className="input-ltr meal-multiplier__input"
              value={multiplierValue}
              onChange={(event) =>
                onMultiplierDraftChange(item.id, event.target.value)
              }
              onBlur={(event) =>
                onCommitMultiplier(item.id, event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onCommitMultiplier(item.id, event.currentTarget.value)
                  event.currentTarget.blur()
                }
              }}
              aria-invalid={Boolean(multiplierError)}
            />
            <button
              type="button"
              className="meal-multiplier__step"
              onClick={() => onStepMultiplier(item.id, 0.25)}
              aria-label="הגדלת כמות ארוחה"
            >
              +
            </button>
          </div>
          {multiplierError ? (
            <p className="product-field__error">{multiplierError}</p>
          ) : null}
        </div>
      ) : null}

      {isMeal ? (
        <div className="today-item-card__actions">
          <button
            type="button"
            className="today-item-card__expand"
            onClick={() => onToggleIngredients(item.id)}
            aria-expanded={ingredientsExpanded}
          >
            ✎ עריכה
          </button>
          {canReplaceWholeMeal(item) ? (
            <button
              type="button"
              className="today-item-card__swap"
              onClick={() => onSwap(item)}
            >
              🔄 החלפה
            </button>
          ) : null}
        </div>
      ) : null}

      {ingredientsExpanded ? (
        <ul className="today-ingredient-list">
          {item.ingredients.map((ingredient, ingredientIndex) => {
            const key = draftKey(ingredientIndex)
            const draftValue = getQuantityDraft(ingredientIndex)
            const error = itemErrors[key]
            const inputId = `today-qty-${item.id}-${ingredientIndex}`
            const errorId = `${inputId}-error`
            const unit = displayUnitForIngredient(ingredient)
            const quantityGrams = getEffectiveQuantityGrams(ingredientIndex)
            const ingredientNutrition = calculateProductNutrition(
              productsById.get(ingredient.productId) || {
                caloriesPer100g: ingredient.caloriesPer100g,
                proteinPer100g: ingredient.proteinPer100g,
                carbsPer100g: ingredient.carbsPer100g,
                fatPer100g: ingredient.fatPer100g,
              },
              quantityGrams,
            )

            return (
              <li key={key} className="today-ingredient-row">
                <div className="today-ingredient-row__main">
                  <span className="today-ingredient-row__name">
                    {ingredientLabel(ingredient, productsById)}
                  </span>
                  <div className="today-ingredient-row__qty">
                    <label className="visually-hidden" htmlFor={inputId}>
                      {`כמות ב${unit.name}`}
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
                        onQuantityDraftChange(
                          item.id,
                          ingredientIndex,
                          event.target.value,
                        )
                      }
                      onFocus={selectQuantityOnFocus}
                      onClick={selectQuantityOnFocus}
                      onMouseUp={preserveQuantitySelectionOnMouseUp}
                      onBlur={(event) =>
                        onCommitQuantity(
                          item.id,
                          ingredientIndex,
                          event.target.value,
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          onCommitQuantity(
                            item.id,
                            ingredientIndex,
                            event.currentTarget.value,
                          )
                          event.currentTarget.blur()
                        }
                      }}
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? errorId : undefined}
                    />
                    <span className="today-ingredient-row__unit">
                      {unit.name}
                    </span>
                  </div>
                  <span className="today-ingredient-row__kcal">
                    <Num>{formatMacro(ingredientNutrition.calories)}</Num>
                    {' קל׳'}
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
      ) : null}
    </li>
  )
}

function TodayPage({ selectedDateKey, onSelectedDateChange }) {
  const todayKey = getLocalDateKey()
  const [goals] = useState(() => getGoals())
  const [products, setProducts] = useState(() => getProducts())
  const [meals] = useState(() => getMeals())
  const [weekStartKey, setWeekStartKey] = useState(() =>
    getWeekStartKey(selectedDateKey),
  )
  const [dayPlan, setDayPlan] = useState(() => getDayPlan(selectedDateKey))

  const [view, setView] = useState('today')
  const [addTab, setAddTab] = useState('meals')
  const [mealQuery, setMealQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('all')
  const [productQuery, setProductQuery] = useState('')
  const [productQuantities, setProductQuantities] = useState({})
  const [productUnits, setProductUnits] = useState({})
  const [quantityDrafts, setQuantityDrafts] = useState({})
  const [productErrors, setProductErrors] = useState({})
  const [itemErrors, setItemErrors] = useState({})
  const [multiplierDrafts, setMultiplierDrafts] = useState({})
  const [multiplierErrors, setMultiplierErrors] = useState({})
  const [expandedMealIds, setExpandedMealIds] = useState(() => new Set())
  const [pendingAdd, setPendingAdd] = useState(null)
  const [preferredSlot, setPreferredSlot] = useState(null)
  const [copyDestKey, setCopyDestKey] = useState('')
  const [copyError, setCopyError] = useState('')
  const [copyReplaceSummary, setCopyReplaceSummary] = useState([])
  const [swapItemId, setSwapItemId] = useState(null)
  const [balanceSheetOpen, setBalanceSheetOpen] = useState(false)

  const dateInputRef = useRef(null)
  const copyDateInputRef = useRef(null)
  const nutritionSentinelRef = useRef(null)
  const nutritionGridRef = useRef(null)

  useLayoutEffect(() => {
    const sentinel = nutritionSentinelRef.current
    const grid = nutritionGridRef.current
    const root = sentinel?.closest('.app-content')
    if (!sentinel || !grid || !root) {
      return undefined
    }

    const cards = Array.from(grid.querySelectorAll('.nutrition-card'))
    const shrinkRange = 180

    cards.forEach((card) => {
      card.style.width = ''
      card.style.height = ''
      card.style.insetInlineStart = ''
      card.style.insetBlockStart = ''
    })
    grid.style.height = ''

    function lerp(from, to, progress) {
      return from + (to - from) * progress
    }

    function pinPoint() {
      const rootTop = root.getBoundingClientRect().top
      const sentinelTop = sentinel.getBoundingClientRect().top
      return sentinelTop - rootTop + root.scrollTop
    }

    function update() {
      const progress = Math.min(
        1,
        Math.max(0, (root.scrollTop - pinPoint()) / shrinkRange),
      )
      const compact = progress >= 0.72
      const sizeProgress = Math.min(1, progress / 0.72)

      grid.dataset.compact = compact ? 'true' : 'false'
      grid.style.setProperty('--macro-p', String(progress))
      grid.style.setProperty('--card-gap', `${lerp(12, 6, sizeProgress)}px`)
      grid.style.setProperty('--card-label-size', `${lerp(0.8, 0.68, sizeProgress)}rem`)
      grid.style.setProperty(
        '--card-value-size',
        `${lerp(1.05, 0.58, sizeProgress)}rem`,
      )
      grid.style.setProperty('--card-unit-size', `${lerp(0.8, 0.68, sizeProgress)}rem`)
      grid.style.setProperty('--card-label-gap', `${lerp(8, 2, sizeProgress)}px`)
      grid.style.setProperty('--card-radius', `${lerp(18, 14, sizeProgress)}px`)
      grid.style.setProperty('--card-pad-y', `${lerp(12, 8, sizeProgress)}px`)
      grid.style.setProperty('--card-pad-b', `${lerp(16, 8, sizeProgress)}px`)
      grid.style.setProperty('--card-pad-x', `${lerp(12, 4, sizeProgress)}px`)
    }

    update()
    root.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      root.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  const productsById = new Map(products.map((product) => [product.id, product]))
  const isSelectedToday = selectedDateKey === todayKey
  const weekDayKeys = getWeekDayKeys(weekStartKey)
  const plannerItems = flattenDayPlan(dayPlan)
  const sourcePlanEmpty = isDayPlanEmpty(dayPlan)

  function refreshPlan(dateKey = selectedDateKey) {
    setDayPlan(getDayPlan(dateKey))
  }

  function selectDate(dateKey) {
    const nextKey =
      typeof dateKey === 'string' && dateKey.trim() !== ''
        ? dateKey.trim()
        : todayKey
    onSelectedDateChange(nextKey)
    setWeekStartKey(getWeekStartKey(nextKey))
    setDayPlan(getDayPlan(nextKey))
    setQuantityDrafts({})
    setItemErrors({})
    setMultiplierDrafts({})
    setMultiplierErrors({})
  }

  function shiftWeek(direction) {
    const nextStart = addDays(parseDateKey(weekStartKey), direction * 7)
    const nextStartKey = getLocalDateKey(nextStart)
    setWeekStartKey(nextStartKey)
  }

  function goToToday() {
    selectDate(todayKey)
  }

  function openCalendarPicker(inputRef = dateInputRef) {
    const input = inputRef.current
    if (!input) {
      return
    }
    // Prefer showPicker when available (desktop + modern mobile).
    // Fall back to focus/click for browsers that reject programmatic open.
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // Fall through.
      }
    }
    input.focus()
    input.click()
  }

  function openCopyDay() {
    setCopyDestKey('')
    setCopyError('')
    setCopyReplaceSummary([])
    setView('copy')
  }

  function closeCopyDay() {
    setView('today')
    setCopyDestKey('')
    setCopyError('')
    setCopyReplaceSummary([])
  }

  function handleCopyDay(options = {}) {
    const result = copyDayPlan(selectedDateKey, copyDestKey, options)

    if (result.needsReplace) {
      setCopyReplaceSummary(
        Array.isArray(result.summary) ? result.summary : summarizeDayPlan(result.existing),
      )
      setCopyError('')
      setView('copy-confirm')
      return
    }

    if (!result.ok) {
      setCopyError(
        result.errors?.destination || 'לא ניתן להעתיק את היום',
      )
      return
    }

    selectDate(result.destinationDateKey || copyDestKey)
    closeCopyDay()
  }

  function openAdd(slotHint = null) {
    setProducts(getProducts())
    setAddTab('meals')
    setMealQuery('')
    setTagFilter('all')
    setProductQuery('')
    setProductQuantities({})
    setProductUnits({})
    setProductErrors({})
    setPendingAdd(null)
    setPreferredSlot(slotHint)
    setView('add')
  }

  function closeAdd() {
    setView('today')
    setProductErrors({})
    setPendingAdd(null)
    setPreferredSlot(null)
  }

  function openSlotPicker(nextPending) {
    setPendingAdd(nextPending)
    setView('slot')
  }

  function clearItemDrafts(itemId) {
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
  }

  function applyAddResult(result) {
    if (result.ok) {
      refreshPlan()
      closeAdd()
      return
    }

    return result
  }

  function handleAddMealToSlot(meal, slot) {
    const result = addMealToDayPlan(selectedDateKey, meal, slot, products)
    const error = applyAddResult(result)
    if (error && !error.ok) {
      window.alert(
        error.errors?.meal ||
          error.errors?.ingredients ||
          error.errors?.name ||
          error.errors?.slot ||
          'לא ניתן להוסיף את הארוחה',
      )
    }
  }

  function handleAddProductToSlot(product, quantityGrams, slot, unitOptions = {}) {
    const result = addProductToDayPlan(
      selectedDateKey,
      product,
      quantityGrams,
      slot,
      unitOptions,
    )

    if (result.ok) {
      refreshPlan()
      closeAdd()
      return
    }

    setProductErrors((current) => ({
      ...current,
      [product.id]:
        result.errors.quantityGrams ||
        result.errors.product ||
        result.errors.name ||
        result.errors.slot ||
        'לא ניתן להוסיף את המוצר',
    }))
    setView('add')
    setAddTab('products')
  }

  function handlePickMeal(meal) {
    if (preferredSlot) {
      handleAddMealToSlot(meal, preferredSlot)
      return
    }

    openSlotPicker({
      kind: 'meal',
      meal,
      recommendedSlots: getRecommendedSlots(mealTags(meal)),
    })
  }

  function getProductQuantity(productId) {
    const draft = productQuantities[productId]
    if (draft !== undefined) {
      return draft
    }
    const unit = resolveUnit(
      productsById.get(productId),
      getProductUnitId(productId),
    )
    return defaultQuantityForUnit(unit)
  }

  function getProductUnitId(productId) {
    const draft = productUnits[productId]
    if (draft !== undefined) {
      return draft
    }
    return GRAMS_UNIT.id
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

  function handleProductUnitChange(productId, unitId) {
    const product = productsById.get(productId)
    const unit = resolveUnit(product, unitId)
    setProductUnits((current) => ({ ...current, [productId]: unitId }))
    setProductQuantities((current) => ({
      ...current,
      [productId]: defaultQuantityForUnit(unit),
    }))
    setProductErrors((current) => {
      if (!current[productId]) {
        return current
      }
      const next = { ...current }
      delete next[productId]
      return next
    })
  }

  function resolveProductGrams(product) {
    const quantityValue = getProductQuantity(product.id)
    const unit = resolveUnit(product, getProductUnitId(product.id))
    return quantityToGrams(quantityValue, unit.grams)
  }

  function productUnitOptions(product) {
    const unit = resolveUnit(product, getProductUnitId(product.id))
    if (unit.id === GRAMS_UNIT.id) {
      return {}
    }
    return {
      unitId: unit.id,
      unitName: unit.name,
      unitGrams: unit.grams,
    }
  }

  function handlePickProduct(product) {
    const grams = resolveProductGrams(product)
    if (!Number.isFinite(grams) || grams <= 0) {
      setProductErrors((current) => ({
        ...current,
        [product.id]: 'הכמות חייבת להיות גדולה מאפס',
      }))
      return
    }

    const unitOptions = productUnitOptions(product)

    if (preferredSlot) {
      handleAddProductToSlot(product, grams, preferredSlot, unitOptions)
      return
    }

    openSlotPicker({
      kind: 'product',
      product,
      quantityValue: grams,
      unitOptions,
      recommendedSlots: [
        'snack',
        ...SLOT_IDS.filter((slot) => slot !== 'snack'),
      ],
    })
  }

  function handleSelectSlot(slot) {
    if (!pendingAdd) {
      return
    }

    if (pendingAdd.kind === 'meal') {
      handleAddMealToSlot(pendingAdd.meal, slot)
      return
    }

    handleAddProductToSlot(
      pendingAdd.product,
      pendingAdd.quantityValue,
      slot,
      pendingAdd.unitOptions || {},
    )
  }

  function draftKey(itemId, ingredientIndex) {
    return `${itemId}:${ingredientIndex}`
  }

  function getEffectiveQuantity(item, ingredientIndex) {
    const ingredient = item.ingredients[ingredientIndex]
    const unit = displayUnitForIngredient(ingredient)
    const key = draftKey(item.id, ingredientIndex)
    if (Object.prototype.hasOwnProperty.call(quantityDrafts, key)) {
      const draft = quantityDrafts[key]
      const parsed = Number(typeof draft === 'string' ? draft.trim() : draft)
      if (Number.isFinite(parsed) && parsed > 0) {
        return quantityToGrams(parsed, unit.grams)
      }
    }
    return ingredient.quantityGrams
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
    const item = plannerItems.find((entry) => entry.id === itemId)
    const ingredient = item?.ingredients?.[ingredientIndex]
    const unit = displayUnitForIngredient(ingredient)
    const grams = quantityToGrams(rawValue, unit.grams)
    const result = updatePlannerItemQuantity(
      selectedDateKey,
      itemId,
      ingredientIndex,
      grams,
    )

    if (!result.ok) {
      setItemErrors((current) => ({
        ...current,
        [key]: result.errors.quantityGrams || 'כמות לא תקינה',
      }))
      return
    }

    clearQuantityDraft(key)
    clearItemError(key)
    refreshPlan()
  }

  function handleMultiplierDraftChange(itemId, value) {
    setMultiplierDrafts((current) => ({ ...current, [itemId]: value }))
    setMultiplierErrors((current) => {
      if (!current[itemId]) {
        return current
      }
      const next = { ...current }
      delete next[itemId]
      return next
    })
  }

  function commitMultiplier(itemId, rawValue) {
    const result = updatePlannerMealMultiplier(
      selectedDateKey,
      itemId,
      rawValue,
    )

    if (!result.ok) {
      setMultiplierErrors((current) => ({
        ...current,
        [itemId]:
          result.errors.mealMultiplier ||
          result.errors.id ||
          'מכפיל לא תקין',
      }))
      return
    }

    setMultiplierDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, itemId)) {
        return current
      }
      const next = { ...current }
      delete next[itemId]
      return next
    })
    setMultiplierErrors((current) => {
      if (!current[itemId]) {
        return current
      }
      const next = { ...current }
      delete next[itemId]
      return next
    })
    refreshPlan()
  }

  function stepMultiplier(itemId, delta) {
    const item = plannerItems.find((entry) => entry.id === itemId)
    if (!item || item.type !== 'meal') {
      return
    }

    const current = Number(item.mealMultiplier ?? 1)
    const base = Number.isFinite(current) ? current : 1
    const next = Math.round((base + delta) * 100) / 100
    if (next <= 0) {
      setMultiplierErrors((currentErrors) => ({
        ...currentErrors,
        [itemId]: 'המכפיל חייב להיות גדול מאפס',
      }))
      return
    }

    commitMultiplier(itemId, next)
  }

  function toggleIngredients(itemId) {
    setExpandedMealIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  function handleRemoveItem(itemId) {
    const confirmed = window.confirm(
      isSelectedToday ? 'להסיר מהיום?' : 'להסיר מיום זה?',
    )
    if (!confirmed) {
      return
    }

    removePlannerItem(selectedDateKey, itemId)
    clearItemDrafts(itemId)
    refreshPlan()
  }

  function handleOpenSwap(item) {
    if (!item || !canReplaceWholeMeal(item)) {
      return
    }
    setBalanceSheetOpen(false)
    setSwapItemId(item.id)
  }

  function handleCloseSwap() {
    setSwapItemId(null)
  }

  function handleConfirmSwap(alternative) {
    if (!swapItem || !alternative) {
      return { ok: false }
    }

    // Accept recommendation object { meal, quantity } or a bare meal.
    const replacementMeal =
      alternative.meal && typeof alternative.meal === 'object'
        ? alternative.meal
        : alternative
    if (!replacementMeal || typeof replacementMeal !== 'object') {
      return { ok: false }
    }

    const result = replacePlannerMealItem(
      selectedDateKey,
      swapItem.id,
      replacementMeal,
      products,
      meals,
    )
    if (!result.ok) {
      return result
    }

    // Preserve the chosen instance quantity (createMealSnapshot defaults to 1).
    const replacementQuantity = Number(alternative.quantity)
    if (
      Number.isFinite(replacementQuantity) &&
      replacementQuantity > 0 &&
      replacementQuantity !== 1
    ) {
      const multiplierResult = updatePlannerMealMultiplier(
        selectedDateKey,
        swapItem.id,
        replacementQuantity,
      )
      if (!multiplierResult.ok) {
        return multiplierResult
      }
    }

    setMultiplierDrafts((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, swapItem.id)) {
        return current
      }
      const next = { ...current }
      delete next[swapItem.id]
      return next
    })
    refreshPlan()
    return { ok: true }
  }

  function handleOpenBalanceSheet() {
    setSwapItemId(null)
    setBalanceSheetOpen(true)
  }

  function handleCloseBalanceSheet() {
    setBalanceSheetOpen(false)
  }

  function handleConfirmBalanceAction(entry) {
    if (!entry || !entry.plannerItemId) {
      return { ok: false }
    }

    if (entry.actionType === BALANCE_ACTION_REDUCE_QUANTITY) {
      const result = updatePlannerMealMultiplier(
        selectedDateKey,
        entry.plannerItemId,
        entry.suggestedQuantity,
      )
      if (result.ok) {
        setMultiplierDrafts((current) => {
          if (!Object.prototype.hasOwnProperty.call(current, entry.plannerItemId)) {
            return current
          }
          const next = { ...current }
          delete next[entry.plannerItemId]
          return next
        })
        setMultiplierErrors((current) => {
          if (!current[entry.plannerItemId]) {
            return current
          }
          const next = { ...current }
          delete next[entry.plannerItemId]
          return next
        })
        refreshPlan()
      }
      return result
    }

    if (entry.actionType === BALANCE_ACTION_REPLACE_MEAL) {
      const replacementMeal = entry.replacement?.meal
      if (!replacementMeal) {
        return { ok: false }
      }

      const replaceResult = replacePlannerMealItem(
        selectedDateKey,
        entry.plannerItemId,
        replacementMeal,
        products,
        meals,
      )
      if (!replaceResult.ok) {
        return replaceResult
      }

      const replacementQuantity = Number(entry.replacementQuantity)
      if (Number.isFinite(replacementQuantity) && replacementQuantity > 0 && replacementQuantity !== 1) {
        const multiplierResult = updatePlannerMealMultiplier(
          selectedDateKey,
          entry.plannerItemId,
          replacementQuantity,
        )
        if (!multiplierResult.ok) {
          return multiplierResult
        }
      }

      setMultiplierDrafts((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, entry.plannerItemId)) {
          return current
        }
        const next = { ...current }
        delete next[entry.plannerItemId]
        return next
      })
      refreshPlan()
      return { ok: true }
    }

    return { ok: false }
  }

  const displayPlanner = plannerWithDrafts(plannerItems)
  const displayById = new Map(
    displayPlanner.map((item) => [item.id, item]),
  )
  const current = calculatePlannerNutrition(displayPlanner, products)
  const remaining = remainingNutrition(current, goals)
  const calorieStatus = getCalorieStatus(
    current.calories,
    goals.calories,
    goals.allowedCalorieOverage,
  )
  const caloriesOverLimit = calorieStatus.isOverLimit
  const caloriesWithinTolerance = calorieStatus.isWithinTolerance
  const caloriesOverBy = calorieStatus.actualExcess
  const swapItem =
    typeof swapItemId === 'string'
      ? plannerItems.find(
          (entry) => entry.id === swapItemId && canReplaceWholeMeal(entry),
        ) || null
      : null

  const replaceableMeals = []
  for (const section of SLOT_SECTIONS) {
    const items =
      section.kind === 'primary'
        ? Array.isArray(dayPlan[section.id])
          ? dayPlan[section.id]
          : []
        : Array.isArray(dayPlan.snacks)
          ? dayPlan.snacks
          : []
    const slotId = section.kind === 'primary' ? section.id : 'snack'
    for (const item of items) {
      if (!item || item.type !== 'meal') {
        continue
      }
      replaceableMeals.push({
        item: displayById.get(item.id) || item,
        slotId,
        slotLabel: section.title,
      })
    }
  }

  const balanceSuggestions = caloriesOverLimit
    ? recommendBalanceDaySwaps({
        replaceableMeals,
        allAvailableMeals: meals,
        currentDayNutrition: current,
        dailyTargets: goals,
        products,
        meals,
        limit: 3,
      })
    : {
        recommendations: [],
        calorieExcess: 0,
        dayCalories: current.calories,
        targetCalories: goals.calories,
        effectiveCalorieLimit: calorieStatus.effectiveCalorieLimit,
      }

  const normalizedMealQuery = mealQuery.trim().toLowerCase()
  const visibleMeals = meals.filter((meal) => {
    const tags = mealTags(meal)
    const matchesTag =
      tagFilter === 'all' || tags.includes(tagFilter)
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

  const slotOptions =
    pendingAdd && Array.isArray(pendingAdd.recommendedSlots)
      ? pendingAdd.recommendedSlots
      : preferredSlot
        ? [preferredSlot, ...SLOT_IDS.filter((slot) => slot !== preferredSlot)]
        : [...SLOT_IDS]

  let recommendedSet = new Set()
  if (pendingAdd?.kind === 'meal') {
    recommendedSet = new Set(highlightedSlotsFromTags(mealTags(pendingAdd.meal)))
    if (preferredSlot) {
      recommendedSet.add(preferredSlot)
    }
  } else if (pendingAdd?.kind === 'product') {
    recommendedSet = new Set([slotOptions[0]])
  }

  if (view === 'copy-confirm') {
    return (
      <section className="page">
        <header className="product-form__header">
          <button
            type="button"
            className="product-form__close"
            onClick={() => {
              setCopyReplaceSummary([])
              setView('copy')
            }}
            aria-label="ביטול"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <h1>אישור החלפה</h1>
          <span className="today-add__header-spacer" aria-hidden="true" />
        </header>

        <p className="copy-day__hint">
          ב־{formatDateLabel(copyDestKey)} כבר יש תפריט. ההעתקה תחליף את הפריטים
          הבאים:
        </p>

        <ul className="copy-day__replace-list" aria-label="פריטים שיוחלפו">
          {copyReplaceSummary.map((row, index) => (
            <li key={`${row.slot}-${row.name}-${index}`}>
              <span className="copy-day__replace-slot">
                {SLOT_LABELS[row.slot] || row.slot}
              </span>
              <span className="copy-day__replace-name">{row.name}</span>
            </li>
          ))}
        </ul>

        <div className="copy-day__actions">
          <button
            type="button"
            className="copy-day__cancel"
            onClick={() => {
              setCopyReplaceSummary([])
              setView('copy')
            }}
          >
            ביטול
          </button>
          <button
            type="button"
            className="copy-day__confirm"
            onClick={() => handleCopyDay({ replaceExplicitly: true })}
          >
            החלף והעתק
          </button>
        </div>
      </section>
    )
  }

  if (view === 'copy') {
    return (
      <section className="page">
        <header className="product-form__header">
          <button
            type="button"
            className="product-form__close"
            onClick={closeCopyDay}
            aria-label="סגירה"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <h1>העתקת יום</h1>
          <span className="today-add__header-spacer" aria-hidden="true" />
        </header>

        <p className="copy-day__hint">
          העתקה מ־{formatDateLabel(selectedDateKey)} לתאריך יעד. הארוחות, החריצים,
          הכמויות והשינויים יועתקו כתכנון עצמאי.
        </p>

        {sourcePlanEmpty ? (
          <p className="copy-day__empty-note">
            יום המקור ריק — היעד יישאר / יהפוך לריק.
          </p>
        ) : null}

        <label className="copy-day__field">
          <span className="copy-day__label">תאריך יעד</span>
          <div className="copy-day__date-row">
            <div className="week-selector__calendar-wrap">
              <span className="week-selector__calendar-label" aria-hidden="true">
                {copyDestKey ? formatDateLabel(copyDestKey) : 'בחירת תאריך'}
              </span>
              <input
                ref={copyDateInputRef}
                type="date"
                className="week-selector__date-input"
                value={copyDestKey}
                onChange={(event) => {
                  setCopyDestKey(event.target.value || '')
                  setCopyError('')
                }}
                aria-label="בחירת תאריך יעד"
              />
            </div>
          </div>
        </label>

        {copyError ? (
          <p className="product-field__error" role="alert">
            {copyError}
          </p>
        ) : null}

        <div className="copy-day__actions">
          <button
            type="button"
            className="copy-day__cancel"
            onClick={closeCopyDay}
          >
            ביטול
          </button>
          <button
            type="button"
            className="copy-day__confirm"
            onClick={() => handleCopyDay()}
            disabled={!copyDestKey}
          >
            העתק
          </button>
        </div>
      </section>
    )
  }

  const showAddSheet = view === 'add' || (view === 'slot' && Boolean(pendingAdd))

  let addSheetBody = null
  if (view === 'slot' && pendingAdd) {
    const pendingName =
      pendingAdd.kind === 'meal'
        ? pendingAdd.meal.name
        : pendingAdd.product.name

    addSheetBody = (
      <>
        <header className="product-form__header">
          <button
            type="button"
            className="product-form__close"
            onClick={() => {
              setPendingAdd(null)
              setView('add')
            }}
            aria-label="חזרה"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <h1>בחירת קטגוריה</h1>
          <span className="today-add__header-spacer" aria-hidden="true" />
        </header>

        <p className="slot-picker__hint">
          לאן להוסיף את <strong>{pendingName}</strong>?
        </p>

        <ul className="slot-picker-list">
          {slotOptions.map((slot) => {
            const isRecommended = recommendedSet.has(slot)
            return (
              <li key={slot}>
                <button
                  type="button"
                  className={
                    isRecommended
                      ? 'slot-picker-option slot-picker-option--recommended'
                      : 'slot-picker-option'
                  }
                  onClick={() => handleSelectSlot(slot)}
                >
                  <span className="slot-picker-option__label">
                    {SLOT_LABELS[slot] || slot}
                  </span>
                  {isRecommended ? (
                    <span className="slot-picker-option__badge">מומלץ</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </>
    )
  } else if (view === 'add') {
    addSheetBody = (
      <>
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
          <h1>{isSelectedToday ? 'הוספה להיום' : 'הוספה ליום'}</h1>
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
              <ul className="today-pick-list">
                {visibleMeals.map((meal) => {
                  const nutrition = calculateMealNutrition(meal, products, meals)
                  const tags = mealTags(meal)

                  return (
                    <li key={meal.id} className="today-pick-card">
                      <div className="today-pick-card__info">
                        <span className="today-pick-card__name">{meal.name}</span>
                        <TagChips tags={tags} />
                        <NutritionSummary nutrition={nutrition} />
                      </div>
                      <button
                        type="button"
                        className="today-pick-card__add"
                        onClick={() => handlePickMeal(meal)}
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
              <div className="empty-state">
                <span className="empty-state__emoji" aria-hidden="true">
                  🥕
                </span>
                <p>
                  {products.length === 0
                    ? 'עדיין אין פה מוצרים'
                    : 'לא נמצאו מוצרים התואמים לחיפוש.'}
                </p>
              </div>
            ) : (
              <ul className="today-pick-list">
                {visibleProducts.map((product) => {
                  const quantityValue = getProductQuantity(product.id)
                  const unitId = getProductUnitId(product.id)
                  const unit = resolveUnit(product, unitId)
                  const unitOptions = getProductUnits(product)
                  const grams = quantityToGrams(quantityValue, unit.grams)
                  const previewNutrition = calculateProductNutrition(
                    product,
                    Number.isFinite(grams) && grams > 0 ? grams : 0,
                  )
                  const error = productErrors[product.id]
                  const quantityId = `today-product-qty-${product.id}`
                  const unitSelectId = `today-product-unit-${product.id}`
                  const errorId = `${quantityId}-error`

                  return (
                    <li
                      key={product.id}
                      className="today-pick-card today-pick-card--product"
                    >
                      <div className="today-pick-card__info">
                        <span className="today-pick-card__name">
                          {product.name}
                        </span>
                        <span className="today-pick-card__meta">
                          <Num>{formatMacro(product.caloriesPer100g)}</Num>
                          {' קל׳ ל־'}
                          <Num>100</Num>
                          {' גרם'}
                        </span>
                        <div className="today-product-qty">
                          <label htmlFor={quantityId}>כמות</label>
                          <div className="today-product-qty__cluster today-product-qty__cluster--units">
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
                              onFocus={selectQuantityOnFocus}
                              onClick={selectQuantityOnFocus}
                              onMouseUp={preserveQuantitySelectionOnMouseUp}
                              aria-invalid={Boolean(error)}
                              aria-describedby={error ? errorId : undefined}
                            />
                            <label
                              className="visually-hidden"
                              htmlFor={unitSelectId}
                            >
                              יחידה
                            </label>
                            <select
                              id={unitSelectId}
                              className="today-product-qty__unit-select"
                              value={unitId}
                              onChange={(event) =>
                                handleProductUnitChange(
                                  product.id,
                                  event.target.value,
                                )
                              }
                            >
                              {unitOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {unit.id !== GRAMS_UNIT.id &&
                        Number.isFinite(grams) &&
                        grams > 0 ? (
                          <span className="today-pick-card__meta">
                            = <Num>{formatMacro(grams)}</Num>
                            {' גרם'}
                          </span>
                        ) : null}
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
                        onClick={() => handlePickProduct(product)}
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
      </>
    )
  }

  return (
    <section className="page">
      <header className="page-header page-header--today">
        <h1>
          תכנון
          <span className="page-header__emoji" aria-hidden="true">
            🌞
          </span>
        </h1>
        <div className="page-header__actions">
          {!isSelectedToday ? (
            <button
              type="button"
              className="week-selector__today-btn"
              onClick={goToToday}
            >
              היום
            </button>
          ) : null}
          <button
            type="button"
            className="week-selector__copy-btn"
            onClick={openCopyDay}
          >
            העתקת יום
          </button>
        </div>
      </header>

      <section className="week-selector" aria-label="בחירת תאריך">
        <div className="week-selector__toolbar">
          <button
            type="button"
            className="week-selector__nav"
            onClick={() => shiftWeek(-1)}
            aria-label="שבוע קודם"
          >
            ‹
          </button>
          <div className="week-selector__calendar-wrap">
            <span className="week-selector__calendar-label" aria-hidden="true">
              {formatDateLabel(selectedDateKey)}
            </span>
            <input
              ref={dateInputRef}
              type="date"
              className="week-selector__date-input"
              value={selectedDateKey}
              onChange={(event) => {
                if (event.target.value) {
                  selectDate(event.target.value)
                }
              }}
              aria-label="בחירת תאריך מלוח שנה"
            />
          </div>
          <button
            type="button"
            className="week-selector__nav"
            onClick={() => shiftWeek(1)}
            aria-label="שבוע הבא"
          >
            ›
          </button>
        </div>

        <div className="week-selector__grid" role="listbox" aria-label="ימי השבוע">
          {weekDayKeys.map((dateKey) => {
            const date = parseDateKey(dateKey)
            const weekday = HEBREW_WEEKDAYS[date.getDay()]
            const isSelected = dateKey === selectedDateKey
            const isToday = dateKey === todayKey

            return (
              <button
                key={dateKey}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={[
                  'week-selector__day',
                  isSelected ? 'week-selector__day--selected' : '',
                  isToday ? 'week-selector__day--today' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  if (isSelected) {
                    openCalendarPicker()
                    return
                  }
                  selectDate(dateKey)
                }}
                aria-label={
                  isSelected
                    ? `תאריך נבחר ${formatDateLabel(dateKey)}. פתיחת לוח שנה`
                    : formatDateLabel(dateKey)
                }
              >
                <span className="week-selector__weekday">{weekday}</span>
                <span className="week-selector__date num">{date.getDate()}</span>
              </button>
            )
          })}
        </div>
      </section>

      <aside className="motivation-card" aria-label="עידוד יומי">
        <span className="motivation-card__emoji" aria-hidden="true">
          💚
        </span>
        <p className="motivation-card__text">
          יש לך את זה! אוכל טוב = מצב רוח טוב ✨
        </p>
      </aside>

      <div ref={nutritionSentinelRef} className="nutrition-grid-sentinel" />
      <div
        ref={nutritionGridRef}
        className="nutrition-grid nutrition-grid--sticky"
      >
        {NUTRITION_CARDS.map((card) => {
          const isCaloriesOver =
            card.key === 'calories' && caloriesOverLimit

          return (
            <article
              key={card.key}
              className={[
                'nutrition-card',
                `nutrition-card--${card.accent}`,
                isCaloriesOver ? 'nutrition-card--over' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-describedby={
                isCaloriesOver
                  ? 'calories-over-warning'
                  : caloriesWithinTolerance && card.key === 'calories'
                    ? 'calories-tolerance-note'
                    : undefined
              }
            >
              <h2 className="nutrition-card__label">{card.label}</h2>
              <p className="nutrition-card__values">
                <Num>
                  {formatDisplay(current[card.key])} /{' '}
                  {formatDisplay(goals[card.key])}
                </Num>
                <span className="nutrition-card__unit"> {card.unit}</span>
              </p>
            </article>
          )
        })}
        {caloriesOverLimit ? (
          <p
            id="calories-over-warning"
            className="nutrition-over-banner"
            role="status"
          >
            חריגה בקלוריות · עודף{' '}
            <Num>{formatDisplay(caloriesOverBy)}</Num>
            {' קל׳'}
          </p>
        ) : null}
        {caloriesWithinTolerance ? (
          <p
            id="calories-tolerance-note"
            className="nutrition-tolerance-banner"
            role="status"
          >
            עדיין בטווח שהגדרת 🌿
            <span className="nutrition-tolerance-banner__detail">
              {' · +'}
              <Num>{formatDisplay(calorieStatus.overTargetBy)}</Num>
              {' מתוך '}
              <Num>{formatDisplay(calorieStatus.allowedCalorieOverage)}</Num>
              {' קל׳ חריגה מותרת'}
            </span>
          </p>
        ) : null}
      </div>

      {caloriesOverLimit ? (
        <section className="balance-suggestion" aria-label="איזון קלוריות">
          <p className="balance-suggestion__headline">
            <span aria-hidden="true">⚠️ </span>
            <Num>{formatDisplay(caloriesOverBy)}</Num>
            {' קלוריות מעל היעד'}
          </p>
          <p className="balance-suggestion__text">
            אפשר להתקרב ליעד בעזרת החלפה חכמה של אחת הארוחות.
          </p>
          <button
            type="button"
            className="btn-primary balance-suggestion__action"
            onClick={handleOpenBalanceSheet}
          >
            ✨ הציעי לי איך לאזן
          </button>
        </section>
      ) : null}

      <section
        className="remaining-card"
        aria-label={isSelectedToday ? 'נשאר להיום' : 'נשאר ליום הנבחר'}
      >
        <h2 className="remaining-card__title">
          {isSelectedToday ? 'נשאר להיום' : 'נשאר ליום'}
        </h2>
        <div className="remaining-card__grid">
          {NUTRITION_CARDS.map((card) => (
            <div key={card.key} className="remaining-card__item">
              <span className="remaining-card__label">{card.label}</span>
              <span className="remaining-card__value">
                <Num>{formatDisplay(remaining[card.key])}</Num>
                {' '}
                {card.unit}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="today-meals" aria-label="חריצי הארוחות">
        <div className="today-meals__header">
          <h2 className="today-meals__title">הארוחות שלי</h2>
          <button type="button" className="today-meals__add" onClick={() => openAdd()}>
            <span aria-hidden="true">+</span>
            הוספה
          </button>
        </div>

        {SLOT_SECTIONS.map((section) => {
          const items =
            section.kind === 'primary'
              ? Array.isArray(dayPlan[section.id])
                ? dayPlan[section.id]
                : []
              : Array.isArray(dayPlan.snacks)
                ? dayPlan.snacks
                : []

          return (
            <section
              key={section.id}
              className={`slot-section slot-section--${section.id}`}
              aria-label={section.title}
            >
              <div className="slot-section__header">
                <h3 className="slot-section__title">
                  <span className="slot-section__emoji" aria-hidden="true">
                    {section.emoji}
                  </span>
                  {section.title}
                </h3>
                <button
                  type="button"
                  className="slot-section__add"
                  onClick={() =>
                    openAdd(section.kind === 'primary' ? section.id : 'snack')
                  }
                  aria-label={`הוספה ל${section.title}`}
                >
                  +
                </button>
              </div>

              {items.length === 0 ? (
                <div className="slot-section__empty">
                  <p>ריק לעכשיו 🌿</p>
                </div>
              ) : (
                <ul className="today-item-list">
                  {items.map((item) => (
                    <PlannerItemCard
                      key={item.id}
                      item={item}
                      displayItem={displayById.get(item.id) || item}
                      products={products}
                      productsById={productsById}
                      quantityDrafts={quantityDrafts}
                      itemErrors={itemErrors}
                      multiplierDrafts={multiplierDrafts}
                      multiplierErrors={multiplierErrors}
                      expandedMealIds={expandedMealIds}
                      onToggleIngredients={toggleIngredients}
                      onQuantityDraftChange={handleQuantityDraftChange}
                      onCommitQuantity={commitQuantity}
                      onMultiplierDraftChange={handleMultiplierDraftChange}
                      onCommitMultiplier={commitMultiplier}
                      onStepMultiplier={stepMultiplier}
                      onRemove={handleRemoveItem}
                      onSwap={handleOpenSwap}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </section>

      {showAddSheet && addSheetBody ? (
        <div className="today-sheet-root">
          <button
            type="button"
            className="today-sheet-backdrop"
            aria-label="סגירה"
            onClick={closeAdd}
          />
          <div
            className="today-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={
              view === 'slot'
                ? 'בחירת קטגוריה'
                : isSelectedToday
                  ? 'הוספה להיום'
                  : 'הוספה ליום'
            }
          >
            <div className="today-sheet__handle" aria-hidden="true" />
            <div className="today-sheet__body">{addSheetBody}</div>
          </div>
        </div>
      ) : null}

      {balanceSheetOpen && caloriesOverLimit ? (
        <BalanceDaySheet
          calorieExcess={balanceSuggestions.calorieExcess || caloriesOverBy}
          targetCalories={goals.calories}
          recommendations={balanceSuggestions.recommendations}
          onConfirmAction={handleConfirmBalanceAction}
          onClose={handleCloseBalanceSheet}
        />
      ) : null}

      {swapItem ? (
        <MealSwapSheet
          item={swapItem}
          displayItem={displayById.get(swapItem.id) || swapItem}
          products={products}
          productsById={productsById}
          meals={meals}
          dayNutrition={current}
          goals={goals}
          onConfirm={handleConfirmSwap}
          onClose={handleCloseSwap}
        />
      ) : null}
    </section>
  )
}

export default TodayPage
