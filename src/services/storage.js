import {
  buildMealsById,
  isMealIngredient,
  isProductIngredient,
  validateAllMealTrees,
  validateMealTree,
} from '../utils/mealTree.js'
import {
  buildShoppingList,
  shoppingSelectionKey,
} from '../utils/shoppingList.js'
import {
  GRAMS_UNIT,
  UNIT_NAME_SUGGESTIONS,
  defaultQuantityForUnit,
  quantityToGrams,
} from '../utils/units.js'
import starterProductsData from '../data/starterProducts.json' with { type: 'json' }

const PRODUCTS_KEY = 'weekplate_products'
const MEALS_KEY = 'weekplate_meals'
const GOALS_KEY = 'weekplate_goals'
const PLANS_KEY = 'weekplate_plans'
const TODAY_KEY = 'weekplate_today'
const MIGRATIONS_KEY = 'weekplate_migrations'
const SHOPPING_PURCHASED_KEY = 'weekplate_shopping_purchased'
const DELETED_STARTER_PRODUCTS_KEY = 'weekplate_deleted_starter_products'

export {
  GRAMS_UNIT,
  UNIT_NAME_SUGGESTIONS,
  defaultQuantityForUnit,
  quantityToGrams,
}

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

const STARTER_PRODUCTS = Array.isArray(starterProductsData?.products)
  ? starterProductsData.products
  : []

const STARTER_PRODUCT_IDS = new Set(
  STARTER_PRODUCTS.map((product) =>
    product && typeof product.id === 'string' ? product.id.trim() : '',
  ).filter(Boolean),
)

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

function normalizeProductNameKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function readDeletedStarterProductIds() {
  try {
    const raw = localStorage.getItem(DELETED_STARTER_PRODUCTS_KEY)
    if (raw == null || raw === '') {
      return new Set()
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return new Set()
    }
    const ids = new Set()
    for (const entry of parsed) {
      if (typeof entry === 'string' && entry.trim() !== '') {
        ids.add(entry.trim())
      }
    }
    return ids
  } catch {
    return new Set()
  }
}

function writeDeletedStarterProductIds(ids) {
  const list = []
  for (const id of ids) {
    if (typeof id === 'string' && id.trim() !== '') {
      list.push(id.trim())
    }
  }
  localStorage.setItem(DELETED_STARTER_PRODUCTS_KEY, JSON.stringify(list))
}

function markStarterProductDeleted(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    return
  }
  const trimmed = id.trim()
  if (!STARTER_PRODUCT_IDS.has(trimmed)) {
    return
  }
  const deleted = readDeletedStarterProductIds()
  if (deleted.has(trimmed)) {
    return
  }
  deleted.add(trimmed)
  writeDeletedStarterProductIds(deleted)
}

/**
 * Merge bundled starter products into localStorage.
 * - New users get all starters.
 * - Existing users get only missing starters (by id).
 * - Never overwrites an existing product (id or edited data).
 * - Skips normalized-name collisions with user products.
 * - Skips starter ids the user previously deleted.
 * Idempotent: safe to call on every launch.
 */
export function ensureStarterProducts() {
  if (STARTER_PRODUCTS.length === 0) {
    return readStoredProducts()
  }

  const products = readStoredProducts()
  const deletedIds = readDeletedStarterProductIds()
  const existingIds = new Set(products.map((product) => product.id))
  const existingNames = new Set(
    products.map((product) => normalizeProductNameKey(product.name)),
  )

  let added = false

  for (const rawStarter of STARTER_PRODUCTS) {
    if (!rawStarter || typeof rawStarter !== 'object') {
      continue
    }

    const id =
      typeof rawStarter.id === 'string' ? rawStarter.id.trim() : ''
    if (!id || deletedIds.has(id) || existingIds.has(id)) {
      continue
    }

    const result = validateProduct(rawStarter)
    if (!result.ok) {
      continue
    }

    const nameKey = normalizeProductNameKey(result.product.name)
    if (!nameKey || existingNames.has(nameKey)) {
      continue
    }

    products.push({
      id,
      ...result.product,
    })
    existingIds.add(id)
    existingNames.add(nameKey)
    added = true
  }

  if (added) {
    saveProducts(products)
  }

  return products
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
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  }
}

/** Normalize a primary slot that may be a legacy single item or an array. */
function normalizeSlotItemList(raw, seenIds) {
  const items = []
  const sources = Array.isArray(raw) ? raw : raw != null ? [raw] : []

  for (const entry of sources) {
    const normalized = normalizePlannerItem(entry)
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

/**
 * Normalize product.units: drop invalid entries; absent/non-array → [].
 * Does not fail the product — bad units are skipped.
 */
function normalizeProductUnits(rawUnits) {
  if (!Array.isArray(rawUnits)) {
    return []
  }

  const units = []
  const seenIds = new Set()

  for (const entry of rawUnits) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name) {
      continue
    }

    const grams = parseNumber(entry.grams)
    if (!Number.isFinite(grams) || grams <= 0) {
      continue
    }

    let id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (!id || seenIds.has(id)) {
      id = createId()
    }

    seenIds.add(id)
    units.push({ id, name, grams })
  }

  return units
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

  // Absent units → []; invalid unit entries are dropped (product still ok).
  const units = normalizeProductUnits(source.units)

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
      units,
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

  // Thin shim: Products UI may omit units — preserve existing until units UI exists.
  const source = input && typeof input === 'object' ? input : {}
  if (!Object.prototype.hasOwnProperty.call(source, 'units')) {
    product.units = Array.isArray(products[index].units)
      ? products[index].units
      : []
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

  markStarterProductDeleted(id)
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

  const stripped = []
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
      if (
        isProductIngredient(ingredient) &&
        ingredient.productId.trim() === id
      ) {
        continue
      }
      ingredients.push(ingredient)
    }

    if (ingredients.length === 0) {
      continue
    }

    stripped.push({ ...meal, ingredients })
  }

  const cleanedMeals = filterValidMeals(stripped, next)
  saveMeals(cleanedMeals)

  return true
}

