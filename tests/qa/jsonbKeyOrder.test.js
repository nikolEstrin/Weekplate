import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import { startDataSession, stopDataSession } from '../../src/services/dataSession.js'
import localState from '../../src/services/localState.js'
import {
  addProduct,
  addProductToDayPlan,
  getDayPlan,
} from '../../src/services/storage.js'
import { createFakeRemote } from '../sync/fakeRemote.js'

// Real Postgres jsonb does not preserve object key order: keys are stored
// sorted by length, then bytewise. The shared fakeRemote keeps JS insertion
// order, so it hides any client logic that compares JSON text.
function jsonbOrder(value) {
  if (Array.isArray(value)) return value.map(jsonbOrder)
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) =>
      a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
    )
    return Object.fromEntries(keys.map((key) => [key, jsonbOrder(value[key])]))
  }
  return value
}

const JSONB_COLUMNS = {
  global_products: ['units'],
  products: ['units'],
  meals: ['ingredients'],
  day_plans: ['slots'],
  shopping_checks: ['checked'],
}

function asPostgres(table, row) {
  const result = { ...row }
  for (const column of JSONB_COLUMNS[table] ?? []) {
    if (result[column] != null) result[column] = jsonbOrder(result[column])
  }
  return result
}

function postgresLikeRemote(base) {
  if (process.env.QA_PLAIN_FAKE === '1') return base
  return {
    async push(table, rows) {
      const result = await base.push(table, rows)
      return { rows: result.rows.map((row) => asPostgres(table, row)) }
    },
    async pull(table, cursor, limit, options) {
      const result = await base.pull(table, cursor, limit, options)
      return { ...result, rows: result.rows.map((row) => asPostgres(table, row)) }
    },
  }
}

const USER = 'aaaaaaaa-0000-4000-8000-0000000000aa'
const DAY_1 = '2026-10-05'
const DAY_2 = '2026-10-06'

let directory
let server
let net

function open(device) {
  return startDataSession({
    userId: USER,
    remote: postgresLikeRemote(server.forUser(USER)),
    platform: { getIsOnline: () => net.online },
    adapterFactory: (name) =>
      createNodeSqliteAdapter(path.join(directory, `${device}-${name}.sqlite`)),
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function makeProduct(name) {
  const result = addProduct({
    name,
    caloriesPer100g: 100,
    proteinPer100g: 10,
    carbsPer100g: 10,
    fatPer100g: 1,
    units: [],
  })
  assert.equal(result.ok, true)
  return result.product
}

async function queuedEntities() {
  const db = localState.getAttachedDatabase()
  await localState.flushWrites()
  const rows = await db.query(
    `SELECT entity_type, entity_id FROM sync_queue ORDER BY entity_type, entity_id`,
  )
  return rows.map((row) => `${row.entity_type}:${row.entity_id}`)
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'weekplate-qa-jsonb-'))
  server = createFakeRemote()
  net = { online: true }
})

afterEach(async () => {
  await stopDataSession()
  await rm(directory, { recursive: true, force: true })
})

describe('QA: server jsonb key order (real Postgres behavior)', () => {
  it('editing one day does not re-queue other, unchanged days', async () => {
    const session = await open('phone1')
    const eggs = makeProduct('Eggs')
    addProductToDayPlan(DAY_1, eggs, 50, 'breakfast')
    addProductToDayPlan(DAY_2, eggs, 60, 'lunch')
    await session.flush()
    assert.deepEqual(await queuedEntities(), [])

    addProductToDayPlan(DAY_1, eggs, 70, 'dinner')
    assert.deepEqual(
      await queuedEntities(),
      [`day_plans:${DAY_1}`],
      'only the edited day should be queued for upload',
    )
    await session.stop()
  })

  it('an offline edit of one day does not overwrite another device\'s newer edit of a different day', async () => {
    let session = await open('phone1')
    const eggs = makeProduct('Eggs')
    addProductToDayPlan(DAY_1, eggs, 50, 'breakfast')
    addProductToDayPlan(DAY_2, eggs, 60, 'lunch')
    await session.flush()
    await session.stop()

    session = await open('phone2')
    await session.flush()
    await sleep(5)
    assert.equal(addProductToDayPlan(DAY_2, eggs, 999, 'snack').ok, true)
    await session.flush()
    await session.stop()
    const serverDay2 = server.rows('day_plans', USER).find((row) => row.date_key === DAY_2)
    assert.equal(serverDay2.slots.snacks.length, 1, 'phone2 edit reached the server')

    net.online = false
    session = await open('phone1')
    await sleep(5)
    addProductToDayPlan(DAY_1, eggs, 70, 'dinner')
    net.online = true
    await session.flush()

    const finalDay2 = server.rows('day_plans', USER).find((row) => row.date_key === DAY_2)
    assert.equal(
      finalDay2.slots.snacks.length,
      1,
      'phone1 edited only DAY_1 but its stale copy of DAY_2 overwrote phone2\'s newer edit',
    )
    assert.equal(getDayPlan(DAY_2).snacks.length, 1)
    await session.stop()
  })
})
