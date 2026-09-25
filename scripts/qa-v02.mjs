/**
 * Weekplate V0.2 release QA — storage/nutrition logic only.
 * Run: node scripts/qa-v02.mjs
 */
import { createRequire } from 'node:module'
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

// --- UNITS ---
check('UNITS: קופסה 2×250=500g', () => {
  assert.equal(units.quantityToGrams(2, 250), 500)
  const product = {
    id: 'p1',
    name: 'יוגורט',
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 8,
    fatPer100g: 4,
    units: [{ id: 'u1', name: 'קופסה', grams: 250 }],
  }
  const grams = units.quantityToGrams(2, 250)
  const n = nutrition.calculateProductNutrition(product, grams)
  assert.equal(n.calories, 500)
  assert.equal(n.protein, 50)
})

// --- MULTIPLIER ---
check('MULTIPLIER: 150→1.5x=225→2x=300 (not 450)', () => {
  store.clear()
  const product = storage.addProduct({
    name: 'אורז',
    caloriesPer100g: 130,
    proteinPer100g: 2.5,
    carbsPer100g: 28,
    fatPer100g: 0.3,
  }).product
  const meal = storage.addMeal(
    {
      name: 'אורז מנה',
      tags: ['lunch'],
      ingredients: [{ productId: product.id, quantityGrams: 150 }],
    },
    [product],
  ).meal

  const dateKey = '2026-09-22'
  const add = storage.addMealToDayPlan(dateKey, meal, 'lunch', [product])
  assert.ok(add.ok)
  assert.equal(add.item.ingredients[0].quantityGrams, 150)

  const m15 = storage.updatePlannerMealMultiplier(dateKey, add.item.id, 1.5)
  assert.ok(m15.ok)
  assert.equal(m15.item.ingredients[0].quantityGrams, 225)
  assert.equal(m15.item.baseIngredients[0].quantityGrams, 150)

  const m2 = storage.updatePlannerMealMultiplier(dateKey, add.item.id, 2)
  assert.ok(m2.ok)
  assert.equal(m2.item.ingredients[0].quantityGrams, 300)
  assert.notEqual(m2.item.ingredients[0].quantityGrams, 450)

  // Saved meal unchanged
  const saved = storage.getMeals().find((m) => m.id === meal.id)
  assert.equal(saved.ingredients[0].quantityGrams, 150)
})

check('MULTIPLIER: local ingredient override does not modify saved meal', () => {
  store.clear()
  const product = storage.addProduct({
    name: 'חזה',
    caloriesPer100g: 110,
    proteinPer100g: 23,
    carbsPer100g: 0,
    fatPer100g: 2,
  }).product
  const meal = storage.addMeal(
    {
      name: 'עוף',
      tags: ['dinner'],
      ingredients: [{ productId: product.id, quantityGrams: 150 }],
    },
    [product],
  ).meal

  const dateKey = '2026-09-23'
  const add = storage.addMealToDayPlan(dateKey, meal, 'dinner', [product])
  storage.updatePlannerMealMultiplier(dateKey, add.item.id, 1.5)
  const qty = storage.updatePlannerItemQuantity(dateKey, add.item.id, 0, 300)
  assert.ok(qty.ok)
  assert.equal(qty.item.ingredients[0].quantityGrams, 300)
  // base should fold: 300/1.5 = 200
  assert.equal(qty.item.baseIngredients[0].quantityGrams, 200)

  const saved = storage.getMeals().find((m) => m.id === meal.id)
  assert.equal(saved.ingredients[0].quantityGrams, 150)

  // next multiplier from new base: 2x → 400
  const m2 = storage.updatePlannerMealMultiplier(dateKey, add.item.id, 2)
  assert.equal(m2.item.ingredients[0].quantityGrams, 400)
})

