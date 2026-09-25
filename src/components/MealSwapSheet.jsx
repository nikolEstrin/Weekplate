import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clampMealQuantity,
  getMealNutritionForSwap,
  getPlannerMealQuantity,
  MEAL_QUANTITY_UI_STEP,
  MIN_MEAL_QUANTITY_UI,
  previewDayNutritionAfterSwap,
  recommendMealSwaps,
  scaleSwapRecommendationToQuantity,
  SMART_SWAP_PAGE_SIZE,
} from '../services/smartMealSwap.js'
import { roundForDisplay } from '../utils/nutrition.js'

const SWAP_REASONS = [
  { id: 'missing-products', label: '🥕 אין לי את המוצרים' },
  { id: 'lower-calories', label: '🔥 רוצה פחות קלוריות' },
  { id: 'higher-protein', label: '💪 רוצה יותר חלבון' },
  { id: 'different-meal', label: '😋 פשוט בא לי משהו אחר' },
]

function formatMacro(value) {
  const decimals = value % 1 === 0 ? 0 : 1
  const rounded = roundForDisplay(value, decimals)
  return rounded.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })
}

function formatQuantity(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return '1'
  }
  if (Number.isInteger(number)) {
    return String(number)
  }
  return String(Math.round(number * 100) / 100)
}

/** Show "2 × name" when quantity is not 1; otherwise plain name. */
function formatMealLabel(name, quantity) {
  const qty = Number(quantity)
  const safeName = typeof name === 'string' ? name : ''
  if (!Number.isFinite(qty) || qty === 1) {
    return safeName
  }
  return `${formatQuantity(qty)} × ${safeName}`
}

function Num({ children }) {
  return <span className="num">{children}</span>
}

function ingredientChipLabel(ingredient, productsById) {
  if (
    typeof ingredient.productName === 'string' &&
    ingredient.productName.trim() !== ''
  ) {
    return ingredient.productName.trim()
  }

  const product = productsById.get(ingredient.productId)
  if (product) {
    return product.name
  }

  return 'מוצר לא זמין'
}

