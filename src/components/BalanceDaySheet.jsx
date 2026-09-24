import { useState } from 'react'
import {
  BALANCE_ACTION_REDUCE_QUANTITY,
  BALANCE_ACTION_REPLACE_MEAL,
  clampMealQuantity,
  MEAL_QUANTITY_UI_STEP,
  MIN_MEAL_QUANTITY_UI,
  previewBalanceReplaceAtQuantity,
} from '../services/smartMealSwap.js'
import { roundForDisplay } from '../utils/nutrition.js'

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

function formatMealLabel(name, quantity) {
  const qty = Number(quantity)
  const safeName = typeof name === 'string' ? name : ''
  if (!Number.isFinite(qty) || qty === 1) {
    return safeName
  }
  return `${formatQuantity(qty)} × ${safeName}`
}

/** Always include quantity + meal name (used for reduce-quantity cards). */
function formatQuantityMealLabel(name, quantity) {
  const safeName = typeof name === 'string' ? name : ''
  return `${formatQuantity(quantity)} × ${safeName}`
}

function Num({ children }) {
  return <span className="num">{children}</span>
}

const SLOT_BADGE_META = {
  breakfast: { emoji: '🥑', section: 'breakfast' },
  lunch: { emoji: '🥗', section: 'lunch' },
  dinner: { emoji: '🥦', section: 'dinner' },
  snack: { emoji: '🍓', section: 'snacks' },
}

function SlotBadge({ slotId, slotLabel }) {
  const label = typeof slotLabel === 'string' ? slotLabel.trim() : ''
  if (!label) {
    return null
  }
  const meta = SLOT_BADGE_META[slotId] || null
  const sectionClass = meta ? `balance-day-card__slot--${meta.section}` : ''

  return (
    <span
      className={`balance-day-card__slot ${sectionClass}`.trim()}
      aria-label={`ב${label}`}
    >
      {meta ? (
        <span className="balance-day-card__slot-emoji" aria-hidden="true">
          {meta.emoji}
        </span>
      ) : null}
      <span className="balance-day-card__slot-text">{label}</span>
    </span>
  )
}

function ImpactRow({ label, before, after, unit }) {
  return (
    <div className="balance-day-impact__card">
      <span className="balance-day-impact__label">{label}</span>
      <span className="balance-day-impact__values">
        <Num>
          {`${formatMacro(before)} → ${formatMacro(after)}${unit}`}
        </Num>
      </span>
    </div>
  )
}

