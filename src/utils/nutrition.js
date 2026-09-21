export function valueForGrams(valuePer100g, quantityGrams) {
  return (valuePer100g * quantityGrams) / 100
}

export function productNutritionForGrams(product, quantityGrams) {
  return {
    calories: valueForGrams(product.caloriesPer100g, quantityGrams),
    protein: valueForGrams(product.proteinPer100g, quantityGrams),
    carbs: valueForGrams(product.carbsPer100g, quantityGrams),
    fat: valueForGrams(product.fatPer100g, quantityGrams),
  }
}

export function roundForDisplay(value, decimals = 0) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
