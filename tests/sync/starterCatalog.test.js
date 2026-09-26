import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, it } from 'node:test'
import starterProductsData from '../../src/data/starterProducts.json' with { type: 'json' }
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import { startDataSession, stopDataSession } from '../../src/services/dataSession.js'
import {
  ensureStarterProducts,
  exportLibrary,
  getProducts,
  importLibrary,
} from '../../src/services/storage.js'
import { createFakeRemote } from './fakeRemote.js'

const USER = 'dddddddd-0000-4000-8000-000000000004'
const STARTERS = starterProductsData.products
const RETIRED = STARTERS[0]
let directory
let server

function globalRow(product, index, deletedAt = null) {
  return {
    id: product.id,
    name: product.name,
    calories_per_100g: product.caloriesPer100g,
    protein_per_100g: product.proteinPer100g,
    carbs_per_100g: product.carbsPer100g,
    fat_per_100g: product.fatPer100g,
    units: product.units ?? [],
    sort_order: index,
    deleted_at: deletedAt,
    server_updated_at: '2026-09-01T00:00:00.000Z',
  }
}

async function start() {
  return startDataSession({
    userId: USER,
    remote: server.forUser(USER),
    platform: { getIsOnline: () => true },
    adapterFactory: (name) => createNodeSqliteAdapter(path.join(directory, `${name}.sqlite`)),
  })
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'weekplate-starters-'))
  server = createFakeRemote()
  STARTERS.forEach((product, index) =>
    server.seed(
      'global_products',
      null,
      globalRow(product, index, product === RETIRED ? '2026-09-01T00:00:00.000Z' : null),
    ),
  )
})

afterEach(async () => {
  await stopDataSession()
  await rm(directory, { recursive: true, force: true })
})

it('a retired global product is not re-created as a private product', async () => {
  const session = await start()
  await session.flush()
  ensureStarterProducts()
  await session.flush()

  assert.equal(getProducts().some((product) => product.id === RETIRED.id), false)
  assert.equal(server.rows('products', USER).some((row) => row.id === RETIRED.id), false)
  await session.stop()
})

it('replace-importing an export keeps the shared starters instead of tombstoning them', async () => {
  const session = await start()
  await session.flush()
  const visibleStarters = getProducts().filter((product) =>
    STARTERS.some((starter) => starter.id === product.id),
  ).length
  assert.ok(visibleStarters > 0)

  const file = exportLibrary()
  assert.equal(importLibrary(file, 'replace').ok, true)
  await session.flush()

  assert.equal(
    getProducts().filter((product) => STARTERS.some((starter) => starter.id === product.id))
      .length,
    visibleStarters,
  )
  assert.equal(server.rows('products', USER).filter((row) => row.deleted_at).length, 0)
  await session.stop()
})
