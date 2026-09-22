const PRODUCTS_KEY = 'weekplate_products'
const MEALS_KEY = 'weekplate_meals'
const GOALS_KEY = 'weekplate_goals'
const PLANS_KEY = 'weekplate_plans'
const TODAY_KEY = 'weekplate_today'
const MIGRATIONS_KEY = 'weekplate_migrations'

const NUTRITION_FIELDS = [
  'caloriesPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
]

const GOAL_FIELDS = ['calories', 'protein', 'carbs', 'fat']

export const MEAL_TAG_OPTIONS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'dessert',
]

export const SLOT_IDS = ['breakfast', 'lunch', 'dinner', 'snack']

const PRIMARY_SLOTS = ['breakfast', 'lunch', 'dinner']

const DEFAULT_GOALS = {
  calories: 1500,
  protein: 110,
  carbs: 150,
  fat: 50,
}

const MIGRATION_MEALS_TAGS = 'meals_tags_v1'
const MIGRATION_TODAY_TO_PLANS = 'today_to_plans_v1'

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

function readMigrations() {
  try {
    const raw = localStorage.getItem(MIGRATIONS_KEY)
    if (raw == null || raw === '') {
      return {}
    }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed
  } catch {
    return {}
  }
}

function writeMigrations(migrations) {
  localStorage.setItem(MIGRATIONS_KEY, JSON.stringify(migrations))
}

function setMigrationFlag(flag) {
  const migrations = readMigrations()
  if (migrations[flag]) {
    return
  }
  migrations[flag] = true
  writeMigrations(migrations)
}

function hasMigrationFlag(flag) {
  return Boolean(readMigrations()[flag])
}

/** Local calendar date as YYYY-MM-DD (not UTC). */
export function getLocalDateKey(date = new Date()) {
  const source =
    date instanceof Date ? date : date == null ? new Date() : new Date(date)

  if (Number.isNaN(source.getTime())) {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const y = source.getFullYear()
  const m = String(source.getMonth() + 1).padStart(2, '0')
  const d = String(source.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getEmptyDayPlan() {
  return {
    breakfast: null,
    lunch: null,
    dinner: null,
    snacks: [],
  }
}

/** Map a meal tag to a planner slot. dessert -> snack; others map to self when valid. */
export function tagToRecommendedSlot(tag) {
  const normalized =
    typeof tag === 'string' ? tag.trim().toLowerCase() : ''

  if (normalized === 'dessert' || normalized === 'other') {
    return 'snack'
  }

  if (PRIMARY_SLOTS.includes(normalized) || normalized === 'snack') {
    return normalized
  }

  return null
}

/**
 * Ordered unique slots: recommended from tags first, then remaining
 * breakfast, lunch, dinner, snack.
 */
export function getRecommendedSlots(tags) {
  const list = Array.isArray(tags) ? tags : []
  const ordered = []
  const seen = new Set()

  for (const tag of list) {
    const slot = tagToRecommendedSlot(tag)
    if (!slot || seen.has(slot)) {
      continue
    }
    seen.add(slot)
    ordered.push(slot)
  }

  for (const slot of SLOT_IDS) {
    if (seen.has(slot)) {
      continue
    }
    seen.add(slot)
    ordered.push(slot)
  }

  return ordered
}

function normalizeMealTag(tag) {
  const normalized =
    typeof tag === 'string' ? tag.trim().toLowerCase() : ''

  if (normalized === 'other') {
    return 'snack'
  }

  if (MEAL_TAG_OPTIONS.includes(normalized)) {
    return normalized
  }

  return null
}

/** Prefer valid tags[]; else derive from legacy tag. Deduped, non-empty or null. */
function deriveMealTags(source) {
  if (!source || typeof source !== 'object') {
    return null
  }

  if (Array.isArray(source.tags)) {
    const tags = []
    const seen = new Set()
    for (const entry of source.tags) {
      const tag = normalizeMealTag(entry)
      if (!tag || seen.has(tag)) {
        continue
      }
      seen.add(tag)
      tags.push(tag)
    }
    if (tags.length > 0) {
      return tags
    }
  }

  if (typeof source.tag === 'string') {
    const tag = normalizeMealTag(source.tag)
    if (tag) {
      return [tag]
    }
  }

  return null
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

  // Read raw meals before re-validation so we can strip the deleted product
  // instead of silently dropping whole meals that still had other ingredients.
  let rawMeals = []
  try {
    const raw = localStorage.getItem(MEALS_KEY)
    if (raw != null && raw !== '') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        rawMeals = parsed
      }
    }
  } catch {
    rawMeals = []
  }

  const cleanedMeals = []
  for (const meal of rawMeals) {
    if (!meal || typeof meal !== 'object') {
      continue
    }
    if (typeof meal.id !== 'string' || meal.id.trim() === '') {
      continue
    }

    const rawIngredients = Array.isArray(meal.ingredients)
      ? meal.ingredients
      : []
    const ingredients = []
    for (const ingredient of rawIngredients) {
      if (!ingredient || typeof ingredient !== 'object') {
        continue
      }
      if (ingredient.productId === id) {
        continue
      }
      ingredients.push(ingredient)
    }

    if (ingredients.length === 0) {
      continue
    }

    const result = validateMeal({ ...meal, ingredients }, next)
    if (!result.ok) {
      continue
    }

    cleanedMeals.push({
      id: meal.id,
      ...result.meal,
    })
  }
  saveMeals(cleanedMeals)

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

  const tags = deriveMealTags(source)
  if (!tags || tags.length === 0) {
    errors.tags = 'יש לבחור לפחות תג אחד'
    // Temporary shim for UI still reading errors.tag
    errors.tag = 'יש לבחור לפחות תג אחד'
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
      tags,
      ingredients,
    },
  }
}

