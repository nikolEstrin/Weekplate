import {
  buildMealsById,
  collectProductIdsInTree,
  isMealIngredient,
  isProductIngredient,
} from '../utils/mealTree.js'
import {
  calculateMealNutrition,
  calculatePlannerNutrition,
  getCalorieStatus,
  scaleNutrition,
  sumNutrition,
} from '../utils/nutrition.js'

export const BALANCE_ACTION_REDUCE_QUANTITY = 'REDUCE_QUANTITY'
export const BALANCE_ACTION_REPLACE_MEAL = 'REPLACE_MEAL'

/** Practical meal-quantity step used by Smart Balance suggestions. */
export const MEAL_QUANTITY_STEP = 0.5
/** Planner UI step for interactive quantity controls (− / +). */
export const MEAL_QUANTITY_UI_STEP = 0.25
/** Lowest quantity Smart Balance may suggest (must stay > 0). */
export const MIN_MEAL_QUANTITY = 0.5
/** Lowest quantity the planner UI allows (must stay > 0). */
export const MIN_MEAL_QUANTITY_UI = 0.25

export const SWAP_REASONS = [
  'missing-products',
  'lower-calories',
  'higher-protein',
  'different-meal',
]

const PAGE_SIZE = 3
const MAX_CALORIE_TOLERANCE = 100
const LOWER_CALORIE_MIN_DROP = 50
const LOWER_CALORIE_MAX_DROP = 200

function toSafeNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value <= 0) {
    return 0
  }
  if (value >= 1) {
    return 1
  }
  return value
}

/** Prefer tags[]; else legacy tag. Returns lowercase ids. */
export function getMealTags(meal) {
  if (!meal || typeof meal !== 'object') {
    return []
  }

  if (Array.isArray(meal.tags) && meal.tags.length > 0) {
    const tags = []
    const seen = new Set()
    for (const entry of meal.tags) {
      if (typeof entry !== 'string') {
        continue
      }
      const tag = entry.trim().toLowerCase()
      if (!tag || seen.has(tag)) {
        continue
      }
      seen.add(tag)
      tags.push(tag)
    }
    return tags
  }

  if (typeof meal.tag === 'string' && meal.tag.trim() !== '') {
    return [meal.tag.trim().toLowerCase()]
  }

  return []
}

function tagsOverlap(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return false
  }
  const setB = new Set(b)
  return a.some((tag) => setB.has(tag))
}

/**
 * Whether a planner entry may show whole-meal Smart Meal Swap ("🔄 החלפה").
 *
 * Uses the meal / product data-model distinction only — never quantity
 * magnitudes (grams, unit counts, mealMultiplier) and never calorie state.
 *
 * Allow: saved meal / recipe instances and normal planned meals (type "meal").
 * Deny: direct product rows (type "product").
 */
export function canReplaceWholeMeal(meal) {
  if (!meal || typeof meal !== 'object') {
    return false
  }

  // Direct product snapshots are never whole-meal replaceable.
  if (meal.type === 'product') {
    return false
  }

  if (meal.type && meal.type !== 'meal') {
    return false
  }

  const hasSourceMealId =
    typeof meal.sourceMealId === 'string' && meal.sourceMealId.trim() !== ''

  // Meal/recipe instance: explicit type, or legacy rows linked via sourceMealId.
  return meal.type === 'meal' || hasSourceMealId
}

/**
 * Nutrition for the meal being replaced.
 * Planner snapshots use calculatePlannerNutrition; saved meals use calculateMealNutrition.
 */
export function getMealNutritionForSwap(meal, products, meals = []) {
  if (!meal || typeof meal !== 'object') {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 }
  }

  if (meal.type === 'meal' || meal.type === 'product' || Array.isArray(meal.baseIngredients)) {
    return calculatePlannerNutrition([meal], products)
  }

  return calculateMealNutrition(meal, products, meals)
}

function collectProductQuantityPairs(meal, mealsById, scale = 1, visiting = new Set()) {
  const pairs = []
  if (!meal || typeof meal !== 'object') {
    return pairs
  }

  const mealId = typeof meal.id === 'string' ? meal.id : null
  if (mealId) {
    if (visiting.has(mealId)) {
      return pairs
    }
    visiting.add(mealId)
  }

  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : []
  for (const ingredient of ingredients) {
    if (!ingredient || typeof ingredient !== 'object') {
      continue
    }

    if (isProductIngredient(ingredient)) {
      const quantity = toSafeNumber(ingredient.quantityGrams) * scale
      if (quantity > 0) {
        pairs.push({
          productId: ingredient.productId.trim(),
          quantityGrams: quantity,
        })
      }
      continue
    }

    if (isMealIngredient(ingredient)) {
      const childId = ingredient.mealId.trim()
      const child = mealsById instanceof Map ? mealsById.get(childId) : null
      if (!child) {
        continue
      }
      const childMultiplier = toSafeNumber(ingredient.mealMultiplier)
      const safeMultiplier = childMultiplier > 0 ? childMultiplier : 1
      pairs.push(
        ...collectProductQuantityPairs(
          child,
          mealsById,
          scale * safeMultiplier,
          visiting,
        ),
      )
    }
  }

  if (mealId) {
    visiting.delete(mealId)
  }

  return pairs
}

