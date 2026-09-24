/**
 * Starter products merge checks (mock localStorage).
 * Run: node scripts/check-starter-products.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import starterData from '../src/data/starterProducts.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const store = new Map()
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    store.set(String(key), String(value))
  },
  removeItem(key) {
    store.delete(String(key))
  },
  clear() {
    store.clear()
  },
}

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'crypto', {
    value: {
      randomUUID() {
        return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`
      },
    },
    configurable: true,
  })
}

store.clear()

const storage = await import(
  pathToFileURL(path.join(root, 'src/services/storage.js')).href
)
const nutrition = await import(
  pathToFileURL(path.join(root, 'src/utils/nutrition.js')).href
)
const units = await import(
  pathToFileURL(path.join(root, 'src/utils/units.js')).href
)

const STARTER_COUNT = starterData.products.length
assert.equal(STARTER_COUNT, 54, 'catalog must contain 54 products')

function assertFreshCatalog() {
  const products = storage.getProducts()
  assert.equal(products.length, STARTER_COUNT)
  const ids = new Set(products.map((product) => product.id))
  assert.equal(ids.size, STARTER_COUNT)
  for (const starter of starterData.products) {
    assert.ok(ids.has(starter.id), `missing starter ${starter.name}`)
    const live = products.find((product) => product.id === starter.id)
    assert.equal(live.name, starter.name.trim())
    assert.equal(live.caloriesPer100g, starter.caloriesPer100g)
    assert.equal(live.proteinPer100g, starter.proteinPer100g)
    assert.equal(live.carbsPer100g, starter.carbsPer100g)
    assert.equal(live.fatPer100g, starter.fatPer100g)
    assert.ok(Array.isArray(live.units))
    assert.equal(live.units.length, (starter.units || []).length)
  }
}

console.log('Fresh user gets all 54 starters')
assertFreshCatalog()

console.log('Units convert via existing quantityToGrams + nutrition')
const rice = storage.getProducts().find((product) => product.name === 'אורז מבושל')
assert.ok(rice)
const cup = rice.units.find((unit) => unit.name === 'כוס')
assert.ok(cup)
assert.equal(cup.grams, 160)
const grams = units.quantityToGrams(1, cup.grams)
assert.equal(grams, 160)
const macros = nutrition.calculateProductNutrition(rice, grams)
assert.equal(macros.calories, 200)
assert.equal(macros.protein, 2.7 * 1.6)

const groundBeef = storage
  .getProducts()
  .find((product) => product.name === 'בקר טחון')
assert.ok(groundBeef)
assert.deepEqual(groundBeef.units, [])

console.log('Second ensureStarterProducts creates no duplicates')
storage.ensureStarterProducts()
storage.ensureStarterProducts()
assert.equal(storage.getProducts().length, STARTER_COUNT)

console.log('Existing user data preserved; missing starters filled')
store.clear()
store.set(
  'weekplate_products',
  JSON.stringify([
    {
      id: 'user-custom-1',
      name: 'מוצר שלי',
      caloriesPer100g: 50,
      proteinPer100g: 1,
      carbsPer100g: 2,
      fatPer100g: 3,
      units: [{ id: 'u1', name: 'כף', grams: 10 }],
    },
    {
      // Same id as a starter — must not be overwritten
      id: '59e48cc0-8512-501f-a555-ee19f83b14a6',
      name: 'אורז מבושל (ערוך)',
      caloriesPer100g: 999,
      proteinPer100g: 1,
      carbsPer100g: 1,
      fatPer100g: 1,
      units: [],
    },
    {
      // Name collision with starter בננה — starter id must not be added
      id: 'user-banana',
      name: 'בננה',
      caloriesPer100g: 1,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 0,
      units: [],
    },
  ]),
)
store.set(
  'weekplate_goals',
  JSON.stringify({ calories: 2000, protein: 150, carbs: 200, fat: 70 }),
)
store.set(
  'weekplate_meals',
  JSON.stringify([
    {
      id: 'user-meal-1',
      name: 'ארוחה שלי',
      tags: ['lunch'],
      ingredients: [{ productId: 'user-custom-1', quantityGrams: 40 }],
    },
  ]),
)

const beforeGoals = storage.getGoals()
const beforeMeals = storage.getMeals()
const merged = storage.ensureStarterProducts()

assert.equal(
  merged.find((product) => product.id === 'user-custom-1')?.name,
  'מוצר שלי',
)
assert.equal(
  merged.find((product) => product.id === '59e48cc0-8512-501f-a555-ee19f83b14a6')
    ?.caloriesPer100g,
  999,
)
assert.ok(
  !merged.some(
    (product) => product.id === '078e65ec-ff3b-5d43-82f6-831a310b42ea',
  ),
  'name-collision starter בננה must not be added',
)
assert.ok(merged.some((product) => product.id === 'user-banana'))
assert.ok(
  merged.some((product) => product.id === '91893b21-a0b0-50d6-bd7e-09129bbeaa2e'),
  'missing starter בקר טחון should be added',
)
assert.deepEqual(storage.getGoals(), beforeGoals)
assert.equal(storage.getMeals().length, beforeMeals.length)
assert.equal(storage.getMeals()[0].id, 'user-meal-1')

const expectedMin = 3 + (STARTER_COUNT - 2) // kept 3 user rows; skip 1 id + 1 name collision
assert.equal(merged.length, expectedMin)

console.log('Deleted starter does not reappear on ensure')
const beefId = '91893b21-a0b0-50d6-bd7e-09129bbeaa2e'
assert.ok(storage.deleteProduct(beefId))
assert.ok(!storage.getProducts().some((product) => product.id === beefId))
storage.ensureStarterProducts()
storage.ensureStarterProducts()
assert.ok(
  !storage.getProducts().some((product) => product.id === beefId),
  'deleted starter must stay gone',
)
assert.ok(
  storage.getProducts().some((product) => product.id === 'user-custom-1'),
  'user product still present',
)

console.log('All starter product checks passed')