/**
 * Normalize + tree-validate a meal list against each other.
 * Drops invalid meals and repeats until meal references stabilize.
 */
function filterValidMeals(rawMeals, products) {
  const productList = Array.isArray(products) ? products : getProducts()
  let candidates = Array.isArray(rawMeals) ? [...rawMeals] : []

  for (let pass = 0; pass < 20; pass += 1) {
    const beforeIds = candidates
      .map((meal) => (meal && typeof meal.id === 'string' ? meal.id : ''))
      .filter(Boolean)
      .sort()
      .join('|')

    const mealIds = new Set(
      candidates
        .filter((meal) => meal && typeof meal.id === 'string')
        .map((meal) => meal.id),
    )
    const normalized = []

    for (const item of candidates) {
      if (!item || typeof item !== 'object') {
        continue
      }
      if (typeof item.id !== 'string' || item.id.trim() === '') {
        continue
      }

      const catalog = candidates.filter((meal) => meal && meal.id !== item.id)
      const result = validateMeal(item, productList, catalog, {
        selfId: item.id,
        skipCatalogTreeCheck: true,
      })
      if (!result.ok) {
        continue
      }

      const hasDangling = result.meal.ingredients.some(
        (ingredient) =>
          isMealIngredient(ingredient) && !mealIds.has(ingredient.mealId),
      )
      if (hasDangling) {
        continue
      }

      normalized.push({
        id: item.id,
        ...result.meal,
      })
    }

    const mealsById = buildMealsById(normalized)
    const productsById = new Map(
      productList
        .filter((product) => product && typeof product.id === 'string')
        .map((product) => [product.id, product]),
    )

    const treeChecked = []
    for (const meal of normalized) {
      const treeResult = validateMealTree(meal, mealsById, productsById)
      if (!treeResult.ok) {
        continue
      }
      treeChecked.push(meal)
    }

    const afterIds = treeChecked
      .map((meal) => meal.id)
      .sort()
      .join('|')

    candidates = treeChecked
    if (beforeIds === afterIds) {
      return treeChecked
    }
  }

  return candidates
}

