import { useState } from 'react'
import {
  addProduct,
  deleteProduct,
  getProducts,
  updateProduct,
} from '../services/storage.js'
import { roundForDisplay } from '../utils/nutrition.js'

const EMPTY_FORM = {
  name: '',
  caloriesPer100g: '',
  proteinPer100g: '',
  carbsPer100g: '',
  fatPer100g: '',
}

const NUTRITION_FIELDS = [
  { name: 'caloriesPer100g', label: 'קלוריות', id: 'product-calories' },
  { name: 'proteinPer100g', label: 'חלבון', id: 'product-protein' },
  { name: 'carbsPer100g', label: 'פחמימות', id: 'product-carbs' },
  { name: 'fatPer100g', label: 'שומן', id: 'product-fat' },
]

function formatCalories(value) {
  return String(roundForDisplay(value, value % 1 === 0 ? 0 : 1))
}

function formatMacro(value) {
  return String(roundForDisplay(value, value % 1 === 0 ? 0 : 1))
}

function productToForm(product) {
  return {
    name: product.name,
    caloriesPer100g: String(product.caloriesPer100g),
    proteinPer100g: String(product.proteinPer100g),
    carbsPer100g: String(product.carbsPer100g),
    fatPer100g: String(product.fatPer100g),
  }
}

function ProductsPage() {
  const [products, setProducts] = useState(() => getProducts())
  const [query, setQuery] = useState('')
  const [view, setView] = useState('list')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  function refreshProducts() {
    setProducts(getProducts())
  }

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setView('form')
  }

  function openEdit(product) {
    setEditingId(product.id)
    setForm(productToForm(product))
    setErrors({})
    setView('form')
  }

  function closeForm() {
    setView('list')
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrors({})
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()

    const result = editingId
      ? updateProduct(editingId, form)
      : addProduct(form)

    if (!result.ok) {
      setErrors(result.errors)
      return
    }

    refreshProducts()
    closeForm()
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
    refreshProducts()
    closeForm()
  }

  const normalizedQuery = query.trim().toLowerCase()
  const visibleProducts = normalizedQuery
    ? products.filter((product) =>
        product.name.toLowerCase().includes(normalizedQuery),
      )
    : products

  if (view === 'form') {
    const isEdit = Boolean(editingId)

    return (
      <section className="page">
        <form className="product-form" onSubmit={handleSubmit} noValidate>
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
            <h1>{isEdit ? 'עריכת מוצר' : 'הוספת מוצר'}</h1>
            <button type="submit" className="product-form__save">
              שמירה
            </button>
          </header>

          {errors.id ? (
            <p className="product-field__error">{errors.id}</p>
          ) : null}

          <div className="product-field">
            <label htmlFor="product-name">שם המוצר</label>
            <input
              id="product-name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="לדוגמה: חזה עוף"
              autoComplete="off"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'product-name-error' : undefined}
            />
            {errors.name ? (
              <p id="product-name-error" className="product-field__error">
                {errors.name}
              </p>
            ) : null}
          </div>

          <h2 className="product-form__section">ערכים תזונתיים ל־100 גרם</h2>

          {NUTRITION_FIELDS.map((field) => {
            const error = errors[field.name]
            const errorId = `${field.id}-error`

            return (
              <div key={field.name} className="product-field">
                <label htmlFor={field.id}>{field.label}</label>
                <input
                  id={field.id}
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
              onClick={handleDelete}
            >
              מחיקת מוצר
            </button>
          ) : null}
        </form>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="products-header">
        <h1>מוצרים</h1>
        <button type="button" className="products-add" onClick={openAdd}>
          <span aria-hidden="true">+</span>
          הוספת מוצר
        </button>
      </header>

      <div className="products-search-wrap">
        <svg className="products-search__icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          className="products-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="חיפוש מוצרים..."
          aria-label="חיפוש מוצרים"
        />
      </div>

      {visibleProducts.length === 0 ? (
        <div className="products-empty">
          <p>
            {products.length === 0
              ? 'עדיין אין מוצרים. הוסיפו את המוצר הראשון.'
              : 'לא נמצאו מוצרים התואמים לחיפוש.'}
          </p>
        </div>
      ) : (
        <ul className="product-list">
          {visibleProducts.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="product-card"
                onClick={() => openEdit(product)}
              >
                <span className="product-card__name">{product.name}</span>
                <span className="product-card__nutrition">
                  <span className="num">
                    {formatCalories(product.caloriesPer100g)} קל׳
                  </span>
                  {' · '}
                  <span className="num">
                    {formatMacro(product.proteinPer100g)} גרם חלבון
                  </span>
                  {' · '}
                  <span className="num">
                    {formatMacro(product.carbsPer100g)} גרם פחמימות
                  </span>
                  {' · '}
                  <span className="num">
                    {formatMacro(product.fatPer100g)} גרם שומן
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ProductsPage
