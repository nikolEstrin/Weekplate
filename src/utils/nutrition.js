import {
  buildMealsById,
  isMealIngredient,
  isProductIngredient,
} from './mealTree.js'

function toSafeNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

/**
 * Nutrition for a product quantity.
 * Formula: valuePer100g * quantityGrams / 100
 */
export function calculateProductNutrition(product, quantityGrams) {
  const quantity = toSafeNumber(quantityGrams)
  const source = product && typeof product === 'object' ? product : {}

  return {
    calories: toSafeNumber(source.caloriesPer100g) * quantity / 100,
    protein: toSafeNumber(source.proteinPer100g) * quantity / 100,
    carbs: toSafeNumber(source.carbsPer100g) * quantity / 100,
    fat: toSafeNumber(source.fatPer100g) * quantity / 100,
  }
}

/** Sum nutrition objects into one totals object. */
export function sumNutrition(items) {
  const totals = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  }

  if (!Array.isArray(items)) {
    return totals
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }

    totals.calories += toSafeNumber(item.calories)
    totals.protein += toSafeNumber(item.protein)
    totals.carbs += toSafeNumber(item.carbs)
    totals.fat += toSafeNumber(item.fat)
  }

  return totals
}

function scaleNutrition(nutrition, multiplier) {
  const factor = toSafeNumber(multiplier)
  const source = nutrition && typeof nutrition === 'object' ? nutrition : {}
  return {
    calories: toSafeNumber(source.calories) * factor,
    protein: toSafeNumber(source.protein) * factor,
    carbs: toSafeNumber(source.carbs) * factor,
    fat: toSafeNumber(source.fat) * factor,
  }
}

/**
 * Total nutrition for a meal from its ingredients.
 * Nested meal components are included via mealMultiplier.
 * Missing products/meals are skipped (treated as zero contribution).
 */
export function calculateMealNutrition(meal, products, meals = []) {
  const source = meal && typeof meal === 'object' ? meal : {}
  const ingredients = Array.isArray(source.ingredients) ? source.ingredients : []
  const productList = Array.isArray(products) ? products : []
  const mealsById = buildMealsById(meals)

  const productsById = new Map()
  for (const product of productList) {
    if (product && typeof product === 'object' && typeof product.id === 'string') {
      productsById.set(product.id, product)
    }
  }

  const visiting = new Set()
  const mealId = typeof source.id === 'string' ? source.id : null
  if (mealId) {
    visiting.add(mealId)
  }

  const nutritionItems = []
  for (const ingredient of ingredients) {
    if (!ingredient || typeof ingredient !== 'object') {
      continue
    }

    if (isProductIngredient(ingredient)) {
      const product = productsById.get(ingredient.productId.trim())
      if (!product) {
        continue
      }
      nutritionItems.push(
        calculateProductNutrition(product, ingredient.quantityGrams),
      )
      continue
    }

    if (isMealIngredient(ingredient)) {
      const childId = ingredient.mealId.trim()
      if (visiting.has(childId)) {
        continue
      }
      const child = mealsById.get(childId)
      if (!child) {
        continue
      }
      const multiplier = toSafeNumber(ingredient.mealMultiplier)
      const safeMultiplier = multiplier > 0 ? multiplier : 1
      const childNutrition = calculateMealNutrition(child, productList, meals)
      nutritionItems.push(scaleNutrition(childNutrition, safeMultiplier))
    }
  }

  return sumNutrition(nutritionItems)
}

/**
 * Total nutrition for Today's planner items.
 * Uses live product data when available; falls back to per-ingredient
 * nutrition snapshots (for deleted products). Does not reimplement the
 * per-100g formula — delegates to calculateProductNutrition.
 * Planner snapshots are already flattened to products.
 */
export function calculatePlannerNutrition(items, products) {
  const list = Array.isArray(items) ? items : []
  const productList = Array.isArray(products) ? products : []

  const productsById = new Map()
  for (const product of productList) {
    if (product && typeof product === 'object' && typeof product.id === 'string') {
      productsById.set(product.id, product)
    }
  }

  const nutritionItems = []
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : []
    for (const ingredient of ingredients) {
      if (!ingredient || typeof ingredient !== 'object') {
        continue
      }
      if (typeof ingredient.productId !== 'string') {
        continue
      }

      const liveProduct = productsById.get(ingredient.productId)
      const product = liveProduct || {
        caloriesPer100g: ingredient.caloriesPer100g,
        proteinPer100g: ingredient.proteinPer100g,
        carbsPer100g: ingredient.carbsPer100g,
        fatPer100g: ingredient.fatPer100g,
      }

      nutritionItems.push(
        calculateProductNutrition(product, ingredient.quantityGrams),
      )
    }
  }

  return sumNutrition(nutritionItems)
}

/** Remaining = goals - current. May be negative when exceeded. */
export function remainingNutrition(current, goals) {
  const currentSafe = current && typeof current === 'object' ? current : {}
  const goalsSafe = goals && typeof goals === 'object' ? goals : {}

  return {
    calories: toSafeNumber(goalsSafe.calories) - toSafeNumber(currentSafe.calories),
    protein: toSafeNumber(goalsSafe.protein) - toSafeNumber(currentSafe.protein),
    carbs: toSafeNumber(goalsSafe.carbs) - toSafeNumber(currentSafe.carbs),
    fat: toSafeNumber(goalsSafe.fat) - toSafeNumber(currentSafe.fat),
  }
}

/** Round only for display. Keep full precision in calculations. */
export function roundForDisplay(value, decimals = 0) {
  const number = toSafeNumber(value)
  const factor = 10 ** decimals
  return Math.round(number * factor) / factor
}