function formatDelta(value, unitLabel) {
  const abs = Math.abs(value)
  const formatted = formatMacro(abs)
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatted}${unitLabel}`
}

function deltaTone(value, betterWhen) {
  if (value === 0) {
    return 'neutral'
  }
  if (betterWhen === 'down') {
    return value < 0 ? 'good' : 'bad'
  }
  return value > 0 ? 'good' : 'bad'
}

function quantitiesDiffer(a, b) {
  const left = Number(a)
  const right = Number(b)
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return false
  }
  return Math.abs(left - right) > 0.001
}

function MealSummaryCard({
  mealName,
  calories,
  protein,
  label,
  tone = 'neutral',
  quantityNote = null,
}) {
  return (
    <div className={`meal-swap-summary meal-swap-summary--${tone}`}>
      {label ? <span className="meal-swap-summary__label">{label}</span> : null}
      <span className="meal-swap-summary__name">{mealName}</span>
      <span className="meal-swap-summary__nutrition">
        <Num>{formatMacro(calories)}</Num>
        {' קל׳ · '}
        <Num>{formatMacro(protein)}</Num>
        {'ג חלבון'}
      </span>
      {quantityNote ? (
        <span className="meal-swap-quantity-note">{quantityNote}</span>
      ) : null}
    </div>
  )
}

function MealSwapSheet({
  item,
  displayItem,
  products,
  productsById,
  meals,
  dayNutrition,
  goals,
  onConfirm,
  onClose,
  initialStep = 'reason',
  initialAlternative = null,
  onDismissPreview = null,
}) {
  const dialogRef = useRef(null)
  const startedInPreview =
    initialStep === 'preview' &&
    initialAlternative &&
    typeof initialAlternative === 'object'

  const [step, setStep] = useState(startedInPreview ? 'preview' : 'reason')
  const [reasonId, setReasonId] = useState(null)
  const [missingProductIds, setMissingProductIds] = useState(() => new Set())
  const [recommendations, setRecommendations] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [selectedAlternative, setSelectedAlternative] = useState(
    startedInPreview ? initialAlternative : null,
  )
  const [confirmError, setConfirmError] = useState('')

  useEffect(() => {
    dialogRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const swapMeal = displayItem || item
  const currentQuantity = getPlannerMealQuantity(swapMeal)
  const currentMealLabel = formatMealLabel(item?.name, currentQuantity)

  const originalNutrition = useMemo(
    () => getMealNutritionForSwap(swapMeal, products, meals),
    [swapMeal, products, meals],
  )

  const ingredientOptions = useMemo(() => {
    const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : []
    const options = []
    const seen = new Set()

    ingredients.forEach((ingredient) => {
      const productId =
        typeof ingredient.productId === 'string' ? ingredient.productId.trim() : ''
      if (!productId || seen.has(productId)) {
        return
      }
      seen.add(productId)
      options.push({
        productId,
        label: ingredientChipLabel(ingredient, productsById),
      })
    })

    return options
  }, [item, productsById])

  const pageStart = pageIndex * SMART_SWAP_PAGE_SIZE
  const visibleAlternatives = recommendations.slice(
    pageStart,
    pageStart + SMART_SWAP_PAGE_SIZE,
  )
  const hasMoreAlternatives =
    pageStart + SMART_SWAP_PAGE_SIZE < recommendations.length

  const continueDisabled =
    !reasonId ||
    (reasonId === 'missing-products' && missingProductIds.size === 0)

  let previewImpact = null
  if (selectedAlternative) {
    const after = previewDayNutritionAfterSwap({
      dayNutrition,
      originalNutrition,
      replacementNutrition: selectedAlternative,
    })

    previewImpact = {
      caloriesBefore: dayNutrition.calories,
      caloriesAfter: after.calories,
      caloriesDelta: after.calories - dayNutrition.calories,
      proteinBefore: dayNutrition.protein,
      proteinAfter: after.protein,
      proteinDelta: after.protein - dayNutrition.protein,
    }
  }

  const selectedQuantity = Number(selectedAlternative?.quantity)
  const safeSelectedQuantity =
    Number.isFinite(selectedQuantity) && selectedQuantity > 0
      ? selectedQuantity
      : 1
  const selectedMealLabel = selectedAlternative
    ? formatMealLabel(selectedAlternative.name, safeSelectedQuantity)
    : ''
  const quantityChanged =
    selectedAlternative &&
    quantitiesDiffer(currentQuantity, safeSelectedQuantity)
  const canDecreaseQuantity =
    safeSelectedQuantity > MIN_MEAL_QUANTITY_UI + 0.001

  function handleSelectReason(nextReasonId) {
    setReasonId(nextReasonId)
    if (nextReasonId !== 'missing-products') {
      setMissingProductIds(new Set())
    }
  }

  function toggleMissingProduct(productId) {
    setMissingProductIds((current) => {
      const next = new Set(current)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  function goToResults() {
    if (continueDisabled) {
      return
    }

    const result = recommendMealSwaps({
      currentMeal: swapMeal,
      allAvailableMeals: meals,
      swapReason: reasonId,
      unavailableProductIds: [...missingProductIds],
      currentDayNutrition: dayNutrition,
      optionalDailyTargets: goals,
      products,
      meals,
    })

    setRecommendations(result.recommendations)
    setPageIndex(0)
    setSelectedAlternative(null)
    setConfirmError('')
    setStep('results')
  }

  function handleShowOtherOptions() {
    if (!hasMoreAlternatives) {
      return
    }
    setPageIndex((current) => current + 1)
  }

  function handleSelectAlternative(alternative) {
    setSelectedAlternative(alternative)
    setConfirmError('')
    setStep('preview')
  }

  function handleStepQuantity(delta) {
    if (!selectedAlternative) {
      return
    }
    const next = clampMealQuantity(safeSelectedQuantity + delta, {
      step: MEAL_QUANTITY_UI_STEP,
      minQuantity: MIN_MEAL_QUANTITY_UI,
    })
    if (!(next > 0) || Math.abs(next - safeSelectedQuantity) < 0.001) {
      return
    }
    setSelectedAlternative(
      scaleSwapRecommendationToQuantity(selectedAlternative, next),
    )
    setConfirmError('')
  }

  function handleQuantityInputChange(rawValue) {
    if (!selectedAlternative) {
      return
    }
    const parsed = Number(typeof rawValue === 'string' ? rawValue.trim() : rawValue)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }
    const next = clampMealQuantity(parsed, {
      step: MEAL_QUANTITY_UI_STEP,
      minQuantity: MIN_MEAL_QUANTITY_UI,
    })
    setSelectedAlternative(
      scaleSwapRecommendationToQuantity(selectedAlternative, next),
    )
    setConfirmError('')
  }

  function handleBack() {
    if (step === 'preview') {
      if (startedInPreview) {
        if (typeof onDismissPreview === 'function') {
          onDismissPreview()
        } else {
          onClose()
        }
        return
      }
      setSelectedAlternative(null)
      setConfirmError('')
      setStep('results')
      return
    }
    if (step === 'results') {
      setStep('reason')
    }
  }

  function handleConfirm() {
    if (!selectedAlternative || typeof onConfirm !== 'function') {
      onClose()
      return
    }

    // Pass meal + chosen replacement quantity (never silently drop quantity).
    const result = onConfirm(selectedAlternative)
    if (result && result.ok === false) {
      setConfirmError('לא הצלחנו להחליף את הארוחה. נסי שוב.')
      return
    }
    onClose()
  }

  const title =
    step === 'reason'
      ? 'החלפת ארוחה'
      : step === 'results'
        ? 'חלופות לארוחה'
        : 'החלפת הארוחה'

  const showBack = step === 'results' || step === 'preview'
  const bestMatchId = recommendations[0]?.id || null

  return (
    <div className="today-sheet-root meal-swap-root">
      <button
        type="button"
        className="today-sheet-backdrop"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="today-sheet meal-swap-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-swap-sheet-title"
        tabIndex={-1}
      >
        <div className="today-sheet__handle" aria-hidden="true" />
        <div className="today-sheet__body meal-swap-sheet__body">
          <header className="meal-swap-sheet__header">
            {showBack ? (
              <button
                type="button"
                className="meal-swap-sheet__nav-btn"
                onClick={handleBack}
                aria-label="חזרה"
              >
                →
              </button>
            ) : (
              <span className="meal-swap-sheet__nav-spacer" aria-hidden="true" />
            )}
            <div className="meal-swap-sheet__titles">
              <h2 id="meal-swap-sheet-title" className="meal-swap-sheet__title">
                {title}
              </h2>
              {step === 'results' && recommendations.length > 0 ? (
                <p className="meal-swap-sheet__subtitle">
                  מצאנו אפשרויות שמתאימות לארוחה שלך
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="meal-swap-sheet__nav-btn"
              onClick={onClose}
              aria-label="סגירה"
            >
              ✕
            </button>
          </header>

          {step === 'reason' ? (
            <div className="meal-swap-step">
              <MealSummaryCard
                mealName={currentMealLabel}
                calories={originalNutrition.calories}
                protein={originalNutrition.protein}
                quantityNote={
                  currentQuantity !== 1
                    ? `כמות: ${formatQuantity(currentQuantity)}`
                    : null
                }
              />

              <p className="meal-swap-question">למה תרצי להחליף?</p>

              <ul className="meal-swap-reason-list" role="listbox" aria-label="סיבת החלפה">
                {SWAP_REASONS.map((reason) => {
                  const selected = reasonId === reason.id
                  return (
                    <li key={reason.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={
                          selected
                            ? 'meal-swap-reason meal-swap-reason--selected'
                            : 'meal-swap-reason'
                        }
                        onClick={() => handleSelectReason(reason.id)}
                      >
                        <span className="meal-swap-reason__label">{reason.label}</span>
                        <span
                          className={
                            selected
                              ? 'meal-swap-reason__radio meal-swap-reason__radio--checked'
                              : 'meal-swap-reason__radio'
                          }
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>

              {reasonId === 'missing-products' ? (
                <div className="meal-swap-missing">
                  <h3 className="meal-swap-missing__title">מה אין לך?</h3>
                  <p className="meal-swap-missing__subtitle">
                    סמני את המוצרים שחסרים לך
                  </p>
                  {ingredientOptions.length === 0 ? (
                    <p className="meal-swap-missing__empty">אין מרכיבים להצגה</p>
                  ) : (
                    <div className="meal-swap-chip-row" role="group" aria-label="מוצרים חסרים">
                      {ingredientOptions.map((option) => {
                        const selected = missingProductIds.has(option.productId)
                        return (
                          <button
                            key={option.productId}
                            type="button"
                            className={
                              selected
                                ? 'meal-swap-chip meal-swap-chip--selected'
                                : 'meal-swap-chip'
                            }
                            aria-pressed={selected}
                            onClick={() => toggleMissingProduct(option.productId)}
                          >
                            {selected ? (
                              <span className="meal-swap-chip__check" aria-hidden="true">
                                ✓
                              </span>
                            ) : null}
                            <span className="meal-swap-chip__label">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              <button
                type="button"
                className="btn-primary meal-swap-continue"
                disabled={continueDisabled}
                onClick={goToResults}
              >
                המשך
              </button>
            </div>
          ) : null}

          {step === 'results' ? (
            <div className="meal-swap-step">
              <MealSummaryCard
                mealName={currentMealLabel}
                calories={originalNutrition.calories}
                protein={originalNutrition.protein}
                label="הארוחה הנוכחית"
                tone="muted"
                quantityNote={
                  currentQuantity !== 1
                    ? `כמות: ${formatQuantity(currentQuantity)}`
                    : null
                }
              />

              {recommendations.length === 0 ? (
                <div className="meal-swap-empty">
                  <p className="meal-swap-empty__message">
                    לא מצאנו כרגע ארוחה מתאימה 😕
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleBack}
                  >
                    בחרי סיבה אחרת
                  </button>
                </div>
              ) : (
                <>
                  <ul className="meal-swap-results">
                    {visibleAlternatives.map((alternative) => {
                      const altQuantity = Number(alternative.quantity)
                      const safeAltQuantity =
                        Number.isFinite(altQuantity) && altQuantity > 0
                          ? altQuantity
                          : 1
                      const calorieDelta =
                        alternative.calories - originalNutrition.calories
                      const proteinDelta =
                        alternative.protein - originalNutrition.protein
                      const isBest =
                        alternative.id === bestMatchId && pageIndex === 0
                      const showQuantityChange = quantitiesDiffer(
                        currentQuantity,
                        safeAltQuantity,
                      )

                      return (
                        <li key={alternative.id} className="meal-swap-result">
                          {isBest ? (
                            <span className="meal-swap-result__badge">
                              הכי מתאים ✨
                            </span>
                          ) : null}
                          <div className="meal-swap-result__main">
                            <div className="meal-swap-result__info">
                              <span className="meal-swap-result__name">
                                {formatMealLabel(alternative.name, safeAltQuantity)}
                              </span>
                              <span className="meal-swap-result__nutrition">
                                <Num>{formatMacro(alternative.calories)}</Num>
                                {' קל׳ · '}
                                <Num>{formatMacro(alternative.protein)}</Num>
                                {'ג חלבון'}
                              </span>
                              {showQuantityChange ? (
                                <span className="meal-swap-quantity-note">
                                  {`כמות: ${formatQuantity(currentQuantity)} → ${formatQuantity(safeAltQuantity)}`}
                                </span>
                              ) : null}
                            </div>
                            <div className="meal-swap-result__deltas">
                              <span
                                className={`meal-swap-delta meal-swap-delta--${deltaTone(
                                  calorieDelta,
                                  'down',
                                )}`}
                              >
                                {formatDelta(calorieDelta, ' קלוריות')}
                              </span>
                              <span
                                className={`meal-swap-delta meal-swap-delta--${deltaTone(
                                  proteinDelta,
                                  'up',
                                )}`}
                              >
                                {formatDelta(proteinDelta, 'g חלבון')}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="meal-swap-result__select"
                            onClick={() => handleSelectAlternative(alternative)}
                          >
                            לבחור בארוחה
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {hasMoreAlternatives ? (
                    <button
                      type="button"
                      className="meal-swap-refresh"
                      onClick={handleShowOtherOptions}
                    >
                      ↻ הציגי אפשרויות אחרות
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {step === 'preview' && selectedAlternative && previewImpact ? (
            <div className="meal-swap-step">
              <div className="meal-swap-preview-flow">
                <MealSummaryCard
                  mealName={currentMealLabel}
                  calories={originalNutrition.calories}
                  protein={originalNutrition.protein}
                  label="הארוחה הנוכחית"
                  tone="muted"
                />
                <div className="meal-swap-preview-arrow" aria-hidden="true">
                  ↓
                </div>
                <MealSummaryCard
                  mealName={selectedMealLabel}
                  calories={selectedAlternative.calories}
                  protein={selectedAlternative.protein}
                  label="הארוחה החדשה"
                  tone="accent"
                  quantityNote={
                    quantityChanged
                      ? `כמות: ${formatQuantity(currentQuantity)} → ${formatQuantity(safeSelectedQuantity)}`
                      : null
                  }
                />
              </div>

              <div className="meal-multiplier meal-swap-quantity">
                <label
                  className="meal-multiplier__label"
                  htmlFor="meal-swap-preview-quantity"
                >
                  כמות
                </label>
                <div className="meal-multiplier__controls">
                  <button
                    type="button"
                    className="meal-multiplier__step"
                    onClick={() => handleStepQuantity(-MEAL_QUANTITY_UI_STEP)}
                    disabled={!canDecreaseQuantity}
                    aria-label="הקטנת כמות"
                  >
                    −
                  </button>
                  <input
                    id="meal-swap-preview-quantity"
                    type="number"
                    inputMode="decimal"
                    min={MIN_MEAL_QUANTITY_UI}
                    step={MEAL_QUANTITY_UI_STEP}
                    className="input-ltr meal-multiplier__input"
                    value={formatQuantity(safeSelectedQuantity)}
                    onChange={(event) =>
                      handleQuantityInputChange(event.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="meal-multiplier__step"
                    onClick={() => handleStepQuantity(MEAL_QUANTITY_UI_STEP)}
                    aria-label="הגדלת כמות"
                  >
                    +
                  </button>
                </div>
              </div>

              <section className="meal-swap-impact" aria-label="השפעה על היום">
                <h3 className="meal-swap-impact__title">השפעה על היום</h3>
                <div className="meal-swap-impact__grid">
                  <div className="meal-swap-impact__card">
                    <span className="meal-swap-impact__label">חלבון</span>
                    <span className="meal-swap-impact__values">
                      <span className="num">
                        {`${formatMacro(previewImpact.proteinBefore)}g → ${formatMacro(previewImpact.proteinAfter)}g`}
                      </span>
                    </span>
                    <span
                      className={`meal-swap-delta meal-swap-delta--${deltaTone(
                        previewImpact.proteinDelta,
                        'up',
                      )}`}
                    >
                      {formatDelta(previewImpact.proteinDelta, 'g')}
                    </span>
                  </div>
                  <div className="meal-swap-impact__card">
                    <span className="meal-swap-impact__label">קלוריות</span>
                    <span className="meal-swap-impact__values">
                      <span className="num">
                        {`${formatMacro(previewImpact.caloriesBefore)} → ${formatMacro(previewImpact.caloriesAfter)}`}
                      </span>
                    </span>
                    <span
                      className={`meal-swap-delta meal-swap-delta--${deltaTone(
                        previewImpact.caloriesDelta,
                        'down',
                      )}`}
                    >
                      {formatDelta(previewImpact.caloriesDelta, '')}
                    </span>
                  </div>
                </div>
              </section>

              {confirmError ? (
                <p className="meal-swap-confirm-error">{confirmError}</p>
              ) : null}

              <div className="meal-swap-preview-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleBack}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirm}
                >
                  אישור החלפה
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default MealSwapSheet