/** Deterministic flat signature for duplicate detection. */
export function mealIngredientSignature(meal, meals = []) {
  const mealsById = buildMealsById(meals)
  const pairs = collectProductQuantityPairs(meal, mealsById)
  if (pairs.length === 0) {
    return ''
  }

  const merged = new Map()
  for (const pair of pairs) {
    merged.set(
      pair.productId,
      (merged.get(pair.productId) || 0) + pair.quantityGrams,
    )
  }

  return [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, grams]) => `${id}:${Math.round(grams * 1000) / 1000}`)
    .join('|')
}

function mealContainsUnavailableProduct(meal, unavailableProductIds, mealsById) {
  if (!Array.isArray(unavailableProductIds) || unavailableProductIds.length === 0) {
    return false
  }

  const blocked = new Set(
    unavailableProductIds
      .filter((id) => typeof id === 'string' && id.trim() !== '')
      .map((id) => id.trim()),
  )
  if (blocked.size === 0) {
    return false
  }

  for (const productId of collectProductIdsInTree(meal, mealsById)) {
    if (blocked.has(productId)) {
      return true
    }
  }
  return false
}

function isValidCandidateMeal(meal, nutrition) {
  if (!meal || typeof meal !== 'object') {
    return false
  }
  if (typeof meal.name !== 'string' || meal.name.trim() === '') {
    return false
  }
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : []
  if (ingredients.length === 0) {
    return false
  }
  if (!(toSafeNumber(nutrition.calories) > 0)) {
    return false
  }
  return true
}

/**
 * Similarity in [0, 1]. scale is the distance that maps to score 0.
 */
export function valueSimilarity(a, b, scale) {
  const left = toSafeNumber(a)
  const right = toSafeNumber(b)
  const safeScale = toSafeNumber(scale)
  if (safeScale <= 0) {
    return left === right ? 1 : 0
  }
  return clamp01(1 - Math.abs(left - right) / safeScale)
}

/**
 * Deterministic similarity score (~50% calories, 30% protein,
 * 10% carbs/fat, 10% category). Higher is better.
 */
export function scoreMealSimilarity(originalNutrition, candidateNutrition, categoryMatch) {
  const orig = originalNutrition && typeof originalNutrition === 'object'
    ? originalNutrition
    : {}
  const cand = candidateNutrition && typeof candidateNutrition === 'object'
    ? candidateNutrition
    : {}

  const origCalories = Math.max(toSafeNumber(orig.calories), 1)
  const calorieScale = Math.max(origCalories * 0.25, 40)
  const proteinScale = Math.max(Math.abs(toSafeNumber(orig.protein)) * 0.4, 8)
  const carbsScale = Math.max(Math.abs(toSafeNumber(orig.carbs)) * 0.4, 10)
  const fatScale = Math.max(Math.abs(toSafeNumber(orig.fat)) * 0.4, 5)

  const calorieScore = valueSimilarity(orig.calories, cand.calories, calorieScale)
  const proteinScore = valueSimilarity(orig.protein, cand.protein, proteinScale)
  const carbsScore = valueSimilarity(orig.carbs, cand.carbs, carbsScale)
  const fatScore = valueSimilarity(orig.fat, cand.fat, fatScale)
  const macroScore = (carbsScore + fatScore) / 2
  const categoryScore = categoryMatch ? 1 : 0

  return (
    calorieScore * 0.5 +
    proteinScore * 0.3 +
    macroScore * 0.1 +
    categoryScore * 0.1
  )
}

export function initialCalorieTolerance(originalCalories) {
  const calories = Math.max(toSafeNumber(originalCalories), 0)
  return Math.min(calories * 0.15, MAX_CALORIE_TOLERANCE)
}

function withinCalorieTolerance(candidateCalories, originalCalories, tolerance) {
  return Math.abs(toSafeNumber(candidateCalories) - toSafeNumber(originalCalories)) <= tolerance
}

function inLowerCalorieBand(candidateCalories, originalCalories) {
  const original = toSafeNumber(originalCalories)
  const candidate = toSafeNumber(candidateCalories)
  const min = original - LOWER_CALORIE_MAX_DROP
  const max = original - LOWER_CALORIE_MIN_DROP
  return candidate >= min && candidate <= max
}

function compareCandidates(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score
  }
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function buildRecommendation(meal, nutrition, score, categoryMatch, quantity = 1) {
  const safeQuantity = normalizeMealQuantity(quantity)
  const instanceQuantity = safeQuantity > 0 ? safeQuantity : 1
  const unitNutrition = scaleNutrition(nutrition, 1 / instanceQuantity)
  return {
    id: meal.id,
    meal,
    name: typeof meal.name === 'string' ? meal.name.trim() : '',
    tags: getMealTags(meal),
    calories: toSafeNumber(nutrition.calories),
    protein: toSafeNumber(nutrition.protein),
    carbs: toSafeNumber(nutrition.carbs),
    fat: toSafeNumber(nutrition.fat),
    /** 1× serving nutrition for interactive quantity changes in confirmation. */
    unitNutrition: {
      calories: toSafeNumber(unitNutrition.calories),
      protein: toSafeNumber(unitNutrition.protein),
      carbs: toSafeNumber(unitNutrition.carbs),
      fat: toSafeNumber(unitNutrition.fat),
    },
    /** Instance quantity used for nutrition / scoring (defaults to current meal qty). */
    quantity: instanceQuantity,
    score,
    categoryMatch: Boolean(categoryMatch),
  }
}

