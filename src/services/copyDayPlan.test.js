import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

function createMemoryStorage() {
  const store = new Map()
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

// storage.js seeds starter products at import time.
globalThis.localStorage = createMemoryStorage()

const {
  buildCopiedDayPlan,
  COPY_DAY_MODES,
  copyDayPlan,
  getDayPlan,
  saveDayPlan,
  updatePlannerItemQuantity,
  updatePlannerMealMultiplier,
} = await import('./storage.js')


function mealItem({
  id,
  name,
  tags = ['lunch'],
  mealMultiplier = 1,
  baseQuantity = 100,
  effectiveQuantity = null,
}) {
  const base = {
    productId: 'prod-a',
    productName: 'מוצר א',
    quantityGrams: baseQuantity,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 5,
  }
  const effective = {
    ...base,
    quantityGrams:
      effectiveQuantity == null ? baseQuantity * mealMultiplier : effectiveQuantity,
  }
  return {
    id,
    type: 'meal',
    name,
    tags,
    sourceMealId: 'library-meal',
    mealMultiplier,
    baseIngredients: [base],
    ingredients: [effective],
  }
}

function productItem({ id, name, quantityGrams = 50 }) {
  return {
    id,
    type: 'product',
    name,
    ingredients: [
      {
        productId: 'prod-b',
        productName: name,
        quantityGrams,
        caloriesPer100g: 50,
        proteinPer100g: 2,
        carbsPer100g: 8,
        fatPer100g: 1,
      },
    ],
  }
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage()
  // Skip starter/migration side effects that need empty flags.
  localStorage.setItem('weekplate_migrations', JSON.stringify({
    meals_tags_v1: true,
    today_to_plans_v1: true,
  }))
  localStorage.setItem('weekplate_products', JSON.stringify([]))
  localStorage.setItem('weekplate_meals', JSON.stringify([]))
  localStorage.setItem('weekplate_plans', JSON.stringify({}))
})

describe('buildCopiedDayPlan', () => {
  it('replace copies all slots and preserves quantity', () => {
    const source = {
      breakfast: [mealItem({ id: 'b1', name: 'בוקר', tags: ['breakfast'], mealMultiplier: 2 })],
      lunch: [mealItem({ id: 'l1', name: 'צהריים', mealMultiplier: 1.5 })],
      dinner: [],
      snacks: [productItem({ id: 's1', name: 'תפוח', quantityGrams: 120 })],
    }
    const next = buildCopiedDayPlan(source, { breakfast: [], lunch: [], dinner: [], snacks: [] }, {
      mode: COPY_DAY_MODES.REPLACE,
    })

    assert.equal(next.breakfast.length, 1)
    assert.equal(next.lunch.length, 1)
    assert.equal(next.snacks.length, 1)
    assert.equal(next.breakfast[0].mealMultiplier, 2)
    assert.equal(next.lunch[0].mealMultiplier, 1.5)
    assert.equal(next.snacks[0].ingredients[0].quantityGrams, 120)
    assert.notEqual(next.breakfast[0].id, 'b1')
  })

  it('merge appends source items without dropping existing ones', () => {
    const source = {
      breakfast: [],
      lunch: [mealItem({ id: 'src', name: 'מקור', mealMultiplier: 2 })],
      dinner: [],
      snacks: [],
    }
    const existing = {
      breakfast: [],
      lunch: [mealItem({ id: 'keep', name: 'קיים', mealMultiplier: 1 })],
      dinner: [],
      snacks: [productItem({ id: 'snack-keep', name: 'נשנוש' })],
    }
    const next = buildCopiedDayPlan(source, existing, { mode: COPY_DAY_MODES.MERGE })

    assert.equal(next.lunch.length, 2)
    assert.equal(next.lunch[0].id, 'keep')
    assert.equal(next.lunch[1].name, 'מקור')
    assert.equal(next.lunch[1].mealMultiplier, 2)
    assert.notEqual(next.lunch[1].id, 'src')
    assert.equal(next.snacks.length, 1)
    assert.equal(next.snacks[0].id, 'snack-keep')
  })

  it('selective copies only chosen slots (desserts filtered separately)', () => {
    const source = {
      breakfast: [mealItem({ id: 'b', name: 'בוקר', tags: ['breakfast'] })],
      lunch: [mealItem({ id: 'l', name: 'צהריים' })],
      dinner: [mealItem({ id: 'd', name: 'ערב', tags: ['dinner'] })],
      snacks: [
        productItem({ id: 's', name: 'נשנוש' }),
        mealItem({ id: 'des', name: 'קינוח', tags: ['dessert'], mealMultiplier: 1 }),
      ],
    }
    const existing = {
      breakfast: [mealItem({ id: 'old-b', name: 'בוקר ישן', tags: ['breakfast'] })],
      lunch: [mealItem({ id: 'old-l', name: 'צהריים ישן' })],
      dinner: [mealItem({ id: 'old-d', name: 'ערב ישן', tags: ['dinner'] })],
      snacks: [
        productItem({ id: 'old-s', name: 'נשנוש ישן' }),
        mealItem({ id: 'old-des', name: 'קינוח ישן', tags: ['dessert'] }),
      ],
    }

    const next = buildCopiedDayPlan(source, existing, {
      mode: COPY_DAY_MODES.SELECTIVE,
      slots: ['lunch', 'desserts'],
    })

    assert.equal(next.breakfast[0].id, 'old-b')
    assert.equal(next.dinner[0].id, 'old-d')
    assert.equal(next.lunch.length, 1)
    assert.equal(next.lunch[0].name, 'צהריים')
    assert.notEqual(next.lunch[0].id, 'l')
    assert.equal(next.snacks.length, 2)
    assert.equal(next.snacks[0].id, 'old-s')
    assert.equal(next.snacks[1].name, 'קינוח')
    assert.notEqual(next.snacks[1].id, 'des')
  })

  it('deep-copies so mutating the result never changes the source', () => {
    const source = {
      breakfast: [],
      lunch: [mealItem({ id: 'l1', name: 'ארוחה', mealMultiplier: 2, baseQuantity: 80 })],
      dinner: [],
      snacks: [],
    }
    const next = buildCopiedDayPlan(source, {}, { mode: COPY_DAY_MODES.REPLACE })

    next.lunch[0].mealMultiplier = 9
    next.lunch[0].ingredients[0].quantityGrams = 999
    next.lunch[0].baseIngredients[0].quantityGrams = 1

    assert.equal(source.lunch[0].mealMultiplier, 2)
    assert.equal(source.lunch[0].ingredients[0].quantityGrams, 160)
    assert.equal(source.lunch[0].baseIngredients[0].quantityGrams, 80)
    assert.notEqual(next.lunch[0].ingredients[0], source.lunch[0].ingredients[0])
    assert.notEqual(next.lunch[0].baseIngredients[0], source.lunch[0].baseIngredients[0])
  })
})

