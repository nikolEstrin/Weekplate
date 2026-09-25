import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { openUserDatabase } from '../../src/db/database.js'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import localState from '../../src/services/localState.js'
import { createSyncEngine } from '../../src/sync/syncEngine.js'
import { uuidV4 } from '../../src/utils/uuid.js'
import { createFakeRemote } from './fakeRemote.js'

let directory
let db

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'weekplate-sync-'))
  db = await openUserDatabase('user-a', {
    adapterFactory: () =>
      createNodeSqliteAdapter(path.join(directory, 'user-a.sqlite')),
  })
  await localState.hydrateFromDatabase(db)
  localState.attachDatabase(db)
})

afterEach(async () => {
  localState.reset()
  await db.close()
  await rm(directory, { recursive: true, force: true })
})

describe('local state and sync', () => {
  it('diffs a synchronous product write into one row and coalesced queue entry', async () => {
    const products = JSON.parse(localState.getItem('weekplate_products'))
    const custom = {
      id: uuidV4(),
      name: 'Custom',
      caloriesPer100g: 100,
      proteinPer100g: 2,
      carbsPer100g: 20,
      fatPer100g: 1,
      units: [],
    }
    localState.setItem('weekplate_products', JSON.stringify([...products, custom]))
    localState.setItem(
      'weekplate_products',
      JSON.stringify([...products, { ...custom, name: 'Edited' }]),
    )
    await localState.flushWrites()

    const rows = await db.query(`SELECT * FROM products WHERE id=?`, [custom.id])
    const queue = await db.query(
      `SELECT * FROM sync_queue WHERE entity_type='products' AND entity_id=?`,
      [custom.id],
    )
    assert.equal(rows[0].name, 'Edited')
    assert.equal(rows[0].sync_status, 'pending')
    assert.equal(queue.length, 1)
  })

  it('uploads offline work and clears the durable queue after reconnect', async () => {
    let online = false
    const server = createFakeRemote()
    const engine = createSyncEngine({
      db,
      remote: server.forUser('user-a'),
      localState,
      getIsOnline: () => online,
      debounceMs: 0,
    })
    localState.attachDatabase(db, {
      onLocalChange: () => engine.requestSync('local'),
    })
    engine.start()
    const products = JSON.parse(localState.getItem('weekplate_products'))
    const custom = {
      id: uuidV4(),
      name: 'Offline',
      caloriesPer100g: 50,
      proteinPer100g: 1,
      carbsPer100g: 10,
      fatPer100g: 0,
      units: [],
    }
    localState.setItem('weekplate_products', JSON.stringify([...products, custom]))
    await localState.flushWrites()
    assert.equal(server.rows('products', 'user-a').length, 0)

    online = true
    await engine.retryNow()
    assert.equal(server.rows('products', 'user-a').length, 1)
    assert.equal((await db.query(`SELECT * FROM sync_queue`)).length, 0)
    await engine.stop()
  })

  it('keeps rejected stale writes queued until the newer server row is pulled', async () => {
    const server = createFakeRemote()
    const remote = server.forUser('user-a')
    const id = uuidV4()
    const products = JSON.parse(localState.getItem('weekplate_products'))
    localState.setItem(
      'weekplate_products',
      JSON.stringify([
        ...products,
        {
          id,
          name: 'Local stale',
          caloriesPer100g: 10,
          proteinPer100g: 1,
          carbsPer100g: 1,
          fatPer100g: 1,
          units: [],
        },
      ]),
    )
    await localState.flushWrites()
    server.seed('products', 'user-a', {
      user_id: 'user-a',
      id,
      name: 'Server newer',
      calories_per_100g: 20,
      protein_per_100g: 2,
      carbs_per_100g: 2,
      fat_per_100g: 2,
      units: [],
      created_at: '2099-01-01T00:00:00.000Z',
      updated_at: '2099-01-01T00:00:00.000Z',
      deleted_at: null,
      server_updated_at: '2026-01-01T00:00:00.000Z',
    })

    const engine = createSyncEngine({ db, remote, localState })
    engine.start()
    await engine.requestSync('test')

    const row = (await db.query(`SELECT * FROM products WHERE id=?`, [id]))[0]
    assert.equal(row.name, 'Server newer')
    assert.equal(row.sync_status, 'synced')
    assert.equal((await db.query(`SELECT * FROM sync_queue`)).length, 0)
    await engine.stop()
  })
})
