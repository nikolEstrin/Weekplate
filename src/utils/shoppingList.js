import { roundForDisplay } from './nutrition.js'
import { GRAMS_UNIT } from './units.js'

/** Primary meal slots expected for a "fully planned" day (snacks optional). */
export const STANDARD_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner']

export const STANDARD_SLOT_LABELS = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'חטיף',
}

function toPositiveNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function normalizeDateKeys(dateKeys) {
  if (!Array.isArray(dateKeys)) {
    return []
  }
  const seen = new Set()
  const keys = []
  for (const key of dateKeys) {
    if (typeof key !== 'string') {
      continue
    }
    const trimmed = key.trim()
    if (trimmed === '' || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    keys.push(trimmed)
  }
  return keys.sort()
}

/**
 * Stable selection key for purchased-state persistence.
 * @param {string[]} dateKeys
 * @returns {string}
 */
export function shoppingSelectionKey(dateKeys) {
  return normalizeDateKeys(dateKeys).join(',')
}

/**
 * Describe the unit used for shopping aggregation / display.
 * Convertible when quantityGrams is known (canonical grams basis).
 */
export function describeIngredientUnit(ingredient) {
  const source = ingredient && typeof ingredient === 'object' ? ingredient : {}
  const quantityGrams = toPositiveNumber(source.quantityGrams)
  const unitGrams = toPositiveNumber(source.unitGrams)
  const unitId =
    typeof source.unitId === 'string' && source.unitId.trim() !== ''
      ? source.unitId.trim()
      : ''
  const unitName =
    typeof source.unitName === 'string' && source.unitName.trim() !== ''
      ? source.unitName.trim()
      : ''

  const isCustomUnit =
    Boolean(unitId) &&
    unitId !== GRAMS_UNIT.id &&
    unitGrams != null

  if (isCustomUnit) {
    return {
      convertible: quantityGrams != null,
      quantityGrams,
      quantityInUnit:
        quantityGrams != null ? quantityGrams / unitGrams : null,
      unitId,
      unitName: unitName || unitId,
      unitGrams,
      /** Lines share this key only when the same named unit definition applies. */
      unitKey: `unit:${unitId}@${unitGrams}`,
    }
  }

  // Named unit without a grams factor cannot be converted safely.
  if (unitId && unitId !== GRAMS_UNIT.id && unitGrams == null) {
    const quantityInUnit = toPositiveNumber(source.quantity)
    return {
      convertible: false,
      quantityGrams: null,
      quantityInUnit,
      unitId,
      unitName: unitName || unitId,
      unitGrams: null,
      unitKey: `opaque:${unitId}:${unitName || unitId}`,
    }
  }

  return {
    convertible: quantityGrams != null,
    quantityGrams,
    quantityInUnit: quantityGrams,
    unitId: GRAMS_UNIT.id,
    unitName: GRAMS_UNIT.name,
    unitGrams: 1,
    unitKey: 'grams',
  }
}

/**
 * Two unit descriptors can merge when both convert through grams,
 * or when they share an identical non-gram unit definition.
 */
export function unitsCanMerge(a, b) {
  if (!a || !b) {
    return false
  }
  if (a.convertible && b.convertible) {
    return true
  }
  return a.unitKey === b.unitKey && a.unitKey !== 'grams'
}

function resolveProductName(ingredient, productsById) {
  if (
    typeof ingredient.productName === 'string' &&
    ingredient.productName.trim() !== ''
  ) {
    return ingredient.productName.trim()
  }
  const productId =
    typeof ingredient.productId === 'string' ? ingredient.productId.trim() : ''
  if (productId && productsById instanceof Map) {
    const product = productsById.get(productId)
    if (product && typeof product.name === 'string' && product.name.trim() !== '') {
      return product.name.trim()
    }
  }
  return productId || 'מוצר'
}

function isDayPlanEmptyLocal(plan) {
  if (!plan || typeof plan !== 'object') {
    return true
  }
  const snacks = Array.isArray(plan.snacks) ? plan.snacks : []
  return (
    slotItemCount(plan.breakfast) === 0 &&
    slotItemCount(plan.lunch) === 0 &&
    slotItemCount(plan.dinner) === 0 &&
    snacks.length === 0
  )
}

/** Count items in a slot that may be a legacy single item or an array. */
function slotItemCount(raw) {
  if (Array.isArray(raw)) {
    return raw.filter(Boolean).length
  }
  return raw != null ? 1 : 0
}

function flattenPlanItems(plan) {
  if (!plan || typeof plan !== 'object') {
    return []
  }
  const items = []
  for (const slot of STANDARD_MEAL_SLOTS) {
    const raw = plan[slot]
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item) {
          items.push(item)
        }
      }
    } else if (raw) {
      items.push(raw)
    }
  }
  if (Array.isArray(plan.snacks)) {
    for (const snack of plan.snacks) {
      if (snack) {
        items.push(snack)
      }
    }
  }
  return items
}