function migrateMealsToTags() {
  if (hasMigrationFlag(MIGRATION_MEALS_TAGS)) {
    return
  }

  try {
    const raw = localStorage.getItem(MEALS_KEY)
    if (raw == null || raw === '') {
      setMigrationFlag(MIGRATION_MEALS_TAGS)
      return
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      setMigrationFlag(MIGRATION_MEALS_TAGS)
      return
    }

    let changed = false
    const next = []

    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        continue
      }

      const tags = deriveMealTags(item)
      const hasLegacyTag = Object.prototype.hasOwnProperty.call(item, 'tag')
      const hadTagsArray = Array.isArray(item.tags)

      const migrated = { ...item }
      if (tags) {
        const sameTags =
          hadTagsArray &&
          item.tags.length === tags.length &&
          item.tags.every((t, i) => t === tags[i])
        if (!sameTags || hasLegacyTag) {
          changed = true
        }
        migrated.tags = tags
      } else if (hadTagsArray || hasLegacyTag) {
        // Drop invalid tag/tags; leave as-is for validateMeal to filter later
        if (hasLegacyTag) {
          changed = true
        }
      }

      if (hasLegacyTag) {
        delete migrated.tag
        changed = true
      }

      next.push(migrated)
    }

    if (changed) {
      localStorage.setItem(MEALS_KEY, JSON.stringify(next))
    }

    setMigrationFlag(MIGRATION_MEALS_TAGS)
  } catch {
    setMigrationFlag(MIGRATION_MEALS_TAGS)
  }
}

function readStoredMeals(products) {
  migrateMealsToTags()

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
    const tags = deriveMealTags(item)
    if (tags) {
      planned.tags = tags
    }
    if (typeof item.sourceMealId === 'string' && item.sourceMealId.trim() !== '') {
      planned.sourceMealId = item.sourceMealId.trim()
    }
  }

  return planned
}

function normalizeDayPlan(plan) {
  const empty = getEmptyDayPlan()
  if (!plan || typeof plan !== 'object') {
    return empty
  }

  const next = getEmptyDayPlan()
  for (const slot of PRIMARY_SLOTS) {
    const item = normalizePlannerItem(plan[slot])
    next[slot] = item
  }

  const rawSnacks = Array.isArray(plan.snacks) ? plan.snacks : []
  const snacks = []
  const seenIds = new Set()

  for (const slot of PRIMARY_SLOTS) {
    if (next[slot]) {
      seenIds.add(next[slot].id)
    }
  }

  for (const item of rawSnacks) {
    const normalized = normalizePlannerItem(item)
    if (!normalized) {
      continue
    }
    if (seenIds.has(normalized.id)) {
      continue
    }
    seenIds.add(normalized.id)
    snacks.push(normalized)
  }

  next.snacks = snacks
  return next
}

