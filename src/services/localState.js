import starterProductsData from '../data/starterProducts.json' with { type: 'json' }
import { upsertLocalRow } from '../sync/rowMapping.js'

export const LEGACY_KEYS = Object.freeze({
  products: 'weekplate_products',
  meals: 'weekplate_meals',
  goals: 'weekplate_goals',
  plans: 'weekplate_plans',
  today: 'weekplate_today',
  migrations: 'weekplate_migrations',
  shopping: 'weekplate_shopping_purchased',
  deletedStarters: 'weekplate_deleted_starter_products',
})

const MIGRATIONS_VALUE = JSON.stringify({
  meals_tags_v1: true,
  today_to_plans_v1: true,
})

let values = new Map([[LEGACY_KEYS.migrations, MIGRATIONS_VALUE]])
let database = null
let globals = new Map()
let privateProducts = new Map()
let listeners = new Set()
let onLocalChange = null
let writeChain = Promise.resolve()
let lastWriteError = null
let localVersion = 0
let generation = 0
let dataVersion = 0
const dataListeners = new Set()

function parse(value, fallback) {
  try {
    return value == null ? fallback : JSON.parse(value)
  } catch {
    return fallback
  }
}

function json(value) {
  return JSON.stringify(value)
}

function same(a, b) {
  return json(a) === json(b)
}

function notify() {
  for (const listener of listeners) listener()
}

function productFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    caloriesPer100g: row.calories_per_100g,
    proteinPer100g: row.protein_per_100g,
    carbsPer100g: row.carbs_per_100g,
    fatPer100g: row.fat_per_100g,
    units: parse(row.units, []),
  }
}

function productToRow(product, timestamps = {}) {
  return {
    id: product.id,
    name: product.name,
    calories_per_100g: product.caloriesPer100g,
    protein_per_100g: product.proteinPer100g,
    carbs_per_100g: product.carbsPer100g,
    fat_per_100g: product.fatPer100g,
    units: product.units ?? [],
    created_at: timestamps.created_at,
    updated_at: timestamps.updated_at,
    deleted_at: timestamps.deleted_at ?? null,
    server_updated_at: timestamps.server_updated_at ?? null,
    sync_status: timestamps.sync_status ?? 'pending',
  }
}

function normalizedProduct(product) {
  if (!product) return null
  const { id, name, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g } =
    product
  return {
    id,
    name,
    caloriesPer100g,
    proteinPer100g,
    carbsPer100g,
    fatPer100g,
    units: product.units ?? [],
  }
}

function equalsGlobal(product, globalRow) {
  return same(normalizedProduct(product), normalizedProduct(productFromRow(globalRow)))
}

async function queueRow(tx, table, id, operation, now) {
  await tx.run(
    `INSERT INTO sync_queue(entity_type, entity_id, operation, created_at,
       attempt_count, last_error, next_attempt_at)
     VALUES (?, ?, ?, ?, 0, NULL, NULL)
     ON CONFLICT(entity_type, entity_id) DO UPDATE SET
       operation=excluded.operation, created_at=excluded.created_at,
       attempt_count=0, last_error=NULL, next_attempt_at=NULL`,
    [table, String(id), operation, now],
  )
}

async function writeProducts(tx, previous, next, now) {
  const before = new Map(previous.map((item) => [item.id, item]))
  const after = new Map(next.map((item) => [item.id, item]))
  const ids = new Set([...before.keys(), ...after.keys()])

  for (const id of ids) {
    const oldProduct = before.get(id)
    const newProduct = after.get(id)
    if (same(oldProduct, newProduct)) continue
    const existing = privateProducts.get(id)
    const global = globals.get(id)
    if (newProduct && global && equalsGlobal(newProduct, global) && !existing) continue

    if (newProduct) {
      const row = productToRow(newProduct, {
        created_at: existing?.created_at ?? now,
        updated_at: now,
        deleted_at: null,
      })
      await upsertLocalRow(tx, 'products', row)
      privateProducts.set(id, { ...row, units: json(row.units) })
      await queueRow(tx, 'products', id, 'upsert', now)
    } else {
      const source = oldProduct ?? (global ? productFromRow(global) : null)
      if (!source) continue
      const row = productToRow(source, {
        created_at: existing?.created_at ?? now,
        updated_at: now,
        deleted_at: now,
      })
      await upsertLocalRow(tx, 'products', row)
      privateProducts.set(id, { ...row, units: json(row.units) })
      await queueRow(tx, 'products', id, 'delete', now)
    }
  }
}

