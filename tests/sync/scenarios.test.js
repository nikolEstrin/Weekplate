import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import { openUserDatabase } from '../../src/db/database.js'
import { startDataSession, stopDataSession } from '../../src/services/dataSession.js'
import localState from '../../src/services/localState.js'
import {
  addMeal,
  addProduct,
  addProductToDayPlan,
  deleteMeal,
  deleteProduct,
  getDayPlan,
  getGoals,
  getMeals,
  getProducts,
  saveGoals,
  setShoppingItemPurchased,
  getShoppingPurchased,
  updateProduct,
} from '../../src/services/storage.js'
import { createSyncEngine } from '../../src/sync/syncEngine.js'
import { createFakeRemote } from './fakeRemote.js'
import starterProductsData from '../../src/data/starterProducts.json' with { type: 'json' }

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const STARTERS = starterProductsData.products
const DATE = '2026-10-01'

let directory
let server
let net

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function open(userId, device, remote = server.forUser(userId)) {
  return startDataSession({
    userId,
    remote,
    platform: { getIsOnline: () => net.online },
    adapterFactory: (name) =>
      createNodeSqliteAdapter(path.join(directory, `${device}-${name}.sqlite`)),
  })
}

function product(name, calories = 100) {
  const result = addProduct({
    name,
    caloriesPer100g: calories,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 1,
    units: [],
  })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.product
}

function serverRow(table, id, userId = USER_A) {
  return server
    .rows(table, userId)
    .find((row) => (row.id ?? row.date_key ?? row.selection_key) === id)
}

async function queueSize(session) {
  return session.getStatus().pendingCount
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'weekplate-scenarios-'))
  server = createFakeRemote()
  net = { online: true }
})

afterEach(async () => {
  await stopDataSession()
  await rm(directory, { recursive: true, force: true })
})