// --- PLANNER ---
check('PLANNER: date switching + slots + multi snacks + nutrition + persist', () => {
  store.clear()
  const product = storage.addProduct({
    name: 'לחם',
    caloriesPer100g: 250,
    proteinPer100g: 8,
    carbsPer100g: 45,
    fatPer100g: 3,
  }).product
  const breakfast = storage.addMeal(
    { name: 'בוקר', tags: ['breakfast'], ingredients: [{ productId: product.id, quantityGrams: 100 }] },
    [product],
  ).meal
  const lunch = storage.addMeal(
    { name: 'צהריים', tags: ['lunch'], ingredients: [{ productId: product.id, quantityGrams: 200 }] },
    [product],
  ).meal
  const dinner = storage.addMeal(
    { name: 'ערב', tags: ['dinner'], ingredients: [{ productId: product.id, quantityGrams: 150 }] },
    [product],
  ).meal
  const snack = storage.addMeal(
    { name: 'נשנוש', tags: ['snack'], ingredients: [{ productId: product.id, quantityGrams: 50 }] },
    [product],
  ).meal

  const d1 = '2026-09-21'
  const d2 = '2026-09-22'
  assert.ok(storage.addMealToDayPlan(d1, breakfast, 'breakfast', [product]).ok)
  assert.ok(storage.addMealToDayPlan(d1, lunch, 'lunch', [product]).ok)
  assert.ok(storage.addMealToDayPlan(d1, dinner, 'dinner', [product]).ok)
  assert.ok(storage.addMealToDayPlan(d1, snack, 'snack', [product]).ok)
  assert.ok(storage.addMealToDayPlan(d1, snack, 'snack', [product]).ok)

  const plan1 = storage.getDayPlan(d1)
  assert.ok(plan1.breakfast)
  assert.ok(plan1.lunch)
  assert.ok(plan1.dinner)
  assert.equal(plan1.snacks.length, 2)

  // second date independent
  assert.ok(storage.addMealToDayPlan(d2, lunch, 'lunch', [product]).ok)
  const plan2 = storage.getDayPlan(d2)
  assert.ok(plan2.lunch)
  assert.equal(plan2.breakfast, null)
  assert.equal(storage.getDayPlan(d1).snacks.length, 2)

  const n1 = nutrition.calculatePlannerNutrition(
    storage.flattenDayPlan(plan1),
    [product],
  )
  // 100+200+150+50+50 = 550g → 250*5.5 = 1375 kcal
  assert.equal(n1.calories, 1375)

  const n2 = nutrition.calculatePlannerNutrition(
    storage.flattenDayPlan(plan2),
    [product],
  )
  assert.equal(n2.calories, 500)

  // persistence via re-read
  const plansRaw = JSON.parse(store.get('weekplate_plans'))
  assert.ok(plansRaw[d1].breakfast)
  assert.equal(plansRaw[d1].snacks.length, 2)
  assert.ok(plansRaw[d2].lunch)
})

check('PLANNER: primary slot one-each occupancy', () => {
  store.clear()
  const product = storage.addProduct({
    name: 'א',
    caloriesPer100g: 100,
    proteinPer100g: 1,
    carbsPer100g: 1,
    fatPer100g: 1,
  }).product
  const m1 = storage.addMeal(
    { name: 'א1', tags: ['breakfast'], ingredients: [{ productId: product.id, quantityGrams: 10 }] },
    [product],
  ).meal
  const m2 = storage.addMeal(
    { name: 'א2', tags: ['breakfast'], ingredients: [{ productId: product.id, quantityGrams: 20 }] },
    [product],
  ).meal
  const d = '2026-09-24'
  assert.ok(storage.addMealToDayPlan(d, m1, 'breakfast', [product]).ok)
  const blocked = storage.addMealToDayPlan(d, m2, 'breakfast', [product])
  assert.equal(blocked.ok, false)
  assert.equal(blocked.needsReplace, true)
  const replaced = storage.addMealToDayPlan(d, m2, 'breakfast', [product], {
    replaceExplicitly: true,
  })
  assert.ok(replaced.ok)
  assert.equal(storage.getDayPlan(d).breakfast.name, 'א2')
})

// --- MEALS ---
check('MEALS: multi tags + filter helpers + recommendations', () => {
  store.clear()
  const product = storage.addProduct({
    name: 'פ',
    caloriesPer100g: 50,
    proteinPer100g: 1,
    carbsPer100g: 1,
    fatPer100g: 1,
  }).product
  const meal = storage.addMeal(
    {
      name: 'רב תג',
      tags: ['breakfast', 'snack', 'dessert'],
      ingredients: [{ productId: product.id, quantityGrams: 40 }],
    },
    [product],
  ).meal
  assert.deepEqual(meal.tags, ['breakfast', 'snack', 'dessert'])
  const rec = storage.getRecommendedSlots(meal.tags)
  assert.equal(rec[0], 'breakfast')
  assert.ok(rec.includes('snack'))
  assert.equal(rec.indexOf('snack'), 1) // dessert maps to snack, already seen
  // full padding still includes lunch/dinner
  assert.ok(rec.includes('lunch'))
  assert.ok(rec.includes('dinner'))
})

