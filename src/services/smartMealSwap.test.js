import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BALANCE_ACTION_REDUCE_QUANTITY,
  BALANCE_ACTION_REPLACE_MEAL,
  canReduceMealQuantity,
  canReplaceWholeMeal,
  expandCalorieMatches,
  generateLowerMealQuantities,
  getMealTags,
  getPlannerMealQuantity,
  initialCalorieTolerance,
  mealIngredientSignature,
  recommendBalanceDaySwaps,
  recommendMealSwaps,
  scoreMealSimilarity,
  valueSimilarity,
} from './smartMealSwap.js'

function product(id, nutrition) {
  return {
    id,
    name: id,
    caloriesPer100g: nutrition.calories,
    proteinPer100g: nutrition.protein,
    carbsPer100g: nutrition.carbs,
    fatPer100g: nutrition.fat,
  }
}

const products = [
  product('chicken', { calories: 110, protein: 23, carbs: 0, fat: 2 }),
  product('rice', { calories: 130, protein: 3, carbs: 28, fat: 0.5 }),
  product('tofu', { calories: 80, protein: 8, carbs: 2, fat: 4 }),
  product('oats', { calories: 380, protein: 13, carbs: 67, fat: 7 }),
  product('yogurt', { calories: 60, protein: 10, carbs: 4, fat: 0.5 }),
  product('bread', { calories: 260, protein: 9, carbs: 49, fat: 3 }),
  product('egg', { calories: 140, protein: 12, carbs: 1, fat: 10 }),
  product('salad', { calories: 20, protein: 1, carbs: 3, fat: 0 }),
]

function meal(id, name, tags, ingredients) {
  return { id, name, tags, ingredients }
}

const meals = [
  meal('current', 'אורז עם עוף', ['lunch'], [
    { productId: 'chicken', quantityGrams: 150 },
    { productId: 'rice', quantityGrams: 150 },
  ]),
  meal('dup', 'אורז עם עוף זהה', ['lunch'], [
    { productId: 'chicken', quantityGrams: 150 },
    { productId: 'rice', quantityGrams: 150 },
  ]),
  meal('near', 'טופו עם אורז', ['lunch'], [
    { productId: 'tofu', quantityGrams: 180 },
    { productId: 'rice', quantityGrams: 140 },
  ]),
  meal('low-cal', 'סלט עם עוף', ['lunch'], [
    { productId: 'chicken', quantityGrams: 120 },
    { productId: 'salad', quantityGrams: 200 },
  ]),
  meal('high-protein', 'יוגורט וביצה', ['breakfast'], [
    { productId: 'yogurt', quantityGrams: 200 },
    { productId: 'egg', quantityGrams: 100 },
  ]),
  meal('breakfast-oats', 'שיבולת שועל', ['breakfast'], [
    { productId: 'oats', quantityGrams: 80 },
    { productId: 'yogurt', quantityGrams: 100 },
  ]),
  meal('dinner-bread', 'לחם וביצה', ['dinner'], [
    { productId: 'bread', quantityGrams: 100 },
    { productId: 'egg', quantityGrams: 100 },
  ]),
  meal('zero', 'ארוחה ריקה', ['snack'], []),
  meal('missing-product-ref', 'מוצר חסר', ['lunch'], [
    { productId: 'does-not-exist', quantityGrams: 100 },
  ]),
]

const currentMeal = {
  id: 'planner-1',
  type: 'meal',
  name: 'אורז עם עוף',
  tags: ['lunch'],
  sourceMealId: 'current',
  ingredients: [
    {
      productId: 'chicken',
      quantityGrams: 150,
      caloriesPer100g: 110,
      proteinPer100g: 23,
      carbsPer100g: 0,
      fatPer100g: 2,
    },
    {
      productId: 'rice',
      quantityGrams: 150,
      caloriesPer100g: 130,
      proteinPer100g: 3,
      carbsPer100g: 28,
      fatPer100g: 0.5,
    },
  ],
}

