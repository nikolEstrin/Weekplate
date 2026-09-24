import { useState } from 'react'
import {
  addProduct,
  deleteProduct,
  UNIT_NAME_SUGGESTIONS,
  updateProduct,
} from '../services/storage.js'

const EMPTY_FORM = {
  name: '',
  caloriesPer100g: '',
  proteinPer100g: '',
  carbsPer100g: '',
  fatPer100g: '',
  units: [],
}

const EMPTY_UNIT_DRAFT = {
  name: '',
  grams: '',
}

const NUTRITION_FIELDS = [
  { name: 'caloriesPer100g', label: 'קלוריות', id: 'product-calories' },
  { name: 'proteinPer100g', label: 'חלבון', id: 'product-protein' },
  { name: 'carbsPer100g', label: 'פחמימות', id: 'product-carbs' },
  { name: 'fatPer100g', label: 'שומן', id: 'product-fat' },
]

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
        <button
          type="button"
          className="product-form__close"
          onClick={onCancel}
          aria-label="ביטול"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h1>{isEdit ? 'עריכת מוצר' : 'הוספת מוצר'}</h1>
        <button type="submit" className="product-form__save">
          שמירה
        </button>
      </header>

      {errors.id ? (
        <p className="product-field__error">{errors.id}</p>
      ) : null}

      <div className="product-field">
        <label htmlFor={nameId}>שם המוצר</label>
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

      <h2 className="product-form__section">ערכים תזונתיים ל־100 גרם</h2>

      {NUTRITION_FIELDS.map((field) => {
        const fieldId = `${idPrefix}-${field.name}`
        const error = errors[field.name]
        const errorId = `${fieldId}-error`

        return (
          <div key={field.name} className="product-field">
            <label htmlFor={fieldId}>{field.label}</label>
            <input
              id={fieldId}
              name={field.name}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className="input-ltr"
              value={form[field.name]}
              onChange={handleChange}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
            {error ? (
              <p id={errorId} className="product-field__error">
                {error}
              </p>
            ) : null}
          </div>
        )
      })}

      <section className="product-units" aria-label="יחידות מידה">
        <h2 className="product-form__section">יחידות מידה</h2>
        <p className="product-units__hint">
          {isEdit
            ? 'מוצרים קיימים נשמרים בגרמים. אפשר להוסיף כאן יחידות מידה חדשות (קופסה, יחידה וכו׳) בלי לשנות ארוחות שכבר נשמרו.'
            : 'אופציונלי. לדוגמה: קופסה = 250 גרם. גרם תמיד זמין כברירת מחדל.'}
        </p>

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
                <div className="product-units__item-info">
                  <span className="product-units__item-name">{unit.name}</span>
                  <span className="product-units__item-grams">
                    <span className="num">{unit.grams}</span>
                    {' גרם'}
                  </span>
                </div>
                <div className="product-units__item-actions">
                  <button
                    type="button"
                    className="product-units__edit"
                    onClick={() => startEditUnit(unit)}
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    className="product-units__remove"
                    onClick={() => handleRemoveUnit(unit.id)}
                  >
                    הסרה
                  </button>
                </div>
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
            <div className="product-field">
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
            <div className="product-field">
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
                placeholder="250"
              />
            </div>
          </div>

          {unitError ? (
            <p className="product-field__error">{unitError}</p>
          ) : null}

          <div className="product-units__editor-actions">
            <button
              type="button"
              className="btn-secondary product-units__save-unit"
              onClick={handleSaveUnit}
            >
              {editingUnitId ? 'עדכון יחידה' : 'הוספת יחידה'}
            </button>
            {editingUnitId ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={resetUnitEditor}
              >
                ביטול עריכה
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="product-form__actions">
        <button type="submit" className="btn-primary">
          שמירה
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