function filterByCalorieWindow(candidates, originalCalories, tolerance) {
  return candidates.filter((entry) =>
    withinCalorieTolerance(entry.nutrition.calories, originalCalories, tolerance),
  )
}

/**
 * Expand calorie tolerance gradually up to ±100 until at least 3 results
 * (or max tolerance reached).
 */
export function expandCalorieMatches(candidates, originalCalories, minCount = PAGE_SIZE) {
  let tolerance = initialCalorieTolerance(originalCalories)
  let matched = filterByCalorieWindow(candidates, originalCalories, tolerance)

  while (matched.length < minCount && tolerance < MAX_CALORIE_TOLERANCE) {
    const next = Math.min(MAX_CALORIE_TOLERANCE, tolerance + 20)
    if (next === tolerance) {
      break
    }
    tolerance = next
    matched = filterByCalorieWindow(candidates, originalCalories, tolerance)
  }

  return { matched, tolerance }
}

function preferSameCategory(entries, minCount = PAGE_SIZE) {
  const same = entries.filter((entry) => entry.categoryMatch)
  if (same.length >= minCount) {
    return same
  }
  if (same.length === 0) {
    return entries
  }

  const sameIds = new Set(same.map((entry) => entry.id))
  const fallback = entries.filter((entry) => !sameIds.has(entry.id))
  return [...same, ...fallback]
}

function selectForLowerCalories(enriched, originalCalories) {
  const band = enriched.filter((entry) =>
    inLowerCalorieBand(entry.nutrition.calories, originalCalories),
  )
  if (band.length > 0) {
    return preferSameCategory(band)
  }

  const lower = enriched.filter(
    (entry) => toSafeNumber(entry.nutrition.calories) < toSafeNumber(originalCalories),
  )
  if (lower.length > 0) {
    return preferSameCategory(lower)
  }

  // Last resort only when no lower-calorie meal exists.
  return preferSameCategory(enriched)
}

/**
 * Balance-mode replacement pool: any lower-calorie same-quantity meal.
 * Does NOT apply normal-swap ±100 tolerance, 50–200 drop band, or
 * same-category truncation — Balance ranks by daily calorie outcome.
 */
function selectForBalanceCalories(enriched, originalCalories) {
  const original = toSafeNumber(originalCalories)
  const lower = enriched.filter(
    (entry) => toSafeNumber(entry.nutrition.calories) < original,
  )
  return lower.length > 0 ? lower : []
}

export const SWAP_MODE_NORMAL = 'normal-swap'
export const SWAP_MODE_BALANCE = 'balance'

function selectForHigherProtein(enriched, originalNutrition) {
  const originalProtein = toSafeNumber(originalNutrition.protein)
  const originalCalories = toSafeNumber(originalNutrition.calories)
  const higher = enriched.filter(
    (entry) => toSafeNumber(entry.nutrition.protein) > originalProtein,
  )
  const pool = higher.length > 0 ? higher : enriched
  const { matched } = expandCalorieMatches(pool, originalCalories)
  return preferSameCategory(matched.length > 0 ? matched : pool)
}

function selectForNormal(enriched, originalCalories) {
  const { matched } = expandCalorieMatches(enriched, originalCalories)
  return preferSameCategory(matched.length > 0 ? matched : enriched)
}

/**
 * Deterministic Smart Meal Swap recommendations.
 *
 * Instance quantity (mealMultiplier) is part of the comparison:
 * - originalNutrition is the current planner instance total
 * - candidates are evaluated at the same quantity by default
 * - scored/returned nutrition values are instance totals, not per-serving
 *
 * Shared builder for normal Smart Meal Swap and Smart Balance.
 * Pass mode: "balance" for calorie-saving intent (no similarity window filters).
 * Pass mode: "normal-swap" (default) for nutrition-similarity intent.
 *
 * @param {object} params
 * @param {object} params.currentMeal
 * @param {object[]} params.allAvailableMeals
 * @param {string} params.swapReason
 * @param {string[]} [params.unavailableProductIds]
 * @param {object} [params.currentDayNutrition]
 * @param {object} [params.optionalDailyTargets]
 * @param {object[]} [params.products]
 * @param {object[]} [params.meals] nested meal library for nutrition (defaults to allAvailableMeals)
 * @param {'normal-swap'|'balance'} [params.mode]
 * @returns {{ recommendations: object[], originalNutrition: object, currentQuantity: number, reason: string, mode: string }}
 */
