import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CALORIE_STATUS_NORMAL,
  CALORIE_STATUS_OVER,
  CALORIE_STATUS_WITHIN_TOLERANCE,
  getCalorieStatus,
} from './nutrition.js'
import { recommendBalanceDaySwaps } from '../services/smartMealSwap.js'

describe('getCalorieStatus', () => {
  it('treats tolerance 0 as a hard daily target', () => {
    const atTarget = getCalorieStatus(1500, 1500, 0)
    assert.equal(atTarget.status, CALORIE_STATUS_NORMAL)
    assert.equal(atTarget.effectiveCalorieLimit, 1500)
    assert.equal(atTarget.actualExcess, 0)
    assert.equal(atTarget.showWarning, false)
    assert.equal(atTarget.showSmartBalance, false)

    const oneOver = getCalorieStatus(1501, 1500, 0)
    assert.equal(oneOver.status, CALORIE_STATUS_OVER)
    assert.equal(oneOver.actualExcess, 1)
    assert.equal(oneOver.showWarning, true)
    assert.equal(oneOver.showSmartBalance, true)
  })

  it('uses tolerance 100 for the effective limit', () => {
    const status = getCalorieStatus(1680, 1500, 100)
    assert.equal(status.effectiveCalorieLimit, 1600)
    assert.equal(status.actualExcess, 80)
    assert.equal(status.overTargetBy, 180)
    assert.equal(status.status, CALORIE_STATUS_OVER)
  })

  it('marks exactly at target as normal', () => {
    const status = getCalorieStatus(1500, 1500, 100)
    assert.equal(status.status, CALORIE_STATUS_NORMAL)
    assert.equal(status.isWithinTarget, true)
    assert.equal(status.showWarning, false)
    assert.equal(status.showSmartBalance, false)
    assert.equal(status.actualExcess, 0)
  })

  it('marks values inside tolerance without warning or Smart Balance', () => {
    const status = getCalorieStatus(1570, 1500, 100)
    assert.equal(status.status, CALORIE_STATUS_WITHIN_TOLERANCE)
    assert.equal(status.isWithinTolerance, true)
    assert.equal(status.showWarning, false)
    assert.equal(status.showSmartBalance, false)
    assert.equal(status.overTargetBy, 70)
    assert.equal(status.actualExcess, 0)
    assert.equal(status.effectiveCalorieLimit, 1600)
  })

  it('marks exactly at the effective limit as within tolerance', () => {
    const status = getCalorieStatus(1600, 1500, 100)
    assert.equal(status.status, CALORIE_STATUS_WITHIN_TOLERANCE)
    assert.equal(status.showWarning, false)
    assert.equal(status.showSmartBalance, false)
    assert.equal(status.actualExcess, 0)
  })

  it('marks 1 kcal above the effective limit as over', () => {
    const status = getCalorieStatus(1601, 1500, 100)
    assert.equal(status.status, CALORIE_STATUS_OVER)
    assert.equal(status.actualExcess, 1)
    assert.equal(status.showWarning, true)
    assert.equal(status.showSmartBalance, true)
  })

  it('updates planner state immediately when tolerance changes', () => {
    const current = 1570
    const target = 1500

    const with100 = getCalorieStatus(current, target, 100)
    assert.equal(with100.status, CALORIE_STATUS_WITHIN_TOLERANCE)
    assert.equal(with100.showSmartBalance, false)

    const with0 = getCalorieStatus(current, target, 0)
    assert.equal(with0.status, CALORIE_STATUS_OVER)
    assert.equal(with0.actualExcess, 70)
    assert.equal(with0.showSmartBalance, true)

    const with200 = getCalorieStatus(current, target, 200)
    assert.equal(with200.status, CALORIE_STATUS_WITHIN_TOLERANCE)
    assert.equal(with200.effectiveCalorieLimit, 1700)
  })
})

describe('recommendBalanceDaySwaps with calorie overage tolerance', () => {
  const products = [
    {
      id: 'p1',
      name: 'p1',
      caloriesPer100g: 100,
      proteinPer100g: 10,
      carbsPer100g: 10,
      fatPer100g: 5,
    },
  ]

  const meals = [
    {
      id: 'lunch',
      name: 'Lunch',
      tags: ['lunch'],
      ingredients: [{ productId: 'p1', quantityGrams: 400 }],
    },
  ]

  const plannerLunch = {
    id: 'planner-lunch',
    type: 'meal',
    mealId: 'lunch',
    name: 'Lunch',
    tags: ['lunch'],
    quantity: 2,
    ingredients: [{ productId: 'p1', quantityGrams: 800 }],
  }

  it('uses actual excess vs effective limit, not raw target', () => {
    // target 1500 + overage 100 = 1600; current 1680 → excess 80
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1680, protein: 110, carbs: 150, fat: 50 },
      dailyTargets: {
        calories: 1500,
        protein: 110,
        carbs: 150,
        fat: 50,
        allowedCalorieOverage: 100,
      },
      products,
      meals,
    })

    assert.equal(result.calorieExcess, 80)
    assert.equal(result.effectiveCalorieLimit, 1600)
  })

  it('does not suggest balance when inside tolerance', () => {
    const result = recommendBalanceDaySwaps({
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1570, protein: 110, carbs: 150, fat: 50 },
      dailyTargets: {
        calories: 1500,
        protein: 110,
        carbs: 150,
        fat: 50,
        allowedCalorieOverage: 100,
      },
      products,
      meals,
    })

    assert.equal(result.calorieExcess, 0)
    assert.equal(result.recommendations.length, 0)
  })

  it('recalculates excess immediately when tolerance changes', () => {
    const base = {
      replaceableMeals: [
        { item: plannerLunch, slotId: 'lunch', slotLabel: 'ארוחת צהריים' },
      ],
      allAvailableMeals: meals,
      currentDayNutrition: { calories: 1570, protein: 110, carbs: 150, fat: 50 },
      products,
      meals,
    }

    const tolerant = recommendBalanceDaySwaps({
      ...base,
      dailyTargets: {
        calories: 1500,
        protein: 110,
        carbs: 150,
        fat: 50,
        allowedCalorieOverage: 100,
      },
    })
    assert.equal(tolerant.calorieExcess, 0)

    const strict = recommendBalanceDaySwaps({
      ...base,
      dailyTargets: {
        calories: 1500,
        protein: 110,
        carbs: 150,
        fat: 50,
        allowedCalorieOverage: 0,
      },
    })
    assert.equal(strict.calorieExcess, 70)
  })
})
