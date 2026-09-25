import starterProductsData from '../data/starterProducts.json' with { type: 'json' }
import localState, { LEGACY_KEYS } from './localState.js'
import { getLocalDateKey, validateGoals, validateMeal, validateProduct } from './storage.js'
import { importLegacySnapshot } from './legacyMigration.js'

const starterById = new Map(
  (starterProductsData.products ?? []).map((product) => [product.id, product]),
)

function parseKey(key, fallback) {
  try {
    const raw = localState.getItem(key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function unitSignature(units) {
  return JSON.stringify(
    (units ?? [])
      .map(({ name, grams }) => [name, Number(grams)])
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

function equalsStarter(product, starter) {
  return (
    product.name === starter.name &&
    ['caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'].every(
      (key) => Number(product[key]) === Number(starter[key]),
    ) &&
    unitSignature(product.units) === unitSignature(starter.units)
  )
}

export function exportBackup() {
  const products = parseKey(LEGACY_KEYS.products, []).filter((product) => {
    const starter = starterById.get(product.id)
    return !starter || !equalsStarter(product, starter)
  })
  return {
    type: 'weekplate-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      weekplate_products: products,
      weekplate_meals: parseKey(LEGACY_KEYS.meals, []),
      weekplate_goals: parseKey(LEGACY_KEYS.goals, null),
      weekplate_plans: parseKey(LEGACY_KEYS.plans, {}),
      weekplate_shopping_purchased: parseKey(LEGACY_KEYS.shopping, {}),
      weekplate_deleted_starter_products: parseKey(
        LEGACY_KEYS.deletedStarters,
        [],
      ),
    },
  }
}

export function getBackupFilename(date = new Date()) {
  return `weekplate-backup-${getLocalDateKey(date)}.json`
}

export function parseBackupJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: 'Backup file is empty' }
  }
  try {
    const data = JSON.parse(text)
    const validation = validateBackup(data)
    return validation.ok
      ? { ok: true, data: validation.backup }
      : { ok: false, error: validation.errors.join('; ') }
  } catch {
    return { ok: false, error: 'Backup is not valid JSON' }
  }
}

export function validateBackup(input) {
  const errors = []
  let backup = input
  if (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    Object.keys(input).some((key) => key.startsWith('weekplate_'))
  ) {
    backup = {
      type: 'weekplate-backup',
      version: 1,
      exportedAt: null,
      data: input,
    }
  }
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return { ok: false, errors: ['Backup must be an object'] }
  }
  if (backup.type !== 'weekplate-backup') errors.push('Unsupported backup type')
  if (backup.version !== 1) errors.push('Unsupported backup version')
  const data = backup.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    errors.push('Backup data must be an object')
    return { ok: false, errors }
  }
  const products = data.weekplate_products ?? []
  const meals = data.weekplate_meals ?? []
  if (!Array.isArray(products)) errors.push('Products must be an array')
  if (!Array.isArray(meals)) errors.push('Meals must be an array')
  if (errors.length) return { ok: false, errors }

  const validatedProducts = []
  for (const product of products) {
    const result = validateProduct(product)
    if (!product?.id || !result.ok) {
      errors.push(`Invalid product: ${product?.id ?? '?'}`)
    } else {
      validatedProducts.push({ id: product.id, ...result.product })
    }
  }
  const catalog = [...starterProductsData.products, ...validatedProducts]
  for (const meal of meals) {
    const result = validateMeal(
      meal,
      catalog,
      meals.filter((entry) => entry?.id !== meal?.id),
      { selfId: meal?.id },
    )
    if (!meal?.id || !result.ok) errors.push(`Invalid meal: ${meal?.id ?? '?'}`)
  }
  if (data.weekplate_goals != null && !validateGoals(data.weekplate_goals).ok) {
    errors.push('Invalid goals')
  }
  for (const [key, expected] of [
    ['weekplate_plans', 'object'],
    ['weekplate_shopping_purchased', 'object'],
  ]) {
    const value = data[key] ?? {}
    if (!value || typeof value !== expected || Array.isArray(value)) {
      errors.push(`Invalid ${key}`)
    }
  }
  if (
    data.weekplate_deleted_starter_products != null &&
    !Array.isArray(data.weekplate_deleted_starter_products)
  ) {
    errors.push('Invalid deleted starter products')
  }
  return { ok: errors.length === 0, errors, backup }
}

export async function importBackup(input, options = {}) {
  const validated = validateBackup(input)
  if (!validated.ok) {
    return {
      ok: false,
      counts: {},
      skipped: {},
      errors: validated.errors,
    }
  }
  const db = options.db ?? localState.getAttachedDatabase()
  const state = options.localState ?? localState
  if (!db) throw new Error('No data session is active')
  return importLegacySnapshot(db, state, validated.backup.data, {
    source: 'backup',
  })
}
