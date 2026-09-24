/**
 * Node checks for nested meal components (no localStorage).
 * Run: node scripts/check-meal-nesting.mjs
 */
import {
  MAX_MEAL_DEPTH,
  findDuplicateProductInTree,
  getMealDepth,
  mealTreeHasCycle,
  validateAllMealTrees,
  validateMealTree,
  buildMealsById,
} from '../src/utils/mealTree.js'
import { calculateMealNutrition } from '../src/utils/nutrition.js'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const products = [
  {
    id: 'p-oats',
    name: 'שיבולת שועל',
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 20,
    fatPer100g: 2,
  },
  {
    id: 'p-milk',
    name: 'חלב',
    caloriesPer100g: 50,
    proteinPer100g: 3,
    carbsPer100g: 5,
    fatPer100g: 2,
  },
  {
    id: 'p-banana',
    name: 'בננה',
    caloriesPer100g: 90,
    proteinPer100g: 1,
    carbsPer100g: 23,
    fatPer100g: 0,
  },
]

const base = {
  id: 'm-base',
  name: 'בסיס',
  tags: ['breakfast'],
  ingredients: [{ productId: 'p-oats', quantityGrams: 100 }],
}

const mid = {
  id: 'm-mid',
  name: 'אמצע',
  tags: ['breakfast'],
  ingredients: [
    { mealId: 'm-base', mealMultiplier: 1 },
    { productId: 'p-milk', quantityGrams: 100 },
  ],
}

const top = {
  id: 'm-top',
  name: 'עליון',
  tags: ['breakfast'],
  ingredients: [
    { mealId: 'm-mid', mealMultiplier: 2 },
    { productId: 'p-banana', quantityGrams: 100 },
  ],
}

const mealsById = buildMealsById([base, mid, top])

assert(getMealDepth(base, mealsById) === 1, 'base depth 1')
assert(getMealDepth(mid, mealsById) === 2, 'mid depth 2')
assert(getMealDepth(top, mealsById) === 3, 'top depth 3')
assert(MAX_MEAL_DEPTH === 3, 'max depth constant')

const tooDeep = {
  id: 'm-deep',
  name: 'עמוק מדי',
  tags: ['snack'],
  ingredients: [{ mealId: 'm-top', mealMultiplier: 1 }],
}
assert(
  validateMealTree(tooDeep, buildMealsById([base, mid, top, tooDeep])).ok ===
    false,
  'depth 4 blocked',
)

const dupAcross = {
  id: 'm-dup',
  name: 'כפול',
  tags: ['lunch'],
  ingredients: [
    { productId: 'p-oats', quantityGrams: 50 },
    { mealId: 'm-base', mealMultiplier: 1 },
  ],
}
const dupResult = validateMealTree(
  dupAcross,
  buildMealsById([base, dupAcross]),
  buildMealsById(products),
)
assert(dupResult.ok === false, 'duplicate across levels blocked')
assert(dupResult.productId === 'p-oats', 'duplicate names oats')
assert(
  findDuplicateProductInTree(dupAcross, buildMealsById([base, dupAcross])) ===
    'p-oats',
  'findDuplicateProductInTree',
)

const cycleA = {
  id: 'm-a',
  name: 'A',
  tags: ['dinner'],
  ingredients: [{ mealId: 'm-b', mealMultiplier: 1 }],
}
const cycleB = {
  id: 'm-b',
  name: 'B',
  tags: ['dinner'],
  ingredients: [{ mealId: 'm-a', mealMultiplier: 1 }],
}
assert(
  mealTreeHasCycle(cycleA, buildMealsById([cycleA, cycleB])) === true,
  'indirect cycle detected',
)

const selfCycle = {
  id: 'm-self',
  name: 'Self',
  tags: ['snack'],
  ingredients: [{ mealId: 'm-self', mealMultiplier: 1 }],
}
assert(
  mealTreeHasCycle(selfCycle, buildMealsById([selfCycle])) === true,
  'direct cycle detected',
)

// Multiplier: base 100 kcal; mid = 100 + 50 = 150; top = 150*2 + 90 = 390
const nutrition = calculateMealNutrition(top, products, [base, mid, top])
assert(nutrition.calories === 390, `multiplier nutrition got ${nutrition.calories}`)
assert(nutrition.protein === 10 * 2 + 3 * 2 + 1, 'protein with multiplier')

// Editing nested meal that would break parent
const baseWithBanana = {
  ...base,
  ingredients: [
    { productId: 'p-oats', quantityGrams: 100 },
    { productId: 'p-banana', quantityGrams: 50 },
  ],
}
const parentBreak = validateAllMealTrees([baseWithBanana, mid, top], products)
assert(parentBreak.ok === false, 'edit that duplicates in parent is blocked')

// Valid catalog still ok
assert(validateAllMealTrees([base, mid, top], products).ok === true, 'valid catalog')

// Existing flat meal still works
const flat = {
  id: 'm-flat',
  name: 'שטוח',
  tags: ['lunch'],
  ingredients: [
    { productId: 'p-oats', quantityGrams: 50 },
    { productId: 'p-milk', quantityGrams: 100 },
  ],
}
assert(validateMealTree(flat, buildMealsById([flat])).ok === true, 'flat meal ok')
assert(
  calculateMealNutrition(flat, products, [flat]).calories === 100,
  'flat nutrition',
)

console.log('All meal-nesting checks passed.')
