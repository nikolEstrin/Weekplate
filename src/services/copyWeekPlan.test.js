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

globalThis.localStorage = createMemoryStorage()

const {
  buildWeekCopyPairs,
  COPY_DAY_MODES,
  COPY_WEEK_DAY_ACTIONS,
  copyWeekPlan,
  getDayPlan,
  getWeekDayKeys,
  getWeekStartKey,
  saveDayPlan,
} = await import('./storage.js')

function mealItem({
  id,
  name,
  tags = ['lunch'],
  mealMultiplier = 1,
  baseQuantity = 100,
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
  return {
    id,
    type: 'meal',
    name,
    tags,
    sourceMealId: 'library-meal',
    mealMultiplier,
    baseIngredients: [base],
    ingredients: [{ ...base, quantityGrams: baseQuantity * mealMultiplier }],
  }
}

function dayWithLunch(id, name, mealMultiplier = 1) {
  return {
    breakfast: [],
    lunch: [mealItem({ id, name, mealMultiplier })],
    dinner: [],
    snacks: [],
  }
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage()
  localStorage.setItem(
    'weekplate_migrations',
    JSON.stringify({
      meals_tags_v1: true,
      today_to_plans_v1: true,
    }),
  )
  localStorage.setItem('weekplate_products', JSON.stringify([]))
  localStorage.setItem('weekplate_meals', JSON.stringify([]))
  localStorage.setItem('weekplate_plans', JSON.stringify({}))
})

describe('week date helpers', () => {
  it('maps Sunday-start weeks and pairs matching weekdays', () => {
    // 2026-03-01 is Sunday
    assert.equal(getWeekStartKey('2026-03-04'), '2026-03-01')
    assert.deepEqual(getWeekDayKeys('2026-03-01'), [
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
    ])

    const pairs = buildWeekCopyPairs('2026-03-01', '2026-03-08')
    assert.equal(pairs.length, 7)
    assert.deepEqual(pairs[0], {
      sourceDateKey: '2026-03-01',
      destinationDateKey: '2026-03-08',
    })
    assert.deepEqual(pairs[1], {
      sourceDateKey: '2026-03-02',
      destinationDateKey: '2026-03-09',
    })
    assert.deepEqual(pairs[6], {
      sourceDateKey: '2026-03-07',
      destinationDateKey: '2026-03-14',
    })
  })
})