describe('sync scenarios through the storage.js API', () => {
  it('new user: global catalog visible, no private rows created', async () => {
    const session = await open(USER_A, 'phone1')
    assert.equal(getProducts().length, STARTERS.length)
    assert.equal(getMeals().length, 0)
    await session.flush()
    assert.equal(server.rows('products', USER_A).length, 0)
    await session.stop()
  })

  it('online create of product, meal, plan, goals and shopping check reaches the server', async () => {
    const session = await open(USER_A, 'phone1')
    const eggs = product('Eggs', 155)
    const meal = addMeal(
      {
        name: 'Omelette',
        tags: ['breakfast'],
        ingredients: [
          { productId: eggs.id, quantityGrams: 120 },
          { productId: STARTERS[0].id, quantityGrams: 50 },
        ],
      },
      getProducts(),
      getMeals(),
    )
    assert.equal(meal.ok, true)
    assert.equal(addProductToDayPlan(DATE, eggs, 60, 'breakfast').ok, true)
    assert.equal(saveGoals({ calories: 1800, protein: 120, carbs: 160, fat: 55, allowedCalorieOverage: 150 }).ok, true)
    setShoppingItemPurchased([DATE], `${eggs.id}::grams`, true)
    await session.flush()

    assert.equal(serverRow('products', eggs.id).name, 'Eggs')
    assert.equal(serverRow('meals', meal.meal.id).ingredients.length, 2)
    assert.equal(serverRow('day_plans', DATE).slots.breakfast.length, 1)
    assert.equal(server.rows('user_settings', USER_A)[0].calories, 1800)
    assert.equal(server.rows('shopping_checks', USER_A).length, 1)
    assert.equal(await queueSize(session), 0)
    await session.stop()
  })

  it('offline create, edit and delete are kept locally and uploaded on reconnect', async () => {
    const session = await open(USER_A, 'phone1')
    const keep = product('Keep')
    const gone = product('Gone')
    await session.flush()
    net.online = false

    const created = product('Offline new')
    assert.equal(updateProduct(keep.id, { ...keep, name: 'Keep edited' }).ok, true)
    assert.equal(deleteProduct(gone.id), true)
    await session.flush()
    assert.equal(serverRow('products', created.id), undefined)
    assert.equal(serverRow('products', keep.id).name, 'Keep')
    assert.ok(getProducts().some((entry) => entry.id === created.id))
    assert.ok((await queueSize(session)) >= 3)

    net.online = true
    await session.requestSync('network')
    assert.equal(serverRow('products', created.id).name, 'Offline new')
    assert.equal(serverRow('products', keep.id).name, 'Keep edited')
    assert.ok(serverRow('products', gone.id).deleted_at)
    assert.equal(await queueSize(session), 0)
    await session.stop()
  })

  it('app closed before sync: queue survives restart and uploads later', async () => {
    net.online = false
    let session = await open(USER_A, 'phone1')
    const saved = product('Saved while offline')
    await session.stop()
    assert.equal(serverRow('products', saved.id), undefined)

    net.online = true
    session = await open(USER_A, 'phone1')
    assert.ok(getProducts().some((entry) => entry.id === saved.id))
    await session.flush()
    assert.equal(serverRow('products', saved.id).name, 'Saved while offline')
    await session.stop()
  })

  it('second device receives everything, including global overrides and hidden globals', async () => {
    let session = await open(USER_A, 'phone1')
    const mine = product('Mine')
    const overridden = STARTERS[0]
    const hidden = STARTERS[1]
    assert.equal(updateProduct(overridden.id, { ...overridden, name: 'Override name' }).ok, true)
    assert.equal(deleteProduct(hidden.id), true)
    const meal = addMeal(
      { name: 'Bowl', tags: ['lunch', 'dinner'], ingredients: [{ productId: mine.id, quantityGrams: 80 }] },
      getProducts(),
      getMeals(),
    )
    addProductToDayPlan(DATE, mine, 75, 'lunch')
    saveGoals({ calories: 2100, protein: 130, carbs: 200, fat: 70, allowedCalorieOverage: 50 })
    setShoppingItemPurchased([DATE], `${mine.id}::grams`, true)
    await session.flush()
    const expected = {
      products: getProducts(),
      meals: getMeals(),
      plan: getDayPlan(DATE),
      goals: getGoals(),
      shopping: getShoppingPurchased([DATE]),
    }
    await session.stop()
    assert.equal(getProducts().length, 0, 'memory cleared after stop')

    session = await open(USER_A, 'phone2')
    assert.deepEqual(getProducts(), expected.products)
    assert.deepEqual(getMeals(), expected.meals)
    assert.deepEqual(getDayPlan(DATE), expected.plan)
    assert.deepEqual(getGoals(), expected.goals)
    assert.deepEqual(getShoppingPurchased([DATE]), expected.shopping)
    assert.ok(getMeals().some((entry) => entry.id === meal.meal.id))
    assert.ok(!getProducts().some((entry) => entry.id === hidden.id))
    assert.equal(getProducts().find((entry) => entry.id === overridden.id).name, 'Override name')
    await session.stop()
  })

  it('server newer than local: stale offline edit loses; local newer: wins', async () => {
    let session = await open(USER_A, 'phone1')
    const item = product('Original')
    await session.flush()
    await session.stop()

    net.online = false
    session = await open(USER_A, 'phone1')
    updateProduct(item.id, { ...item, name: 'Phone1 older edit' })
    await session.stop()

    await sleep(5)
    net.online = true
    session = await open(USER_A, 'phone2')
    updateProduct(item.id, { ...item, name: 'Phone2 newer edit' })
    await session.flush()
    await session.stop()

    session = await open(USER_A, 'phone1')
    await session.flush()
    assert.equal(serverRow('products', item.id).name, 'Phone2 newer edit')
    assert.equal(getProducts().find((entry) => entry.id === item.id).name, 'Phone2 newer edit')
    assert.equal(await queueSize(session), 0)

    await sleep(5)
    updateProduct(item.id, { ...item, name: 'Phone1 newest edit' })
    await session.flush()
    await session.stop()
    session = await open(USER_A, 'phone2')
    // A device that has synced before opens from local data; the pull runs in the background.
    await session.flush()
    assert.equal(getProducts().find((entry) => entry.id === item.id).name, 'Phone1 newest edit')
    await session.stop()
  })

  it('offline delete on one device beats an older edit on another', async () => {
    let session = await open(USER_A, 'phone1')
    const meal = addMeal(
      { name: 'Soup', tags: ['dinner'], ingredients: [{ productId: STARTERS[2].id, quantityGrams: 200 }] },
      getProducts(),
      getMeals(),
    ).meal
    await session.flush()
    await session.stop()

    session = await open(USER_A, 'phone2')
    net.online = false
    await sleep(5)
    assert.equal(deleteMeal(meal.id), true)
    await session.stop()

    net.online = true
    session = await open(USER_A, 'phone2')
    await session.flush()
    await session.stop()
    assert.ok(serverRow('meals', meal.id).deleted_at)

    session = await open(USER_A, 'phone1')
    assert.ok(getMeals().some((entry) => entry.id === meal.id), 'opens from local data first')
    await session.flush()
    assert.ok(!getMeals().some((entry) => entry.id === meal.id))
    await session.stop()
  })

  it('duplicate delivery: server applied a push but the response was lost', async () => {
    const base = server.forUser(USER_A)
    let dropNext = true
    let pushes = 0
    const flaky = {
      pull: base.pull,
      async push(table, rows) {
        pushes += 1
        const result = await base.push(table, rows)
        if (dropNext) {
          dropNext = false
          const error = new Error('Failed to fetch')
          error.code = 'network'
          throw error
        }
        return result
      },
    }
    const session = await open(USER_A, 'phone1', flaky)
    const item = product('Once')
    await session.flush()
    await session.requestSync('manual')
    assert.ok(pushes >= 2)
    assert.equal(server.rows('products', USER_A).filter((row) => row.id === item.id).length, 1)
    assert.equal(await queueSize(session), 0)
    await session.stop()
  })

  it('logout with pending work: next user sees nothing, original user uploads on return', async () => {
    net.online = false
    let session = await open(USER_A, 'shared-phone')
    const secret = product('A private product')
    await session.stop()

    net.online = true
    session = await open(USER_B, 'shared-phone')
    assert.ok(!getProducts().some((entry) => entry.id === secret.id))
    assert.equal(getMeals().length, 0)
    await session.flush()
    assert.equal(server.rows('products', USER_B).length, 0)
    await session.stop()

    session = await open(USER_A, 'shared-phone')
    assert.ok(getProducts().some((entry) => entry.id === secret.id))
    await session.flush()
    assert.equal(serverRow('products', secret.id).name, 'A private product')
    assert.equal(server.rows('products', USER_B).length, 0)
    await session.stop()
  })

  it('user B on another device cannot pull user A rows', async () => {
    let session = await open(USER_A, 'phone1')
    product('A only')
    await session.flush()
    await session.stop()
    session = await open(USER_B, 'phone2')
    assert.ok(!getProducts().some((entry) => entry.name === 'A only'))
    await session.stop()
  })

  it('local edit made during an in-flight sync is not lost by the post-sync reload', async () => {
    const base = server.forUser(USER_A)
    let gate = null
    const slow = {
      push: base.push,
      async pull(table, ...rest) {
        if (table === 'meals' && gate) await gate
        return base.pull(table, ...rest)
      },
    }
    const session = await open(USER_A, 'phone1', slow)
    let release
    gate = new Promise((resolve) => {
      release = resolve
    })
    const cycle = session.requestSync('manual')
    await sleep(10)
    const during = product('Added during sync')
    release()
    await cycle
    gate = null
    assert.ok(getProducts().some((entry) => entry.id === during.id))
    await session.flush()
    assert.equal(serverRow('products', during.id).name, 'Added during sync')
    await session.stop()
  })

  it('a row the server rejects does not block the rest of the queue', async () => {
    const base = server.forUser(USER_A)
    let poisonId = null
    const strict = {
      pull: base.pull,
      async push(table, rows) {
        if (rows.some((row) => row.id === poisonId)) {
          const error = new Error('violates check constraint')
          error.code = 'other'
          throw error
        }
        return base.push(table, rows)
      },
    }
    const session = await open(USER_A, 'phone1', strict)
    net.online = false
    const poison = product('Poison')
    poisonId = poison.id
    const healthy = product('Healthy')
    net.online = true
    await session.flush()
    assert.equal(serverRow('products', healthy.id).name, 'Healthy')
    assert.equal(serverRow('products', poison.id), undefined)
    const status = session.getStatus()
    assert.equal(status.errorCode, 'rejected')
    assert.equal(status.pendingCount, 1)
    await session.stop()
  })
})

