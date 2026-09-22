/**
 * Shared quantity → grams helpers.
 * Nutrition always uses grams; convert quantity × unitGrams once at entry time.
 */

/** Suggested unit names for UI (not exclusive — names are free text). */
export const UNIT_NAME_SUGGESTIONS = [
  'יחידה',
  'קופסה',
  'פרוסה',
  'כף',
  'כפית',
  'כוס',
]

/** Built-in grams option: 1 quantity × grams unit = that many grams. */
export const GRAMS_UNIT = {
  id: 'grams',
  name: 'גרם',
  grams: 1,
}

/**
 * Convert a quantity in a given unit to grams.
 * @param {number|string} quantity - how many of the unit
 * @param {number|string} unitGrams - grams per 1 unit (use 1 for base grams)
 * @returns {number} grams, or NaN if inputs are invalid
 *
 * Example: quantity 2, unit קופסה=250 → 500
 */
export function quantityToGrams(quantity, unitGrams) {
  const qty =
    typeof quantity === 'number' ? quantity : Number(quantity)
  const gramsPerUnit =
    typeof unitGrams === 'number' ? unitGrams : Number(unitGrams)

  if (!Number.isFinite(qty) || !Number.isFinite(gramsPerUnit)) {
    return Number.NaN
  }
  if (gramsPerUnit <= 0) {
    return Number.NaN
  }

  return qty * gramsPerUnit
}
