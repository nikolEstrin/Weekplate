const PRODUCTS_KEY = 'weekplate.products'
const GOALS_KEY = 'weekplate.goals'

const NUTRITION_FIELDS = [
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
]

const GOAL_FIELDS = ['calories', 'protein', 'carbs', 'fat']

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      return Number.NaN
    }
    return Number(trimmed)
  }

  return Number.NaN
}

export function validateProduct(input) {
  const errors = {}
  const source = input && typeof input === 'object' ? input : {}

  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!name) {
    errors.name = 'Name is required'
  }

  const nutrition = {}
  for (const field of NUTRITION_FIELDS) {
    const value = parseNumber(source[field])
    if (!Number.isFinite(value)) {
      errors[field] = 'Must be a valid number'
      continue
    }
    if (value < 0) {
      errors[field] = 'Cannot be negative'
      continue
    }
    nutrition[field] = value
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, product: null }
  }

  return {
    ok: true,
    errors: {},
    product: {
      name,
      caloriesPer100g: nutrition.caloriesPer100g,
      proteinPer100g: nutrition.proteinPer100g,
      carbsPer100g: nutrition.carbsPer100g,
      fatPer100g: nutrition.fatPer100g,
    },
  }
}

function readStoredProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY)
    if (raw == null || raw === '') {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    const products = []
    const seenIds = new Set()
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        continue
      }
      if (typeof item.id !== 'string' || item.id.trim() === '') {
        continue
      }
      if (seenIds.has(item.id)) {
        continue
      }

      const result = validateProduct(item)
      if (!result.ok) {
        continue
      }

      seenIds.add(item.id)
      products.push({
        id: item.id,
        ...result.product,
      })
    }

    return products
  } catch {
    return []
  }
}

export function getProducts() {
  return readStoredProducts()
}

export function saveProducts(products) {
  if (!Array.isArray(products)) {
    throw new Error('products must be an array')
  }

  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products))
}

export function addProduct(input) {
  const result = validateProduct(input)
  if (!result.ok) {
    return result
  }

  const product = {
    id: createId(),
    ...result.product,
  }

  const products = getProducts()
  products.push(product)
  saveProducts(products)

  return { ok: true, errors: {}, product }
}

export function updateProduct(id, input) {
  if (typeof id !== 'string' || id.trim() === '') {
    return { ok: false, errors: { id: 'Product not found' }, product: null }
  }

  const products = getProducts()
  const index = products.findIndex((product) => product.id === id)
  if (index === -1) {
    return { ok: false, errors: { id: 'Product not found' }, product: null }
  }

  const result = validateProduct(input)
  if (!result.ok) {
    return result
  }

  const product = {
    id,
    ...result.product,
  }

  products[index] = product
  saveProducts(products)

  return { ok: true, errors: {}, product }
}

export function deleteProduct(id) {
  const products = getProducts()
  const next = products.filter((product) => product.id !== id)

  if (next.length === products.length) {
    return false
  }

  saveProducts(next)
  return true
}

export function validateGoals(input) {
  const errors = {}
  const source = input && typeof input === 'object' ? input : {}
  const goals = {}

  for (const field of GOAL_FIELDS) {
    const value = parseNumber(source[field])
    if (!Number.isFinite(value)) {
      errors[field] = 'Must be a valid number'
      continue
    }
    if (value < 0) {
      errors[field] = 'Cannot be negative'
      continue
    }
    goals[field] = value
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, goals: null }
  }

  return {
    ok: true,
    errors: {},
    goals: {
      calories: goals.calories,
      protein: goals.protein,
      carbs: goals.carbs,
      fat: goals.fat,
    },
  }
}

function readStoredGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY)
    if (raw == null || raw === '') {
      return { ...DEFAULT_GOALS }
    }

    const parsed = JSON.parse(raw)
    const result = validateGoals(parsed)
    if (!result.ok) {
      return { ...DEFAULT_GOALS }
    }

    return result.goals
  } catch {
    return { ...DEFAULT_GOALS }
  }
}

export function getGoals() {
  return readStoredGoals()
}

export function saveGoals(input) {
  const result = validateGoals(input)
  if (!result.ok) {
    return result
  }

  localStorage.setItem(GOALS_KEY, JSON.stringify(result.goals))
  return { ok: true, errors: {}, goals: result.goals }
}
