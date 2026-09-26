import starterProductsData from '../data/starterProducts.json' with { type: 'json' }
import {
  getEmptyDayPlan,
  getLocalDateKey,
  normalizeDayPlan,
  validateGoals,
  validateMeal,
  validateProduct,
} from './storage.js'
import { isUuid, uuidV5 } from '../utils/uuid.js'
import { upsertLocalRow } from '../sync/rowMapping.js'

export const LEGACY_UUID_NAMESPACE = 'b0d6a3c2-6f1e-4c8a-9a51-8f2c7e1d4a90'

const SNAPSHOT_KEYS = [
  'weekplate_products',
  'weekplate_meals',
  'weekplate_goals',
  'weekplate_plans',
  'weekplate_today',
  'weekplate_shopping_purchased',
  'weekplate_deleted_starter_products',
]

function remapId(kind, id) {
  const value = String(id ?? '').trim()
  if (!value) throw new Error(`Missing ${kind} id`)
  return isUuid(value)
    ? value.toLowerCase()
    : uuidV5(`legacy:${kind}:${value}`, LEGACY_UUID_NAMESPACE)
}

function signature(units) {
  return (Array.isArray(units) ? units : [])
    .map((unit) => `${String(unit?.name ?? '').trim()}\0${Number(unit?.grams)}`)
    .sort()
    .join('\n')
}

