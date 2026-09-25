import {
  createCapacitorSqliteAdapter,
  deleteCapacitorDatabase,
} from './capacitorSqliteAdapter.js'
import { migrateDatabase } from './migrations.js'

export function getUserDatabaseName(userId) {
  const safe = String(userId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!safe) throw new TypeError('userId is required')
  return `weekplate_${safe}`
}

/**
 * One SQLite connection cannot run overlapping transactions, so every call is
 * queued. Code inside a transaction callback must use the `tx` argument, never
 * the outer handle (that would wait on its own lock).
 */
export function serializeAdapter(adapter) {
  let tail = Promise.resolve()
  const exclusive = (operation) => {
    const result = tail.then(operation)
    tail = result.catch(() => {})
    return result
  }
  return {
    query: (sql, params) => exclusive(() => adapter.query(sql, params)),
    run: (sql, params) => exclusive(() => adapter.run(sql, params)),
    transaction: (callback) => exclusive(() => adapter.transaction(callback)),
    close: () => exclusive(() => adapter.close()),
  }
}

export async function openUserDatabase(userId, options = {}) {
  const name = getUserDatabaseName(userId)
  const factory = options.adapterFactory ?? createCapacitorSqliteAdapter
  const db = serializeAdapter(await factory(name))
  try {
    await migrateDatabase(db)
    const rows = await db.query(`SELECT value FROM meta WHERE key = 'user_id'`)
    if (rows.length > 0 && rows[0].value !== userId) {
      throw new Error('Database user mismatch')
    }
    if (rows.length === 0) {
      await db.run(`INSERT INTO meta(key, value) VALUES ('user_id', ?)`, [userId])
    }
    Object.defineProperties(db, {
      databaseName: { value: name, enumerable: true },
      userId: { value: userId, enumerable: true },
    })
    return db
  } catch (error) {
    await db.close().catch(() => {})
    throw error
  }
}

export async function deleteUserDatabase(userId, options = {}) {
  const name = getUserDatabaseName(userId)
  if (options.deleteDatabase) return options.deleteDatabase(name)
  return deleteCapacitorDatabase(name)
}
