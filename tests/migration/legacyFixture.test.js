import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { openUserDatabase } from '../../src/db/database.js'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import { importLegacySnapshot } from '../../src/services/legacyMigration.js'
import localState from '../../src/services/localState.js'
import {
  getDayPlan,
  getGoals,
  getLocalDateKey,
  getMeals,
  getProducts,
  getShoppingPurchased,
  initializeStorage,
} from '../../src/services/storage.js'
import { isUuid } from '../../src/utils/uuid.js'
import starterProductsData from '../../src/data/starterProducts.json' with { type: 'json' }

const STARTERS = starterProductsData.products
const PLAN_DATE = '2026-09-20'

function legacyStarterCopy(starter, index) {
  return {
    ...starter,
    units: starter.units.map((unit, unitIndex) => ({
      id: `legacy-unit-${index}-${unitIndex}`,
      name: unit.name,
      grams: unit.grams,
    })),
  }
}

/** A realistic weekplate v0.2 localStorage dump. */
function buildLegacySnapshot() {
  const collidingName = STARTERS[3].name
  const starters = STARTERS.map(legacyStarterCopy).filter(
    (_, index) => index !== 2 && index !== 3,
  )
  starters[1] = { ...starters[1], caloriesPer100g: starters[1].caloriesPer100g + 7 }
  const firstStarterUnit = starters[0].units[0]
  const custom = {
    id: 'mf3k2a-x81kd02p',
    name: 'גרנולה ביתית',
    caloriesPer100g: 450,
    proteinPer100g: 11,
    carbsPer100g: 60,
    fatPer100g: 18,
    units: [{ id: 'unit-1700000000-abc', name: 'כף', grams: 12 }],
  }
  const collision = {
    id: 'mf3k2a-collide',
    name: collidingName,
    caloriesPer100g: 1,
    proteinPer100g: 1,
    carbsPer100g: 1,
    fatPer100g: 1,
    units: [],
  }
  const baseMeal = {
    id: 'meal-legacy-1',
    name: 'יוגורט וגרנולה',
    tag: 'Breakfast',
    ingredients: [
      { productId: custom.id, quantityGrams: 36, unitId: custom.units[0].id, unitName: 'כף', unitGrams: 12 },
      {
        productId: starters[0].id,
        quantityGrams: firstStarterUnit.grams,
        unitId: firstStarterUnit.id,
        unitName: firstStarterUnit.name,
        unitGrams: firstStarterUnit.grams,
      },
    ],
  }
  const nestedMeal = {
    id: 'meal-legacy-2',
    name: 'ארוחה כפולה',
    tags: ['dinner', 'snack'],
    ingredients: [{ mealId: baseMeal.id, mealMultiplier: 2 }],
  }
  const snapshotIngredient = {
    productId: custom.id,
    quantityGrams: 54,
    productName: custom.name,
    caloriesPer100g: 450,
    proteinPer100g: 11,
    carbsPer100g: 60,
    fatPer100g: 18,
    unitId: custom.units[0].id,
    unitName: 'כף',
    unitGrams: 12,
  }
  return {
    weekplate_products: [...starters, custom, collision],
    weekplate_meals: [baseMeal, nestedMeal],
    weekplate_goals: { calories: 1650, protein: 120, carbs: 140, fat: 55 },
    weekplate_plans: {
      [PLAN_DATE]: {
        breakfast: {
          id: 'planned-1',
          type: 'meal',
          name: baseMeal.name,
          tags: ['breakfast'],
          sourceMealId: baseMeal.id,
          mealMultiplier: 1.5,
          baseIngredients: [{ ...snapshotIngredient, quantityGrams: 36 }],
          ingredients: [snapshotIngredient],
        },
        lunch: [],
        dinner: [],
        snacks: [
          {
            id: 'planned-2',
            type: 'product',
            name: custom.name,
            ingredients: [{ ...snapshotIngredient, quantityGrams: 30 }],
          },
        ],
      },
      'not-a-date': { breakfast: [], lunch: [], dinner: [], snacks: [] },
    },
    weekplate_today: [
      {
        id: 'today-1',
        type: 'product',
        name: custom.name,
        tags: ['lunch'],
        ingredients: [{ ...snapshotIngredient, quantityGrams: 20 }],
      },
    ],
    weekplate_shopping_purchased: { [PLAN_DATE]: { [`${custom.id}::grams`]: true } },
    weekplate_deleted_starter_products: [STARTERS[2].id],
  }
}

/** What the old app showed, computed by the unchanged storage.js logic in memory. */
function legacyView(snapshot) {
  localState.reset()
  for (const [key, value] of Object.entries(snapshot)) {
    localState.setItem(key, JSON.stringify(value))
  }
  localState.setItem('weekplate_migrations', JSON.stringify({}))
  initializeStorage()
  return captureView()
}