describe('copyWeekPlan', () => {
  it('copies a full week onto an empty week with correct weekday mapping', () => {
    const sourceWeek = '2026-03-01'
    const destWeek = '2026-03-08'
    const sourceDays = getWeekDayKeys(sourceWeek)
    const destDays = getWeekDayKeys(destWeek)

    sourceDays.forEach((key, index) => {
      saveDayPlan(
        key,
        dayWithLunch(`s-${index}`, `ארוחה ${index}`, index === 1 ? 2 : 1),
      )
    })

    const result = copyWeekPlan(sourceWeek, destWeek, {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(result.ok, true)
    assert.equal(result.results.filter((row) => !row.skipped).length, 7)

    destDays.forEach((key, index) => {
      const plan = getDayPlan(key)
      assert.equal(plan.lunch.length, 1)
      assert.equal(plan.lunch[0].name, `ארוחה ${index}`)
      assert.equal(plan.lunch[0].mealMultiplier, index === 1 ? 2 : 1)
      assert.notEqual(plan.lunch[0].id, `s-${index}`)
    })
  })

  it('keeps empty source days from erasing destination content', () => {
    saveDayPlan('2026-03-01', dayWithLunch('sun', 'ראשון'))
    saveDayPlan('2026-03-03', dayWithLunch('tue', 'שלישי', 2))
    // other source days empty

    saveDayPlan('2026-03-08', dayWithLunch('keep-sun', 'יעד ראשון'))
    saveDayPlan('2026-03-09', dayWithLunch('keep-mon', 'יעד שני'))
    saveDayPlan('2026-03-10', dayWithLunch('keep-tue', 'יעד שלישי'))

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
      replaceExplicitly: true,
    })
    assert.equal(result.ok, true)

    // Sunday replaced from source
    assert.equal(getDayPlan('2026-03-08').lunch[0].name, 'ראשון')
    // Monday source empty → destination kept
    assert.equal(getDayPlan('2026-03-09').lunch[0].id, 'keep-mon')
    assert.equal(getDayPlan('2026-03-09').lunch[0].name, 'יעד שני')
    // Tuesday replaced
    assert.equal(getDayPlan('2026-03-10').lunch[0].name, 'שלישי')
    assert.equal(getDayPlan('2026-03-10').lunch[0].mealMultiplier, 2)
  })

  it('fullReplace allows empty source days to clear destinations', () => {
    saveDayPlan('2026-03-01', dayWithLunch('sun', 'ראשון'))
    saveDayPlan('2026-03-09', dayWithLunch('keep-mon', 'יעד שני'))

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
      fullReplace: true,
      replaceExplicitly: true,
    })
    assert.equal(result.ok, true)
    assert.equal(getDayPlan('2026-03-08').lunch[0].name, 'ראשון')
    assert.equal(getDayPlan('2026-03-09').lunch.length, 0)
  })

  it('merges into a partially populated target week', () => {
    saveDayPlan('2026-03-02', dayWithLunch('src-mon', 'מקור', 2))
    saveDayPlan('2026-03-09', dayWithLunch('dst-mon', 'קיים', 1))

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.MERGE,
    })
    assert.equal(result.ok, true)

    const monday = getDayPlan('2026-03-09')
    assert.equal(monday.lunch.length, 2)
    assert.equal(monday.lunch[0].id, 'dst-mon')
    assert.equal(monday.lunch[1].name, 'מקור')
    assert.equal(monday.lunch[1].mealMultiplier, 2)
    assert.notEqual(monday.lunch[1].id, 'src-mon')
  })

  it('replace overwrites destination days when confirmed', () => {
    saveDayPlan('2026-03-02', dayWithLunch('src', 'מקור', 3))
    saveDayPlan('2026-03-09', dayWithLunch('old', 'ישן'))

    const blocked = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(blocked.ok, false)
    assert.equal(blocked.needsReplace, true)
    assert.ok(blocked.conflictingDateKeys.includes('2026-03-09'))
    assert.equal(getDayPlan('2026-03-09').lunch[0].id, 'old')

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
      replaceExplicitly: true,
    })
    assert.equal(result.ok, true)
    assert.equal(getDayPlan('2026-03-09').lunch[0].name, 'מקור')
    assert.equal(getDayPlan('2026-03-09').lunch[0].mealMultiplier, 3)
  })

  it('supports per-day conflict resolution', () => {
    saveDayPlan('2026-03-01', dayWithLunch('src-sun', 'מקור א'))
    saveDayPlan('2026-03-02', dayWithLunch('src-mon', 'מקור ב', 2))
    saveDayPlan('2026-03-03', dayWithLunch('src-tue', 'מקור ג'))

    saveDayPlan('2026-03-08', dayWithLunch('dst-sun', 'יעד א'))
    saveDayPlan('2026-03-09', dayWithLunch('dst-mon', 'יעד ב'))
    saveDayPlan('2026-03-10', dayWithLunch('dst-tue', 'יעד ג'))

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
      dayModes: {
        '2026-03-08': COPY_WEEK_DAY_ACTIONS.REPLACE,
        '2026-03-09': COPY_WEEK_DAY_ACTIONS.MERGE,
        '2026-03-10': COPY_WEEK_DAY_ACTIONS.SKIP,
      },
    })
    assert.equal(result.ok, true)

    assert.equal(getDayPlan('2026-03-08').lunch.length, 1)
    assert.equal(getDayPlan('2026-03-08').lunch[0].name, 'מקור א')

    const monday = getDayPlan('2026-03-09')
    assert.equal(monday.lunch.length, 2)
    assert.equal(monday.lunch[0].id, 'dst-mon')
    assert.equal(monday.lunch[1].name, 'מקור ב')
    assert.equal(monday.lunch[1].mealMultiplier, 2)

    assert.equal(getDayPlan('2026-03-10').lunch[0].id, 'dst-tue')
  })

  it('preserves quantities across the week copy', () => {
    saveDayPlan(
      '2026-03-04',
      dayWithLunch('src', 'כמות', 2.5),
    )

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(result.ok, true)

    const dest = getDayPlan('2026-03-11')
    assert.equal(dest.lunch[0].mealMultiplier, 2.5)
    assert.equal(dest.lunch[0].ingredients[0].quantityGrams, 250)
    assert.equal(dest.lunch[0].baseIngredients[0].quantityGrams, 100)
  })

  it('leaves source week unchanged after copy', () => {
    saveDayPlan('2026-03-02', dayWithLunch('src', 'מקור', 2))

    copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
    })

    const source = getDayPlan('2026-03-02')
    const dest = getDayPlan('2026-03-09')
    assert.equal(source.lunch[0].id, 'src')
    assert.equal(source.lunch[0].mealMultiplier, 2)
    assert.notEqual(dest.lunch[0].id, 'src')

    dest.lunch[0].mealMultiplier = 9
    assert.equal(getDayPlan('2026-03-02').lunch[0].mealMultiplier, 2)
  })

  it('rejects copying a week onto itself', () => {
    saveDayPlan('2026-03-01', dayWithLunch('src', 'מקור'))
    const result = copyWeekPlan('2026-03-01', '2026-03-04', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(result.ok, false)
    assert.match(result.errors.destination, /שונה/)
    assert.equal(getDayPlan('2026-03-01').lunch[0].id, 'src')
  })

  it('writes the week as one stored plans snapshot', () => {
    saveDayPlan('2026-03-01', dayWithLunch('a', 'א'))
    saveDayPlan('2026-03-02', dayWithLunch('b', 'ב'))

    let writes = 0
    const originalSetItem = localStorage.setItem.bind(localStorage)
    localStorage.setItem = (key, value) => {
      if (key === 'weekplate_plans') {
        writes += 1
      }
      return originalSetItem(key, value)
    }

    const result = copyWeekPlan('2026-03-01', '2026-03-08', {
      mode: COPY_DAY_MODES.REPLACE,
    })
    assert.equal(result.ok, true)
    assert.equal(writes, 1)
    assert.equal(getDayPlan('2026-03-08').lunch[0].name, 'א')
    assert.equal(getDayPlan('2026-03-09').lunch[0].name, 'ב')
  })
})
