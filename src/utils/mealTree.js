/** Max meal nesting depth; the top-level meal counts as level 1. */
export const MAX_MEAL_DEPTH = 3

export function buildMealsById(meals) {
  const map = new Map()
  if (!Array.isArray(meals)) {
    return map
  }
  for (const meal of meals) {
    if (meal && typeof meal === 'object' && typeof meal.id === 'string') {
      map.set(meal.id, meal)
    }
  }
  return map
}

export function isProductIngredient(ingredient) {
  return (
    Boolean(ingredient) &&
    typeof ingredient === 'object' &&
    typeof ingredient.productId === 'string' &&
    ingredient.productId.trim() !== ''
  )
}

export function isMealIngredient(ingredient) {
  return (
    Boolean(ingredient) &&
    typeof ingredient === 'object' &&
    typeof ingredient.mealId === 'string' &&
    ingredient.mealId.trim() !== ''
  )
}

/**
 * Depth of a meal tree. Products-only meals are depth 1.
 * Returns Infinity when a cycle is detected.
 */
export function getMealDepth(meal, mealsById, visiting = new Set()) {
  if (!meal || typeof meal !== 'object') {
    return 1
  }

  const mealId = typeof meal.id === 'string' ? meal.id : null
  if (mealId) {
    if (visiting.has(mealId)) {
      return Number.POSITIVE_INFINITY
    }
    visiting.add(mealId)
  }

  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : []
  let maxChildDepth = 0

  for (const ingredient of ingredients) {
    if (!isMealIngredient(ingredient)) {
      continue
    }
    const childId = ingredient.mealId.trim()
    const child = mealsById instanceof Map ? mealsById.get(childId) : null
    if (!child) {
      continue
    }
    const childDepth = getMealDepth(child, mealsById, visiting)
    if (childDepth > maxChildDepth) {
      maxChildDepth = childDepth
    }
  }

  if (mealId) {
    visiting.delete(mealId)
  }

  return 1 + maxChildDepth
}

/**
 * Walk the meal tree and collect product ids in encounter order.
 * Stops early on cycles (treats as invalid).
 */
export function collectProductIdsInTree(meal, mealsById, visiting = new Set()) {
  const productIds = []
  if (!meal || typeof meal !== 'object') {
    return productIds
  }

  const mealId = typeof meal.id === 'string' ? meal.id : null
  if (mealId) {
    if (visiting.has(mealId)) {
      return productIds
    }
    visiting.add(mealId)
  }

  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : []
  for (const ingredient of ingredients) {
    if (isProductIngredient(ingredient)) {
      productIds.push(ingredient.productId.trim())
      continue
    }
    if (isMealIngredient(ingredient)) {
      const child = mealsById instanceof Map
        ? mealsById.get(ingredient.mealId.trim())
        : null
      if (child) {
        productIds.push(...collectProductIdsInTree(child, mealsById, visiting))
      }
    }
  }

  if (mealId) {
    visiting.delete(mealId)
  }

  return productIds
}

/** First product id that appears more than once in the resulting tree. */
export function findDuplicateProductInTree(meal, mealsById) {
  const seen = new Set()
  for (const productId of collectProductIdsInTree(meal, mealsById)) {
    if (seen.has(productId)) {
      return productId
    }
    seen.add(productId)
  }
  return null
}

export function mealTreeHasCycle(meal, mealsById, visiting = new Set()) {
  if (!meal || typeof meal !== 'object') {
    return false
  }

  const mealId = typeof meal.id === 'string' ? meal.id : null
  if (mealId) {
    if (visiting.has(mealId)) {
      return true
    }
    visiting.add(mealId)
  }

  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : []
  for (const ingredient of ingredients) {
    if (!isMealIngredient(ingredient)) {
      continue
    }
    const childId = ingredient.mealId.trim()
    if (mealId && childId === mealId) {
      if (mealId) {
        visiting.delete(mealId)
      }
      return true
    }
    const child = mealsById instanceof Map ? mealsById.get(childId) : null
    if (child && mealTreeHasCycle(child, mealsById, visiting)) {
      if (mealId) {
        visiting.delete(mealId)
      }
      return true
    }
  }

  if (mealId) {
    visiting.delete(mealId)
  }
  return false
}

/**
 * Validate depth, cycles, and duplicate products for one meal tree.
 * @returns {{ ok: true } | { ok: false, code: string, productId?: string, message: string }}
 */
export function validateMealTree(meal, mealsById, productsById = new Map()) {
  if (mealTreeHasCycle(meal, mealsById)) {
    return {
      ok: false,
      code: 'cycle',
      message: 'לא ניתן ליצור הפניה מעגלית בין ארוחות',
    }
  }

  const depth = getMealDepth(meal, mealsById)
  if (!Number.isFinite(depth) || depth > MAX_MEAL_DEPTH) {
    return {
      ok: false,
      code: 'depth',
      message: `עומק הארוחה מוגבל ל־${MAX_MEAL_DEPTH} רמות`,
    }
  }

  const duplicateProductId = findDuplicateProductInTree(meal, mealsById)
  if (duplicateProductId) {
    const product =
      productsById instanceof Map ? productsById.get(duplicateProductId) : null
    const productName =
      product && typeof product.name === 'string' && product.name.trim() !== ''
        ? product.name.trim()
        : duplicateProductId
    return {
      ok: false,
      code: 'duplicate_product',
      productId: duplicateProductId,
      message: `המוצר "${productName}" כבר מופיע בארוחה`,
    }
  }

  return { ok: true }
}

/**
 * Re-validate every meal in the catalog after a proposed change.
 * Used so edits to a nested meal cannot silently break parents.
 */
export function validateAllMealTrees(meals, products = []) {
  const mealsById = buildMealsById(meals)
  const productsById = new Map()
  if (Array.isArray(products)) {
    for (const product of products) {
      if (product && typeof product === 'object' && typeof product.id === 'string') {
        productsById.set(product.id, product)
      }
    }
  }

  for (const meal of mealsById.values()) {
    const result = validateMealTree(meal, mealsById, productsById)
    if (!result.ok) {
      const mealName =
        typeof meal.name === 'string' && meal.name.trim() !== ''
          ? meal.name.trim()
          : meal.id
      return {
        ok: false,
        mealId: meal.id,
        mealName,
        ...result,
        message: `הארוחה "${mealName}": ${result.message}`,
      }
    }
  }

  return { ok: true }
}