export function recommendMealSwaps({
  currentMeal,
  allAvailableMeals,
  swapReason,
  unavailableProductIds = [],
  currentDayNutrition = null,
  optionalDailyTargets = null,
  products = [],
  meals = null,
  mode = SWAP_MODE_NORMAL,
} = {}) {
  void currentDayNutrition
  void optionalDailyTargets

  const swapMode = mode === SWAP_MODE_BALANCE ? SWAP_MODE_BALANCE : SWAP_MODE_NORMAL
  const reason =
    typeof swapReason === 'string' && SWAP_REASONS.includes(swapReason)
      ? swapReason
      : swapMode === SWAP_MODE_BALANCE
        ? 'lower-calories'
        : 'different-meal'

  const mealLibrary = Array.isArray(meals) ? meals : allAvailableMeals
  const mealsById = buildMealsById(mealLibrary)
  // Prefer preserving the current planner instance quantity (never silently use 1×).
  const currentQuantity = getPlannerMealQuantity(currentMeal)
  const originalNutrition = getMealNutritionForSwap(
    currentMeal,
    products,
    mealLibrary,
  )
  const originalTags = getMealTags(currentMeal)
  const originalSignature = mealIngredientSignature(currentMeal, mealLibrary)

  const currentIds = new Set()
  if (currentMeal && typeof currentMeal === 'object') {
    if (typeof currentMeal.id === 'string' && currentMeal.id.trim() !== '') {
      currentIds.add(currentMeal.id.trim())
    }
    if (
      typeof currentMeal.sourceMealId === 'string' &&
      currentMeal.sourceMealId.trim() !== ''
    ) {
      currentIds.add(currentMeal.sourceMealId.trim())
    }
  }

  const unavailable =
    reason === 'missing-products'
      ? unavailableProductIds
      : []

  const seenSignatures = new Set()
  if (originalSignature) {
    seenSignatures.add(originalSignature)
  }

  const enriched = []
  const list = Array.isArray(allAvailableMeals) ? allAvailableMeals : []

  for (const meal of list) {
    if (!meal || typeof meal !== 'object' || typeof meal.id !== 'string') {
      continue
    }

    const mealId = meal.id.trim()
    if (!mealId || currentIds.has(mealId)) {
      continue
    }

    if (mealContainsUnavailableProduct(meal, unavailable, mealsById)) {
      continue
    }

    const signature = mealIngredientSignature(meal, mealLibrary)
    if (signature && seenSignatures.has(signature)) {
      continue
    }
    if (signature) {
      seenSignatures.add(signature)
    }

    // Library meals are 1× servings; evaluate at the current instance quantity.
    const unitNutrition = calculateMealNutrition(meal, products, mealLibrary)
    if (!isValidCandidateMeal(meal, unitNutrition)) {
      continue
    }
    const nutrition = scaleNutrition(unitNutrition, currentQuantity)

    const categoryMatch = tagsOverlap(originalTags, getMealTags(meal))
    let score = scoreMealSimilarity(originalNutrition, nutrition, categoryMatch)

    if (reason === 'lower-calories') {
      const drop = toSafeNumber(originalNutrition.calories) - toSafeNumber(nutrition.calories)
      if (drop > 0) {
        score += Math.min(drop, LOWER_CALORIE_MAX_DROP) / LOWER_CALORIE_MAX_DROP * 0.08
      } else {
        score -= 0.2
      }
    }

    if (reason === 'higher-protein') {
      const gain = toSafeNumber(nutrition.protein) - toSafeNumber(originalNutrition.protein)
      if (gain > 0) {
        score += Math.min(gain, 40) / 40 * 0.12
      } else {
        score -= 0.15
      }
    }

    enriched.push({
      meal,
      nutrition,
      categoryMatch,
      score,
    })
  }

  let selected
  if (swapMode === SWAP_MODE_BALANCE) {
    // Balance: keep every lower-calorie same-quantity candidate; rank elsewhere.
    selected = selectForBalanceCalories(enriched, originalNutrition.calories)
  } else if (reason === 'lower-calories') {
    selected = selectForLowerCalories(enriched, originalNutrition.calories)
  } else if (reason === 'higher-protein') {
    selected = selectForHigherProtein(enriched, originalNutrition)
  } else {
    selected = selectForNormal(enriched, originalNutrition.calories)
  }

  const recommendations = selected
    .map((entry) =>
      buildRecommendation(
        entry.meal,
        entry.nutrition,
        entry.score,
        entry.categoryMatch,
        currentQuantity,
      ),
    )
    .sort(compareCandidates)

  return {
    recommendations,
    originalNutrition,
    currentQuantity,
    reason,
    mode: swapMode,
  }
}

/** Day nutrition after swapping one planner item for a recommended meal. */
export function previewDayNutritionAfterSwap({
  dayNutrition,
  originalNutrition,
  replacementNutrition,
}) {
  const day = dayNutrition && typeof dayNutrition === 'object' ? dayNutrition : {}
  const original =
    originalNutrition && typeof originalNutrition === 'object'
      ? originalNutrition
      : {}
  const replacement =
    replacementNutrition && typeof replacementNutrition === 'object'
      ? replacementNutrition
      : {}

  return sumNutrition([
    {
      calories: toSafeNumber(day.calories) - toSafeNumber(original.calories),
      protein: toSafeNumber(day.protein) - toSafeNumber(original.protein),
      carbs: toSafeNumber(day.carbs) - toSafeNumber(original.carbs),
      fat: toSafeNumber(day.fat) - toSafeNumber(original.fat),
    },
    replacement,
  ])
}

const BALANCE_MIN_SAVINGS = 30
const QUANTITY_EPSILON = 0.001

/** Normalize a positive meal quantity to a stable two-decimal value. */
export function normalizeMealQuantity(value) {
  const number = toSafeNumber(value)
  if (!(number > 0)) {
    return 0
  }
  return Math.round(number * 100) / 100
}