/** Flatten a day plan into a list for calculatePlannerNutrition. */
export function flattenDayPlan(plan) {
  const normalized = normalizeDayPlan(plan)
  const items = []

  for (const slot of PRIMARY_SLOTS) {
    if (normalized[slot]) {
      items.push(normalized[slot])
    }
  }

  for (const snack of normalized.snacks) {
    items.push(snack)
  }

  return items
}

function readStoredPlans() {
  try {
    const raw = localStorage.getItem(PLANS_KEY)
    if (raw == null || raw === '') {
      return {}
    }

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const plans = {}
    for (const [dateKey, plan] of Object.entries(parsed)) {
      if (typeof dateKey !== 'string' || dateKey.trim() === '') {
        continue
      }
      plans[dateKey] = normalizeDayPlan(plan)
    }
    return plans
  } catch {
    return {}
  }
}

function writeStoredPlans(plans) {
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans))
}

function readLegacyTodayPlanner() {
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

function assignLegacyItemToPlan(plan, item) {
  if (!item) {
    return
  }

  if (item.type === 'meal') {
    const tags = Array.isArray(item.tags) ? item.tags : []
    const primaryTag = tags.find((tag) => PRIMARY_SLOTS.includes(tag))
    if (primaryTag && plan[primaryTag] == null) {
      plan[primaryTag] = item
      return
    }
  }

  plan.snacks.push(item)
}

function migrateTodayToPlans() {
  if (hasMigrationFlag(MIGRATION_TODAY_TO_PLANS)) {
    return
  }

  try {
    const legacyItems = readLegacyTodayPlanner()
    if (legacyItems.length > 0) {
      const plans = readStoredPlans()
      const dateKey = getLocalDateKey()
      const plan = plans[dateKey]
        ? normalizeDayPlan(plans[dateKey])
        : getEmptyDayPlan()

      for (const item of legacyItems) {
        assignLegacyItemToPlan(plan, item)
      }

      plans[dateKey] = plan
      writeStoredPlans(plans)
    }

    localStorage.removeItem(TODAY_KEY)
    setMigrationFlag(MIGRATION_TODAY_TO_PLANS)
  } catch {
    try {
      localStorage.removeItem(TODAY_KEY)
    } catch {
      // ignore
    }
    setMigrationFlag(MIGRATION_TODAY_TO_PLANS)
  }
}

function ensureMigrations() {
  migrateMealsToTags()
  migrateTodayToPlans()
}

export function getAllPlans() {
  ensureMigrations()
  return readStoredPlans()
}

export function getDayPlan(dateKey) {
  ensureMigrations()
  const key =
    typeof dateKey === 'string' && dateKey.trim() !== ''
      ? dateKey.trim()
      : getLocalDateKey()

  const plans = readStoredPlans()
  if (!plans[key]) {
    return getEmptyDayPlan()
  }

  return normalizeDayPlan(plans[key])
}

export function saveDayPlan(dateKey, plan) {
  ensureMigrations()
  const key =
    typeof dateKey === 'string' && dateKey.trim() !== ''
      ? dateKey.trim()
      : getLocalDateKey()

  const plans = readStoredPlans()
  const normalized = normalizeDayPlan(plan)
  plans[key] = normalized
  writeStoredPlans(plans)
  return normalized
}

function ensureDayExists(dateKey) {
  const key =
    typeof dateKey === 'string' && dateKey.trim() !== ''
      ? dateKey.trim()
      : getLocalDateKey()

  const plans = readStoredPlans()
  if (!plans[key]) {
    plans[key] = getEmptyDayPlan()
    writeStoredPlans(plans)
  }
  return key
}

function normalizeSlotId(slot) {
  if (typeof slot !== 'string') {
    return null
  }
  const normalized = slot.trim().toLowerCase()
  if (PRIMARY_SLOTS.includes(normalized) || normalized === 'snack') {
    return normalized
  }
  return null
}

/**
 * Deep-clones a saved meal into a planner snapshot (does not persist).
 */
export function createMealSnapshot(meal, products) {
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

  const tags = deriveMealTags(source)
  if (tags) {
    item.tags = tags
  }

  if (typeof source.id === 'string' && source.id.trim() !== '') {
    item.sourceMealId = source.id.trim()
  }

  return { ok: true, errors: {}, item }
}

/**
 * Creates a product planner snapshot (does not persist).
 */
export function createProductSnapshot(product, quantityGrams) {
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

  return { ok: true, errors: {}, item }
}

export function setSlotItem(dateKey, slot, item) {
  ensureMigrations()
  const key = ensureDayExists(dateKey)
  const slotId = normalizeSlotId(slot)

  if (!PRIMARY_SLOTS.includes(slotId)) {
    return {
      ok: false,
      errors: { slot: 'חריץ לא תקין' },
      plan: getDayPlan(key),
    }
  }

  const normalizedItem = item == null ? null : normalizePlannerItem(item)
  if (item != null && !normalizedItem) {
    return {
      ok: false,
      errors: { item: 'פריט לא תקין' },
      plan: getDayPlan(key),
    }
  }

  const plan = getDayPlan(key)
  plan[slotId] = normalizedItem
  const saved = saveDayPlan(key, plan)
  return { ok: true, errors: {}, plan: saved, item: normalizedItem }
}

export function addSnack(dateKey, item) {
  ensureMigrations()
  const key = ensureDayExists(dateKey)
  const normalizedItem = normalizePlannerItem(item)

  if (!normalizedItem) {
    return {
      ok: false,
      errors: { item: 'פריט לא תקין' },
      plan: getDayPlan(key),
    }
  }

  const plan = getDayPlan(key)
  const existingIds = new Set(flattenDayPlan(plan).map((entry) => entry.id))
  if (existingIds.has(normalizedItem.id)) {
    return {
      ok: false,
      errors: { item: 'הפריט כבר קיים' },
      plan,
    }
  }

  plan.snacks.push(normalizedItem)
  const saved = saveDayPlan(key, plan)
  return { ok: true, errors: {}, plan: saved, item: normalizedItem }
}

export function replaceSlotItem(dateKey, slot, item) {
  return setSlotItem(dateKey, slot, item)
}

/**
 * Add a meal snapshot to a day plan slot.
 * Primary slots: one item only — returns needsReplace if occupied unless replaceExplicitly.
 * Snack slot: always appends.
 */
export function addMealToDayPlan(dateKey, meal, slot, products, options = {}) {
  ensureMigrations()
  const slotId = normalizeSlotId(slot)
  if (!slotId) {
    return {
      ok: false,
      errors: { slot: 'יש לבחור חריץ' },
      item: null,
      needsReplace: false,
    }
  }

  const snapshot = createMealSnapshot(meal, products)
  if (!snapshot.ok) {
    return { ...snapshot, needsReplace: false }
  }

  const key = ensureDayExists(dateKey)
  const plan = getDayPlan(key)
  const replaceExplicitly = Boolean(options && options.replaceExplicitly)

  if (slotId === 'snack') {
    const result = addSnack(key, snapshot.item)
    if (!result.ok) {
      return {
        ok: false,
        errors: result.errors,
        item: null,
        needsReplace: false,
      }
    }
    return { ok: true, errors: {}, item: result.item, needsReplace: false }
  }

  if (plan[slotId] != null && !replaceExplicitly) {
    return {
      ok: false,
      errors: {},
      item: null,
      needsReplace: true,
      existing: plan[slotId],
      slot: slotId,
    }
  }

  const result = setSlotItem(key, slotId, snapshot.item)
  if (!result.ok) {
    return {
      ok: false,
      errors: result.errors,
      item: null,
      needsReplace: false,
    }
  }

  return { ok: true, errors: {}, item: result.item, needsReplace: false }
}

/**
 * Add a product snapshot to a day plan slot (same occupancy rules as meals).
 */
export function addProductToDayPlan(
  dateKey,
  product,
  quantityGrams,
  slot,
  options = {},
) {
  ensureMigrations()
  const slotId = normalizeSlotId(slot)
  if (!slotId) {
    return {
      ok: false,
      errors: { slot: 'יש לבחור חריץ' },
      item: null,
      needsReplace: false,
    }
  }

  const snapshot = createProductSnapshot(product, quantityGrams)
  if (!snapshot.ok) {
    return { ...snapshot, needsReplace: false }
  }

  const key = ensureDayExists(dateKey)
  const plan = getDayPlan(key)
  const replaceExplicitly = Boolean(options && options.replaceExplicitly)

  if (slotId === 'snack') {
    const result = addSnack(key, snapshot.item)
    if (!result.ok) {
      return {
        ok: false,
        errors: result.errors,
        item: null,
        needsReplace: false,
      }
    }
    return { ok: true, errors: {}, item: result.item, needsReplace: false }
  }

  if (plan[slotId] != null && !replaceExplicitly) {
    return {
      ok: false,
      errors: {},
      item: null,
      needsReplace: true,
      existing: plan[slotId],
      slot: slotId,
    }
  }

  const result = setSlotItem(key, slotId, snapshot.item)
  if (!result.ok) {
    return {
      ok: false,
      errors: result.errors,
      item: null,
      needsReplace: false,
    }
  }

  return { ok: true, errors: {}, item: result.item, needsReplace: false }
}

function findPlannerItemLocation(plan, itemId) {
  for (const slot of PRIMARY_SLOTS) {
    if (plan[slot] && plan[slot].id === itemId) {
      return { kind: 'slot', slot }
    }
  }

  const snackIndex = plan.snacks.findIndex((item) => item.id === itemId)
  if (snackIndex !== -1) {
    return { kind: 'snack', snackIndex }
  }

  return null
}

export function removePlannerItem(dateKey, itemId) {
  ensureMigrations()
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return false
  }

  const key = ensureDayExists(dateKey)
  const plan = getDayPlan(key)
  const location = findPlannerItemLocation(plan, itemId)
  if (!location) {
    return false
  }

  if (location.kind === 'slot') {
    plan[location.slot] = null
  } else {
    plan.snacks.splice(location.snackIndex, 1)
  }

  saveDayPlan(key, plan)
  return true
}