describe('local isolation', () => {
  it('a write queued just before reset never lands in the next user database', async () => {
    const dbA = await openUserDatabase(USER_A, { adapterFactory: () => createNodeSqliteAdapter() })
    const dbB = await openUserDatabase(USER_B, { adapterFactory: () => createNodeSqliteAdapter() })
    await localState.hydrateFromDatabase(dbA)
    localState.attachDatabase(dbA)
    product('Queued for A')
    localState.reset()
    await localState.hydrateFromDatabase(dbB)
    localState.attachDatabase(dbB)
    await localState.flushWrites()
    assert.equal((await dbB.query(`SELECT COUNT(*) AS n FROM products`))[0].n, 0)
    assert.equal((await dbB.query(`SELECT COUNT(*) AS n FROM sync_queue`))[0].n, 0)
    assert.ok(!getProducts().some((entry) => entry.name === 'Queued for A'))
    localState.reset()
    await dbA.close()
    await dbB.close()
  })
})

describe('sync engine retry behavior', () => {
  it('backs off exponentially on network failure instead of looping', async () => {
    const db = await openUserDatabase(USER_A, { adapterFactory: () => createNodeSqliteAdapter() })
    await localState.hydrateFromDatabase(db)
    localState.attachDatabase(db)
    let calls = 0
    const timers = []
    const engine = createSyncEngine({
      db,
      localState,
      remote: {
        async push() {
          return { rows: [] }
        },
        async pull() {
          calls += 1
          const error = new Error('offline')
          error.code = 'network'
          throw error
        },
      },
      random: () => 0.5,
      setTimer: (callback, delay) => {
        timers.push({ callback, delay })
        return timers.length
      },
      clearTimer: () => {},
    })
    engine.start()
    await engine.requestSync('manual')
    for (let index = 0; index < 4; index += 1) {
      const timer = timers.at(-1)
      await timer.callback()
      await sleep(0)
    }
    const delays = timers.map((timer) => timer.delay)
    assert.ok(calls <= 6, `too many attempts: ${calls}`)
    for (let index = 1; index < delays.length; index += 1) {
      assert.ok(delays[index] >= delays[index - 1], `delays not increasing: ${delays}`)
    }
    assert.ok(delays.at(-1) >= 16_000)
    assert.equal(engine.getStatus().state, 'offline')
    await engine.stop()
    localState.reset()
    await db.close()
  })
})