/** Current planner meal quantity (mealMultiplier). Defaults to 1. */
export function getPlannerMealQuantity(item) {
  if (!item || typeof item !== 'object') {
    return 1
  }
  const raw = toSafeNumber(item.mealMultiplier)
  const normalized = normalizeMealQuantity(raw)
  return normalized > 0 ? normalized : 1
}

/**
 * Whether quantity reduction is valid for this planner entry.
 * Meals use mealMultiplier; direct product rows are not eligible.
 * Smart Balance never suggests reducing below 1× — only when quantity > 1.
 */
export function canReduceMealQuantity(item) {
  if (!item || typeof item !== 'object') {
    return false
  }
  if (item.type === 'product') {
    return false
  }
  if (item.type && item.type !== 'meal') {
    return false
  }
  // Need a meal/recipe instance (same identity gate as whole-meal features).
  const hasSourceMealId =
    typeof item.sourceMealId === 'string' && item.sourceMealId.trim() !== ''
  if (!(item.type === 'meal' || hasSourceMealId)) {
    return false
  }
  // Only reduce when above a full serving; qty === 1 should replace instead.
  return getPlannerMealQuantity(item) > 1 + QUANTITY_EPSILON
}

/**
 * Lower quantity options using Weekplate's practical fractional step (0.5).
 * Never returns <= 0 or values above the current quantity.
 */
export function generateLowerMealQuantities(
  currentQuantity,
  {
    step = MEAL_QUANTITY_STEP,
    minQuantity = MIN_MEAL_QUANTITY,
  } = {},
) {
  const current = normalizeMealQuantity(currentQuantity)
  const safeStep = toSafeNumber(step)
  const min = normalizeMealQuantity(minQuantity)
  if (!(current > min + QUANTITY_EPSILON) || !(safeStep > 0)) {
    return []
  }

  const options = []
  let next = normalizeMealQuantity(current - safeStep)
  // Hard cap prevents runaway loops if step/min are pathological.
  const maxSteps = Math.ceil(current / safeStep) + 2
  let steps = 0
  while (next >= min - QUANTITY_EPSILON && steps < maxSteps) {
    steps += 1
    if (next < current - QUANTITY_EPSILON && next > 0) {
      options.push(normalizeMealQuantity(Math.max(next, min)))
    }
    const decreased = next - safeStep
    next = decreased > 0 ? normalizeMealQuantity(decreased) : 0
  }

  // Deduplicate while preserving descending order.
  const seen = new Set()
  const unique = []
  for (const value of options) {
    const key = String(value)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(value)
  }
  return unique
}

/**
 * Replacement quantities to evaluate: preserve current first, then lower steps.
 * Smart Balance never evaluates below 1× (minQuantity defaults to 1).
 */
export function generateReplacementMealQuantities(currentQuantity, options = {}) {
  const current = normalizeMealQuantity(currentQuantity)
  const safeCurrent = current > 0 ? current : 1
  const lower = generateLowerMealQuantities(safeCurrent, {
    minQuantity: 1,
    ...options,
  })
  return [safeCurrent, ...lower]
}

/**
 * Snap a user-edited replacement quantity to the planner UI step.
 * Never returns <= 0.
 */
export function clampMealQuantity(
  value,
  {
    step = MEAL_QUANTITY_UI_STEP,
    minQuantity = MIN_MEAL_QUANTITY_UI,
  } = {},
) {
  const min = normalizeMealQuantity(minQuantity)
  const safeMin = min > 0 ? min : MIN_MEAL_QUANTITY_UI
  const safeStep = toSafeNumber(step)
  const raw = toSafeNumber(value)
  if (!(raw > 0)) {
    return safeMin
  }
  if (!(safeStep > 0)) {
    return normalizeMealQuantity(Math.max(raw, safeMin)) || safeMin
  }
  const stepped = Math.round(raw / safeStep) * safeStep
  const normalized = normalizeMealQuantity(Math.max(stepped, safeMin))
  return normalized > 0 ? normalized : safeMin
}

/**
 * Rescale a swap recommendation (or its unit nutrition) to a new quantity.
 * Used by confirmation screens when the user adjusts quantity before save.
 */
export function scaleSwapRecommendationToQuantity(recommendation, nextQuantity) {
  if (!recommendation || typeof recommendation !== 'object') {
    return null
  }

  const quantity = clampMealQuantity(nextQuantity)
  const currentQuantity = normalizeMealQuantity(recommendation.quantity) || 1
  const unitFromRecommendation =
    recommendation.unitNutrition && typeof recommendation.unitNutrition === 'object'
      ? recommendation.unitNutrition
      : null
  const unitNutrition = unitFromRecommendation || {
    calories: toSafeNumber(recommendation.calories) / currentQuantity,
    protein: toSafeNumber(recommendation.protein) / currentQuantity,
    carbs: toSafeNumber(recommendation.carbs) / currentQuantity,
    fat: toSafeNumber(recommendation.fat) / currentQuantity,
  }
  const nutrition = scaleNutrition(unitNutrition, quantity)

  return {
    ...recommendation,
    unitNutrition: {
      calories: toSafeNumber(unitNutrition.calories),
      protein: toSafeNumber(unitNutrition.protein),
      carbs: toSafeNumber(unitNutrition.carbs),
      fat: toSafeNumber(unitNutrition.fat),
    },
    quantity,
    calories: toSafeNumber(nutrition.calories),
    protein: toSafeNumber(nutrition.protein),
    carbs: toSafeNumber(nutrition.carbs),
    fat: toSafeNumber(nutrition.fat),
  }
}

