import { useState } from 'react'
import { getProducts } from '../services/storage.js'
import { roundForDisplay } from '../utils/nutrition.js'
import ProductForm from '../components/ProductForm.jsx'

function formatCalories(value) {
  const decimals = value % 1 === 0 ? 0 : 1
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

function ProductsPage() {
  const [products, setProducts] = useState(() => getProducts())
  const [query, setQuery] = useState('')
  const [view, setView] = useState('list')
  const [editingProduct, setEditingProduct] = useState(null)

  function refreshProducts() {
    setProducts(getProducts())
  }

  function openAdd() {
    setEditingProduct(null)
    setView('form')
  }

  function openEdit(product) {
    setEditingProduct(product)
    setView('form')
  }

  function closeForm() {
    setView('list')
    setEditingProduct(null)
  }

  function handleSaved() {
    refreshProducts()
    closeForm()
  }

  function handleDeleted() {
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
    return (
      <section className="page">
        <ProductForm
          key={editingProduct?.id || 'new'}
          editingProduct={editingProduct}
          onCancel={closeForm}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
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
        <ul className="product-list">
          {visibleProducts.map((product, index) => {
            const icons = ['🍎', '🥑', '🥦', '🍓', '🥕', '🥗']
            const icon = icons[index % icons.length]

            return (
              <li key={product.id}>
                <button
                  type="button"
                  className="product-card"
                  onClick={() => openEdit(product)}
                >
                  <span className="product-card__icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="product-card__body">
                    <span className="product-card__name">{product.name}</span>
                    <span className="product-card__nutrition">
                      <span className="num">
                        {formatCalories(product.caloriesPer100g)}
                      </span>
                      {' קל׳ · '}
                      <span className="num">
                        {formatMacro(product.proteinPer100g)}
                      </span>
                      {'ג חלבון · '}
                      <span className="num">
                        {formatMacro(product.carbsPer100g)}
                      </span>
                      {'ג פחמימות · '}
                      <span className="num">
                        {formatMacro(product.fatPer100g)}
                      </span>
                      {'ג שומן'}
                      {' · '}
                      <span className="num">100</span>
                      {' גרם'}
                    </span>
                    {Array.isArray(product.units) && product.units.length > 0 ? (
                      <span className="product-card__units">
                        {product.units
                          .map((unit) => `${unit.name} (${unit.grams}ג)`)
                          .join(' · ')}
                      </span>
                    ) : (
                      <span className="product-card__units product-card__units--empty">
                        לחיצה לעריכה ולהוספת יחידות מידה
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default ProductsPage
