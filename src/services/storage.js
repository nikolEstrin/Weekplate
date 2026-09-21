const PRODUCTS_KEY = 'weekplate_products'
const MEALS_KEY = 'weekplate_meals'
const GOALS_KEY = 'weekplate_goals'
const TODAY_KEY = 'weekplate_today'

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

function isPositiveQuantity(value) {
  return Number.isFinite(value) && value > 0
}

function findProductById(products, productId) {
  if (!Array.isArray(products) || typeof productId !== 'string') {
    return null
  }

  return (
    products.find(
      (product) => product && typeof product === 'object' && product.id === productId,
    ) || null
  )
}

function snapshotIngredient(ingredient, products) {
  const source = ingredient && typeof ingredient === 'object' ? ingredient : {}
  const productId =
    typeof source.productId === 'string' ? source.productId.trim() : ''
  const quantityGrams = parseNumber(source.quantityGrams)

  if (!productId || !isPositiveQuantity(quantityGrams)) {
    return null
  }

  const product = findProductById(products, productId)
  const snapshot = {
    productId,
    quantityGrams,
  }

  if (product) {
    snapshot.productName = product.name
    snapshot.caloriesPer100g = product.caloriesPer100g
    snapshot.proteinPer100g = product.proteinPer100g
    snapshot.carbsPer100g = product.carbsPer100g
    snapshot.fatPer100g = product.fatPer100g
  } else {
    if (typeof source.productName === 'string' && source.productName.trim() !== '') {
      snapshot.productName = source.productName.trim()
    }
    for (const field of NUTRITION_FIELDS) {
      const value = parseNumber(source[field])
      if (Number.isFinite(value) && value >= 0) {
        snapshot[field] = value
      }
    }
  }

  return snapshot
}

function normalizePlannerIngredient(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') {
    return null
  }

  const productId =
    typeof ingredient.productId === 'string' ? ingredient.productId.trim() : ''
  const quantityGrams = parseNumber(ingredient.quantityGrams)

  if (!productId || !isPositiveQuantity(quantityGrams)) {
    return null
  }

  const normalized = {
    productId,
    quantityGrams,
  }

  if (
    typeof ingredient.productName === 'string' &&
    ingredient.productName.trim() !== ''
  ) {
    normalized.productName = ingredient.productName.trim()
  }

  for (const field of NUTRITION_FIELDS) {
    const value = parseNumber(ingredient[field])
    if (Number.isFinite(value) && value >= 0) {
      normalized[field] = value
    }
  }

  return normalized
}

function normalizePlannerItem(item) {
  if (!item || typeof item !== 'object') {
    return null
  }

  if (typeof item.id !== 'string' || item.id.trim() === '') {
    return null
  }

  const type = item.type === 'product' ? 'product' : item.type === 'meal' ? 'meal' : null
  if (!type) {
    return null
  }

  const name = typeof item.name === 'string' ? item.name.trim() : ''
  if (!name) {
    return null
  }

  const rawIngredients = Array.isArray(item.ingredients) ? item.ingredients : []
  const ingredients = []
  for (const ingredient of rawIngredients) {
    const normalized = normalizePlannerIngredient(ingredient)
    if (normalized) {
      ingredients.push(normalized)
    }
  }

  if (ingredients.length === 0) {
    return null
  }

  const planned = {
    id: item.id,
    type,
    name,
    ingredients,
  }

  if (type === 'meal') {
    if (typeof item.tag === 'string' && item.tag.trim() !== '') {
      planned.tag = item.tag.trim().toLowerCase()
    }
    if (typeof item.sourceMealId === 'string' && item.sourceMealId.trim() !== '') {
      planned.sourceMealId = item.sourceMealId.trim()
    }
  }

  return planned
}

