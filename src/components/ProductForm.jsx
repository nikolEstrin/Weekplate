import { useState } from 'react'
import {
  addProduct,
  deleteProduct,
  UNIT_NAME_SUGGESTIONS,
  updateProduct,
} from '../services/storage.js'

const EMPTY_FORM = {
  name: '',
  caloriesPer100g: '0',
  proteinPer100g: '0',
  carbsPer100g: '0',
  fatPer100g: '0',
  units: [],
}

const EMPTY_UNIT_DRAFT = {
  name: '',
  grams: '250',
}

/** Select the full value so the next keypress replaces it. */
function selectAllOnFocus(event) {
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
function preserveSelectionOnMouseUp(event) {
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

const NUTRITION_FIELDS = [
  {
    name: 'caloriesPer100g',
    label: 'קלוריות',
    id: 'product-calories',
    unit: 'קק״ל',
    tone: 'calories',
  },
  {
    name: 'proteinPer100g',
    label: 'חלבון',
    id: 'product-protein',
    unit: 'גרם',
    tone: 'protein',
  },
  {
    name: 'carbsPer100g',
    label: 'פחמימות',
    id: 'product-carbs',
    unit: 'גרם',
    tone: 'carbs',
  },
  {
    name: 'fatPer100g',
    label: 'שומן',
    id: 'product-fat',
    unit: 'גרם',
    tone: 'fat',
  },
]

function IconPencil() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.5 4.5l5 5L8 21H3v-5L14.5 4.5z" />
      <path d="M12.5 6.5l5 5" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 19V10M12 19V5M19 19v-7" />
    </svg>
  )
}

function IconRuler() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 8h16v8H4z" />
      <path d="M8 8v3M12 8v4M16 8v3" />
    </svg>
  )
}

function IconFlame() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c2 3 1 5-1 7 3 0 6 2 6 6a5 5 0 01-10 0c0-3 2-5 3-7-2 1-3 3-3 5 0 .5.1 1 .2 1.4C6.5 13 7 11 9 9c0 2 1 3 2 4 .5-2 1.5-4 1-10z" />
    </svg>
  )
}

function IconProtein() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 8c0-2 1.5-3.5 3-3.5S15 6 15 8c0 1.5-.5 2.5-1.5 3.5L15 15l-1.5 1.5L11 14l-1.5 2.5L8 15l2-3.5C9.2 10.5 9 9.5 9 8z" />
      <path d="M8 18h8" />
    </svg>
  )
}

function IconCarbs() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 20c0-6 3-9 3-14 0 0-3 2-3 5 0-3-3-5-3-5 0 5 3 8 3 14z" />
      <path d="M9 10c-2 1-3 3-3 5M15 10c2 1 3 3 3 5" />
    </svg>
  )
}

function IconFat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4c3 4 5 7 5 10a5 5 0 01-10 0c0-3 2-6 5-10z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7.5h.01" />
    </svg>
  )
}

