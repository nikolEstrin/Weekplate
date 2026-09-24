/**
 * Shopping-list aggregation checks.
 * Run: node scripts/check-shopping-list.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID() {
        return `id-${Math.random().toString(16).slice(2)}-${Date.now()}`
      },
    },
    configurable: true,
  })
}

const storage = await import(
  pathToFileURL(path.join(root, 'src/services/storage.js')).href
)
const shopping = await import(
  pathToFileURL(path.join(root, 'src/utils/shoppingList.js')).href
)

const results = []
function check(area, fn) {
  try {
    fn()
    results.push({ area, status: 'PASS' })
    console.log(`PASS  ${area}`)
  } catch (err) {
    results.push({ area, status: 'FAIL', error: err.message })
    console.error(`FAIL  ${area}: ${err.message}`)
  }
}

function nutritionProduct(overrides) {
  return {
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 5,
    ...overrides,
  }
}

store.clear()

const d1 = '2026-09-21'
const d2 = '2026-09-22'
const d3 = '2026-09-23'
const d4 = '2026-09-24'

check('Repeated product across dates combines', () => {
  store.clear()
  // re-seed after clear — storage module already loaded; products wiped
  const p = storage.addProduct(nutritionProduct({ name: 'אורז' })).product
  const meal = storage.addMeal(
    {
      name: 'אורז',
      tags: ['lunch'],
      ingredients: [{ productId: p.id, quantityGrams: 150 }],
    },
    [p],
  ).meal

  storage.addMealToDayPlan(d1, meal, 'lunch', [p])
  storage.addMealToDayPlan(d2, meal, 'lunch', [p])
  storage.updatePlannerMealMultiplier(d2, storage.getDayPlan(d2).lunch.id, 2)

  const list = storage.generateShoppingList([d1, d2])
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].productId, p.id)
  // day1: 150, day2: 150*2 = 300 → 450g
  assert.equal(list.items[0].quantityGrams, 450)
  assert.equal(list.items[0].quantity, 450)
  assert.equal(list.items[0].label, 'גרם')
})

check('Nested meals + multipliers expand into products', () => {
  store.clear()
  const pOats = storage.addProduct(nutritionProduct({ name: 'שיבולת שועל' })).product
  const pBanana = storage.addProduct(nutritionProduct({ name: 'בננה' })).product
  const base = storage.addMeal(
    {
      name: 'בסיס',
      tags: ['breakfast'],
      ingredients: [{ productId: pOats.id, quantityGrams: 100 }],
    },
    [pOats, pBanana],
  ).meal
  const top = storage.addMeal(
    {
      name: 'עליון',
      tags: ['breakfast'],
      ingredients: [
        { mealId: base.id, mealMultiplier: 2 },
        { productId: pBanana.id, quantityGrams: 120 },
      ],
    },
    [pOats, pBanana],
    [base],
  ).meal

  const add = storage.addMealToDayPlan(d1, top, 'breakfast', [pOats, pBanana])
  assert.equal(add.ok, true)
  storage.updatePlannerMealMultiplier(d1, add.item.id, 1.5)

  const list = storage.generateShoppingList([d1])
  const byId = Object.fromEntries(list.items.map((item) => [item.productId, item]))
  // oats: 100 * nested×2 * meal×1.5 = 300
  assert.equal(byId[pOats.id].quantityGrams, 300)
  // banana: 120 * meal×1.5 = 180
  assert.equal(byId[pBanana.id].quantityGrams, 180)
})

check('Different convertible units of same product combine', () => {
  store.clear()
  const yogurt = storage.addProduct(
    nutritionProduct({
      name: 'יוגורט',
      units: [{ id: 'box', name: 'קופסה', grams: 250 }],
    }),
  ).product

  storage.addProductToDayPlan(d1, yogurt, 200, 'snack')
  const snap = storage.createProductSnapshot(yogurt, 500)
  // 500g with box metadata (2 boxes)
  snap.item.ingredients[0].unitId = 'box'
  snap.item.ingredients[0].unitName = 'קופסה'
  snap.item.ingredients[0].unitGrams = 250
  storage.addSnack(d2, snap.item)

  const list = storage.generateShoppingList([d1, d2])
  const yogurtLines = list.items.filter((item) => item.productId === yogurt.id)
  assert.equal(yogurtLines.length, 1)
  assert.equal(yogurtLines[0].quantityGrams, 700)
  assert.equal(yogurtLines[0].label, 'גרם')
  assert.equal(yogurtLines[0].mergedFromDifferentUnits, true)
})

check('Opaque non-convertible units stay separate and labelled', () => {
  const items = shopping.aggregateShoppingItems([
    {
      productId: 'p-eggs',
      productName: 'ביצים',
      quantityGrams: 120,
      unitId: 'grams',
    },
    {
      productId: 'p-eggs',
      productName: 'ביצים',
      quantity: 6,
      unitId: 'pack',
      unitName: 'מארז',
      // no unitGrams, no quantityGrams → opaque
    },
  ])
  assert.equal(items.length, 2)
  const labels = items.map((item) => item.label).sort()
  assert.deepEqual(labels, ['גרם', 'מארז'])
})

check('Empty day warns but still allows partial list', () => {
  store.clear()
  const p = storage.addProduct(nutritionProduct({ name: 'לחם' })).product
  storage.addProductToDayPlan(d1, p, 50, 'breakfast')
  // d3 never planned

  const list = storage.generateShoppingList([d1, d3])
  assert.deepEqual(list.warnings.emptyDates, [d3])
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].quantityGrams, 50)
})

check('Partially planned day warns about missing standard slots', () => {
  store.clear()
  const p = storage.addProduct(nutritionProduct({ name: 'סלט' })).product
  storage.addProductToDayPlan(d4, p, 200, 'lunch')
  // breakfast + dinner missing; snacks empty — still partial

  const list = storage.generateShoppingList([d4])
  assert.equal(list.warnings.emptyDates.length, 0)
  assert.equal(list.warnings.missingSlots.length, 1)
  assert.equal(list.warnings.missingSlots[0].dateKey, d4)
  assert.deepEqual(list.warnings.missingSlots[0].slots, [
    'breakfast',
    'dinner',
  ])
  assert.equal(list.items.length, 1)
})

check('Purchased flags do not mutate plans/products/meals', () => {
  store.clear()
  const p = storage.addProduct(nutritionProduct({ name: 'גבינה' })).product
  const productsBefore = JSON.stringify(storage.getProducts())
  const mealsBefore = JSON.stringify(storage.getMeals())
  storage.addProductToDayPlan(d1, p, 80, 'snack')
  const planBefore = JSON.stringify(storage.getDayPlan(d1))

  const list = storage.generateShoppingList([d1])
  assert.equal(list.items.length, 1)
  const itemId = list.items[0].id

  storage.setShoppingItemPurchased([d1], itemId, true)
  const purchased = storage.getShoppingPurchased([d1])
  assert.equal(purchased[itemId], true)

  assert.equal(JSON.stringify(storage.getProducts()), productsBefore)
  assert.equal(JSON.stringify(storage.getMeals()), mealsBefore)
  assert.equal(JSON.stringify(storage.getDayPlan(d1)), planBefore)

  storage.setShoppingItemPurchased([d1], itemId, false)
  assert.equal(storage.getShoppingPurchased([d1])[itemId], undefined)
})

const failed = results.filter((row) => row.status === 'FAIL')
console.log('')
console.log(
  `Shopping list checks: ${results.length - failed.length}/${results.length} passed`,
)
if (failed.length > 0) {
  process.exitCode = 1
}