check('MEALS: saved meal isolation on planner edit', () => {
  store.clear()
  const product = storage.addProduct({
    name: 'גבינה',
    caloriesPer100g: 200,
    proteinPer100g: 20,
    carbsPer100g: 2,
    fatPer100g: 12,
  }).product
  const meal = storage.addMeal(
    {
      name: 'סלט',
      tags: ['lunch', 'dinner'],
      ingredients: [{ productId: product.id, quantityGrams: 80 }],
    },
    [product],
  ).meal
  const d = '2026-09-25'
  const add = storage.addMealToDayPlan(d, meal, 'lunch', [product])
  storage.updatePlannerItemQuantity(d, add.item.id, 0, 999)
  const saved = storage.getMeals().find((m) => m.id === meal.id)
  assert.equal(saved.ingredients[0].quantityGrams, 80)
  assert.equal(storage.getDayPlan(d).lunch.ingredients[0].quantityGrams, 999)
})

// --- IMPORT / EXPORT ---
check('IMPORT/EXPORT: export merge replace invalid JSON refs goals plans', () => {
  store.clear()
  storage.saveGoals({ calories: 1800, protein: 120, carbs: 160, fat: 55 })
  const product = storage.addProduct({
    name: 'מקומי',
    caloriesPer100g: 90,
    proteinPer100g: 5,
    carbsPer100g: 10,
    fatPer100g: 3,
  }).product
  const meal = storage.addMeal(
    {
      name: 'ארוחה מקומית',
      tags: ['lunch'],
      ingredients: [{ productId: product.id, quantityGrams: 100 }],
    },
    [product],
  ).meal
  const planDate = '2026-09-26'
  storage.addMealToDayPlan(planDate, meal, 'lunch', [product])

  const exported = storage.exportLibrary()
  assert.equal(exported.version, 1)
  assert.equal(exported.products.length, 1)
  assert.equal(exported.meals.length, 1)
  assert.equal(exported.plans, undefined)
  assert.equal(exported.goals, undefined)

  // invalid JSON
  const badParse = storage.parseLibraryJson('{not json')
  assert.equal(badParse.ok, false)

  // invalid refs
  const badRefs = storage.validateLibraryImport(
    {
      version: 1,
      products: [],
      meals: [
        {
          id: 'm-x',
          name: 'שבור',
          tags: ['snack'],
          ingredients: [{ productId: 'missing', quantityGrams: 10 }],
        },
      ],
    },
    'replace',
  )
  assert.equal(badRefs.ok, false)

  // merge new product+meal
  const importPayload = {
    version: 1,
    products: [
      {
        id: 'imp-p',
        name: 'מיובא',
        caloriesPer100g: 70,
        proteinPer100g: 3,
        carbsPer100g: 8,
        fatPer100g: 2,
        units: [],
      },
    ],
    meals: [
      {
        id: 'imp-m',
        name: 'ארוחה מיובאת',
        tags: ['dinner'],
        ingredients: [{ productId: 'imp-p', quantityGrams: 120 }],
      },
    ],
  }
  const merged = storage.importLibrary(importPayload, 'merge')
  assert.ok(merged.ok)
  assert.equal(storage.getProducts().length, 2)
  assert.equal(storage.getMeals().length, 2)
  assert.deepEqual(storage.getGoals(), {
    calories: 1800,
    protein: 120,
    carbs: 160,
    fat: 55,
  })
  assert.ok(storage.getDayPlan(planDate).lunch)

  // replace
  const replaced = storage.importLibrary(importPayload, 'replace')
  assert.ok(replaced.ok)
  assert.equal(storage.getProducts().length, 1)
  assert.equal(storage.getProducts()[0].id, 'imp-p')
  assert.equal(storage.getMeals().length, 1)
  // goals + plans untouched
  assert.deepEqual(storage.getGoals(), {
    calories: 1800,
    protein: 120,
    carbs: 160,
    fat: 55,
  })
  assert.ok(storage.getDayPlan(planDate).lunch)
})