const CONFIG = {
  [LEGACY_KEYS.meals]: {
    table: 'meals',
    kind: 'array',
    key: 'id',
    toRow: (item) => ({
      id: item.id,
      name: item.name,
      tags: item.tags ?? [],
      ingredients: item.ingredients ?? [],
    }),
  },
  [LEGACY_KEYS.plans]: {
    table: 'day_plans',
    kind: 'object',
    key: 'date_key',
    toRow: (item, id) => ({ date_key: id, slots: item }),
  },
  [LEGACY_KEYS.shopping]: {
    table: 'shopping_checks',
    kind: 'object',
    key: 'selection_key',
    toRow: (item, id) => ({ selection_key: id, checked: item }),
  },
}

async function writeCollection(tx, key, previous, next, now) {
  const config = CONFIG[key]
  const before =
    config.kind === 'array'
      ? new Map(previous.map((item) => [item[config.key], item]))
      : new Map(Object.entries(previous))
  const after =
    config.kind === 'array'
      ? new Map(next.map((item) => [item[config.key], item]))
      : new Map(Object.entries(next))
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (same(before.get(id), after.get(id))) continue
    const oldRows = await tx.query(
      `SELECT * FROM ${config.table} WHERE ${config.key} = ?`,
      [id],
    )
    const old = oldRows[0]
    const item = after.get(id) ?? before.get(id)
    const row = {
      ...config.toRow(item, id),
      created_at: old?.created_at ?? now,
      updated_at: now,
      deleted_at: after.has(id) ? null : now,
      server_updated_at: old?.server_updated_at ?? null,
      sync_status: 'pending',
    }
    await upsertLocalRow(tx, config.table, row)
    await queueRow(tx, config.table, id, after.has(id) ? 'upsert' : 'delete', now)
  }
}

async function persistChange(target, key, previousRaw, nextRaw) {
  if (!target) return
  const now = new Date().toISOString()
  await target.transaction(async (tx) => {
    if (key === LEGACY_KEYS.products) {
      await writeProducts(tx, parse(previousRaw, []), parse(nextRaw, []), now)
    } else if (CONFIG[key]) {
      const fallback = CONFIG[key].kind === 'array' ? [] : {}
      await writeCollection(
        tx,
        key,
        parse(previousRaw, fallback),
        parse(nextRaw, fallback),
        now,
      )
    } else if (key === LEGACY_KEYS.goals) {
      const next = parse(nextRaw, null)
      if (!next) return
      const current = (await tx.query(`SELECT * FROM user_settings WHERE id=1`))[0]
      await upsertLocalRow(tx, 'user_settings', {
        id: 1,
        calories: next.calories,
        protein: next.protein,
        carbs: next.carbs,
        fat: next.fat,
        allowed_calorie_overage: next.allowedCalorieOverage ?? 100,
        created_at: current?.created_at ?? now,
        updated_at: now,
        server_updated_at: current?.server_updated_at ?? null,
        sync_status: 'pending',
      })
      await queueRow(tx, 'user_settings', '1', 'upsert', now)
    }
  })
}

/**
 * A write is bound to the database and session generation current when it was
 * made, so a queued write can never land in the next user's database.
 */
function scheduleWrite(key, previous, next) {
  const target = database
  const writeGeneration = generation
  const notifyChange = onLocalChange
  writeChain = writeChain
    .then(() => {
      if (writeGeneration !== generation) return false
      return persistChange(target, key, previous, next).then(() => true)
    })
    .then((written) => {
      if (!written) return
      lastWriteError = null
      notifyChange?.()
    })
    .catch((error) => {
      if (writeGeneration !== generation) return
      lastWriteError = error
      notify()
    })
}

export function getItem(key) {
  return values.has(key) ? values.get(key) : null
}

export function setItem(key, value) {
  const normalizedKey = String(key)
  const next = String(value)
  const previous = getItem(normalizedKey)
  if (previous === next) return
  localVersion += 1
  values.set(normalizedKey, next)
  scheduleWrite(normalizedKey, previous, next)
  notify()
}

export function removeItem(key) {
  const normalizedKey = String(key)
  const previous = getItem(normalizedKey)
  if (previous == null) return
  localVersion += 1
  values.delete(normalizedKey)
  scheduleWrite(normalizedKey, previous, null)
  notify()
}

export async function hydrateFromDatabase(db, options = {}) {
  if (database !== db) generation += 1
  database = db
  applySnapshot(await readSnapshot(db, options))
}