/**
 * Collect raw product contributions from planned days.
 * Uses effective planner ingredients (already flattened nested meals + multipliers).
 */
export function collectShoppingContributions(dateKeys, plansByDate) {
  const keys = normalizeDateKeys(dateKeys)
  const contributions = []

  for (const dateKey of keys) {
    const plan =
      plansByDate && typeof plansByDate === 'object'
        ? plansByDate[dateKey]
        : null
    const items = flattenPlanItems(plan)
    for (const item of items) {
      const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : []
      for (const ingredient of ingredients) {
        if (!ingredient || typeof ingredient !== 'object') {
          continue
        }
        const productId =
          typeof ingredient.productId === 'string'
            ? ingredient.productId.trim()
            : ''
        if (!productId) {
          continue
        }
        contributions.push({
          ...ingredient,
          productId,
          dateKey,
          sourceItemName:
            typeof item.name === 'string' && item.name.trim() !== ''
              ? item.name.trim()
              : '',
        })
      }
    }
  }

  return contributions
}

/**
 * Warn about empty dates and missing breakfast/lunch/dinner on partially planned days.
 */
export function analyzeShoppingCoverage(dateKeys, plansByDate) {
  const keys = normalizeDateKeys(dateKeys)
  const emptyDates = []
  const missingSlots = []

  for (const dateKey of keys) {
    const plan =
      plansByDate && typeof plansByDate === 'object'
        ? plansByDate[dateKey]
        : null

    if (isDayPlanEmptyLocal(plan)) {
      emptyDates.push(dateKey)
      continue
    }

    const missing = []
    for (const slot of STANDARD_MEAL_SLOTS) {
      if (!plan || slotItemCount(plan[slot]) === 0) {
        missing.push(slot)
      }
    }
    if (missing.length > 0) {
      missingSlots.push({ dateKey, slots: missing })
    }
  }

  return { emptyDates, missingSlots }
}

/**
 * Aggregate contributions into shopping lines.
 * Same product merges when units convert safely (via grams); otherwise separate labelled lines.
 *
 * @returns {Array<{
 *   id: string,
 *   productId: string,
 *   productName: string,
 *   quantity: number,
 *   quantityGrams: number,
 *   unitId: string,
 *   unitName: string,
 *   unitGrams: number,
 *   label: string,
 *   mergedFromDifferentUnits: boolean,
 * }>}
 */