function readStoredTodayPlanner() {
  try {
    const raw = localStorage.getItem(TODAY_KEY)
    if (raw == null || raw === '') {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    const items = []
    const seenIds = new Set()

    for (const item of parsed) {
      const normalized = normalizePlannerItem(item)
      if (!normalized) {
        continue
      }
      if (seenIds.has(normalized.id)) {
        continue
      }

      seenIds.add(normalized.id)
      items.push(normalized)
    }

    return items
  } catch {
    return []
  }
}

export function getTodayPlanner() {
  return readStoredTodayPlanner()
}

export function saveTodayPlanner(items) {
  if (!Array.isArray(items)) {
    throw new Error('today planner must be an array')
  }

  const normalized = []
  const seenIds = new Set()

  for (const item of items) {
    const next = normalizePlannerItem(item)
    if (!next) {
      continue
    }
    if (seenIds.has(next.id)) {
      continue
    }
    seenIds.add(next.id)
    normalized.push(next)
  }

  localStorage.setItem(TODAY_KEY, JSON.stringify(normalized))
  return normalized
}

/**
 * Deep-clones a saved meal into an independent Today planner item.
 * Quantities live only on the planner snapshot — never mutate getMeals().
 */
export function addMealToToday(meal, products) {
  const source = meal && typeof meal === 'object' ? meal : null
  if (!source) {
    return { ok: false, errors: { meal: 'הארוחה לא נמצאה' }, item: null }
  }

  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!name) {
    return { ok: false, errors: { name: 'יש להזין שם ארוחה' }, item: null }
  }

  const productList = Array.isArray(products) ? products : getProducts()
  const rawIngredients = Array.isArray(source.ingredients) ? source.ingredients : []
  const ingredients = []

  for (const ingredient of rawIngredients) {
    const snapshot = snapshotIngredient(ingredient, productList)
    if (snapshot) {
      ingredients.push(snapshot)
    }
  }

  if (ingredients.length === 0) {
    return {
      ok: false,
      errors: { ingredients: 'יש להוסיף לפחות מרכיב אחד' },
      item: null,
    }
  }

  const item = {
    id: createId(),
    type: 'meal',
    name,
    ingredients,
  }

  if (typeof source.tag === 'string' && source.tag.trim() !== '') {
    item.tag = source.tag.trim().toLowerCase()
  }

  if (typeof source.id === 'string' && source.id.trim() !== '') {
    item.sourceMealId = source.id.trim()
  }

  const planner = getTodayPlanner()
  planner.push(item)
  saveTodayPlanner(planner)

  return { ok: true, errors: {}, item }
}

export function addProductToToday(product, quantityGrams) {
  const source = product && typeof product === 'object' ? product : null
  if (!source || typeof source.id !== 'string' || source.id.trim() === '') {
    return { ok: false, errors: { product: 'המוצר לא נמצא' }, item: null }
  }

  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!name) {
    return { ok: false, errors: { name: 'יש להזין שם מוצר' }, item: null }
  }

  const quantity = parseNumber(quantityGrams)
  if (!isPositiveQuantity(quantity)) {
    return {
      ok: false,
      errors: { quantityGrams: 'הכמות חייבת להיות גדולה מאפס' },
      item: null,
    }
  }

  const ingredient = snapshotIngredient(
    { productId: source.id, quantityGrams: quantity },
    [source],
  )

  if (!ingredient) {
    return {
      ok: false,
      errors: { quantityGrams: 'הכמות חייבת להיות גדולה מאפס' },
      item: null,
    }
  }

  const item = {
    id: createId(),
    type: 'product',
    name,
    ingredients: [ingredient],
  }

  const planner = getTodayPlanner()
  planner.push(item)
  saveTodayPlanner(planner)

  return { ok: true, errors: {}, item }
}

/**
 * Updates a single ingredient quantity on a Today planner item only.
 * Does not touch saved meals in weekplate_meals.
 */
export function updateTodayItemQuantity(itemId, ingredientIndex, quantityGrams) {
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return { ok: false, errors: { id: 'הפריט לא נמצא' }, item: null }
  }

  if (!Number.isInteger(ingredientIndex) || ingredientIndex < 0) {
    return {
      ok: false,
      errors: { ingredientIndex: 'מרכיב לא תקין' },
      item: null,
    }
  }

  const quantity = parseNumber(quantityGrams)
  if (!isPositiveQuantity(quantity)) {
    return {
      ok: false,
      errors: { quantityGrams: 'הכמות חייבת להיות גדולה מאפס' },
      item: null,
    }
  }

  const planner = getTodayPlanner()
  const index = planner.findIndex((item) => item.id === itemId)
  if (index === -1) {
    return { ok: false, errors: { id: 'הפריט לא נמצא' }, item: null }
  }

  const item = planner[index]
  if (!item.ingredients[ingredientIndex]) {
    return {
      ok: false,
      errors: { ingredientIndex: 'מרכיב לא תקין' },
      item: null,
    }
  }

  // Replace ingredient object so callers cannot retain a shared reference
  // to pre-update state, and never touch meal storage.
  const nextIngredients = item.ingredients.map((ingredient, i) => {
    if (i !== ingredientIndex) {
      return { ...ingredient }
    }
    return {
      ...ingredient,
      quantityGrams: quantity,
    }
  })

  const nextItem = {
    ...item,
    ingredients: nextIngredients,
  }

  planner[index] = nextItem
  saveTodayPlanner(planner)

  return { ok: true, errors: {}, item: nextItem }
}

export function removeTodayItem(itemId) {
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return false
  }

  const planner = getTodayPlanner()
  const next = planner.filter((item) => item.id !== itemId)

  if (next.length === planner.length) {
    return false
  }

  saveTodayPlanner(next)
  return true
}