check('IMPORT/EXPORT: custom starter units are exported and imported', () => {
  store.clear()
  storage.ensureStarterProducts()
  const starters = storage.getProducts()
  assert.ok(starters.length > 0, 'starters seeded')

  const starter = starters[0]
  const customUnit = {
    id: 'custom-unit-export-test',
    name: 'יחידה מותאמת',
    grams: 77,
  }
  const updated = storage.updateProduct(starter.id, {
    ...starter,
    units: [...(starter.units || []), customUnit],
  })
  assert.ok(updated.ok)

  const meal = storage.addMeal(
    {
      name: 'ארוחה עם יחידה מותאמת',
      tags: ['lunch'],
      ingredients: [
        {
          productId: starter.id,
          quantityGrams: 77,
          unitId: customUnit.id,
          unitName: customUnit.name,
          unitGrams: customUnit.grams,
        },
      ],
    },
    storage.getProducts(),
  ).meal
  assert.ok(meal)

  const exported = storage.exportLibrary()
  const exportedStarter = exported.products.find((p) => p.id === starter.id)
  assert.ok(exportedStarter, 'customized starter included in export')
  assert.ok(
    exportedStarter.units.some((u) => u.id === customUnit.id && u.grams === 77),
    'custom unit present in export',
  )
  // Unmodified starters stay out of the export.
  assert.equal(
    exported.products.filter((p) =>
      starters.some((s) => s.id === p.id && s.id !== starter.id),
    ).length,
    0,
  )

  // Fresh user imports the library.
  store.clear()
  storage.ensureStarterProducts()
  const beforeUnits = storage.getProducts().find((p) => p.id === starter.id).units
  assert.ok(!beforeUnits.some((u) => u.id === customUnit.id))

  const imported = storage.importLibrary(exported, 'merge')
  assert.ok(imported.ok)
  const after = storage.getProducts().find((p) => p.id === starter.id)
  assert.ok(
    after.units.some((u) => u.id === customUnit.id && u.name === customUnit.name),
    'importer receives custom starter units',
  )
  assert.ok(storage.getMeals().some((m) => m.id === meal.id))
})

// --- LEGACY ---
check('LEGACY: products without units + single-tag meals + today migration idempotent', () => {
  store.clear()
  // Legacy product without units
  store.set(
    'weekplate_products',
    JSON.stringify([
      {
        id: 'legacy-p',
        name: 'ישן',
        caloriesPer100g: 100,
        proteinPer100g: 5,
        carbsPer100g: 10,
        fatPer100g: 2,
      },
    ]),
  )
  // Legacy single-tag meal
  store.set(
    'weekplate_meals',
    JSON.stringify([
      {
        id: 'legacy-m',
        name: 'ארוחה ישנה',
        tag: 'Breakfast',
        ingredients: [{ productId: 'legacy-p', quantityGrams: 100 }],
      },
    ]),
  )
  // Old today planner
  store.set(
    'weekplate_today',
    JSON.stringify([
      {
        id: 'legacy-item',
        type: 'meal',
        name: 'ארוחה ישנה',
        tags: ['breakfast'],
        sourceMealId: 'legacy-m',
        ingredients: [
          {
            productId: 'legacy-p',
            quantityGrams: 100,
            productName: 'ישן',
            caloriesPer100g: 100,
            proteinPer100g: 5,
            carbsPer100g: 10,
            fatPer100g: 2,
          },
        ],
      },
    ]),
  )

  const products = storage.getProducts()
  assert.equal(products.length, 1)
  assert.deepEqual(products[0].units, [])

  const meals = storage.getMeals()
  assert.equal(meals.length, 1)
  assert.deepEqual(meals[0].tags, ['breakfast'])
  assert.equal(meals[0].tag, undefined)

  const plans = storage.getAllPlans()
  const todayKey = storage.getLocalDateKey()
  assert.ok(plans[todayKey])
  assert.ok(plans[todayKey].breakfast || plans[todayKey].snacks.length > 0)
  assert.equal(store.get('weekplate_today'), undefined)

  const migrations1 = JSON.parse(store.get('weekplate_migrations'))
  assert.equal(migrations1.meals_tags_v1, true)
  assert.equal(migrations1.today_to_plans_v1, true)

  // Idempotent: re-run reads
  const mealsAgain = storage.getMeals()
  assert.deepEqual(mealsAgain[0].tags, ['breakfast'])
  const plansAgain = storage.getAllPlans()
  assert.equal(
    storage.flattenDayPlan(plansAgain[todayKey]).length,
    storage.flattenDayPlan(plans[todayKey]).length,
  )
  const migrations2 = JSON.parse(store.get('weekplate_migrations'))
  assert.deepEqual(migrations2, migrations1)
})

console.log('\n--- SUMMARY ---')
for (const r of results) {
  console.log(`${r.area} | ${r.status}${r.error ? ` | ${r.error}` : ''}`)
}
const failed = results.filter((r) => r.status === 'FAIL')
process.exit(failed.length ? 1 : 0)