export function validateMeal(input, products, meals = [], options = {}) {
  const errors = {}
  const source = input && typeof input === 'object' ? input : {}
  const productList = Array.isArray(products) ? products : []
  const mealList = Array.isArray(meals) ? meals : []
  const selfId =
    typeof options.selfId === 'string' && options.selfId.trim() !== ''
      ? options.selfId.trim()
      : null
  const skipCatalogTreeCheck = Boolean(options.skipCatalogTreeCheck)

  const productIds = new Set(
    productList
      .filter((product) => product && typeof product.id === 'string')
      .map((product) => product.id),
  )
  const mealIds = new Set(
    mealList
      .filter((meal) => meal && typeof meal.id === 'string')
      .map((meal) => meal.id),
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
      const mealId =
        typeof entry.mealId === 'string' ? entry.mealId.trim() : ''

      if (productId && mealId) {
        itemErrors.productId = 'מרכיב לא יכול להיות גם מוצר וגם ארוחה'
      } else if (mealId) {
        if (selfId && mealId === selfId) {
          itemErrors.mealId = 'לא ניתן להוסיף ארוחה לעצמה'
        } else if (!mealIds.has(mealId)) {
          itemErrors.mealId = 'הארוחה לא נמצאה'
        }

        const mealMultiplier = parseNumber(entry.mealMultiplier)
        if (!Number.isFinite(mealMultiplier)) {
          itemErrors.mealMultiplier = 'יש להזין מספר תקין'
        } else if (mealMultiplier <= 0) {
          itemErrors.mealMultiplier = 'המכפיל חייב להיות גדול מאפס'
        }

        if (Object.keys(itemErrors).length === 0) {
          ingredients.push({
            mealId,
            mealMultiplier,
          })
        }
      } else if (productId) {
        if (!productIds.has(productId)) {
          itemErrors.productId = 'המוצר לא נמצא'
        }

        const quantityGrams = parseNumber(entry.quantityGrams)
        if (!Number.isFinite(quantityGrams)) {
          itemErrors.quantityGrams = 'יש להזין מספר תקין'
        } else if (quantityGrams <= 0) {
          itemErrors.quantityGrams = 'הכמות חייבת להיות גדולה מאפס'
        }

        if (Object.keys(itemErrors).length === 0) {
          // Grams are canonical. Optional unit* fields are UI convenience only
          // (frozen at entry — never re-resolved from live product units).
          const ingredient = {
            productId,
            quantityGrams,
          }
          attachUnitMetadata(ingredient, entry)
          ingredients.push(ingredient)
        }
      } else {
        itemErrors.productId = 'יש לבחור מוצר או ארוחה'
      }

      if (Object.keys(itemErrors).length > 0) {
        hasIngredientErrors = true
        ingredientErrors[index] = itemErrors
      }
    }

    if (hasIngredientErrors) {
      errors.ingredients = ingredientErrors
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, meal: null }
  }

  const draftMeal = {
    id: selfId || '__draft__',
    name,
    tags,
    ingredients,
  }

  const catalogMeals = mealList.filter(
    (meal) => meal && typeof meal.id === 'string' && meal.id !== selfId,
  )
  const mealsById = buildMealsById(catalogMeals)
  mealsById.set(draftMeal.id, draftMeal)

  const productsById = new Map(
    productList
      .filter((product) => product && typeof product.id === 'string')
      .map((product) => [product.id, product]),
  )

  const treeResult = validateMealTree(draftMeal, mealsById, productsById)
  if (!treeResult.ok) {
    return {
      ok: false,
      errors: { ingredients: treeResult.message },
      meal: null,
    }
  }

  if (!skipCatalogTreeCheck && selfId) {
    const proposed = [...catalogMeals, draftMeal]
    const allResult = validateAllMealTrees(proposed, productList)
    if (!allResult.ok) {
      return {
        ok: false,
        errors: { ingredients: allResult.message },
        meal: null,
      }
    }
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
    return filterValidMeals(parsed, productList)
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

export function addMeal(input, products, meals) {
  const productList = Array.isArray(products) ? products : getProducts()
  const mealList = Array.isArray(meals) ? meals : getMeals()
  const result = validateMeal(input, productList, mealList)
  if (!result.ok) {
    return result
  }

  const meal = {
    id: createId(),
    ...result.meal,
  }

  const nextMeals = [...mealList, meal]
  saveMeals(nextMeals)

  return { ok: true, errors: {}, meal }
}

export function updateMeal(id, input, products, meals) {
  if (typeof id !== 'string' || id.trim() === '') {
    return { ok: false, errors: { id: 'הארוחה לא נמצאה' }, meal: null }
  }

  const mealList = Array.isArray(meals) ? meals : getMeals()
  const index = mealList.findIndex((meal) => meal.id === id)
  if (index === -1) {
    return { ok: false, errors: { id: 'הארוחה לא נמצאה' }, meal: null }
  }

  const productList = Array.isArray(products) ? products : getProducts()
  const catalog = mealList.filter((meal) => meal.id !== id)
  const result = validateMeal(input, productList, catalog, { selfId: id })
  if (!result.ok) {
    return result
  }

  const meal = {
    id,
    ...result.meal,
  }

  const nextMeals = mealList.map((entry) => (entry.id === id ? meal : entry))
  saveMeals(nextMeals)

  return { ok: true, errors: {}, meal }
}

export function deleteMeal(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    return false
  }

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

  const exists = rawMeals.some((meal) => meal && meal.id === id)
  if (!exists) {
    return false
  }

  const stripped = []
  for (const meal of rawMeals) {
    if (!meal || typeof meal !== 'object') {
      continue
    }
    if (typeof meal.id !== 'string' || meal.id.trim() === '') {
      continue
    }
    if (meal.id === id) {
      continue
    }

    const rawIngredients = Array.isArray(meal.ingredients)
      ? meal.ingredients
      : []
    const ingredients = rawIngredients.filter((ingredient) => {
      if (!ingredient || typeof ingredient !== 'object') {
        return false
      }
      if (isMealIngredient(ingredient) && ingredient.mealId.trim() === id) {
        return false
      }
      return true
    })

    if (ingredients.length === 0) {
      continue
    }

    stripped.push({ ...meal, ingredients })
  }

  saveMeals(filterValidMeals(stripped, getProducts()))
  return true
}

const LIBRARY_VERSION = 1

/** Snapshot of products + saved meals only (no plans, no goals). */
export function exportLibrary() {
  return {
    version: LIBRARY_VERSION,
    products: getProducts(),
    meals: getMeals(),
  }
}

export function getLibraryExportFilename(date = new Date()) {
  return `weekplate-library-${getLocalDateKey(date)}.json`
}

/**
 * Parse library JSON text. Does not write storage.
 * @returns {{ ok: true, data: unknown } | { ok: false, error: string }}
 */
export function parseLibraryJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'קובץ ריק או לא תקין' }
  }

  try {
    return { ok: true, data: JSON.parse(text) }
  } catch {
    return { ok: false, error: 'קובץ JSON לא תקין' }
  }
}

/**
 * Validate an entire library payload before any write.
 * mode: 'merge' | 'replace'
 * @returns {{ ok: boolean, error?: string, products?: object[], meals?: object[] }}
 */