function captureView() {
  const products = getProducts()
  const productName = new Map(products.map((product) => [product.id, product.name]))
  const meals = getMeals()
  const mealName = new Map(meals.map((meal) => [meal.id, meal.name]))
  const describePlan = (dateKey) => {
    const plan = getDayPlan(dateKey)
    return Object.fromEntries(
      Object.entries(plan).map(([slot, items]) => [
        slot,
        items.map((item) => ({
          type: item.type,
          name: item.name,
          multiplier: item.mealMultiplier,
          source: item.sourceMealId ? mealName.get(item.sourceMealId) : undefined,
          ingredients: item.ingredients.map((entry) => [
            productName.get(entry.productId) ?? entry.productName,
            entry.quantityGrams,
            entry.unitName,
          ]),
        })),
      ]),
    )
  }
  return {
    products: products.map((product) => ({
      name: product.name,
      calories: product.caloriesPer100g,
      units: product.units.map((unit) => [unit.name, unit.grams]),
    })),
    meals: meals.map((meal) => ({
      name: meal.name,
      tags: meal.tags,
      ingredients: meal.ingredients.map((entry) =>
        entry.mealId
          ? ['meal', mealName.get(entry.mealId), entry.mealMultiplier]
          : [productName.get(entry.productId), entry.quantityGrams, entry.unitName],
      ),
    })),
    plan: describePlan(PLAN_DATE),
    today: describePlan(getLocalDateKey()),
    goals: getGoals(),
    rawProducts: products,
    rawMeals: meals,
  }
}

let db = null

afterEach(async () => {
  localState.reset()
  await db?.close()
  db = null
})

async function importIntoFreshAccount(snapshot) {
  localState.reset()
  db = await openUserDatabase('legacy-user', { adapterFactory: () => createNodeSqliteAdapter() })
  await localState.hydrateFromDatabase(db)
  localState.attachDatabase(db)
  const report = await importLegacySnapshot(db, localState, snapshot, { source: 'browser' })
  initializeStorage()
  await localState.flushWrites()
  return report
}

describe('legacy localStorage migration with a realistic v0.2 dump', () => {
  it('preserves the visible catalog, meals, plans, today, goals and relationships', async () => {
    const snapshot = buildLegacySnapshot()
    const before = legacyView(structuredClone(snapshot))
    const report = await importIntoFreshAccount(snapshot)
    assert.equal(report.ok, true, report.errors.join(', '))
    assert.equal(report.invalid.plans, 1)
    const after = captureView()

    assert.deepEqual(after.products, before.products)
    assert.deepEqual(after.meals, before.meals)
    assert.deepEqual(after.plan, before.plan)
    assert.deepEqual(after.today, before.today)
    assert.deepEqual(after.goals, before.goals)

    for (const product of after.rawProducts) {
      assert.ok(isUuid(product.id), `non-uuid product id ${product.id}`)
      for (const unit of product.units) assert.ok(isUuid(unit.id), `non-uuid unit id ${unit.id}`)
    }
    const byId = new Map(after.rawProducts.map((product) => [product.id, product]))
    const mealIds = new Set(after.rawMeals.map((meal) => meal.id))
    for (const meal of after.rawMeals) {
      for (const entry of meal.ingredients) {
        if (entry.mealId) {
          assert.ok(mealIds.has(entry.mealId))
          continue
        }
        const owner = byId.get(entry.productId)
        assert.ok(owner, `dangling product ${entry.productId}`)
        if (entry.unitId) {
          assert.ok(owner.units.some((unit) => unit.id === entry.unitId), `dangling unit ${entry.unitId}`)
        }
      }
    }

    const unchangedStarterRows = await db.query(`SELECT id FROM products WHERE id = ?`, [STARTERS[0].id])
    assert.equal(unchangedStarterRows.length, 0, 'unchanged starter must not become a private copy')
    const hidden = await db.query(
      `SELECT id FROM products WHERE deleted_at IS NOT NULL ORDER BY id`,
    )
    assert.deepEqual(
      hidden.map((row) => row.id),
      [STARTERS[2].id, STARTERS[3].id].sort(),
    )
    const customId = after.rawProducts.find((product) => product.name === 'גרנולה ביתית').id
    assert.deepEqual(getShoppingPurchased([PLAN_DATE]), { [`${customId}::grams`]: true })
  })

  it('is idempotent and never mutates the legacy source', async () => {
    const snapshot = buildLegacySnapshot()
    const original = structuredClone(snapshot)
    const first = await importIntoFreshAccount(snapshot)
    assert.equal(first.ok, true)
    const counts = async () =>
      Object.fromEntries(
        await Promise.all(
          ['products', 'meals', 'day_plans', 'user_settings', 'shopping_checks', 'sync_queue'].map(
            async (table) => [table, (await db.query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n],
          ),
        ),
      )
    const afterFirst = await counts()
    const second = await importLegacySnapshot(db, localState, snapshot, { source: 'browser' })
    assert.equal(second.ok, true)
    assert.equal(second.alreadyImported, true)
    const third = await importLegacySnapshot(db, localState, snapshot, { source: 'backup' })
    assert.equal(third.ok, true)
    assert.equal(Object.values(third.counts).reduce((sum, value) => sum + value, 0), 0)
    assert.deepEqual(await counts(), afterFirst)
    assert.deepEqual(snapshot, original)
  })

  it('a structurally invalid snapshot imports nothing', async () => {
    const snapshot = buildLegacySnapshot()
    snapshot.weekplate_plans = 'corrupted'
    const report = await importIntoFreshAccount(snapshot)
    assert.equal(report.ok, false)
    for (const table of ['products', 'meals', 'day_plans', 'user_settings', 'sync_queue']) {
      assert.equal((await db.query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n, 0, table)
    }
    assert.deepEqual(snapshot.weekplate_meals, buildLegacySnapshot().weekplate_meals)
  })
})