describe('smartMealSwap helpers', () => {
  it('computes calorie tolerance as min(15%, 100)', () => {
    assert.equal(initialCalorieTolerance(400), 60)
    assert.equal(initialCalorieTolerance(700), 100)
  })

  it('scores category match and calorie closeness deterministically', () => {
    const original = { calories: 400, protein: 30, carbs: 40, fat: 10 }
    const close = { calories: 410, protein: 31, carbs: 39, fat: 10 }
    const far = { calories: 700, protein: 10, carbs: 80, fat: 30 }

    const closeScore = scoreMealSimilarity(original, close, true)
    const farScore = scoreMealSimilarity(original, far, false)
    assert.ok(closeScore > farScore)
    assert.equal(valueSimilarity(10, 10, 5), 1)
  })

  it('reads meal tags from tags[] or legacy tag', () => {
    assert.deepEqual(getMealTags({ tags: ['Lunch', 'snack'] }), ['lunch', 'snack'])
    assert.deepEqual(getMealTags({ tag: 'Breakfast' }), ['breakfast'])
    assert.deepEqual(getMealTags({}), [])
  })

  it('builds stable ingredient signatures', () => {
    const a = mealIngredientSignature(meals[0], meals)
    const b = mealIngredientSignature(meals[1], meals)
    const c = mealIngredientSignature(meals[2], meals)
    assert.equal(a, b)
    assert.notEqual(a, c)
  })

  it('expands calorie window until enough matches', () => {
    const candidates = [
      { nutrition: { calories: 400 } },
      { nutrition: { calories: 470 } },
      { nutrition: { calories: 490 } },
    ]
    const { matched, tolerance } = expandCalorieMatches(candidates, 400, 3)
    assert.equal(matched.length, 3)
    assert.ok(tolerance >= 60)
  })
})

describe('canReplaceWholeMeal', () => {
  it('allows saved recipe with multiple ingredients', () => {
    assert.equal(canReplaceWholeMeal(currentMeal), true)
  })

  it('does not allow direct single product with quantity 1', () => {
    const entry = {
      id: 'p1',
      type: 'product',
      name: 'דף אורז',
      ingredients: [
        {
          productId: 'rice-paper',
          quantityGrams: 10,
          unitId: 'unit',
          unitName: 'יחידה',
          unitGrams: 10,
        },
      ],
    }
    assert.equal(canReplaceWholeMeal(entry), false)
  })

  it('does not allow direct single product with quantity 12', () => {
    const entry = {
      id: 'p12',
      type: 'product',
      name: 'דף אורז',
      ingredients: [
        {
          productId: 'rice-paper',
          quantityGrams: 120,
          unitId: 'unit',
          unitName: 'יחידה',
          unitGrams: 10,
        },
      ],
    }
    assert.equal(canReplaceWholeMeal(entry), false)
  })

  it('does not allow direct product measured in grams', () => {
    const entry = {
      id: 'p-g',
      type: 'product',
      name: 'אורז',
      ingredients: [{ productId: 'rice', quantityGrams: 200 }],
    }
    assert.equal(canReplaceWholeMeal(entry), false)
  })

  it('allows multi-ingredient meal', () => {
    const entry = {
      id: 'm-multi',
      type: 'meal',
      name: 'עוף אורז ברוקולי',
      ingredients: [
        { productId: 'chicken', quantityGrams: 150 },
        { productId: 'rice', quantityGrams: 200 },
        { productId: 'salad', quantityGrams: 100 },
      ],
    }
    assert.equal(canReplaceWholeMeal(entry), true)
  })

  it('allows single-ingredient saved meal instances (not direct products)', () => {
    const entry = {
      id: 'm-single',
      type: 'meal',
      name: 'דף אורז',
      sourceMealId: 'rice-paper-meal',
      mealMultiplier: 12,
      ingredients: [
        {
          productId: 'rice-paper',
          quantityGrams: 120,
          unitId: 'unit',
          unitName: 'יחידה',
          unitGrams: 10,
        },
      ],
    }
    assert.equal(canReplaceWholeMeal(entry), true)
  })

  it('allows החלפה for quantity 1, 2, and 3', () => {
    assert.equal(canReplaceWholeMeal({ ...currentMeal, mealMultiplier: 1 }), true)
    assert.equal(canReplaceWholeMeal({ ...currentMeal, mealMultiplier: 2 }), true)
    assert.equal(canReplaceWholeMeal({ ...currentMeal, mealMultiplier: 3 }), true)
  })
})