export function validateLibraryImport(data, mode) {
  const importMode = mode === 'replace' ? 'replace' : mode === 'merge' ? 'merge' : null
  if (!importMode) {
    return { ok: false, error: 'מצב ייבוא לא תקין' }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'מבנה הקובץ אינו תקין' }
  }

  if (data.version !== LIBRARY_VERSION) {
    return { ok: false, error: 'גרסת קובץ לא נתמכת' }
  }

  if (!Array.isArray(data.products)) {
    return { ok: false, error: 'רשימת המוצרים אינה תקינה' }
  }

  if (!Array.isArray(data.meals)) {
    return { ok: false, error: 'רשימת הארוחות אינה תקינה' }
  }

  const importedProducts = []
  const seenProductIds = new Set()

  for (let index = 0; index < data.products.length; index += 1) {
    const item = data.products[index]
    if (!item || typeof item !== 'object') {
      return {
        ok: false,
        error: `מוצר לא תקין במיקום ${index + 1}`,
      }
    }

    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!id) {
      return {
        ok: false,
        error: `למוצר במיקום ${index + 1} חסר מזהה`,
      }
    }
    if (seenProductIds.has(id)) {
      return {
        ok: false,
        error: `מזהה מוצר כפול: ${id}`,
      }
    }

    const result = validateProduct(item)
    if (!result.ok) {
      return {
        ok: false,
        error: `מוצר לא תקין (${id || index + 1})`,
      }
    }

    seenProductIds.add(id)
    importedProducts.push({
      id,
      ...result.product,
    })
  }

  let productListForMeals
  if (importMode === 'replace') {
    productListForMeals = importedProducts
  } else {
    const merged = new Map()
    for (const product of getProducts()) {
      merged.set(product.id, product)
    }
    for (const product of importedProducts) {
      merged.set(product.id, product)
    }
    productListForMeals = [...merged.values()]
  }

  const importedMeals = []
  const seenMealIds = new Set()

  for (let index = 0; index < data.meals.length; index += 1) {
    const item = data.meals[index]
    if (!item || typeof item !== 'object') {
      return {
        ok: false,
        error: `ארוחה לא תקינה במיקום ${index + 1}`,
      }
    }

    const id = typeof item.id === 'string' ? item.id.trim() : ''
    if (!id) {
      return {
        ok: false,
        error: `לארוחה במיקום ${index + 1} חסר מזהה`,
      }
    }
    if (seenMealIds.has(id)) {
      return {
        ok: false,
        error: `מזהה ארוחה כפול: ${id}`,
      }
    }

    seenMealIds.add(id)
    importedMeals.push(item)
  }

  // Structural + tree validation across the full imported meal set.
  // For merge mode, also allow refs to existing meals not in the file.
  let mealCatalogForImport
  if (importMode === 'replace') {
    mealCatalogForImport = importedMeals
  } else {
    const merged = new Map()
    for (const meal of getMeals()) {
      merged.set(meal.id, meal)
    }
    for (const meal of importedMeals) {
      merged.set(meal.id, meal)
    }
    mealCatalogForImport = [...merged.values()]
  }

  const validatedMeals = []
  for (const item of importedMeals) {
    const catalog = mealCatalogForImport.filter((meal) => meal.id !== item.id)
    const result = validateMeal(item, productListForMeals, catalog, {
      selfId: item.id,
    })
    if (!result.ok) {
      return {
        ok: false,
        error: `ארוחה לא תקינה (${item.id})`,
      }
    }
    validatedMeals.push({
      id: item.id,
      ...result.meal,
    })
  }

  // Final catalog tree check for merge (imported + untouched existing).
  let proposedCatalog
  if (importMode === 'replace') {
    proposedCatalog = validatedMeals
  } else {
    const merged = new Map()
    for (const meal of getMeals()) {
      merged.set(meal.id, meal)
    }
    for (const meal of validatedMeals) {
      merged.set(meal.id, meal)
    }
    proposedCatalog = [...merged.values()]
  }

  const allTree = validateAllMealTrees(proposedCatalog, productListForMeals)
  if (!allTree.ok) {
    return { ok: false, error: allTree.message }
  }

  return {
    ok: true,
    products: importedProducts,
    meals: validatedMeals,
  }
}

/**
 * Import products + meals after full validation.
 * Never writes on validation failure. Never touches plans or goals.
 * mode: 'merge' | 'replace'
 */
export function importLibrary(data, mode) {
  const importMode = mode === 'replace' ? 'replace' : mode === 'merge' ? 'merge' : null
  if (!importMode) {
    return { ok: false, error: 'מצב ייבוא לא תקין' }
  }

  const validated = validateLibraryImport(data, importMode)
  if (!validated.ok) {
    return validated
  }

  if (importMode === 'replace') {
    saveProducts(validated.products)
    saveMeals(validated.meals)
    return {
      ok: true,
      products: validated.products,
      meals: validated.meals,
    }
  }

  const productsById = new Map()
  for (const product of getProducts()) {
    productsById.set(product.id, product)
  }
  for (const product of validated.products) {
    productsById.set(product.id, product)
  }
  const nextProducts = [...productsById.values()]

  const mealsById = new Map()
  for (const meal of getMeals()) {
    mealsById.set(meal.id, meal)
  }
  for (const meal of validated.meals) {
    mealsById.set(meal.id, meal)
  }
  const nextMeals = [...mealsById.values()]

  saveProducts(nextProducts)
  saveMeals(nextMeals)

  return {
    ok: true,
    products: nextProducts,
    meals: nextMeals,
  }
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

/**
 * Copy optional unit metadata for UI only. Nutrition always uses quantityGrams.
 * Never re-resolve these from live product.units later.
 */
function attachUnitMetadata(target, source) {
  if (!target || !source || typeof source !== 'object') {
    return target
  }

  if (typeof source.unitId === 'string' && source.unitId.trim() !== '') {
    target.unitId = source.unitId.trim()
  }
  if (typeof source.unitName === 'string' && source.unitName.trim() !== '') {
    target.unitName = source.unitName.trim()
  }
  const unitGrams = parseNumber(source.unitGrams)
  if (Number.isFinite(unitGrams) && unitGrams > 0) {
    target.unitGrams = unitGrams
  }

  return target
}

function cloneIngredient(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') {
    return null
  }
  return { ...ingredient }
}

