/**
 * Storage round-trip checks for nested meals (mock localStorage).
 * Run: node scripts/check-meal-storage.mjs
 */
const store = new Map()
globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    store.set(key, String(value))
  },
  removeItem(key) {
    store.delete(key)
  },
}

const {
  addMeal,
  addProduct,
  getMeals,
  updateMeal,
  validateMeal,
} = await import('../src/services/storage.js')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const oats = addProduct({
  name: 'שיבולת שועל',
  caloriesPer100g: 100,
  proteinPer100g: 10,
  carbsPer100g: 20,
  fatPer100g: 2,
})
assert(oats.ok, 'add oats')

const milk = addProduct({
  name: 'חלב',
  caloriesPer100g: 50,
  proteinPer100g: 3,
  carbsPer100g: 5,
  fatPer100g: 2,
})
assert(milk.ok, 'add milk')

const banana = addProduct({
  name: 'בננה',
  caloriesPer100g: 90,
  proteinPer100g: 1,
  carbsPer100g: 23,
  fatPer100g: 0,
})
assert(banana.ok, 'add banana')

const base = addMeal({
  name: 'בסיס',
  tags: ['breakfast'],
  ingredients: [{ productId: oats.product.id, quantityGrams: 100 }],
})
assert(base.ok, 'add base meal')

const mid = addMeal({
  name: 'אמצע',
  tags: ['breakfast'],
  ingredients: [
    { mealId: base.meal.id, mealMultiplier: 1.5 },
    { productId: milk.product.id, quantityGrams: 100 },
  ],
})
assert(mid.ok, `add mid meal: ${JSON.stringify(mid.errors)}`)

const top = addMeal({
  name: 'עליון',
  tags: ['breakfast'],
  ingredients: [
    { mealId: mid.meal.id, mealMultiplier: 2 },
    { productId: banana.product.id, quantityGrams: 100 },
  ],
})
assert(top.ok, `add top meal: ${JSON.stringify(top.errors)}`)

// Reload from storage
const reloaded = getMeals()
const reloadedTop = reloaded.find((meal) => meal.id === top.meal.id)
assert(reloadedTop, 'top reloaded')
const nested = reloadedTop.ingredients.find(
  (item) => item.mealId === mid.meal.id,
)
assert(nested, 'meal reference preserved')
assert(nested.mealMultiplier === 2, 'multiplier preserved')

// Depth 4 blocked
const depth4 = addMeal({
  name: 'עמוק',
  tags: ['snack'],
  ingredients: [{ mealId: top.meal.id, mealMultiplier: 1 }],
})
assert(depth4.ok === false, 'depth 4 blocked on add')

// Duplicate product across levels blocked
const dup = addMeal({
  name: 'כפול',
  tags: ['lunch'],
  ingredients: [
    { productId: oats.product.id, quantityGrams: 40 },
    { mealId: base.meal.id, mealMultiplier: 1 },
  ],
})
assert(dup.ok === false, 'duplicate product blocked')
assert(
  typeof dup.errors.ingredients === 'string' &&
    dup.errors.ingredients.includes('שיבולת שועל'),
  'duplicate names the product',
)

// Cycle blocked
const cycle = updateMeal(
  base.meal.id,
  {
    name: 'בסיס',
    tags: ['breakfast'],
    ingredients: [{ mealId: top.meal.id, mealMultiplier: 1 }],
  },
)
assert(cycle.ok === false, 'cycle via edit blocked')

// Edit nested meal that would duplicate in parent
const breakParent = updateMeal(
  mid.meal.id,
  {
    name: 'אמצע',
    tags: ['breakfast'],
    ingredients: [
      { mealId: base.meal.id, mealMultiplier: 1.5 },
      { productId: milk.product.id, quantityGrams: 100 },
      { productId: banana.product.id, quantityGrams: 50 },
    ],
  },
)
assert(breakParent.ok === false, 'edit breaking parent duplicate blocked')

// Valid multiplier-only edit still works
const okEdit = updateMeal(
  mid.meal.id,
  {
    name: 'אמצע',
    tags: ['breakfast'],
    ingredients: [
      { mealId: base.meal.id, mealMultiplier: 2 },
      { productId: milk.product.id, quantityGrams: 100 },
    ],
  },
)
assert(okEdit.ok, `valid nested edit: ${JSON.stringify(okEdit.errors)}`)
assert(okEdit.meal.ingredients[0].mealMultiplier === 2, 'multiplier updated')

const after = getMeals().find((meal) => meal.id === mid.meal.id)
assert(after.ingredients[0].mealMultiplier === 2, 'multiplier persists after getMeals')

// validateMeal rejects self-reference
const selfDirect = validateMeal(
  {
    name: 'בסיס',
    tags: ['breakfast'],
    ingredients: [{ mealId: base.meal.id, mealMultiplier: 1 }],
  },
  undefined,
  getMeals().filter((meal) => meal.id !== base.meal.id),
  { selfId: base.meal.id },
)
assert(selfDirect.ok === false, 'direct self meal ref blocked')

console.log('All meal-storage checks passed.')