/**
 * Rebuild Balance Day REPLACE_MEAL preview metrics after the user changes quantity.
 */
export function previewBalanceReplaceAtQuantity(entry, nextQuantity) {
  if (!entry || entry.actionType !== BALANCE_ACTION_REPLACE_MEAL) {
    return entry
  }

  const scaled = scaleSwapRecommendationToQuantity(entry.replacement, nextQuantity)
  if (!scaled) {
    return entry
  }

  const originalNutrition = {
    calories: toSafeNumber(entry.currentCalories),
    protein: toSafeNumber(entry.currentProtein),
    carbs: 0,
    fat: 0,
  }
  const dayNutrition = {
    calories: toSafeNumber(entry.dayCaloriesBefore),
    protein: toSafeNumber(entry.dayProteinBefore),
    carbs: 0,
    fat: 0,
  }
  const metrics = buildBalanceCandidateMetrics({
    dayNutrition,
    originalNutrition,
    suggestedNutrition: scaled,
    targetCalories: toSafeNumber(entry.targetCalories),
    dayCalories: toSafeNumber(entry.dayCaloriesBefore),
    dayProtein: toSafeNumber(entry.dayProteinBefore),
    mealProtein: toSafeNumber(entry.currentProtein),
    desiredSuggestedCalories: toSafeNumber(entry.desiredReplacementCalories),
  })
  const quantityChange = Math.abs(
    normalizeMealQuantity(toSafeNumber(entry.currentQuantity) - scaled.quantity),
  )

  return {
    ...entry,
    suggestedQuantity: scaled.quantity,
    replacementQuantity: scaled.quantity,
    replacement: scaled,
    quantityChange,
    changeSize: quantityChange / Math.max(toSafeNumber(entry.currentQuantity), QUANTITY_EPSILON),
    ...metrics,
  }
}

function nutritionAtMealQuantity(currentNutrition, currentQuantity, nextQuantity) {
  const current = normalizeMealQuantity(currentQuantity)
  const next = normalizeMealQuantity(nextQuantity)
  if (!(current > 0)) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 }
  }
  return scaleNutrition(currentNutrition, next / current)
}

function compareBalanceDayCandidates(a, b) {
  // 1. Closest final daily calories to effective limit / aim
  if (a.distanceToTarget !== b.distanceToTarget) {
    return a.distanceToTarget - b.distanceToTarget
  }
  // 2. Avoid unnecessary undershoot below the aim
  if (a.undershoot !== b.undershoot) {
    return a.undershoot - b.undershoot
  }
  // 3. Preserve protein (less protein loss is better)
  if (a.proteinLoss !== b.proteinLoss) {
    return a.proteinLoss - b.proteinLoss
  }
  // 4. Prefer smaller practical quantity changes (same scale for both action types)
  if (a.changeSize !== b.changeSize) {
    return a.changeSize - b.changeSize
  }
  // 5. Prefer preserving current meal quantity on replacements
  if (a.quantityChange !== b.quantityChange) {
    return a.quantityChange - b.quantityChange
  }
  // 6. Action type is only a minor tie-breaker (REDUCE slightly preferred)
  if (a.actionType !== b.actionType) {
    if (a.actionType === BALANCE_ACTION_REDUCE_QUANTITY) {
      return -1
    }
    if (b.actionType === BALANCE_ACTION_REDUCE_QUANTITY) {
      return 1
    }
  }
  if (a.categoryMatch !== b.categoryMatch) {
    return a.categoryMatch ? -1 : 1
  }
  if (a.desiredGap !== b.desiredGap) {
    return a.desiredGap - b.desiredGap
  }
  if (a.calorieSavings !== b.calorieSavings) {
    return a.calorieSavings - b.calorieSavings
  }
  if (a.currentName !== b.currentName) {
    return a.currentName < b.currentName ? -1 : 1
  }
  if (a.replacementName !== b.replacementName) {
    return a.replacementName < b.replacementName ? -1 : 1
  }
  if (a.plannerItemId !== b.plannerItemId) {
    return a.plannerItemId < b.plannerItemId ? -1 : 1
  }
  const aKey = a.actionKey || ''
  const bKey = b.actionKey || ''
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
}