function cloneIngredients(ingredients) {
  if (!Array.isArray(ingredients)) {
    return []
  }
  return ingredients.map((ingredient) => cloneIngredient(ingredient)).filter(Boolean)
}

function parseMealMultiplier(value) {
  const multiplier = parseNumber(value)
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return 1
  }
  return multiplier
}

/**
 * Effective ingredients = scale each baseIngredients[i].quantityGrams by multiplier.
 * Always scale from base — never multiply already-scaled current ingredients.
 */
function scaleIngredientsFromBase(baseIngredients, multiplier, currentIngredients) {
  const base = Array.isArray(baseIngredients) ? baseIngredients : []
  const current = Array.isArray(currentIngredients) ? currentIngredients : []
  const scaled = []

  for (let i = 0; i < base.length; i += 1) {
    const baseIng = base[i]
    if (!baseIng || typeof baseIng !== 'object') {
      continue
    }
    const baseQty = parseNumber(baseIng.quantityGrams)
    if (!isPositiveQuantity(baseQty)) {
      continue
    }

    const currentIng =
      current[i] && typeof current[i] === 'object' ? current[i] : null
    const next = {
      ...(currentIng || {}),
      ...baseIng,
      quantityGrams: baseQty * multiplier,
    }
    scaled.push(next)
  }

  return scaled
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

  // Freeze unit metadata at entry time for UI; grams remain canonical.
  attachUnitMetadata(snapshot, source)

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

  attachUnitMetadata(normalized, ingredient)

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

    const mealMultiplier = parseMealMultiplier(item.mealMultiplier)
    planned.mealMultiplier = mealMultiplier

    // Old items without baseIngredients: treat current ingredients as the local base.
    // Do not re-scale stored effective quantities on read.
    const rawBase = Array.isArray(item.baseIngredients) ? item.baseIngredients : null
    if (rawBase && rawBase.length > 0) {
      const baseIngredients = []
      for (const ingredient of rawBase) {
        const normalized = normalizePlannerIngredient(ingredient)
        if (normalized) {
          baseIngredients.push(normalized)
        }
      }
      planned.baseIngredients =
        baseIngredients.length > 0 ? baseIngredients : cloneIngredients(ingredients)
    } else {
      planned.baseIngredients = cloneIngredients(ingredients)
    }
  }

  return planned
}

function normalizeDayPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return getEmptyDayPlan()
  }

  const next = getEmptyDayPlan()
  const seenIds = new Set()

  for (const slot of PRIMARY_SLOTS) {
    next[slot] = normalizeSlotItemList(plan[slot], seenIds)
  }

  next.snacks = normalizeSlotItemList(plan.snacks, seenIds)
  return next
}

