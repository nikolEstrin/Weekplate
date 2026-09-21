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