function buildBalanceCandidateMetrics({
  dayNutrition,
  originalNutrition,
  suggestedNutrition,
  targetCalories,
  dayCalories,
  dayProtein,
  mealProtein,
  desiredSuggestedCalories,
}) {
  const calorieSavings =
    toSafeNumber(originalNutrition.calories) - toSafeNumber(suggestedNutrition.calories)
  const dayAfter = previewDayNutritionAfterSwap({
    dayNutrition,
    originalNutrition,
    replacementNutrition: suggestedNutrition,
  })
  const afterCalories = toSafeNumber(dayAfter.calories)
  const afterProtein = toSafeNumber(dayAfter.protein)
  const distanceToTarget = Math.abs(afterCalories - targetCalories)
  const undershoot = Math.max(0, targetCalories - afterCalories)
  const proteinLoss = Math.max(
    0,
    toSafeNumber(mealProtein) - toSafeNumber(suggestedNutrition.protein),
  )
  const desiredGap = Math.abs(
    toSafeNumber(suggestedNutrition.calories) - toSafeNumber(desiredSuggestedCalories),
  )

  return {
    calorieSavings,
    dayCaloriesAfter: afterCalories,
    dayProteinAfter: afterProtein,
    dayCaloriesBefore: dayCalories,
    dayProteinBefore: dayProtein,
    targetCalories,
    distanceToTarget,
    undershoot,
    proteinLoss,
    desiredGap,
    suggestedCalories: toSafeNumber(suggestedNutrition.calories),
    suggestedProtein: toSafeNumber(suggestedNutrition.protein),
    proteinDelta:
      toSafeNumber(suggestedNutrition.protein) - toSafeNumber(originalNutrition.protein),
    caloriesDelta: -calorieSavings,
  }
}

/**
 * Balance Day: recommend REDUCE_QUANTITY and/or REPLACE_MEAL actions.
 * Prefers the smallest practical change that brings daily calories near target.
 * Reuses recommendMealSwaps (lower-calories) for replacement meal discovery.
 *
 * @param {object} params
 * @param {{ item: object, slotId?: string, slotLabel?: string }[]} params.replaceableMeals
 * @param {object[]} params.allAvailableMeals
 * @param {object} params.currentDayNutrition
 * @param {object} params.dailyTargets
 * @param {object[]} [params.products]
 * @param {object[]} [params.meals]
 * @param {number} [params.limit]
 */
