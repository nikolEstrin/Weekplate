import { DatabaseSync } from 'node:sqlite'

export function createNodeSqliteAdapter(filename = ':memory:') {
  const database = new DatabaseSync(filename)
  let closed = false

  const api = {
    async query(sql, params = []) {
      return database.prepare(sql).all(...params)
    },
    async run(sql, params = []) {
      database.prepare(sql).run(...params)
    },
    async transaction(callback) {
      database.exec('BEGIN IMMEDIATE')
      try {
        const result = await callback(api)
        database.exec('COMMIT')
        return result
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
    },
    async close() {
      if (!closed) {
        database.close()
        closed = true
      }
    },
  }
  return api
}