function equalStarter(product, starter) {
  return (
    product.name.trim() === starter.name.trim() &&
    ['caloriesPer100g', 'proteinPer100g', 'carbsPer100g', 'fatPer100g'].every(
      (key) => Number(product[key]) === Number(starter[key]),
    ) &&
    signature(product.units) === signature(starter.units)
  )
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sourceHash(snapshot) {
  const text = canonicalJson(snapshot)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function remapIngredient(ingredient, maps) {
  const next = { ...ingredient }
  if (next.productId) next.productId = maps.products.get(next.productId) ?? remapId('product', next.productId)
  if (next.unitId) next.unitId = maps.units.get(next.unitId) ?? remapId('unit', next.unitId)
  if (next.mealId) next.mealId = maps.meals.get(next.mealId) ?? remapId('meal', next.mealId)
  return next
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function remapPlannerItem(item, maps) {
  if (!item || typeof item !== 'object') return item
  const hasId = typeof item.id === 'string' && item.id.trim() !== ''
  const next = {
    ...item,
    id: hasId ? remapId('planner-item', item.id) : item.id,
    ingredients: (item.ingredients ?? []).map((entry) =>
      remapIngredient(entry, maps),
    ),
  }
  if (item.sourceMealId) {
    next.sourceMealId =
      maps.meals.get(item.sourceMealId) ?? remapId('meal', item.sourceMealId)
  }
  if (Array.isArray(item.baseIngredients)) {
    next.baseIngredients = item.baseIngredients.map((entry) =>
      remapIngredient(entry, maps),
    )
  }
  return next
}

function remapPlan(plan, maps) {
  const source = plan && typeof plan === 'object' ? plan : {}
  const result = {}
  for (const key of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    const raw = Array.isArray(source[key])
      ? source[key]
      : source[key] == null
        ? []
        : [source[key]]
    result[key] = raw.map((item) => remapPlannerItem(item, maps))
  }
  return normalizeDayPlan(result)
}

function rowForProduct(product, now, deletedAt = null) {
  return {
    id: product.id,
    name: product.name,
    calories_per_100g: product.caloriesPer100g,
    protein_per_100g: product.proteinPer100g,
    carbs_per_100g: product.carbsPer100g,
    fat_per_100g: product.fatPer100g,
    units: product.units ?? [],
    created_at: now,
    updated_at: now,
    deleted_at: deletedAt,
    server_updated_at: null,
    sync_status: 'pending',
  }
}

async function enqueue(tx, table, id, operation, now) {
  await tx.run(
    `INSERT INTO sync_queue(entity_type,entity_id,operation,created_at)
     VALUES (?,?,?,?)
     ON CONFLICT(entity_type,entity_id) DO NOTHING`,
    [table, String(id), operation, now],
  )
}

function rewriteShoppingKey(key, maps) {
  const separator = key.indexOf('::')
  if (separator < 0) return key
  const productId = key.slice(0, separator)
  const mapped = maps.products.get(productId)
  return mapped ? `${mapped}${key.slice(separator)}` : key
}

function normalizeArguments(dbOrContext, stateOrSnapshot, snapshotOrOptions, maybeOptions) {
  if (dbOrContext?.db && dbOrContext?.localState) {
    return {
      db: dbOrContext.db,
      state: dbOrContext.localState,
      snapshot: stateOrSnapshot,
      options: snapshotOrOptions ?? {},
    }
  }
  return {
    db: dbOrContext,
    state: stateOrSnapshot,
    snapshot: snapshotOrOptions,
    options: maybeOptions ?? {},
  }
}

export async function importLegacySnapshot(
  dbOrContext,
  stateOrSnapshot,
  snapshotOrOptions,
  maybeOptions,
) {
  const { db, state, snapshot, options } = normalizeArguments(
    dbOrContext,
    stateOrSnapshot,
    snapshotOrOptions,
    maybeOptions,
  )
  const source = options.source ?? 'legacy'
  const report = {
    ok: false,
    counts: { products: 0, meals: 0, plans: 0, settings: 0, shopping: 0 },
    skipped: { products: 0, meals: 0, plans: 0, settings: 0, shopping: 0 },
    invalid: { products: 0, meals: 0, plans: 0 },
    errors: [],
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    report.errors.push('Snapshot must be an object')
    return report
  }

  try {
    const hash = sourceHash(snapshot)
    if (source !== 'backup') {
      const marker = (
        await db.query(`SELECT value FROM meta WHERE key='legacy_import_v1'`)
      )[0]?.value
      if (marker === hash) return { ...report, ok: true, alreadyImported: true }
    }

    const globalRows = await db.query(`SELECT * FROM global_products ORDER BY sort_order,id`)
    const globals =
      globalRows.length > 0
        ? globalRows.map((row) => ({
            id: row.id,
            name: row.name,
            caloriesPer100g: row.calories_per_100g,
            proteinPer100g: row.protein_per_100g,
            carbsPer100g: row.carbs_per_100g,
            fatPer100g: row.fat_per_100g,
            units: JSON.parse(row.units ?? '[]'),
          }))
        : starterProductsData.products
    const globalById = new Map(globals.map((product) => [product.id, product]))
    const maps = { products: new Map(), units: new Map(), meals: new Map() }
    const privateProducts = []
    const seenLegacyGlobals = new Set()
    const rawProducts = snapshot.weekplate_products ?? []
    if (!Array.isArray(rawProducts)) throw new Error('Products must be an array')

    for (const raw of rawProducts) {
      // The legacy reader silently dropped invalid products, so the user never saw them.
      if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) {
        report.invalid.products += 1
        continue
      }
      const validated = validateProduct(raw)
      if (!validated.ok) {
        report.invalid.products += 1
        continue
      }
      const starter = globalById.get(raw.id)
      const id = starter ? raw.id : remapId('product', raw.id)
      maps.products.set(raw.id, id)
      const product = { id, ...validated.product }
      if (starter) {
        seenLegacyGlobals.add(id)
        if (equalStarter(product, starter)) {
          for (const oldUnit of raw.units ?? []) {
            const match = starter.units.find(
              (unit) =>
                unit.name.trim() === String(oldUnit.name).trim() &&
                Number(unit.grams) === Number(oldUnit.grams),
            )
            if (oldUnit.id && match) maps.units.set(oldUnit.id, match.id)
          }
          continue
        }
      }
      product.units = product.units.map((unit, index) => {
        const old = raw.units?.[index]
        const unitId = remapId('unit', old?.id ?? unit.id)
        if (old?.id) maps.units.set(old.id, unitId)
        return { ...unit, id: unitId }
      })
      privateProducts.push(product)
    }

    const rawMeals = snapshot.weekplate_meals ?? []
    if (!Array.isArray(rawMeals)) throw new Error('Meals must be an array')
    for (const raw of rawMeals) maps.meals.set(raw.id, remapId('meal', raw.id))
    const meals = rawMeals.map((raw) => ({
      ...raw,
      id: maps.meals.get(raw.id),
      ingredients: (raw.ingredients ?? []).map((item) =>
        remapIngredient(item, maps),
      ),
    }))
    const catalog = [...globals, ...privateProducts]
    const normalizedMeals = []
    for (const meal of meals) {
      const validated = validateMeal(
        meal,
        catalog,
        meals.filter((entry) => entry.id !== meal.id),
        { selfId: meal.id },
      )
      if (!validated.ok) {
        report.invalid.meals += 1
        continue
      }
      normalizedMeals.push({ id: meal.id, ...validated.meal })
    }

    const rawPlans = snapshot.weekplate_plans ?? {}
    if (!rawPlans || typeof rawPlans !== 'object' || Array.isArray(rawPlans)) {
      throw new Error('Plans must be an object')
    }
    const plans = {}
    for (const [date, plan] of Object.entries(rawPlans)) {
      if (!isValidDateKey(date)) {
        report.invalid.plans += 1
        continue
      }
      plans[date] = remapPlan(plan, maps)
    }
    if (Array.isArray(snapshot.weekplate_today) && snapshot.weekplate_today.length) {
      const date = getLocalDateKey()
      const plan = plans[date] ?? getEmptyDayPlan()
      for (const item of snapshot.weekplate_today.map((entry) =>
        remapPlannerItem(entry, maps),
      )) {
        const normalized = normalizeDayPlan({ snacks: [item] }).snacks[0]
        if (!normalized) throw new Error('Invalid legacy today item')
        const primary = normalized.tags?.find((tag) =>
          ['breakfast', 'lunch', 'dinner'].includes(tag),
        )
        plan[primary ?? 'snacks'].push(normalized)
      }
      plans[date] = plan
    } else if (
      snapshot.weekplate_today != null &&
      !Array.isArray(snapshot.weekplate_today)
    ) {
      throw new Error('Today must be an array')
    }

    let goals = null
    if (snapshot.weekplate_goals != null) {
      const validated = validateGoals(snapshot.weekplate_goals)
      if (!validated.ok) throw new Error('Invalid goals')
      goals = validated.goals
    }
    const rawShopping = snapshot.weekplate_shopping_purchased ?? {}
    if (
      !rawShopping ||
      typeof rawShopping !== 'object' ||
      Array.isArray(rawShopping)
    ) {
      throw new Error('Shopping checks must be an object')
    }
    const shopping = Object.fromEntries(
      Object.entries(rawShopping).map(([selection, checks]) => [
        selection,
        Object.fromEntries(
          Object.entries(checks ?? {}).map(([key, checked]) => [
            rewriteShoppingKey(key, maps),
            checked,
          ]),
        ),
      ]),
    )
    const deleted = new Set(snapshot.weekplate_deleted_starter_products ?? [])
    if (source !== 'backup') {
      for (const id of globalById.keys()) {
        if (!seenLegacyGlobals.has(id)) deleted.add(id)
      }
    }

    const now = new Date().toISOString()
    // Lists are displayed in created_at order; one millisecond per item keeps legacy order.
    const baseTime = Date.now()
    const orderedAt = (index) => new Date(baseTime + index).toISOString()
    await db.transaction(async (tx) => {
      for (const [index, product] of privateProducts.entries()) {
        if ((await tx.query(`SELECT 1 FROM products WHERE id=?`, [product.id])).length) {
          report.skipped.products += 1
          continue
        }
        await upsertLocalRow(tx, 'products', rowForProduct(product, orderedAt(index)))
        await enqueue(tx, 'products', product.id, 'upsert', now)
        report.counts.products += 1
      }
      for (const id of deleted) {
        const global = globalById.get(id)
        if (!global) continue
        if ((await tx.query(`SELECT 1 FROM products WHERE id=?`, [id])).length) {
          report.skipped.products += 1
          continue
        }
        await upsertLocalRow(tx, 'products', rowForProduct(global, now, now))
        await enqueue(tx, 'products', id, 'delete', now)
        report.counts.products += 1
      }
      for (const [index, meal] of normalizedMeals.entries()) {
        if ((await tx.query(`SELECT 1 FROM meals WHERE id=?`, [meal.id])).length) {
          report.skipped.meals += 1
          continue
        }
        await upsertLocalRow(tx, 'meals', {
          id: meal.id,
          name: meal.name,
          tags: meal.tags,
          ingredients: meal.ingredients,
          created_at: orderedAt(index),
          updated_at: orderedAt(index),
          deleted_at: null,
          server_updated_at: null,
          sync_status: 'pending',
        })
        await enqueue(tx, 'meals', meal.id, 'upsert', now)
        report.counts.meals += 1
      }
      for (const [date, slots] of Object.entries(plans)) {
        if ((await tx.query(`SELECT 1 FROM day_plans WHERE date_key=?`, [date])).length) {
          report.skipped.plans += 1
          continue
        }
        await upsertLocalRow(tx, 'day_plans', {
          date_key: date,
          slots,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          server_updated_at: null,
          sync_status: 'pending',
        })
        await enqueue(tx, 'day_plans', date, 'upsert', now)
        report.counts.plans += 1
      }
      if (goals) {
        if ((await tx.query(`SELECT 1 FROM user_settings WHERE id=1`)).length) {
          report.skipped.settings += 1
        } else {
          await upsertLocalRow(tx, 'user_settings', {
            id: 1,
            calories: goals.calories,
            protein: goals.protein,
            carbs: goals.carbs,
            fat: goals.fat,
            allowed_calorie_overage: goals.allowedCalorieOverage,
            created_at: now,
            updated_at: now,
            server_updated_at: null,
            sync_status: 'pending',
          })
          await enqueue(tx, 'user_settings', '1', 'upsert', now)
          report.counts.settings += 1
        }
      }
      for (const [selection, checked] of Object.entries(shopping)) {
        if (
          (await tx.query(`SELECT 1 FROM shopping_checks WHERE selection_key=?`, [
            selection,
          ])).length
        ) {
          report.skipped.shopping += 1
          continue
        }
        await upsertLocalRow(tx, 'shopping_checks', {
          selection_key: selection,
          checked,
          created_at: now,
          updated_at: now,
          deleted_at: null,
          server_updated_at: null,
          sync_status: 'pending',
        })
        await enqueue(tx, 'shopping_checks', selection, 'upsert', now)
        report.counts.shopping += 1
      }
      if (source !== 'backup') {
        await tx.run(
          `INSERT INTO meta(key,value) VALUES ('legacy_import_v1',?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          [hash],
        )
      }
    })
    await state.rehydrate()
    if (source === 'browser' && typeof window !== 'undefined') {
      window.localStorage?.setItem(
        'weekplate_legacy_import_owner',
        String(db.userId ?? ''),
      )
    }
    report.ok = true
    return report
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
    return report
  }
}

export function readBrowserLegacySnapshot() {
  if (typeof window === 'undefined' || !window.localStorage) return null
  const snapshot = {}
  let found = false
  for (const key of SNAPSHOT_KEYS) {
    const raw = window.localStorage.getItem(key)
    if (raw == null) continue
    found = true
    try {
      snapshot[key] = JSON.parse(raw)
    } catch {
      snapshot[key] = null
    }
  }
  return found ? snapshot : null
}
