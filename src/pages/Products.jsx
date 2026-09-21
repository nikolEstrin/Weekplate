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
  caloriesPer100g: '0',
  proteinPer100g: '0',
  carbsPer100g: '0',
  fatPer100g: '0',
}

const NUTRITION_FIELDS = [
  { name: 'caloriesPer100g', label: 'Calories (kcal)', id: 'product-calories' },
  { name: 'proteinPer100g', label: 'Protein (g)', id: 'product-protein' },
  { name: 'carbsPer100g', label: 'Carbs (g)', id: 'product-carbs' },
  { name: 'fatPer100g', label: 'Fat (g)', id: 'product-fat' },
]

function formatMacro(value) {
  return String(roundForDisplay(value, 1))
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

function Products() {
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

    const confirmed = window.confirm('Delete this product?')
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
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <h1>{isEdit ? 'Edit Product' : 'Add Product'}</h1>
            <button type="submit" className="product-form__save">
              Save
            </button>
          </header>

          {errors.id ? (
            <p className="product-field__error">{errors.id}</p>
          ) : null}

          <div className="product-field">
            <label htmlFor="product-name">Name</label>
            <input
              id="product-name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="e.g. Chicken Breast"
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

          <h2 className="product-form__section">Nutrition values (per 100g)</h2>

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

          {isEdit ? (
            <button
              type="button"
              className="product-form__delete"
              onClick={handleDelete}
            >
              Delete product
            </button>
          ) : null}
        </form>
      </section>
    )
  }

  return (
    <section className="page">
      <header className="products-header">
        <h1>Products</h1>
        <button type="button" className="products-add" onClick={openAdd}>
          <span aria-hidden="true">+</span>
          Add Product
        </button>
      </header>

      <input
        type="search"
        className="products-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search products..."
        aria-label="Search products"
      />

      {visibleProducts.length === 0 ? (
        <div className="products-empty">
          <p>
            {products.length === 0
              ? 'No products yet. Add your first product.'
              : 'No products match your search.'}
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
                  {roundForDisplay(product.caloriesPer100g, 0)} kcal ·{' '}
                  {formatMacro(product.proteinPer100g)}g P ·{' '}
                  {formatMacro(product.carbsPer100g)}g C ·{' '}
                  {formatMacro(product.fatPer100g)}g F per 100g
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default Products
