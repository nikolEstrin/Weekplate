import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, it } from 'node:test'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import { startDataSession, stopDataSession } from '../../src/services/dataSession.js'
import { nextUpdatedAt } from '../../src/services/localState.js'
import { addProduct, getProducts, updateProduct } from '../../src/services/storage.js'
import { createFakeRemote } from './fakeRemote.js'

const USER = 'cccccccc-0000-4000-8000-000000000003'
let directory
let server

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'weekplate-skew-'))
  server = createFakeRemote()
})

afterEach(async () => {
  await stopDataSession()
  await rm(directory, { recursive: true, force: true })
})

it('nextUpdatedAt is strictly after the previous version', () => {
  const now = '2026-09-26T10:00:00.000Z'
  assert.equal(nextUpdatedAt(now, null), now)
  assert.equal(nextUpdatedAt(now, '2026-09-26T09:00:00.000Z'), now)
  assert.equal(nextUpdatedAt(now, '2026-09-26T10:02:00.000Z'), '2026-09-26T10:02:00.001Z')
  assert.equal(nextUpdatedAt(now, now), '2026-09-26T10:00:00.001Z')
})

it('an edit made on a device whose clock is behind still syncs', async () => {
  const session = await startDataSession({
    userId: USER,
    remote: server.forUser(USER),
    platform: { getIsOnline: () => true },
    adapterFactory: (name) => createNodeSqliteAdapter(path.join(directory, `${name}.sqlite`)),
  })
  const created = addProduct({
    name: 'Yogurt',
    caloriesPer100g: 60,
    proteinPer100g: 5,
    carbsPer100g: 4,
    fatPer100g: 3,
    units: [],
  }).product
  await session.flush()

  // Another device, whose clock runs two minutes ahead, edits the product.
  const [serverRow] = server.rows('products', USER)
  await server.forUser(USER).push('products', [
    { ...serverRow, name: 'Edited ahead', updated_at: new Date(Date.now() + 120_000).toISOString() },
  ])
  await session.flush()
  assert.equal(getProducts().find((product) => product.id === created.id).name, 'Edited ahead')

  // This device (clock behind that one) edits after seeing that version.
  const current = getProducts().find((product) => product.id === created.id)
  assert.equal(updateProduct(created.id, { ...current, name: 'Edited later here' }).ok, true)
  await session.flush()

  assert.equal(server.rows('products', USER)[0].name, 'Edited later here')
  assert.equal(session.getStatus().pendingCount, 0)
  await session.stop()
})