function BalanceDaySheet({
  calorieExcess,
  targetCalories,
  recommendations,
  onConfirmAction,
  onClose,
}) {
  const [previewEntry, setPreviewEntry] = useState(null)
  const [confirmError, setConfirmError] = useState('')

  const hasRecommendations =
    Array.isArray(recommendations) && recommendations.length > 0
  const isPreview = Boolean(previewEntry)
  const isReplacePreview =
    previewEntry?.actionType === BALANCE_ACTION_REPLACE_MEAL
  const previewQuantity = Number(previewEntry?.replacementQuantity)
  const safePreviewQuantity =
    Number.isFinite(previewQuantity) && previewQuantity > 0
      ? previewQuantity
      : 1
  const canDecreasePreviewQuantity =
    safePreviewQuantity > MIN_MEAL_QUANTITY_UI + 0.001

  function handleSelect(entry) {
    setConfirmError('')
    setPreviewEntry(entry)
  }

  function handleBackFromPreview() {
    setConfirmError('')
    setPreviewEntry(null)
  }

  function handleStepPreviewQuantity(delta) {
    if (!previewEntry || !isReplacePreview) {
      return
    }
    const next = clampMealQuantity(safePreviewQuantity + delta, {
      step: MEAL_QUANTITY_UI_STEP,
      minQuantity: MIN_MEAL_QUANTITY_UI,
    })
    if (!(next > 0) || Math.abs(next - safePreviewQuantity) < 0.001) {
      return
    }
    setPreviewEntry(previewBalanceReplaceAtQuantity(previewEntry, next))
    setConfirmError('')
  }

  function handlePreviewQuantityInput(rawValue) {
    if (!previewEntry || !isReplacePreview) {
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
    setPreviewEntry(previewBalanceReplaceAtQuantity(previewEntry, next))
    setConfirmError('')
  }

  function handleConfirm() {
    if (!previewEntry || typeof onConfirmAction !== 'function') {
      onClose()
      return
    }

    const result = onConfirmAction(previewEntry)
    if (result && result.ok === false) {
      setConfirmError(
        previewEntry.actionType === BALANCE_ACTION_REDUCE_QUANTITY
          ? 'לא הצלחנו לעדכן את הכמות. נסי שוב.'
          : 'לא הצלחנו להחליף את הארוחה. נסי שוב.',
      )
      return
    }
    onClose()
  }

  return (
    <div className="today-sheet-root balance-day-root">
      <button
        type="button"
        className="today-sheet-backdrop"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div
        className="today-sheet balance-day-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="איזון היום"
      >
        <div className="today-sheet__handle" aria-hidden="true" />
        <div className="today-sheet__body balance-day-sheet__body">
          <header className="balance-day-sheet__header">
            {isPreview ? (
              <button
                type="button"
                className="balance-day-sheet__nav-btn"
                onClick={handleBackFromPreview}
                aria-label="חזרה"
              >
                →
              </button>
            ) : (
              <span className="balance-day-sheet__nav-spacer" aria-hidden="true" />
            )}
            <div className="balance-day-sheet__titles">
              <h2 className="balance-day-sheet__title">
                {isPreview ? 'אישור שינוי' : 'איזון היום'}
              </h2>
            </div>
            <button
              type="button"
              className="balance-day-sheet__nav-btn"
              onClick={onClose}
              aria-label="סגירה"
            >
              ✕
            </button>
          </header>

          {!isPreview ? (
            <>
              <p className="balance-day-sheet__excess">
                את כרגע{' '}
                <Num>{formatMacro(calorieExcess)}</Num>
                {' קלוריות מעל היעד.'}
              </p>

              {hasRecommendations ? (
                <ul className="balance-day-results" aria-label="הצעות איזון">
                  {recommendations.map((entry) => {
                    const isReduce =
                      entry.actionType === BALANCE_ACTION_REDUCE_QUANTITY
                    const cardKey =
                      entry.actionKey ||
                      `${entry.actionType}:${entry.plannerItemId}:${entry.replacementId || entry.suggestedQuantity}`

                    return (
                      <li key={cardKey}>
                        <article className="balance-day-card">
                          <div className="balance-day-card__context">
                            <SlotBadge
                              slotId={entry.slotId}
                              slotLabel={entry.slotLabel}
                            />
                            <span className="balance-day-card__action">
                              {isReduce ? 'הקטנת כמות' : 'החלפת ארוחה'}
                            </span>
                          </div>

                          <div className="balance-day-card__swap">
                            <div className="balance-day-card__meal">
                              <span className="balance-day-card__label">נוכחי</span>
                              <span className="balance-day-card__name">
                                {isReduce
                                  ? formatQuantityMealLabel(
                                      entry.currentName,
                                      entry.currentQuantity,
                                    )
                                  : formatMealLabel(
                                      entry.currentName,
                                      entry.currentQuantity,
                                    )}
                              </span>
                              <span className="balance-day-card__cals">
                                <Num>{formatMacro(entry.currentCalories)}</Num>
                                {' קל׳'}
                              </span>
                            </div>

                            <div
                              className="balance-day-card__arrow"
                              aria-hidden="true"
                            >
                              ↓
                            </div>

                            <div className="balance-day-card__meal balance-day-card__meal--suggested">
                              <span className="balance-day-card__label">מוצע</span>
                              <span className="balance-day-card__name">
                                {isReduce
                                  ? formatQuantityMealLabel(
                                      entry.currentName,
                                      entry.suggestedQuantity,
                                    )
                                  : formatMealLabel(
                                      entry.replacementName,
                                      entry.replacementQuantity,
                                    )}
                              </span>
                              <span className="balance-day-card__cals">
                                <Num>{formatMacro(entry.suggestedCalories)}</Num>
                                {' קל׳'}
                              </span>
                            </div>
                          </div>

                          <p className="balance-day-card__savings">
                            חיסכון:{' '}
                            <Num>{formatMacro(entry.calorieSavings)}</Num>
                            {' קל׳'}
                          </p>

                          <p className="balance-day-card__after">
                            {isReduce ? 'אחרי השינוי:' : 'אחרי ההחלפה:'}{' '}
                            <Num>
                              {`${formatMacro(entry.dayCaloriesAfter)} / ${formatMacro(targetCalories)}`}
                            </Num>
                            {' קל׳'}
                          </p>

                          <p className="balance-day-card__protein">
                            חלבון:{' '}
                            <Num>
                              {`${formatMacro(entry.dayProteinBefore)}g → ${formatMacro(entry.dayProteinAfter)}g`}
                            </Num>
                          </p>

                          <button
                            type="button"
                            className="btn-primary balance-day-card__select"
                            onClick={() => handleSelect(entry)}
                          >
                            {isReduce ? 'בחירת ההקטנה' : 'בחירת ההחלפה'}
                          </button>
                        </article>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="balance-day-empty">
                  <p className="balance-day-empty__message">
                    לא מצאנו כרגע שינוי שתשפר משמעותית את האיזון של היום.
                  </p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={onClose}
                  >
                    סגירה
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="balance-day-preview">
              <div className="balance-day-card__context">
                <SlotBadge
                  slotId={previewEntry.slotId}
                  slotLabel={previewEntry.slotLabel}
                />
                <span className="balance-day-card__action">
                  {previewEntry.actionType === BALANCE_ACTION_REDUCE_QUANTITY
                    ? 'הקטנת כמות'
                    : 'החלפת ארוחה'}
                </span>
              </div>

              <div className="balance-day-card__swap">
                <div className="balance-day-card__meal">
                  <span className="balance-day-card__label">לפני</span>
                  <span className="balance-day-card__name">
                    {previewEntry.actionType === BALANCE_ACTION_REDUCE_QUANTITY
                      ? formatQuantityMealLabel(
                          previewEntry.currentName,
                          previewEntry.currentQuantity,
                        )
                      : formatMealLabel(
                          previewEntry.currentName,
                          previewEntry.currentQuantity,
                        )}
                  </span>
                  <span className="balance-day-card__cals">
                    <Num>{formatMacro(previewEntry.currentCalories)}</Num>
                    {' קל׳ · '}
                    <Num>{formatMacro(previewEntry.currentProtein)}</Num>
                    {'ג חלבון'}
                  </span>
                </div>

                <div className="balance-day-card__arrow" aria-hidden="true">
                  ↓
                </div>

                <div className="balance-day-card__meal balance-day-card__meal--suggested">
                  <span className="balance-day-card__label">אחרי</span>
                  <span className="balance-day-card__name">
                    {previewEntry.actionType === BALANCE_ACTION_REDUCE_QUANTITY
                      ? formatQuantityMealLabel(
                          previewEntry.currentName,
                          previewEntry.suggestedQuantity,
                        )
                      : formatMealLabel(
                          previewEntry.replacementName,
                          previewEntry.replacementQuantity,
                        )}
                  </span>
                  <span className="balance-day-card__cals">
                    <Num>{formatMacro(previewEntry.suggestedCalories)}</Num>
                    {' קל׳ · '}
                    <Num>{formatMacro(previewEntry.suggestedProtein)}</Num>
                    {'ג חלבון'}
                  </span>
                </div>
              </div>

              {isReplacePreview ? (
                <div className="meal-multiplier meal-swap-quantity">
                  <label
                    className="meal-multiplier__label"
                    htmlFor="balance-replace-preview-quantity"
                  >
                    כמות
                  </label>
                  <div className="meal-multiplier__controls">
                    <button
                      type="button"
                      className="meal-multiplier__step"
                      onClick={() =>
                        handleStepPreviewQuantity(-MEAL_QUANTITY_UI_STEP)
                      }
                      disabled={!canDecreasePreviewQuantity}
                      aria-label="הקטנת כמות"
                    >
                      −
                    </button>
                    <input
                      id="balance-replace-preview-quantity"
                      type="number"
                      inputMode="decimal"
                      min={MIN_MEAL_QUANTITY_UI}
                      step={MEAL_QUANTITY_UI_STEP}
                      className="input-ltr meal-multiplier__input"
                      value={formatQuantity(safePreviewQuantity)}
                      onChange={(event) =>
                        handlePreviewQuantityInput(event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="meal-multiplier__step"
                      onClick={() =>
                        handleStepPreviewQuantity(MEAL_QUANTITY_UI_STEP)
                      }
                      aria-label="הגדלת כמות"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : null}

              <section className="balance-day-impact" aria-label="השפעה על היום">
                <h3 className="balance-day-impact__title">השפעה על היום</h3>
                <div className="balance-day-impact__grid">
                  <ImpactRow
                    label="קלוריות"
                    before={previewEntry.dayCaloriesBefore}
                    after={previewEntry.dayCaloriesAfter}
                    unit=" קל׳"
                  />
                  <ImpactRow
                    label="חלבון"
                    before={previewEntry.dayProteinBefore}
                    after={previewEntry.dayProteinAfter}
                    unit="g"
                  />
                </div>
                <p className="balance-day-card__savings">
                  חיסכון:{' '}
                  <Num>{formatMacro(previewEntry.calorieSavings)}</Num>
                  {' קל׳'}
                </p>
              </section>

              {confirmError ? (
                <p className="balance-day-confirm-error">{confirmError}</p>
              ) : null}

              <div className="balance-day-preview-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleBackFromPreview}
                >
                  ביטול
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirm}
                >
                  {previewEntry.actionType === BALANCE_ACTION_REPLACE_MEAL
                    ? 'אישור החלפה'
                    : 'אישור הקטנה'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BalanceDaySheet
