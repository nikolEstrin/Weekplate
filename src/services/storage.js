const PRODUCTS_KEY = 'weekplate_products'
const MEALS_KEY = 'weekplate_meals'
const GOALS_KEY = 'weekplate_goals'

const NUTRITION_FIELDS = [
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
]

const GOAL_FIELDS = ['calories', 'protein', 'carbs', 'fat']

const MEAL_TAGS = ['breakfast', 'lunch', 'dinner', 'snack', 'other']

const DEFAULT_GOALS = {
  calories: 1500,
  protein: 110,
  carbs: 150,
  fat: 50,
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
    errors.name = 'יש להזין שם מוצר'
  }

  const nutrition = {}
  for (const field of NUTRITION_FIELDS) {
    const value = parseNumber(source[field])
    if (!Number.isFinite(value)) {
      errors[field] = 'יש להזין מספר תקין'
      continue
    }
    if (value < 0) {
      errors[field] = 'הערך לא יכול להיות שלילי'
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
    return { ok: false, errors: { id: 'המוצר לא נמצא' }, product: null }
  }

  const products = getProducts()
  const index = products.findIndex((product) => product.id === id)
  if (index === -1) {
    return { ok: false, errors: { id: 'המוצר לא נמצא' }, product: null }
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

export function validateMeal(input, products) {
  const errors = {}
  const source = input && typeof input === 'object' ? input : {}
  const productList = Array.isArray(products) ? products : []
  const productIds = new Set(
    productList
      .filter((product) => product && typeof product.id === 'string')
      .map((product) => product.id),
  )

  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!name) {
    errors.name = 'יש להזין שם ארוחה'
  }

  const tag =
    typeof source.tag === 'string' ? source.tag.trim().toLowerCase() : ''
  if (!MEAL_TAGS.includes(tag)) {
    errors.tag = 'יש לבחור סוג ארוחה'
  }

  const rawIngredients = Array.isArray(source.ingredients)
    ? source.ingredients
    : null

  if (!rawIngredients || rawIngredients.length === 0) {
    errors.ingredients = 'יש להוסיף לפחות מרכיב אחד'
  }

  const ingredients = []
  if (rawIngredients && rawIngredients.length > 0) {
    const ingredientErrors = []
    let hasIngredientErrors = false

    for (let index = 0; index < rawIngredients.length; index += 1) {
      const item = rawIngredients[index]
      const entry = item && typeof item === 'object' ? item : {}
      const itemErrors = {}

      const productId =
        typeof entry.productId === 'string' ? entry.productId.trim() : ''
      if (!productId || !productIds.has(productId)) {
        itemErrors.productId = 'המוצר לא נמצא'
      }

      const quantityGrams = parseNumber(entry.quantityGrams)
      if (!Number.isFinite(quantityGrams)) {
        itemErrors.quantityGrams = 'יש להזין מספר תקין'
      } else if (quantityGrams <= 0) {
        itemErrors.quantityGrams = 'הכמות חייבת להיות גדולה מאפס'
      }

      if (Object.keys(itemErrors).length > 0) {
        hasIngredientErrors = true
        ingredientErrors[index] = itemErrors
      } else {
        ingredients.push({
          productId,
          quantityGrams,
        })
      }
    }

    if (hasIngredientErrors) {
      errors.ingredients = ingredientErrors
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, meal: null }
  }

  return {
    ok: true,
    errors: {},
    meal: {
      name,
      tag,
      ingredients,
    },
  }
}

function readStoredMeals(products) {
  try {
    const raw = localStorage.getItem(MEALS_KEY)
    if (raw == null || raw === '') {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    const productList = Array.isArray(products) ? products : getProducts()
    const meals = []
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

      const result = validateMeal(item, productList)
      if (!result.ok) {
        continue
      }

      seenIds.add(item.id)
      meals.push({
        id: item.id,
        ...result.meal,
      })
    }

    return meals
  } catch {
    return []
  }
}

export function getMeals() {
  return readStoredMeals()
}

export function saveMeals(meals) {
  if (!Array.isArray(meals)) {
    throw new Error('meals must be an array')
  }

  localStorage.setItem(MEALS_KEY, JSON.stringify(meals))
}

export function addMeal(input, products) {
  const productList = Array.isArray(products) ? products : getProducts()
  const result = validateMeal(input, productList)
  if (!result.ok) {
    return result
  }

  const meal = {
    id: createId(),
    ...result.meal,
  }

  const meals = getMeals()
  meals.push(meal)
  saveMeals(meals)

  return { ok: true, errors: {}, meal }
}

export function updateMeal(id, input, products) {
  if (typeof id !== 'string' || id.trim() === '') {
    return { ok: false, errors: { id: 'הארוחה לא נמצאה' }, meal: null }
  }

  const meals = getMeals()
  const index = meals.findIndex((meal) => meal.id === id)
  if (index === -1) {
    return { ok: false, errors: { id: 'הארוחה לא נמצאה' }, meal: null }
  }

  const productList = Array.isArray(products) ? products : getProducts()
  const result = validateMeal(input, productList)
  if (!result.ok) {
    return result
  }

  const meal = {
    id,
    ...result.meal,
  }

  meals[index] = meal
  saveMeals(meals)

  return { ok: true, errors: {}, meal }
}

export function deleteMeal(id) {
  const meals = getMeals()
  const next = meals.filter((meal) => meal.id !== id)

  if (next.length === meals.length) {
    return false
  }

  saveMeals(next)
  return true
}

export function validateGoals(input) {
  const errors = {}
  const source = input && typeof input === 'object' ? input : {}
  const goals = {}

  for (const field of GOAL_FIELDS) {
    const value = parseNumber(source[field])
    if (!Number.isFinite(value)) {
      errors[field] = 'יש להזין מספר תקין'
      continue
    }
    if (value < 0) {
      errors[field] = 'הערך לא יכול להיות שלילי'
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