export function aggregateShoppingItems(contributions, productsById = new Map()) {
  const list = Array.isArray(contributions) ? contributions : []

  // Buckets keyed by productId → array of merge groups
  const byProduct = new Map()

  for (const contribution of list) {
    const productId =
      typeof contribution.productId === 'string'
        ? contribution.productId.trim()
        : ''
    if (!productId) {
      continue
    }

    const unit = describeIngredientUnit(contribution)
    const hasAmount =
      (unit.convertible && unit.quantityGrams != null) ||
      (!unit.convertible && unit.quantityInUnit != null)
    if (!hasAmount) {
      continue
    }

    if (!byProduct.has(productId)) {
      byProduct.set(productId, [])
    }
    const groups = byProduct.get(productId)
    const productName = resolveProductName(contribution, productsById)

    let target = null
    for (const group of groups) {
      if (unitsCanMerge(group, unit)) {
        target = group
        break
      }
    }

    if (!target) {
      target = {
        unitKey: unit.unitKey,
        unitId: unit.unitId,
        unitName: unit.unitName,
        unitGrams: unit.unitGrams,
        convertible: unit.convertible,
        quantityGrams: 0,
        quantityInUnit: 0,
        productName,
        mergedFromDifferentUnits: false,
      }
      groups.push(target)
    } else if (target.unitKey !== unit.unitKey) {
      target.mergedFromDifferentUnits = true
      // Prefer grams display when combining across different unit definitions.
      target.unitKey = 'grams'
      target.unitId = GRAMS_UNIT.id
      target.unitName = GRAMS_UNIT.name
      target.unitGrams = 1
    }

    if (unit.convertible && unit.quantityGrams != null) {
      target.quantityGrams += unit.quantityGrams
      target.convertible = true
      if (target.unitKey !== 'grams' && toPositiveNumber(target.unitGrams)) {
        target.quantityInUnit = target.quantityGrams / target.unitGrams
      } else {
        target.quantityInUnit = target.quantityGrams
      }
    } else if (unit.quantityInUnit != null) {
      target.quantityInUnit += unit.quantityInUnit
    }

    if (productName && (!target.productName || target.productName === productId)) {
      target.productName = productName
    }
  }

  const items = []
  for (const [productId, groups] of byProduct) {
    for (const group of groups) {
      const unitName = group.unitName || GRAMS_UNIT.name
      const id = `${productId}::${group.unitKey}`

      if (group.convertible && group.quantityGrams > 0) {
        const unitGrams = toPositiveNumber(group.unitGrams) || 1
        const quantity = group.quantityGrams / unitGrams
        items.push({
          id,
          productId,
          productName: group.productName || productId,
          quantity,
          quantityGrams: group.quantityGrams,
          unitId: group.unitId || GRAMS_UNIT.id,
          unitName,
          unitGrams,
          label: unitName,
          mergedFromDifferentUnits: Boolean(group.mergedFromDifferentUnits),
        })
        continue
      }

      if (!group.convertible && group.quantityInUnit > 0) {
        items.push({
          id,
          productId,
          productName: group.productName || productId,
          quantity: group.quantityInUnit,
          quantityGrams: null,
          unitId: group.unitId,
          unitName,
          unitGrams: null,
          label: unitName,
          mergedFromDifferentUnits: false,
        })
      }
    }
  }

  items.sort((a, b) => {
    const nameCmp = a.productName.localeCompare(b.productName, 'he')
    if (nameCmp !== 0) {
      return nameCmp
    }
    return a.label.localeCompare(b.label, 'he')
  })

  return items
}

/**
 * Build a shopping list for selected dates.
 *
 * @param {string[]} dateKeys
 * @param {Record<string, object>} plansByDate
 * @param {Map<string, object>|object[]} [products]
 * @returns {{
 *   dateKeys: string[],
 *   items: ReturnType<typeof aggregateShoppingItems>,
 *   warnings: { emptyDates: string[], missingSlots: { dateKey: string, slots: string[] }[] },
 * }}
 */
export function buildShoppingList(dateKeys, plansByDate, products) {
  const keys = normalizeDateKeys(dateKeys)
  let productsById = new Map()
  if (products instanceof Map) {
    productsById = products
  } else if (Array.isArray(products)) {
    for (const product of products) {
      if (product && typeof product === 'object' && typeof product.id === 'string') {
        productsById.set(product.id, product)
      }
    }
  }

  const warnings = analyzeShoppingCoverage(keys, plansByDate)
  const contributions = collectShoppingContributions(keys, plansByDate)
  const items = aggregateShoppingItems(contributions, productsById)

  return {
    dateKeys: keys,
    items,
    warnings,
  }
}

function formatQuantityForText(value) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) {
    return ''
  }
  const decimals = Math.abs(number - Math.round(number)) < 1e-9 ? 0 : 1
  return String(roundForDisplay(number, decimals))
}

/**
 * Plain-text shopping list for copy / WhatsApp share.
 *
 * @param {Array<{ productName?: string, quantity?: number, label?: string }>} items
 * @param {{ title?: string }} [options]
 * @returns {string}
 */
export function formatShoppingListAsText(items, options = {}) {
  const list = Array.isArray(items) ? items : []
  const title =
    typeof options.title === 'string' && options.title.trim() !== ''
      ? options.title.trim()
      : 'רשימת קניות'

  if (list.length === 0) {
    return title
  }

  const lines = [title, '']
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const name =
      typeof item.productName === 'string' && item.productName.trim() !== ''
        ? item.productName.trim()
        : 'מוצר'
    const qty = formatQuantityForText(item.quantity)
    const unit =
      typeof item.label === 'string' && item.label.trim() !== ''
        ? item.label.trim()
        : ''
    const amount = [qty, unit].filter(Boolean).join(' ')
    lines.push(amount ? `• ${name} — ${amount}` : `• ${name}`)
  }

  return lines.join('\n')
}