function NutritionIcon({ tone }) {
  if (tone === 'calories') return <IconFlame />
  if (tone === 'protein') return <IconProtein />
  if (tone === 'carbs') return <IconCarbs />
  return <IconFat />
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `unit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function productToForm(product) {
  const units = Array.isArray(product.units)
    ? product.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        grams: String(unit.grams),
      }))
    : []

  return {
    name: product.name,
    caloriesPer100g: String(product.caloriesPer100g),
    proteinPer100g: String(product.proteinPer100g),
    carbsPer100g: String(product.carbsPer100g),
    fatPer100g: String(product.fatPer100g),
    units,
  }
}

/**
 * Create/edit product form. Used by Products page and Today add-product flow.
 * @param {{
 *   editingProduct?: object | null,
 *   onCancel: () => void,
 *   onSaved: (product: object) => void,
 *   onDeleted?: () => void,
 *   idPrefix?: string,
 * }} props
 */
function ProductForm({
  editingProduct = null,
  onCancel,
  onSaved,
  onDeleted,
  idPrefix = 'product',
}) {
  const editingId = editingProduct?.id || null
  const [form, setForm] = useState(() =>
    editingProduct
      ? productToForm(editingProduct)
      : { ...EMPTY_FORM, units: [] },
  )
  const [unitDraft, setUnitDraft] = useState(EMPTY_UNIT_DRAFT)
  const [editingUnitId, setEditingUnitId] = useState(null)
  const [unitError, setUnitError] = useState('')
  const [errors, setErrors] = useState({})

  const isEdit = Boolean(editingId)

  function resetUnitEditor() {
    setUnitDraft(EMPTY_UNIT_DRAFT)
    setEditingUnitId(null)
    setUnitError('')
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function handleUnitDraftChange(field, value) {
    setUnitDraft((current) => ({ ...current, [field]: value }))
    setUnitError('')
  }

  function handleSuggestionClick(name) {
    setUnitDraft((current) => ({ ...current, name }))
    setUnitError('')
  }

  function startEditUnit(unit) {
    setEditingUnitId(unit.id)
    setUnitDraft({
      name: unit.name,
      grams: String(unit.grams),
    })
    setUnitError('')
  }

  function handleSaveUnit() {
    const name = typeof unitDraft.name === 'string' ? unitDraft.name.trim() : ''
    const grams = Number(
      typeof unitDraft.grams === 'string'
        ? unitDraft.grams.trim()
        : unitDraft.grams,
    )

    if (!name) {
      setUnitError('יש להזין שם יחידה')
      return
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      setUnitError('הגרמים חייבים להיות גדולים מאפס')
      return
    }

    setForm((current) => {
      const nextUnit = {
        id: editingUnitId || createLocalId(),
        name,
        grams: String(grams),
      }

      if (editingUnitId) {
        return {
          ...current,
          units: current.units.map((unit) =>
            unit.id === editingUnitId ? nextUnit : unit,
          ),
        }
      }

      return {
        ...current,
        units: [...current.units, nextUnit],
      }
    })

    resetUnitEditor()
  }

  function handleRemoveUnit(unitId) {
    setForm((current) => ({
      ...current,
      units: current.units.filter((unit) => unit.id !== unitId),
    }))
    if (editingUnitId === unitId) {
      resetUnitEditor()
    }
  }

  function handleSubmit(event) {
    event.preventDefault()

    const payload = {
      name: form.name,
      caloriesPer100g: form.caloriesPer100g,
      proteinPer100g: form.proteinPer100g,
      carbsPer100g: form.carbsPer100g,
      fatPer100g: form.fatPer100g,
      units: form.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        grams: unit.grams,
      })),
    }

    const result = editingId
      ? updateProduct(editingId, payload)
      : addProduct(payload)

    if (!result.ok) {
      setErrors(result.errors)
      if (result.errors?.name) {
        window.setTimeout(() => scrollFormToNameField(nameId), 0)
      }
      return
    }

    onSaved(result.product)
  }

  function handleDelete() {
    if (!editingId) {
      return
    }

    const confirmed = window.confirm('למחוק את המוצר?')
    if (!confirmed) {
      return
    }

    deleteProduct(editingId)
    if (typeof onDeleted === 'function') {
      onDeleted()
    }
  }

  const nameId = `${idPrefix}-name`
  const unitNameId = `${idPrefix}-unit-name`
  const unitGramsId = `${idPrefix}-unit-grams`

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <header className="product-form__header">
        <div className="product-form__heading">
          <span className="product-form__badge" aria-hidden="true">
            <IconPencil />
          </span>
          <div className="product-form__titles">
            <h1>{isEdit ? 'עריכת מוצר' : 'הוספת מוצר'}</h1>
            <p className="product-form__subtitle">
              {isEdit
                ? 'עדכן את פרטי המוצר וערכים תזונתיים'
                : 'הזן את פרטי המוצר וערכים תזונתיים'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="product-form__close"
          onClick={onCancel}
          aria-label="ביטול"
        >
          <IconClose />
        </button>
      </header>

      {errors.id ? (
        <p className="product-field__error">{errors.id}</p>
      ) : null}

      <section className="product-form__panel product-form__panel--name">
        <div className="product-field">
          <label htmlFor={nameId}>
            שם המוצר <span className="product-field__required">*</span>
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            placeholder="לדוגמה: חזה עוף"
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
          />
          {errors.name ? (
            <p id={`${nameId}-error`} className="product-field__error">
              {errors.name}
            </p>
          ) : null}
        </div>
      </section>

      <section
        className="product-form__panel product-form__panel--nutrition"
        aria-labelledby={`${idPrefix}-nutrition-title`}
      >
        <div className="product-form__panel-head">
          <span
            className="product-form__panel-icon product-form__panel-icon--blue"
            aria-hidden="true"
          >
            <IconChart />
          </span>
          <div>
            <h2
              id={`${idPrefix}-nutrition-title`}
              className="product-form__panel-title"
            >
              ערכים תזונתיים ל־100 גרם
            </h2>
            <p className="product-form__panel-hint">
              הזן את הערכים התזונתיים של המוצר לפי 100 גרם
            </p>
          </div>
        </div>

        <div className="product-form__nutrition-grid">
          {NUTRITION_FIELDS.map((field) => {
            const fieldId = `${idPrefix}-${field.name}`
            const error = errors[field.name]
            const errorId = `${fieldId}-error`

            return (
              <div
                key={field.name}
                className={`product-nutrition-card product-nutrition-card--${field.tone}`}
              >
                <span
                  className="product-nutrition-card__icon"
                  aria-hidden="true"
                >
                  <NutritionIcon tone={field.tone} />
                </span>
                <label
                  htmlFor={fieldId}
                  className="product-nutrition-card__label"
                >
                  {field.label}
                </label>
                <input
                  id={fieldId}
                  name={field.name}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  className="input-ltr product-nutrition-card__input"
                  value={form[field.name]}
                  onChange={handleChange}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                />
                <span className="product-nutrition-card__unit">{field.unit}</span>
                {error ? (
                  <p id={errorId} className="product-field__error">
                    {error}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section
        className="product-form__panel product-form__panel--units"
        aria-label="יחידות מידה"
      >
        <div className="product-form__panel-head">
          <span
            className="product-form__panel-icon product-form__panel-icon--peach"
            aria-hidden="true"
          >
            <IconRuler />
          </span>
          <div>
            <h2 className="product-form__panel-title">יחידות מידה נוספות</h2>
            <p className="product-form__panel-hint">
              הוסף יחידות נוספות למוצר (בנוסף לגרמים) כדי להקל על ההזנה.
            </p>
          </div>
        </div>

        {form.units.length === 0 ? (
          <p className="product-units__empty">
            {isEdit
              ? 'עדיין אין יחידות למוצר הזה — הוסיפו למטה.'
              : 'אין יחידות מותאמות עדיין.'}
          </p>
        ) : (
          <ul className="product-units__list">
            {form.units.map((unit) => (
              <li key={unit.id} className="product-units__item">
                <button
                  type="button"
                  className="product-units__item-name"
                  onClick={() => startEditUnit(unit)}
                >
                  {unit.name}
                </button>
                <span className="product-units__item-sep">גרם ליחידה</span>
                <div className="product-units__item-grams-box">
                  <span className="num">{unit.grams}</span>
                </div>
                <button
                  type="button"
                  className="product-units__remove"
                  onClick={() => handleRemoveUnit(unit.id)}
                  aria-label={`הסרת יחידה ${unit.name}`}
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="product-units__editor">
          <span className="product-units__editor-title">
            {editingUnitId ? 'עריכת יחידה' : 'הוספת יחידה'}
          </span>

          <div
            className="product-units__suggestions"
            role="group"
            aria-label="הצעות לשם יחידה"
          >
            {UNIT_NAME_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={
                  unitDraft.name === suggestion
                    ? 'meal-chip meal-chip--active'
                    : 'meal-chip'
                }
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="product-units__fields">
            <div className="product-field product-units__field-name">
              <label htmlFor={unitNameId}>שם יחידה</label>
              <input
                id={unitNameId}
                type="text"
                value={unitDraft.name}
                onChange={(event) =>
                  handleUnitDraftChange('name', event.target.value)
                }
                placeholder="לדוגמה: קופסה"
                autoComplete="off"
              />
            </div>
            <div className="product-field product-units__field-grams">
              <label htmlFor={unitGramsId}>גרם ליחידה</label>
              <input
                id={unitGramsId}
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                className="input-ltr"
                value={unitDraft.grams}
                onChange={(event) =>
                  handleUnitDraftChange('grams', event.target.value)
                }
                onFocus={selectAllOnFocus}
                onClick={selectAllOnFocus}
                onMouseUp={preserveSelectionOnMouseUp}
              />
            </div>
          </div>

          {unitError ? (
            <p className="product-field__error">{unitError}</p>
          ) : null}

          <div className="product-units__editor-actions">
            <button
              type="button"
              className="product-units__save-unit"
              onClick={handleSaveUnit}
            >
              <span className="product-units__save-unit-icon" aria-hidden="true">
                <IconPlus />
              </span>
              {editingUnitId ? 'עדכון יחידה' : 'הוספת יחידת מידה נוספת'}
            </button>
            {editingUnitId ? (
              <button
                type="button"
                className="btn-secondary product-units__cancel-edit"
                onClick={resetUnitEditor}
              >
                ביטול עריכה
              </button>
            ) : null}
          </div>
        </div>

        <p className="product-units__footer-hint">
          <span className="product-units__footer-hint-icon" aria-hidden="true">
            <IconInfo />
          </span>
          ניתן לבחור מתוך יחידות קיימות (כפית, כף, כוס, פרוסה וכו׳) או להזין שם
          יחידה מותאם אישית.
        </p>
      </section>

      <div className="product-form__actions">
        <button type="submit" className="btn-primary product-form__submit">
          שמירה
          <span className="product-form__submit-icon" aria-hidden="true">
            <IconCheck />
          </span>
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
      </div>

      {isEdit ? (
        <button
          type="button"
          className="product-form__delete"
          onClick={handleDelete}
        >
          מחיקת מוצר
        </button>
      ) : null}
    </form>
  )
}

export default ProductForm