describe('copyDayPlan persistence', () => {
  it('copies to an empty day', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'l1', name: 'צהריים', mealMultiplier: 2 })],
      dinner: [],
      snacks: [],
    })

    const result = copyDayPlan('2026-03-01', '2026-03-02', {
      mode: COPY_DAY_MODES.REPLACE,
    })

    assert.equal(result.ok, true)
    const dest = getDayPlan('2026-03-02')
    assert.equal(dest.lunch.length, 1)
    assert.equal(dest.lunch[0].mealMultiplier, 2)
    assert.notEqual(dest.lunch[0].id, 'l1')
  })

  it('replace overwrites an existing day when confirmed', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'src', name: 'מקור', mealMultiplier: 3 })],
      dinner: [],
      snacks: [],
    })
    saveDayPlan('2026-03-02', {
      breakfast: [mealItem({ id: 'old', name: 'ישן', tags: ['breakfast'] })],
      lunch: [],
      dinner: [],
      snacks: [productItem({ id: 'old-s', name: 'נשנוש' })],
    })

    const blocked = copyDayPlan('2026-03-01', '2026-03-02', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.needsReplace, true)

    const result = copyDayPlan('2026-03-01', '2026-03-02', {
      mode: COPY_DAY_MODES.REPLACE,
      replaceExplicitly: true,
    })
    assert.equal(result.ok, true)

    const dest = getDayPlan('2026-03-02')
    assert.equal(dest.breakfast.length, 0)
    assert.equal(dest.snacks.length, 0)
    assert.equal(dest.lunch.length, 1)
    assert.equal(dest.lunch[0].name, 'מקור')
    assert.equal(dest.lunch[0].mealMultiplier, 3)
  })

  it('merge into an existing day', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'src', name: 'מקור', mealMultiplier: 2 })],
      dinner: [],
      snacks: [],
    })
    saveDayPlan('2026-03-02', {
      breakfast: [],
      lunch: [mealItem({ id: 'keep', name: 'קיים', mealMultiplier: 1 })],
      dinner: [],
      snacks: [],
    })

    const result = copyDayPlan('2026-03-01', '2026-03-02', {
      mode: COPY_DAY_MODES.MERGE,
    })
    assert.equal(result.ok, true)

    const dest = getDayPlan('2026-03-02')
    assert.equal(dest.lunch.length, 2)
    assert.equal(dest.lunch[0].id, 'keep')
    assert.equal(dest.lunch[1].name, 'מקור')
    assert.equal(dest.lunch[1].mealMultiplier, 2)
  })

  it('selective copy only replaces chosen slots', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [mealItem({ id: 'b', name: 'בוקר חדש', tags: ['breakfast'] })],
      lunch: [mealItem({ id: 'l', name: 'צהריים חדש' })],
      dinner: [],
      snacks: [productItem({ id: 's', name: 'נשנוש חדש' })],
    })
    saveDayPlan('2026-03-02', {
      breakfast: [mealItem({ id: 'old-b', name: 'בוקר ישן', tags: ['breakfast'] })],
      lunch: [mealItem({ id: 'old-l', name: 'צהריים ישן' })],
      dinner: [mealItem({ id: 'old-d', name: 'ערב ישן', tags: ['dinner'] })],
      snacks: [productItem({ id: 'old-s', name: 'נשנוש ישן' })],
    })

    const result = copyDayPlan('2026-03-01', '2026-03-02', {
      mode: COPY_DAY_MODES.SELECTIVE,
      slots: ['breakfast', 'snack'],
    })
    assert.equal(result.ok, true)

    const dest = getDayPlan('2026-03-02')
    assert.equal(dest.breakfast[0].name, 'בוקר חדש')
    assert.equal(dest.snacks[0].name, 'נשנוש חדש')
    assert.equal(dest.lunch[0].id, 'old-l')
    assert.equal(dest.dinner[0].id, 'old-d')
  })

  it('copies to multiple dates', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'l1', name: 'צהריים', mealMultiplier: 2 })],
      dinner: [],
      snacks: [],
    })

    const result = copyDayPlan('2026-03-01', ['2026-03-03', '2026-03-04'], {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(result.ok, true)
    assert.deepEqual(result.destinationDateKeys, ['2026-03-03', '2026-03-04'])
    assert.equal(result.results.length, 2)

    for (const key of ['2026-03-03', '2026-03-04']) {
      const plan = getDayPlan(key)
      assert.equal(plan.lunch.length, 1)
      assert.equal(plan.lunch[0].mealMultiplier, 2)
      assert.notEqual(plan.lunch[0].id, 'l1')
    }

    assert.notEqual(
      getDayPlan('2026-03-03').lunch[0].id,
      getDayPlan('2026-03-04').lunch[0].id,
    )
  })

  it('preserves quantity and ingredient overrides across copy', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [
        mealItem({
          id: 'l1',
          name: 'ארוחה',
          mealMultiplier: 2,
          baseQuantity: 100,
          effectiveQuantity: 200,
        }),
      ],
      dinner: [],
      snacks: [],
    })

    // Fold an ingredient override into baseIngredients the same way the app does.
    const updated = updatePlannerItemQuantity('2026-03-01', 'l1', 0, 300)
    assert.equal(updated.ok, true)
    assert.equal(updated.item.ingredients[0].quantityGrams, 300)
    assert.equal(updated.item.baseIngredients[0].quantityGrams, 150)
    assert.equal(updated.item.mealMultiplier, 2)

    const result = copyDayPlan('2026-03-01', '2026-03-05', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(result.ok, true)

    const dest = getDayPlan('2026-03-05')
    assert.equal(dest.lunch[0].mealMultiplier, 2)
    assert.equal(dest.lunch[0].ingredients[0].quantityGrams, 300)
    assert.equal(dest.lunch[0].baseIngredients[0].quantityGrams, 150)

    const scaled = updatePlannerMealMultiplier(
      '2026-03-05',
      dest.lunch[0].id,
      1,
    )
    assert.equal(scaled.ok, true)
    assert.equal(scaled.item.ingredients[0].quantityGrams, 150)

    // Source day stays unchanged.
    const source = getDayPlan('2026-03-01')
    assert.equal(source.lunch[0].mealMultiplier, 2)
    assert.equal(source.lunch[0].ingredients[0].quantityGrams, 300)
  })

  it('keeps source and target independent after persistence', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'l1', name: 'ארוחה', mealMultiplier: 2 })],
      dinner: [],
      snacks: [],
    })

    copyDayPlan('2026-03-01', '2026-03-06', { mode: COPY_DAY_MODES.REPLACE })
    const destBefore = getDayPlan('2026-03-06')
    updatePlannerMealMultiplier('2026-03-06', destBefore.lunch[0].id, 4)

    const source = getDayPlan('2026-03-01')
    const dest = getDayPlan('2026-03-06')
    assert.equal(source.lunch[0].mealMultiplier, 2)
    assert.equal(dest.lunch[0].mealMultiplier, 4)
    assert.notEqual(source.lunch[0].id, dest.lunch[0].id)
  })

  it('rejects copying a day onto itself', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'l1', name: 'ארוחה' })],
      dinner: [],
      snacks: [],
    })

    const single = copyDayPlan('2026-03-01', '2026-03-01', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(single.ok, false)
    assert.match(single.errors.destination, /שונה/)

    const multi = copyDayPlan('2026-03-01', ['2026-03-02', '2026-03-01'], {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(multi.ok, false)
    assert.equal(getDayPlan('2026-03-02').lunch.length, 0)
  })

  it('rejects selective copy without slots', () => {
    saveDayPlan('2026-03-01', {
      breakfast: [],
      lunch: [mealItem({ id: 'l1', name: 'ארוחה' })],
      dinner: [],
      snacks: [],
    })

    const result = copyDayPlan('2026-03-01', '2026-03-07', {
      mode: COPY_DAY_MODES.SELECTIVE,
      slots: [],
    })
    assert.equal(result.ok, false)
    assert.ok(result.errors.slots)
  })
})