export function updatePlannerItemQuantity(
  dateKey,
  itemId,
  ingredientIndex,
  quantityGrams,
) {
  ensureMigrations()

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

  const key = ensureDayExists(dateKey)
  const plan = getDayPlan(key)
  const location = findPlannerItemLocation(plan, itemId)
  if (!location) {
    return { ok: false, errors: { id: 'הפריט לא נמצא' }, item: null }
  }

  const item =
    location.kind === 'slot'
      ? plan[location.slot]
      : plan.snacks[location.snackIndex]

  if (!item.ingredients[ingredientIndex]) {
    return {
      ok: false,
      errors: { ingredientIndex: 'מרכיב לא תקין' },
      item: null,
    }
  }

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

  if (location.kind === 'slot') {
    plan[location.slot] = nextItem
  } else {
    plan.snacks[location.snackIndex] = nextItem
  }

  saveDayPlan(key, plan)
  return { ok: true, errors: {}, item: nextItem }
}

// --- Temporary Today compatibility shims (flat list over today's date plan) ---

export function getTodayPlanner() {
  return flattenDayPlan(getDayPlan(getLocalDateKey()))
}

/** @deprecated Prefer saveDayPlan. Writes all items into today's snacks and clears primary slots. */
export function saveTodayPlanner(items) {
  if (!Array.isArray(items)) {
    throw new Error('today planner must be an array')
  }

  const plan = getEmptyDayPlan()
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
    plan.snacks.push(next)
  }

  return flattenDayPlan(saveDayPlan(getLocalDateKey(), plan))
}

/**
 * Temporary shim: adds meal to today's recommended slot.
 * If primary slot is occupied, falls back to snacks (never silent replace).
 */
export function addMealToToday(meal, products) {
  const dateKey = getLocalDateKey()
  const tags = deriveMealTags(meal) || []
  const recommended = getRecommendedSlots(tags)
  const slot = recommended[0] || 'snack'

  const result = addMealToDayPlan(dateKey, meal, slot, products)
  if (result.ok) {
    return result
  }

  if (result.needsReplace && slot !== 'snack') {
    return addMealToDayPlan(dateKey, meal, 'snack', products)
  }

  return result
}

/** Temporary shim: adds product to today's snacks. */
export function addProductToToday(product, quantityGrams) {
  return addProductToDayPlan(
    getLocalDateKey(),
    product,
    quantityGrams,
    'snack',
  )
}

export function updateTodayItemQuantity(itemId, ingredientIndex, quantityGrams) {
  return updatePlannerItemQuantity(
    getLocalDateKey(),
    itemId,
    ingredientIndex,
    quantityGrams,
  )
}

export function removeTodayItem(itemId) {
  return removePlannerItem(getLocalDateKey(), itemId)
}

// Run migrations when the storage module loads.
ensureMigrations()