async function readSnapshot(
  db,
  { globalProductsFallback = starterProductsData.products ?? [] } = {},
) {
  const globalRows = await db.query(
    `SELECT * FROM global_products WHERE deleted_at IS NULL ORDER BY sort_order, id`,
  )
  const effectiveGlobals =
    globalRows.length > 0
      ? globalRows
      : globalProductsFallback.map((product, index) => ({
          ...productToRow(product),
          sort_order: index,
          units: json(product.units ?? []),
        }))
  const nextGlobals = new Map(effectiveGlobals.map((row) => [row.id, row]))

  const productRows = await db.query(`SELECT * FROM products ORDER BY created_at, id`)
  const nextPrivateProducts = new Map(productRows.map((row) => [row.id, row]))
  const products = []
  const deletedStarters = []
  for (const global of effectiveGlobals) {
    const override = nextPrivateProducts.get(global.id)
    if (override?.deleted_at) {
      deletedStarters.push(global.id)
    } else {
      products.push(productFromRow(override ?? global))
    }
  }
  for (const row of productRows) {
    if (!nextGlobals.has(row.id) && !row.deleted_at) products.push(productFromRow(row))
  }

  const meals = (await db.query(
    `SELECT * FROM meals WHERE deleted_at IS NULL ORDER BY created_at, id`,
  )).map((row) => ({
    id: row.id,
    name: row.name,
    tags: parse(row.tags, []),
    ingredients: parse(row.ingredients, []),
  }))
  const plans = Object.fromEntries(
    (await db.query(`SELECT * FROM day_plans WHERE deleted_at IS NULL`)).map(
      (row) => [row.date_key, parse(row.slots, {})],
    ),
  )
  const settings = (await db.query(`SELECT * FROM user_settings WHERE id=1`))[0]
  const shopping = Object.fromEntries(
    (await db.query(`SELECT * FROM shopping_checks WHERE deleted_at IS NULL`)).map(
      (row) => [row.selection_key, parse(row.checked, {})],
    ),
  )

  const nextValues = new Map([
    [LEGACY_KEYS.products, json(products)],
    [LEGACY_KEYS.meals, json(meals)],
    [LEGACY_KEYS.plans, json(plans)],
    [LEGACY_KEYS.shopping, json(shopping)],
    [LEGACY_KEYS.deletedStarters, json(deletedStarters)],
    [LEGACY_KEYS.migrations, MIGRATIONS_VALUE],
  ])
  if (settings) {
    nextValues.set(
      LEGACY_KEYS.goals,
      json({
        calories: settings.calories,
        protein: settings.protein,
        carbs: settings.carbs,
        fat: settings.fat,
        allowedCalorieOverage: settings.allowed_calorie_overage,
      }),
    )
  }
  return { values: nextValues, globals: nextGlobals, privateProducts: nextPrivateProducts }
}

function applySnapshot(snapshot) {
  const changed =
    snapshot.values.size !== values.size ||
    [...snapshot.values].some(([key, value]) => values.get(key) !== value)
  values = snapshot.values
  globals = snapshot.globals
  privateProducts = snapshot.privateProducts
  notify()
  if (changed) {
    dataVersion += 1
    for (const listener of dataListeners) listener(dataVersion)
  }
}

/**
 * Fires only when a reload from SQLite (sync pull, import) changed visible data,
 * never for the app's own synchronous writes — pages use it to re-read.
 */
export function subscribeDataChanges(listener) {
  dataListeners.add(listener)
  return () => dataListeners.delete(listener)
}

export function getDataVersion() {
  return dataVersion
}

/**
 * Reload memory from SQLite without losing local edits made meanwhile: pending
 * writes are persisted first, and a snapshot is discarded if memory changed
 * while it was being read.
 */
export async function rehydrate() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const db = database
    if (!db) return
    await writeChain
    const version = localVersion
    const snapshot = await readSnapshot(db)
    if (db !== database) return
    if (version === localVersion) {
      applySnapshot(snapshot)
      return
    }
  }
}

export async function applyRemoteChanges() {
  await rehydrate()
}

export function attachDatabase(db, options = {}) {
  database = db
  onLocalChange = options.onLocalChange ?? null
}

export function detach() {
  generation += 1
  database = null
  onLocalChange = null
  globals = new Map()
  privateProducts = new Map()
}

export function reset() {
  detach()
  values = new Map([[LEGACY_KEYS.migrations, MIGRATIONS_VALUE]])
  lastWriteError = null
  notify()
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function flushWrites() {
  await writeChain
  if (lastWriteError) throw lastWriteError
}

export function getLastWriteError() {
  return lastWriteError
}

export function getAttachedDatabase() {
  return database
}

const localState = {
  getItem,
  setItem,
  removeItem,
  hydrateFromDatabase,
  rehydrate,
  applyRemoteChanges,
  attachDatabase,
  detach,
  reset,
  subscribe,
  subscribeDataChanges,
  getDataVersion,
  flushWrites,
  getLastWriteError,
  getAttachedDatabase,
}

export default localState
