import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { openUserDatabase } from '../../src/db/database.js'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import {
  exportBackup,
  importBackup,
  parseBackupJson,
  validateBackup,
} from '../../src/services/backup.js'
import {
  importLegacySnapshot,
} from '../../src/services/legacyMigration.js'
import localState from '../../src/services/localState.js'

let db

beforeEach(async () => {
  db = await openUserDatabase('migration-user', {
    adapterFactory: () => createNodeSqliteAdapter(),
  })
  await localState.hydrateFromDatabase(db)
  localState.attachDatabase(db)
})

afterEach(async () => {
  localState.reset()
  await db.close()
})

describe('legacy migration and backups', () => {
  it('hashes nested snapshot values instead of treating changed data as imported', async () => {
    const first = {
      weekplate_goals: {
        calories: 1800,
        protein: 100,
        carbs: 200,
        fat: 60,
        allowedCalorieOverage: 100,
      },
    }
    const second = {
      weekplate_goals: {
        ...first.weekplate_goals,
        calories: 1900,
      },
    }

    assert.equal(
      (await importLegacySnapshot(db, localState, first, { source: 'browser' }))
        .ok,
      true,
    )
    const firstMarker = (
      await db.query(`SELECT value FROM meta WHERE key='legacy_import_v1'`)
    )[0].value
    const report = await importLegacySnapshot(db, localState, second, {
      source: 'browser',
    })
    const secondMarker = (
      await db.query(`SELECT value FROM meta WHERE key='legacy_import_v1'`)
    )[0].value

    assert.equal(report.ok, true)
    assert.equal(report.alreadyImported, undefined)
    assert.notEqual(secondMarker, firstMarker)
  })

  it('round-trips a validated backup through the database facade', async () => {
    const products = JSON.parse(localState.getItem('weekplate_products'))
    localState.setItem(
      'weekplate_products',
      JSON.stringify([
        ...products,
        {
          id: '7d9990de-6e5e-4aa8-9d08-e56b92542864',
          name: 'Backup product',
          caloriesPer100g: 125,
          proteinPer100g: 5,
          carbsPer100g: 20,
          fatPer100g: 3,
          units: [],
        },
      ]),
    )
    await localState.flushWrites()

    const backup = exportBackup()
    assert.equal(validateBackup(backup).ok, true)
    assert.deepEqual(parseBackupJson(JSON.stringify(backup)).data, backup)

    const report = await importBackup(backup)
    assert.equal(report.ok, true)
    assert.equal(report.skipped.products, 1)
  })

  it('rejects malformed backups without writing partial rows', async () => {
    const report = await importBackup({
      type: 'weekplate-backup',
      version: 1,
      data: {
        weekplate_products: [
          {
            id: 'bad-product',
            name: '',
            caloriesPer100g: -1,
            proteinPer100g: 0,
            carbsPer100g: 0,
            fatPer100g: 0,
          },
        ],
        weekplate_meals: [],
      },
    })

    assert.equal(report.ok, false)
    assert.equal((await db.query(`SELECT * FROM products`)).length, 0)
  })
})