describe('recommendMealSwaps', () => {
  it('excludes current meal, duplicates, empty and zero-calorie meals', () => {
    const { recommendations } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })

    const ids = recommendations.map((entry) => entry.id)
    assert.ok(!ids.includes('current'))
    assert.ok(!ids.includes('dup'))
    assert.ok(!ids.includes('zero'))
    assert.ok(!ids.includes('missing-product-ref'))
  })

  it('filters unavailable products for missing-products reason', () => {
    const { recommendations } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'missing-products',
      unavailableProductIds: ['chicken'],
      products,
      meals,
    })

    assert.ok(recommendations.every((entry) => entry.id !== 'low-cal'))
    assert.ok(recommendations.every((entry) => entry.id !== 'current'))
    assert.ok(recommendations.some((entry) => entry.id === 'near'))
  })

  it('prioritizes lower-calorie meals for lower-calories reason', () => {
    const { recommendations, originalNutrition } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'lower-calories',
      products,
      meals,
    })

    assert.ok(recommendations.length > 0)
    assert.ok(recommendations[0].calories < originalNutrition.calories)
    assert.ok(
      recommendations.every(
        (entry, index, list) =>
          index === 0 || list[index - 1].score >= entry.score,
      ),
    )
  })

  it('prioritizes higher protein for higher-protein reason', () => {
    const { recommendations, originalNutrition } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'higher-protein',
      products,
      meals,
    })

    assert.ok(recommendations.length > 0)
    const top = recommendations[0]
    assert.ok(top.protein > originalNutrition.protein || recommendations.every(
      (entry) => entry.protein <= originalNutrition.protein,
    ))
  })

  it('prefers same category when available', () => {
    const { recommendations } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })

    assert.ok(recommendations.length > 0)
    assert.equal(recommendations[0].categoryMatch, true)
  })

  it('returns sorted best-to-worst without randomness', () => {
    const first = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })
    const second = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })

    assert.deepEqual(
      first.recommendations.map((entry) => entry.id),
      second.recommendations.map((entry) => entry.id),
    )

    for (let i = 1; i < first.recommendations.length; i += 1) {
      assert.ok(
        first.recommendations[i - 1].score >= first.recommendations[i].score,
      )
    }
  })

  it('returns empty list when nothing matches', () => {
    const { recommendations } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: [meals[0], meals[1]],
      swapReason: 'missing-products',
      unavailableProductIds: ['chicken', 'rice', 'tofu', 'oats', 'yogurt', 'bread', 'egg', 'salad'],
      products,
      meals,
    })

    assert.equal(recommendations.length, 0)
  })

  function doubleQuantityPlannerMeal(item, id) {
    const quantity = 2
    return {
      ...item,
      id,
      mealMultiplier: quantity,
      baseIngredients: item.ingredients.map((ingredient) => ({
        ...ingredient,
      })),
      ingredients: item.ingredients.map((ingredient) => ({
        ...ingredient,
        quantityGrams: ingredient.quantityGrams * quantity,
      })),
    }
  }

  it('uses instance totals and same quantity for qty=2 recommendations', () => {
    const doubleCurrent = doubleQuantityPlannerMeal(currentMeal, 'planner-2x')
    const single = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })
    const doubled = recommendMealSwaps({
      currentMeal: doubleCurrent,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })

    assert.equal(doubled.currentQuantity, 2)
    assert.ok(
      Math.abs(doubled.originalNutrition.calories - single.originalNutrition.calories * 2) < 0.01,
    )
    assert.ok(doubled.recommendations.length > 0)
    for (const entry of doubled.recommendations) {
      assert.equal(entry.quantity, 2)
      const unit = single.recommendations.find((row) => row.id === entry.id)
      if (unit) {
        assert.ok(Math.abs(entry.calories - unit.calories * 2) < 0.01)
        assert.ok(Math.abs(entry.protein - unit.protein * 2) < 0.01)
      }
    }
  })

  it('defaults candidate quantity to 3 when current quantity is 3', () => {
    const triple = {
      ...currentMeal,
      id: 'planner-3x',
      mealMultiplier: 3,
      baseIngredients: currentMeal.ingredients.map((ingredient) => ({
        ...ingredient,
      })),
      ingredients: currentMeal.ingredients.map((ingredient) => ({
        ...ingredient,
        quantityGrams: ingredient.quantityGrams * 3,
      })),
    }
    const { recommendations, currentQuantity, originalNutrition } = recommendMealSwaps({
      currentMeal: triple,
      allAvailableMeals: meals,
      swapReason: 'missing-products',
      unavailableProductIds: ['chicken'],
      products,
      meals,
    })

    assert.equal(currentQuantity, 3)
    assert.ok(originalNutrition.calories > 0)
    assert.ok(recommendations.every((entry) => entry.quantity === 3))
    assert.ok(recommendations.every((entry) => entry.id !== 'low-cal'))
  })

  it('keeps quantity 1 behavior unchanged', () => {
    const { recommendations, currentQuantity } = recommendMealSwaps({
      currentMeal,
      allAvailableMeals: meals,
      swapReason: 'different-meal',
      products,
      meals,
    })
    assert.equal(currentQuantity, 1)
    assert.ok(recommendations.every((entry) => entry.quantity === 1))
  })
})