export function recommendBalanceDaySwaps({
  replaceableMeals = [],
  allAvailableMeals = [],
  currentDayNutrition = null,
  dailyTargets = null,
  products = [],
  meals = null,
  limit = PAGE_SIZE,
} = {}) {
  const dayCalories = toSafeNumber(currentDayNutrition?.calories)
  const dayProtein = toSafeNumber(currentDayNutrition?.protein)
  const targetCalories = toSafeNumber(dailyTargets?.calories)
  const calorieStatus = getCalorieStatus(
    dayCalories,
    targetCalories,
    dailyTargets?.allowedCalorieOverage,
  )
  // Excess is vs effective limit (target + allowed overage), not raw daily target.
  const calorieExcess = calorieStatus.actualExcess
  // Rank suggestions toward the effective limit so we reduce ~actualExcess kcal.
  const balanceAimCalories = calorieStatus.effectiveCalorieLimit

  if (!(calorieExcess > 0) || !Array.isArray(replaceableMeals)) {
    return {
      recommendations: [],
      calorieExcess: Math.max(calorieExcess, 0),
      dayCalories,
      targetCalories,
      effectiveCalorieLimit: calorieStatus.effectiveCalorieLimit,
    }
  }

  const mealLibrary = Array.isArray(meals) ? meals : allAvailableMeals
  const candidates = []

  for (const entry of replaceableMeals) {
    const plannerItem = entry && typeof entry === 'object' ? entry.item : null
    if (!plannerItem || typeof plannerItem !== 'object') {
      continue
    }
    if (plannerItem.type && plannerItem.type !== 'meal') {
      continue
    }
    if (typeof plannerItem.id !== 'string' || plannerItem.id.trim() === '') {
      continue
    }

    const originalNutrition = getMealNutritionForSwap(
      plannerItem,
      products,
      mealLibrary,
    )
    const mealCalories = toSafeNumber(originalNutrition.calories)
    const mealProtein = toSafeNumber(originalNutrition.protein)
    if (!(mealCalories > 0)) {
      continue
    }

    const currentQuantity = getPlannerMealQuantity(plannerItem)
    const desiredSuggestedCalories = mealCalories - calorieExcess
    const currentName =
      typeof plannerItem.name === 'string' ? plannerItem.name.trim() : ''
    const slotId = typeof entry.slotId === 'string' ? entry.slotId : ''
    const slotLabel = typeof entry.slotLabel === 'string' ? entry.slotLabel : ''

    // --- REDUCE_QUANTITY candidates (only when quantity > 1; never below 1×) ---
    if (canReduceMealQuantity(plannerItem)) {
      for (const suggestedQuantity of generateLowerMealQuantities(
        currentQuantity,
        { minQuantity: 1 },
      )) {
        const suggestedNutrition = nutritionAtMealQuantity(
          originalNutrition,
          currentQuantity,
          suggestedQuantity,
        )
        const metrics = buildBalanceCandidateMetrics({
          dayNutrition: currentDayNutrition,
          originalNutrition,
          suggestedNutrition,
          targetCalories: balanceAimCalories,
          dayCalories,
          dayProtein,
          mealProtein,
          desiredSuggestedCalories,
        })
        if (!(metrics.calorieSavings > 0)) {
          continue
        }

        const quantityChange = normalizeMealQuantity(
          currentQuantity - suggestedQuantity,
        )
        candidates.push({
          actionType: BALANCE_ACTION_REDUCE_QUANTITY,
          actionKey: `reduce:${plannerItem.id}:${suggestedQuantity}`,
          plannerItemId: plannerItem.id,
          plannerItem,
          slotId,
          slotLabel,
          currentName,
          currentQuantity,
          suggestedQuantity,
          currentCalories: mealCalories,
          currentProtein: mealProtein,
          desiredReplacementCalories: desiredSuggestedCalories,
          replacement: null,
          replacementId: '',
          replacementName: '',
          replacementQuantity: suggestedQuantity,
          quantityChange,
          // Same changeSize scale for reduce and replace (quantity delta only).
          // Action type is only a minor tie-breaker in compareBalanceDayCandidates.
          changeSize: quantityChange / Math.max(currentQuantity, QUANTITY_EPSILON),
          categoryMatch: true,
          ...metrics,
        })
      }
    }

    // --- REPLACE_MEAL candidates ---
    // Generated independently of REDUCE_QUANTITY (no if/else early return).
    // Quantity > 1 never blocks replacement; evaluate at the same quantity.
    if (!canReplaceWholeMeal(plannerItem)) {
      continue
    }

    // Shared replacement builder in balance mode: same-quantity lower-calorie
    // meals without normal-swap similarity / ±100 / category truncation filters.
    const swapResult = recommendMealSwaps({
      currentMeal: plannerItem,
      allAvailableMeals,
      swapReason: 'lower-calories',
      mode: SWAP_MODE_BALANCE,
      currentDayNutrition,
      optionalDailyTargets: dailyTargets,
      products,
      meals: mealLibrary,
    })

    // Evaluate replacement at the current instance quantity only.
    // Quantity changes belong to REDUCE_QUANTITY (or the confirmation stepper).
    const replacementQuantity =
      currentQuantity > 0 ? currentQuantity : 1

    for (const recommendation of swapResult.recommendations) {
      // recommendMealSwaps returns instance totals at recommendation.quantity;
      // recover 1× nutrition, then scale to the preserved quantity.
      const recommendationQuantity =
        normalizeMealQuantity(recommendation.quantity) || 1
      const unitNutrition =
        recommendation.unitNutrition && typeof recommendation.unitNutrition === 'object'
          ? recommendation.unitNutrition
          : {
              calories: toSafeNumber(recommendation.calories) / recommendationQuantity,
              protein: toSafeNumber(recommendation.protein) / recommendationQuantity,
              carbs: toSafeNumber(recommendation.carbs) / recommendationQuantity,
              fat: toSafeNumber(recommendation.fat) / recommendationQuantity,
            }

      const suggestedNutrition = scaleNutrition(unitNutrition, replacementQuantity)
      const metrics = buildBalanceCandidateMetrics({
        dayNutrition: currentDayNutrition,
        originalNutrition,
        suggestedNutrition,
        targetCalories: balanceAimCalories,
        dayCalories,
        dayProtein,
        mealProtein,
        desiredSuggestedCalories,
      })
      // Never recommend a swap that increases (or fails to reduce) calorie excess.
      if (!(metrics.calorieSavings > 0)) {
        continue
      }

      const quantityChange = 0
      const scaledRecommendation = {
        ...recommendation,
        unitNutrition,
        calories: metrics.suggestedCalories,
        protein: metrics.suggestedProtein,
        carbs: toSafeNumber(suggestedNutrition.carbs),
        fat: toSafeNumber(suggestedNutrition.fat),
        quantity: replacementQuantity,
      }

      candidates.push({
        actionType: BALANCE_ACTION_REPLACE_MEAL,
        actionKey: `replace:${plannerItem.id}:${recommendation.id}:${replacementQuantity}`,
        plannerItemId: plannerItem.id,
        plannerItem,
        slotId,
        slotLabel,
        currentName,
        currentQuantity,
        suggestedQuantity: replacementQuantity,
        currentCalories: mealCalories,
        currentProtein: mealProtein,
        desiredReplacementCalories: desiredSuggestedCalories,
        replacement: scaledRecommendation,
        replacementId: recommendation.id,
        replacementName: recommendation.name,
        replacementQuantity,
        quantityChange,
        // Same changeSize scale as REDUCE (quantity delta only). No REPLACE bonus/penalty.
        changeSize: quantityChange / Math.max(currentQuantity, QUANTITY_EPSILON),
        categoryMatch: Boolean(recommendation.categoryMatch),
        ...metrics,
      })
    }
  }

  const strong = candidates.filter(
    (entry) => entry.calorieSavings >= BALANCE_MIN_SAVINGS,
  )
  const pool = strong.length > 0 ? strong : candidates
  const ranked = [...pool].sort(compareBalanceDayCandidates)

  // Best of each action type per planner instance, then top N overall.
  // Allows REDUCE_QUANTITY and REPLACE_MEAL for the same meal to both appear.
  const seenActionKeys = new Set()
  const recommendations = []
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : PAGE_SIZE

  for (const entry of ranked) {
    const dedupeKey = `${entry.plannerItemId}:${entry.actionType}`
    if (seenActionKeys.has(dedupeKey)) {
      continue
    }
    seenActionKeys.add(dedupeKey)
    recommendations.push(entry)
    if (recommendations.length >= max) {
      break
    }
  }

  return {
    recommendations,
    calorieExcess,
    dayCalories,
    targetCalories,
    effectiveCalorieLimit: calorieStatus.effectiveCalorieLimit,
  }
}

export const SMART_SWAP_PAGE_SIZE = PAGE_SIZE
export const BALANCE_DAY_MIN_SAVINGS = BALANCE_MIN_SAVINGS
