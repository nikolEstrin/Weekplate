import assert from 'node:assert/strict'
import { beforeEach, it } from 'node:test'
import localState from '../../src/services/localState.js'
import { getMeals, getProducts, importLibrary } from '../../src/services/storage.js'
import { isUuid } from '../../src/utils/uuid.js'
import { toStableId } from '../../src/utils/importIds.js'

const UPPER = 'ABCDEF12-3456-4ABC-8DEF-1234567890AB'

beforeEach(() => {
  localState.reset()
})

it('library import turns legacy and uppercase ids into lowercase UUIDs and keeps references', () => {
  const file = {
    version: 1,
    products: [
      {
        id: 'lk2x9-abc123',
        name: 'Legacy oats',
        caloriesPer100g: 380,
        proteinPer100g: 13,
        carbsPer100g: 60,
        fatPer100g: 7,
        units: [{ id: 'unit-old-1', name: 'כוס', grams: 90 }],
      },
      {
        id: UPPER,
        name: 'Upper milk',
        caloriesPer100g: 60,
        proteinPer100g: 3,
        carbsPer100g: 5,
        fatPer100g: 3,
        units: [],
      },
    ],
    meals: [
      {
        id: 'meal-legacy-1',
        name: 'Porridge',
        tags: ['breakfast'],
        ingredients: [
          { productId: 'lk2x9-abc123', quantityGrams: 90, unitId: 'unit-old-1', unitName: 'כוס', unitGrams: 90 },
          { productId: UPPER, quantityGrams: 200 },
        ],
      },
    ],
  }

  const result = importLibrary(file, 'merge')
  assert.equal(result.ok, true, result.error)

  const oats = getProducts().find((product) => product.name === 'Legacy oats')
  const milk = getProducts().find((product) => product.name === 'Upper milk')
  const meal = getMeals().find((entry) => entry.name === 'Porridge')
  for (const id of [oats.id, oats.units[0].id, milk.id, meal.id]) {
    assert.ok(isUuid(id) && id === id.toLowerCase(), `${id} is a lowercase UUID`)
  }
  assert.equal(oats.id, toStableId('product', 'lk2x9-abc123'))
  assert.equal(milk.id, UPPER.toLowerCase())
  assert.deepEqual(
    meal.ingredients.map((ingredient) => ingredient.productId),
    [oats.id, milk.id],
  )
  assert.equal(meal.ingredients[0].unitId, oats.units[0].id)

  // Importing the same file again maps to the same ids: no duplicates.
  assert.equal(importLibrary(file, 'merge').ok, true)
  assert.equal(getProducts().filter((product) => product.name === 'Legacy oats').length, 1)
  assert.equal(getMeals().filter((entry) => entry.name === 'Porridge').length, 1)
})
