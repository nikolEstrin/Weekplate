import { isUuid, uuidV5 } from './uuid.js'

export const LEGACY_UUID_NAMESPACE = 'b0d6a3c2-6f1e-4c8a-9a51-8f2c7e1d4a90'

/**
 * Cloud keys are lowercase UUIDs. Imported files may carry old non-UUID ids;
 * they map deterministically (same scheme as the legacy importer), so importing
 * the same file twice yields the same ids.
 */
export function toStableId(kind, id) {
  if (typeof id !== 'string') return id
  const value = id.trim()
  if (!value) return value
  return isUuid(value)
    ? value.toLowerCase()
    : uuidV5(`legacy:${kind}:${value}`, LEGACY_UUID_NAMESPACE)
}

function mapIngredient(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') return ingredient
  const next = { ...ingredient }
  if ('productId' in next) next.productId = toStableId('product', next.productId)
  if ('unitId' in next) next.unitId = toStableId('unit', next.unitId)
  if ('mealId' in next) next.mealId = toStableId('meal', next.mealId)
  return next
}

function mapIngredients(list) {
  return Array.isArray(list) ? list.map(mapIngredient) : list
}

function mapProduct(product) {
  if (!product || typeof product !== 'object') return product
  return {
    ...product,
    id: toStableId('product', product.id),
    units: Array.isArray(product.units)
      ? product.units.map((unit) =>
          unit && typeof unit === 'object' ? { ...unit, id: toStableId('unit', unit.id) } : unit,
        )
      : product.units,
  }
}

function mapMeal(meal) {
  if (!meal || typeof meal !== 'object') return meal
  return { ...meal, id: toStableId('meal', meal.id), ingredients: mapIngredients(meal.ingredients) }
}

function mapPlannerItem(item) {
  if (!item || typeof item !== 'object') return item
  const next = { ...item, ingredients: mapIngredients(item.ingredients) }
  if ('baseIngredients' in next) next.baseIngredients = mapIngredients(next.baseIngredients)
  if ('sourceMealId' in next) next.sourceMealId = toStableId('meal', next.sourceMealId)
  return next
}

function mapDayPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan
  const next = {}
  for (const [slot, items] of Object.entries(plan)) {
    next[slot] = Array.isArray(items)
      ? items.map(mapPlannerItem)
      : items && typeof items === 'object'
        ? mapPlannerItem(items)
        : items
  }
  return next
}

/** Copy of a library / week-prep import with every id and reference made cloud-safe. */
export function normalizeImportIds(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const next = { ...data }
  if (Array.isArray(data.products)) next.products = data.products.map(mapProduct)
  if (Array.isArray(data.meals)) next.meals = data.meals.map(mapMeal)
  if (data.days && typeof data.days === 'object' && !Array.isArray(data.days)) {
    next.days = Object.fromEntries(
      Object.entries(data.days).map(([key, plan]) => [key, mapDayPlan(plan)]),
    )
  }
  return next
}