describe('recommendBalanceDaySwaps', () => {
  const plannerLunch = {
    ...currentMeal,
    id: 'planner-lunch',
  }

  const plannerDinner = {
    id: 'planner-dinner',
    type: 'meal',
    name: 'לחם וביצה',
    tags: ['dinner'],
    sourceMealId: 'dinner-bread',
    ingredients: [
      {
        productId: 'bread',
        quantityGrams: 100,
        caloriesPer100g: 260,
        proteinPer100g: 9,
        carbsPer100g: 49,
        fatPer100g: 3,
      },
      {
        productId: 'egg',
        quantityGrams: 100,
        caloriesPer100g: 140,
        proteinPer100g: 12,
        carbsPer100g: 1,
        fatPer100g: 10,
      },
    ],
  }

  function doubleQuantityMeal(item, id) {
    const quantity = 2
    return {
      ...item,
      id,
      mealMultiplier: quantity,
      baseIngredients: item.ingredients.map((ingredient) => ({
        ...ingredient,
        quantityGrams: ingredient.quantityGrams,
      })),
      ingredients: item.ingredients.map((ingredient) => ({
        ...ingredient,
        quantityGrams: ingredient.quantityGrams * quantity,
      })),
    }
  }

  it('returns no suggestions when already under or at target', () => {
    const under = recommendBalanceDaySwaps({
      replaceableMeals: [{ item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' }],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1400, protein: 100, carbs: 120, fat: 40 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    })
    assert.equal(under.recommendations.length, 0)
    assert.equal(under.calorieExcess, 0)

    const exact = recommendBalanceDaySwaps({
      replaceableMeals: [{ item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' }],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1500, protein: 100, carbs: 120, fat: 40 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    })
    assert.equal(exact.recommendations.length, 0)
  })

  it('suggests single-meal actions that reduce excess for small and large overages', () => {
    for (const excess of [50, 150, 400]) {
      const dayCalories = 1500 + excess
      const result = recommendBalanceDaySwaps({
        replaceableMeals: [
          { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
          { item: plannerDinner, slotId: 'dinner', slotLabel: 'ארוחת ערב' },
        ],
        allAvailableMeals: meals,
        currentDayNutrition: {
          calories: dayCalories,
          protein: 110,
          carbs: 150,
          fat: 50,
        },
        dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
        products,
        meals,
        limit: 3,
      })

      assert.equal(result.calorieExcess, excess)
      assert.ok(result.recommendations.length <= 3)
      for (const entry of result.recommendations) {
        assert.ok(entry.calorieSavings > 0)
        assert.ok(entry.dayCaloriesAfter < dayCalories)
        assert.equal(
          entry.dayCaloriesAfter,
          dayCalories - entry.currentCalories + entry.suggestedCalories,
        )
        assert.ok(
          entry.actionType === BALANCE_ACTION_REDUCE_QUANTITY ||
            entry.actionType === BALANCE_ACTION_REPLACE_MEAL,
        )
      }
    }
  })

  it('prefers savings of at least 30 kcal when available', () => {
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1650, protein: 112, carbs: 150, fat: 50 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    })

    if (result.recommendations.length > 0) {
      assert.ok(result.recommendations.every((entry) => entry.calorieSavings >= 30))
    }
  })

  it('never recommends an action that increases calorie excess', () => {
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
        { item: plannerDinner, slotId: 'dinner', slotLabel: 'ארוחת ערב' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1700, protein: 120, carbs: 160, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    })

    for (const entry of result.recommendations) {
      assert.ok(entry.calorieSavings > 0)
      assert.ok(entry.suggestedCalories < entry.currentCalories)
    }
  })

  it('keeps planner instance id so duplicate recipes stay distinct', () => {
    const lunchA = { ...plannerLunch, id: 'instance-a' }
    const lunchB = { ...plannerLunch, id: 'instance-b' }

    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: lunchA, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
        { item: lunchB, slotId: 'dinner', slotLabel: 'ארוחת ערב' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1900, protein: 140, carbs: 180, fat: 60 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
      limit: 3,
    })

    const ids = result.recommendations.map((entry) => entry.plannerItemId)
    assert.ok(ids.every((id) => id === 'instance-a' || id === 'instance-b'))
    assert.equal(new Set(ids).size, ids.length)
  })

  it('returns empty when no useful library replacements exist and quantity cannot be reduced', () => {
    const minMeal = {
      ...plannerLunch,
      id: 'planner-min-empty',
      mealMultiplier: 0.5,
      baseIngredients: plannerLunch.ingredients.map((ingredient) => ({
        ...ingredient,
      })),
      ingredients: plannerLunch.ingredients.map((ingredient) => ({
        ...ingredient,
        quantityGrams: ingredient.quantityGrams * 0.5,
      })),
    }
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: minMeal, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: [meals[0], meals[1]],
      currentDayNutrition: { calories: 1700, protein: 120, carbs: 160, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    })

    assert.equal(result.recommendations.length, 0)
  })

  it('ranks closer-to-target days ahead of larger undershoots when possible', () => {
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
        { item: plannerDinner, slotId: 'dinner', slotLabel: 'ארוחת ערב' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1650, protein: 112, carbs: 150, fat: 50 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
      limit: 3,
    })

    for (let i = 1; i < result.recommendations.length; i += 1) {
      const prev = result.recommendations[i - 1]
      const next = result.recommendations[i]
      assert.ok(prev.distanceToTarget <= next.distanceToTarget)
    }
  })

  it('generates lower quantities down to 0.5 by default, but balance uses min 1', () => {
    assert.deepEqual(generateLowerMealQuantities(2), [1.5, 1, 0.5])
    assert.deepEqual(generateLowerMealQuantities(2, { minQuantity: 1 }), [1.5, 1])
    assert.deepEqual(generateLowerMealQuantities(1), [0.5])
    assert.deepEqual(generateLowerMealQuantities(1, { minQuantity: 1 }), [])
    assert.deepEqual(generateLowerMealQuantities(0.5), [])
    // qty === 1: reduce is not offered; use meal replacement instead.
    assert.equal(canReduceMealQuantity(plannerLunch), false)
    assert.equal(canReduceMealQuantity({ ...plannerLunch, mealMultiplier: 2 }), true)
    assert.equal(canReduceMealQuantity({ ...plannerLunch, mealMultiplier: 0.5 }), false)
    assert.equal(getPlannerMealQuantity({ mealMultiplier: 2 }), 2)
  })

  it('for quantity 1 suggests meal replacement, not a sub-1 quantity', () => {
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1700, protein: 120, carbs: 160, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
      limit: 3,
    })

    assert.ok(result.recommendations.length > 0)
    for (const entry of result.recommendations) {
      assert.equal(entry.actionType, BALANCE_ACTION_REPLACE_MEAL)
      assert.ok(entry.replacementQuantity >= 1)
      assert.ok(entry.suggestedQuantity >= 1)
      assert.notEqual(entry.replacementId, '')
    }
  })

  it('prefers reducing 2 → 1.5 when that matches a small calorie excess', () => {
    const doubleLunch = doubleQuantityMeal(plannerLunch, 'planner-lunch-2x')
    // 1× lunch is 360 kcal → 2× is 720. Excess 180 → 2→1.5 saves exactly 180.
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: doubleLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1680, protein: 150, carbs: 180, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
      limit: 1,
    })

    assert.ok(result.recommendations.length >= 1)
    const top = result.recommendations[0]
    assert.equal(top.actionType, BALANCE_ACTION_REDUCE_QUANTITY)
    assert.equal(top.currentQuantity, 2)
    assert.equal(top.suggestedQuantity, 1.5)
    assert.equal(top.calorieSavings, 180)
    assert.equal(top.dayCaloriesAfter, 1500)
  })

  it('prefers replacement when a half-step reduction still overshoots worse than a swap', () => {
    const doubleLunch = doubleQuantityMeal(plannerLunch, 'planner-lunch-2x')
    // Custom meal ~300 kcal/serving (≥50 kcal below lunch so swap engine includes it).
    // At qty 2 saves 120 → day 1480 (distance 20).
    // Reduce 2→1.5 would save 180 → day 1420 (distance 80).
    const almostLunch = meal('almost-lunch', 'אורז עם עוף קל', ['lunch'], [
      { productId: 'chicken', quantityGrams: 125 },
      { productId: 'rice', quantityGrams: 125 },
    ])
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: doubleLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: [...meals, almostLunch],
      currentDayNutrition: { calories: 1600, protein: 150, carbs: 180, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals: [...meals, almostLunch],
      limit: 1,
    })

    assert.ok(result.recommendations.length >= 1)
    const top = result.recommendations[0]
    assert.equal(top.actionType, BALANCE_ACTION_REPLACE_MEAL)
    assert.equal(top.replacementQuantity, 2)
    assert.ok(top.distanceToTarget < 80)
  })

  it('evaluates replacement at the current meal quantity when useful', () => {
    const doubleLunch = doubleQuantityMeal(plannerLunch, 'planner-lunch-2x')
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: doubleLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      // Large excess so quantity reduction alone may not be enough / replace competes.
      currentDayNutrition: { calories: 2200, protein: 180, carbs: 220, fat: 70 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
      limit: 3,
    })

    const replaceActions = result.recommendations.filter(
      (entry) => entry.actionType === BALANCE_ACTION_REPLACE_MEAL,
    )
    for (const entry of replaceActions) {
      assert.ok(entry.replacementQuantity > 0)
      assert.ok(entry.replacement)
      assert.equal(entry.replacement.quantity, entry.replacementQuantity)
      assert.ok(entry.suggestedCalories > 0)
      assert.equal(entry.suggestedCalories, entry.replacement.calories)
    }
  })

  it('can surface both REDUCE_QUANTITY and REPLACE_MEAL for the same qty=2 meal', () => {
    const doubleLunch = doubleQuantityMeal(plannerLunch, 'planner-lunch-both')
    // Custom lighter lunch: 1× ≈ 300 kcal → 2× = 600; save 120 vs 2× lunch (720).
    const almostLunch = meal('almost-lunch-mix', 'אורז עם עוף קל', ['lunch'], [
      { productId: 'chicken', quantityGrams: 125 },
      { productId: 'rice', quantityGrams: 125 },
    ])
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: doubleLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: [...meals, almostLunch],
      currentDayNutrition: { calories: 1680, protein: 150, carbs: 180, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals: [...meals, almostLunch],
      limit: 3,
    })

    const types = new Set(result.recommendations.map((entry) => entry.actionType))
    assert.ok(types.has(BALANCE_ACTION_REDUCE_QUANTITY))
    assert.ok(types.has(BALANCE_ACTION_REPLACE_MEAL))

    const replace = result.recommendations.find(
      (entry) => entry.actionType === BALANCE_ACTION_REPLACE_MEAL,
    )
    assert.equal(replace.currentQuantity, 2)
    assert.equal(replace.replacementQuantity, 2)
  })

  it('PART10: REPLACE_MEAL at qty=2 outranks REDUCE that overshoots the 170 excess', () => {
    // Target 1500, overage 100 → effective 1600. Day 1770 → excess 170.
    // Meal A: 300 kcal/serving × 2 = 600. Meal B: 220 × 2 = 440. Save 160.
    // Reduce 2→1 saves 300 (farther from limit than replace).
    const productsA = [
      product('a1', { calories: 200, protein: 20, carbs: 10, fat: 5 }),
      product('a2', { calories: 100, protein: 5, carbs: 15, fat: 2 }),
      product('b1', { calories: 150, protein: 18, carbs: 8, fat: 4 }),
      product('b2', { calories: 70, protein: 4, carbs: 10, fat: 1 }),
    ]
    const mealA = meal('meal-a', 'Meal A', ['lunch'], [
      { productId: 'a1', quantityGrams: 100 },
      { productId: 'a2', quantityGrams: 100 },
    ])
    const mealB = meal('meal-b', 'Meal B', ['dinner'], [
      { productId: 'b1', quantityGrams: 100 },
      { productId: 'b2', quantityGrams: 100 },
    ])
    // Extra same-tag near meals that would fill a normal-swap category window
    // without being the best balance save — balance mode must still find Meal B.
    const nearMeals = [1, 2, 3].map((n) =>
      meal(`near-${n}`, `Near ${n}`, ['lunch'], [
        { productId: 'a1', quantityGrams: 95 - n },
        { productId: 'a2', quantityGrams: 95 - n },
      ]),
    )
    const plannerA = {
      ...mealA,
      id: 'planner-a',
      type: 'meal',
      sourceMealId: 'meal-a',
      mealMultiplier: 2,
      baseIngredients: mealA.ingredients.map((ingredient) => ({ ...ingredient })),
      ingredients: mealA.ingredients.map((ingredient) => {
        const p = productsA.find((entry) => entry.id === ingredient.productId)
        return {
          ...ingredient,
          quantityGrams: ingredient.quantityGrams * 2,
          caloriesPer100g: p.caloriesPer100g,
          proteinPer100g: p.proteinPer100g,
          carbsPer100g: p.carbsPer100g,
          fatPer100g: p.fatPer100g,
        }
      }),
    }
    const library = [mealA, mealB, ...nearMeals]
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerA, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: library,
      currentDayNutrition: { calories: 1770, protein: 100, carbs: 150, fat: 50 },
      dailyTargets: {
        calories: 1500,
        protein: 110,
        carbs: 150,
        fat: 50,
        allowedCalorieOverage: 100,
      },
      products: productsA,
      meals: library,
      limit: 3,
    })

    assert.equal(result.calorieExcess, 170)
    assert.equal(result.effectiveCalorieLimit, 1600)

    const types = result.recommendations.map((entry) => entry.actionType)
    assert.ok(types.includes(BALANCE_ACTION_REPLACE_MEAL))
    assert.ok(types.includes(BALANCE_ACTION_REDUCE_QUANTITY))

    const top = result.recommendations[0]
    assert.equal(top.actionType, BALANCE_ACTION_REPLACE_MEAL)
    assert.equal(top.replacementName, 'Meal B')
    assert.equal(top.currentQuantity, 2)
    assert.equal(top.replacementQuantity, 2)
    assert.equal(top.calorieSavings, 160)
    assert.equal(top.dayCaloriesAfter, 1610)

    const reduce = result.recommendations.find(
      (entry) => entry.actionType === BALANCE_ACTION_REDUCE_QUANTITY,
    )
    assert.ok(reduce)
    // 2→1 saves 300 and lands farther from 1600 than the 160-kcal replace.
    assert.ok(top.distanceToTarget < reduce.distanceToTarget)
  })

  it('balance mode includes cross-category lower-calorie meals normal-swap may drop', () => {
    const doubleLunch = doubleQuantityMeal(plannerLunch, 'planner-cross-cat')
    // Different tag, clearly lower calorie at qty 2.
    const lightDinner = meal('light-dinner-x', 'ארוחת ערב קלה', ['dinner'], [
      { productId: 'chicken', quantityGrams: 100 },
      { productId: 'salad', quantityGrams: 200 },
    ])
    const library = [...meals, lightDinner]
    const { recommendations: balanceRecs } = recommendMealSwaps({
      currentMeal: doubleLunch,
      allAvailableMeals: library,
      swapReason: 'lower-calories',
      mode: 'balance',
      products,
      meals: library,
    })
    assert.ok(balanceRecs.some((entry) => entry.id === 'light-dinner-x'))
    assert.ok(balanceRecs.every((entry) => entry.quantity === 2))
    assert.ok(
      balanceRecs.every(
        (entry) => entry.calories < 720, // 2× lunch ≈ 720
      ),
    )
  })

  it('does not suggest reducing quantity when already at or below 1', () => {
    const minMeal = {
      ...plannerLunch,
      id: 'planner-min',
      mealMultiplier: 0.5,
      baseIngredients: plannerLunch.ingredients.map((ingredient) => ({
        ...ingredient,
      })),
      ingredients: plannerLunch.ingredients.map((ingredient) => ({
        ...ingredient,
        quantityGrams: ingredient.quantityGrams * 0.5,
      })),
    }
    assert.equal(canReduceMealQuantity(minMeal), false)
    assert.equal(canReduceMealQuantity(plannerLunch), false)

    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: minMeal, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: [meals[0], meals[1]],
      currentDayNutrition: { calories: 1700, protein: 120, carbs: 160, fat: 55 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    })

    assert.ok(
      result.recommendations.every(
        (entry) => entry.actionType !== BALANCE_ACTION_REDUCE_QUANTITY,
      ),
    )
  })

  it('keeps at most one recommendation per planner instance and action type', () => {
    const a = doubleQuantityMeal(plannerLunch, 'instance-a')
    const b = doubleQuantityMeal(plannerLunch, 'instance-b')
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: a, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
        { item: b, slotId: 'dinner', slotLabel: 'ארוחת ערב' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 2000, protein: 180, carbs: 220, fat: 70 },
      dailyTargets: { calories: 1500, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
      limit: 3,
    })

    const keys = result.recommendations.map(
      (entry) => `${entry.plannerItemId}:${entry.actionType}`,
    )
    assert.equal(new Set(keys).size, keys.length)
  })

  it('allows החלפה eligibility regardless of mealMultiplier', () => {
    assert.equal(canReplaceWholeMeal(plannerLunch), true)
    assert.equal(
      canReplaceWholeMeal({ ...plannerLunch, mealMultiplier: 2 }),
      true,
    )
    assert.equal(
      canReplaceWholeMeal({ ...plannerLunch, mealMultiplier: 3 }),
      true,
    )
  })
})