/** Flatten a day plan into a list for calculatePlannerNutrition. */
export function flattenDayPlan(plan) {
  const normalized = normalizeDayPlan(plan)
  const items = []

  for (const slot of PRIMARY_SLOTS) {
    for (const item of normalized[slot]) {
      items.push(item)
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
    if (primaryTag) {
      plan[primaryTag].push(item)
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

export function isDayPlanEmpty(plan) {
  const normalized = normalizeDayPlan(plan)
  return (
    normalized.breakfast.length === 0 &&
    normalized.lunch.length === 0 &&
    normalized.dinner.length === 0 &&
    normalized.snacks.length === 0
  )
}

/** Slot/name rows for confirmation UIs (does not mutate). */
export function summarizeDayPlan(plan) {
  const normalized = normalizeDayPlan(plan)
  const rows = []

  for (const slot of PRIMARY_SLOTS) {
    for (const item of normalized[slot]) {
      rows.push({ slot, name: item.name })
    }
  }

  for (const snack of normalized.snacks) {
    rows.push({ slot: 'snack', name: snack.name })
  }

  return rows
}

function clonePlannerItemIndependent(item) {
  const normalized = normalizePlannerItem(item)
  if (!normalized) {
    return null
  }

  const cloned = {
    id: createId(),
    type: normalized.type,
    name: normalized.name,
    ingredients: cloneIngredients(normalized.ingredients),
  }

  if (normalized.type === 'meal') {
    if (Array.isArray(normalized.tags) && normalized.tags.length > 0) {
      cloned.tags = [...normalized.tags]
    }
    if (typeof normalized.sourceMealId === 'string') {
      cloned.sourceMealId = normalized.sourceMealId
    }
    cloned.mealMultiplier = parseMealMultiplier(normalized.mealMultiplier)
    cloned.baseIngredients = cloneIngredients(normalized.baseIngredients)
  }

  return cloned
}

/**
 * Deep-clone a day plan with new item ids (independent planning data).
 * Preserves slots, quantities, multipliers, and ingredient overrides.
 */
export function cloneDayPlanIndependent(plan) {
  const source = normalizeDayPlan(plan)
  const next = getEmptyDayPlan()

  for (const slot of PRIMARY_SLOTS) {
    next[slot] = source[slot]
      .map((item) => clonePlannerItemIndependent(item))
      .filter(Boolean)
  }

  next.snacks = source.snacks
    .map((item) => clonePlannerItemIndependent(item))
    .filter(Boolean)

  return next
}

/**
 * Copy a day's plan onto another date as independent snapshots.
 * If the destination already has items and replaceExplicitly is not set,
 * returns needsReplace without writing.
 */
export function copyDayPlan(sourceDateKey, destinationDateKey, options = {}) {
  ensureMigrations()

  const sourceKey =
    typeof sourceDateKey === 'string' && sourceDateKey.trim() !== ''
      ? sourceDateKey.trim()
      : getLocalDateKey()
  const destKey =
    typeof destinationDateKey === 'string' && destinationDateKey.trim() !== ''
      ? destinationDateKey.trim()
      : ''

  if (!destKey) {
    return {
      ok: false,
      needsReplace: false,
      errors: { destination: 'יש לבחור תאריך יעד' },
      existing: null,
      summary: [],
      plan: getDayPlan(sourceKey),
    }
  }

  if (sourceKey === destKey) {
    return {
      ok: false,
      needsReplace: false,
      errors: { destination: 'תאריך היעד חייב להיות שונה מיום המקור' },
      existing: null,
      summary: [],
      plan: getDayPlan(sourceKey),
    }
  }

  const sourcePlan = getDayPlan(sourceKey)
  const existingPlan = getDayPlan(destKey)
  const summary = summarizeDayPlan(existingPlan)

  if (!isDayPlanEmpty(existingPlan) && !options.replaceExplicitly) {
    return {
      ok: false,
      needsReplace: true,
      errors: {},
      existing: existingPlan,
      summary,
      plan: existingPlan,
    }
  }

  const cloned = cloneDayPlanIndependent(sourcePlan)
  const saved = saveDayPlan(destKey, cloned)

  return {
    ok: true,
    needsReplace: false,
    errors: {},
    existing: null,
    summary: [],
    plan: saved,
    destinationDateKey: destKey,
  }
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

function expandMealToProductSnapshots(
  meal,
  products,
  mealsById,
  multiplier,
  visiting,
) {
  const source = meal && typeof meal === 'object' ? meal : null
  if (!source) {
    return []
  }

  const mealId = typeof source.id === 'string' ? source.id : null
  if (mealId) {
    if (visiting.has(mealId)) {
      return []
    }
    visiting.add(mealId)
  }

  const scale = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
  const rawIngredients = Array.isArray(source.ingredients)
    ? source.ingredients
    : []
  const snapshots = []

  for (const ingredient of rawIngredients) {
    if (!ingredient || typeof ingredient !== 'object') {
      continue
    }

    if (isProductIngredient(ingredient)) {
      const quantityGrams = parseNumber(ingredient.quantityGrams) * scale
      const snapshot = snapshotIngredient(
        { ...ingredient, quantityGrams },
        products,
      )
      if (snapshot) {
        snapshots.push(snapshot)
      }
      continue
    }

    if (isMealIngredient(ingredient)) {
      const childId = ingredient.mealId.trim()
      const child = mealsById.get(childId)
      if (!child) {
        continue
      }
      const childMultiplier = parseMealMultiplier(ingredient.mealMultiplier) * scale
      snapshots.push(
        ...expandMealToProductSnapshots(
          child,
          products,
          mealsById,
          childMultiplier,
          visiting,
        ),
      )
    }
  }

  if (mealId) {
    visiting.delete(mealId)
  }

  return snapshots
}

/**
 * Deep-clones a saved meal into a planner snapshot (does not persist).
 * Nested meal components are flattened to product ingredients with scaled grams.
 * Sets baseIngredients (recipe grams) + mealMultiplier: 1; ingredients equal base.
 * Saved meals themselves never carry planner mealMultiplier.
 */
export function createMealSnapshot(meal, products, meals) {
  const source = meal && typeof meal === 'object' ? meal : null
  if (!source) {
    return { ok: false, errors: { meal: 'הארוחה לא נמצאה' }, item: null }
  }

  const name = typeof source.name === 'string' ? source.name.trim() : ''
  if (!name) {
    return { ok: false, errors: { name: 'יש להזין שם ארוחה' }, item: null }
  }

  const productList = Array.isArray(products) ? products : getProducts()
  const mealList = Array.isArray(meals) ? meals : getMeals()
  const mealsById = buildMealsById(mealList)

  const ingredients = expandMealToProductSnapshots(
    source,
    productList,
    mealsById,
    1,
    new Set(),
  )

  if (ingredients.length === 0) {
    return {
      ok: false,
      errors: { ingredients: 'יש להוסיף לפחות מרכיב אחד' },
      item: null,
    }
  }

  const baseIngredients = cloneIngredients(ingredients)

  const item = {
    id: createId(),
    type: 'meal',
    name,
    baseIngredients,
    mealMultiplier: 1,
    ingredients: cloneIngredients(baseIngredients),
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
 * Optional unit metadata (unitId / unitName / unitGrams) is frozen for UI;
 * nutrition always uses quantityGrams.
 */
export function createProductSnapshot(product, quantityGrams, options = {}) {
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

  const unitSource =
    options && typeof options === 'object' && options.unit && typeof options.unit === 'object'
      ? options.unit
      : options && typeof options === 'object'
        ? options
        : null

  const ingredientInput = { productId: source.id, quantityGrams: quantity }
  if (unitSource) {
    attachUnitMetadata(ingredientInput, unitSource)
  }

  const ingredient = snapshotIngredient(ingredientInput, [source])

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

function getSlotList(plan, slotId) {
  if (slotId === 'snack') {
    return plan.snacks
  }
  return plan[slotId]
}

/** Append a planner item to a slot list (breakfast/lunch/dinner/snack). */
export function appendSlotItem(dateKey, slot, item) {
  ensureMigrations()
  const key = ensureDayExists(dateKey)
  const slotId = normalizeSlotId(slot)

  if (!slotId) {
    return {
      ok: false,
      errors: { slot: 'קטגוריה לא תקינה' },
      plan: getDayPlan(key),
    }
  }

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

  getSlotList(plan, slotId).push(normalizedItem)
  const saved = saveDayPlan(key, plan)
  return { ok: true, errors: {}, plan: saved, item: normalizedItem }
}

/**
 * Replace the entire contents of a primary slot with a single item (or clear).
 * Prefer appendSlotItem for normal adds.
 */
export function setSlotItem(dateKey, slot, item) {
  ensureMigrations()
  const key = ensureDayExists(dateKey)
  const slotId = normalizeSlotId(slot)

  if (!PRIMARY_SLOTS.includes(slotId)) {
    return {
      ok: false,
      errors: { slot: 'קטגוריה לא תקינה' },
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
  plan[slotId] = normalizedItem ? [normalizedItem] : []
  const saved = saveDayPlan(key, plan)
  return { ok: true, errors: {}, plan: saved, item: normalizedItem }
}

export function addSnack(dateKey, item) {
  return appendSlotItem(dateKey, 'snack', item)
}

export function replaceSlotItem(dateKey, slot, item) {
  return setSlotItem(dateKey, slot, item)
}

/**
 * Add a meal snapshot to a day plan slot.
 * If the same saved meal (sourceMealId) is already in that slot,
 * bump mealMultiplier by 1 instead of appending another row.
 */
export function addMealToDayPlan(dateKey, meal, slot, products, options = {}) {
  ensureMigrations()
  const slotId = normalizeSlotId(slot)
  if (!slotId) {
    return {
      ok: false,
      errors: { slot: 'יש לבחור קטגוריה' },
      item: null,
      needsReplace: false,
    }
  }

  const sourceMealId =
    meal && typeof meal === 'object' && typeof meal.id === 'string'
      ? meal.id.trim()
      : ''

  const key = ensureDayExists(dateKey)

  if (sourceMealId) {
    const plan = getDayPlan(key)
    const existing = getSlotList(plan, slotId).find(
      (item) =>
        item &&
        item.type === 'meal' &&
        typeof item.sourceMealId === 'string' &&
        item.sourceMealId === sourceMealId,
    )

    if (existing) {
      const nextMultiplier = parseMealMultiplier(existing.mealMultiplier) + 1
      const updated = updatePlannerMealMultiplier(key, existing.id, nextMultiplier)
      return { ...updated, needsReplace: false }
    }
  }

  const snapshot = createMealSnapshot(meal, products)
  if (!snapshot.ok) {
    return { ...snapshot, needsReplace: false }
  }

  const result = appendSlotItem(key, slotId, snapshot.item)
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
 * Add a product snapshot to a day plan slot (same append rules as meals).
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
      errors: { slot: 'יש לבחור קטגוריה' },
      item: null,
      needsReplace: false,
    }
  }

  const snapshot = createProductSnapshot(product, quantityGrams, options)
  if (!snapshot.ok) {
    return { ...snapshot, needsReplace: false }
  }

  const key = ensureDayExists(dateKey)
  const result = appendSlotItem(key, slotId, snapshot.item)
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
    const index = plan[slot].findIndex((item) => item.id === itemId)
    if (index !== -1) {
      return { kind: 'slot', slot, index }
    }
  }

  const snackIndex = plan.snacks.findIndex((item) => item.id === itemId)
  if (snackIndex !== -1) {
    return { kind: 'snack', snackIndex }
  }

  return null
}

function getItemAtLocation(plan, location) {
  if (location.kind === 'slot') {
    return plan[location.slot][location.index]
  }
  return plan.snacks[location.snackIndex]
}

function setItemAtLocation(plan, location, nextItem) {
  if (location.kind === 'slot') {
    plan[location.slot][location.index] = nextItem
    return
  }
  plan.snacks[location.snackIndex] = nextItem
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
    plan[location.slot].splice(location.index, 1)
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

  const item = getItemAtLocation(plan, location)

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

  // Ingredient override (local to this planned instance only):
  // Update effective quantity AND fold it into baseIngredients as
  // quantityGrams / mealMultiplier so later multiplier changes still
  // scale from this new local base (never multiply already-scaled values).
  if (item.type === 'meal') {
    const mealMultiplier = parseMealMultiplier(item.mealMultiplier)
    nextItem.mealMultiplier = mealMultiplier

    const existingBase = Array.isArray(item.baseIngredients)
      ? item.baseIngredients
      : cloneIngredients(item.ingredients)
    const baseIngredients = existingBase.map((ingredient, i) => {
      const cloned = { ...ingredient }
      if (i === ingredientIndex) {
        cloned.quantityGrams = quantity / mealMultiplier
      }
      return cloned
    })

    // Ensure base row exists if ingredients grew somehow (should not).
    if (!baseIngredients[ingredientIndex] && nextIngredients[ingredientIndex]) {
      baseIngredients[ingredientIndex] = {
        ...nextIngredients[ingredientIndex],
        quantityGrams: quantity / mealMultiplier,
      }
    }

    nextItem.baseIngredients = baseIngredients
  }

  setItemAtLocation(plan, location, nextItem)

  saveDayPlan(key, plan)
  return { ok: true, errors: {}, item: nextItem }
}

/**
 * Set mealMultiplier on a planned meal instance and recompute effective
 * ingredient grams from baseIngredients (original recipe quantities).
 * Never multiplies already-scaled current ingredients.
 */
export function updatePlannerMealMultiplier(dateKey, itemId, multiplier) {
  ensureMigrations()

  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return { ok: false, errors: { id: 'הפריט לא נמצא' }, item: null }
  }

  const nextMultiplier = parseNumber(multiplier)
  if (!Number.isFinite(nextMultiplier) || nextMultiplier <= 0) {
    return {
      ok: false,
      errors: { mealMultiplier: 'המכפיל חייב להיות גדול מאפס' },
      item: null,
    }
  }

  const key = ensureDayExists(dateKey)
  const plan = getDayPlan(key)
  const location = findPlannerItemLocation(plan, itemId)
  if (!location) {
    return { ok: false, errors: { id: 'הפריט לא נמצא' }, item: null }
  }

  const item = getItemAtLocation(plan, location)

  if (!item || item.type !== 'meal') {
    return {
      ok: false,
      errors: { type: 'מכפיל זמין רק לארוחות מתוכננות' },
      item: null,
    }
  }

  const baseIngredients = Array.isArray(item.baseIngredients)
    ? cloneIngredients(item.baseIngredients)
    : cloneIngredients(item.ingredients)

  if (baseIngredients.length === 0) {
    return {
      ok: false,
      errors: { ingredients: 'אין מרכיבי בסיס' },
      item: null,
    }
  }

  const nextItem = {
    ...item,
    mealMultiplier: nextMultiplier,
    baseIngredients,
    ingredients: scaleIngredientsFromBase(
      baseIngredients,
      nextMultiplier,
      item.ingredients,
    ),
  }

  setItemAtLocation(plan, location, nextItem)

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
 */
export function addMealToToday(meal, products) {
  const dateKey = getLocalDateKey()
  const tags = deriveMealTags(meal) || []
  const recommended = getRecommendedSlots(tags)
  const slot = recommended[0] || 'snack'

  return addMealToDayPlan(dateKey, meal, slot, products)
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

/**
 * Generate a shopping list from one or more planned dates.
 * Does not mutate products, meals, or plans.
 */
export function generateShoppingList(dateKeys) {
  ensureMigrations()
  const keys = Array.isArray(dateKeys) ? dateKeys : []
  const plans = readStoredPlans()
  const plansByDate = {}
  for (const key of keys) {
    if (typeof key !== 'string' || key.trim() === '') {
      continue
    }
    const trimmed = key.trim()
    plansByDate[trimmed] = plans[trimmed]
      ? normalizeDayPlan(plans[trimmed])
      : getEmptyDayPlan()
  }
  return buildShoppingList(keys, plansByDate, getProducts())
}

function readShoppingPurchasedStore() {
  try {
    const raw = localStorage.getItem(SHOPPING_PURCHASED_KEY)
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

function writeShoppingPurchasedStore(store) {
  localStorage.setItem(SHOPPING_PURCHASED_KEY, JSON.stringify(store))
}

/**
 * Purchased flags for a shopping selection (sorted date keys).
 * Independent of products / meals / plans.
 * @returns {Record<string, boolean>}
 */
export function getShoppingPurchased(dateKeys) {
  const selection = shoppingSelectionKey(dateKeys)
  if (!selection) {
    return {}
  }
  const store = readShoppingPurchasedStore()
  const entry = store[selection]
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return {}
  }
  const result = {}
  for (const [itemId, value] of Object.entries(entry)) {
    if (value === true) {
      result[itemId] = true
    }
  }
  return result
}

/**
 * Mark / unmark a shopping-list line as purchased.
 * Does not change products, meals, or plans.
 */
export function setShoppingItemPurchased(dateKeys, itemId, purchased) {
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return getShoppingPurchased(dateKeys)
  }
  const selection = shoppingSelectionKey(dateKeys)
  if (!selection) {
    return {}
  }

  const store = readShoppingPurchasedStore()
  const current =
    store[selection] &&
    typeof store[selection] === 'object' &&
    !Array.isArray(store[selection])
      ? { ...store[selection] }
      : {}

  if (purchased) {
    current[itemId.trim()] = true
  } else {
    delete current[itemId.trim()]
  }

  if (Object.keys(current).length === 0) {
    delete store[selection]
  } else {
    store[selection] = current
  }

  writeShoppingPurchasedStore(store)
  return getShoppingPurchased(dateKeys)
}

// Run migrations + starter catalog when the storage module loads.
ensureMigrations()
ensureStarterProducts()
