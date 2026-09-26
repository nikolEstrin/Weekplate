import { Capacitor } from '@capacitor/core'
import {
  CapacitorSQLite,
  SQLiteConnection,
} from '@capacitor-community/sqlite'

let connectionManager
let webInitialized = false

async function getManager() {
  if (!connectionManager) connectionManager = new SQLiteConnection(CapacitorSQLite)
  if (Capacitor.getPlatform() === 'web' && !webInitialized) {
    const { defineCustomElements } = await import('jeep-sqlite/loader')
    defineCustomElements(globalThis)
    let element = document.querySelector('jeep-sqlite')
    if (!element) {
      element = document.createElement('jeep-sqlite')
      document.body.append(element)
    }
    await customElements.whenDefined('jeep-sqlite')
    await connectionManager.initWebStore()
    webInitialized = true
  }
  return connectionManager
}

export async function createCapacitorSqliteAdapter(databaseName) {
  const manager = await getManager()
  const connection = await manager.createConnection(
    databaseName,
    false,
    'no-encryption',
    1,
    false,
  )
  await connection.open()
  const isWeb = Capacitor.getPlatform() === 'web'

  async function query(sql, params = []) {
    const result = await connection.query(sql, params)
    return result.values ?? []
  }

  // Saving the web store exports the database, which ends an open transaction,
  // so statements inside a transaction must not save; the commit saves once.
  const tx = {
    query,
    async run(sql, params = []) {
      await connection.run(sql, params, false)
    },
  }

  const api = {
    query,
    async run(sql, params = []) {
      await connection.run(sql, params, false)
      if (isWeb) await manager.saveToStore(databaseName)
    },
    async transaction(callback) {
      await connection.beginTransaction()
      try {
        const result = await callback(tx)
        await connection.commitTransaction()
        if (isWeb) await manager.saveToStore(databaseName)
        return result
      } catch (error) {
        await connection.rollbackTransaction().catch(() => {})
        throw error
      }
    },
    async close() {
      if (isWeb) await manager.saveToStore(databaseName)
      await connection.close()
      await manager.closeConnection(databaseName, false)
    },
  }
  return api
}

export async function deleteCapacitorDatabase(databaseName) {
  const manager = await getManager()
  const { result: connected } = await manager.isConnection(databaseName, false)
  const connection = connected
    ? await manager.retrieveConnection(databaseName, false)
    : await manager.createConnection(databaseName, false, 'no-encryption', 1, false)
  if (!(await connection.isDBOpen()).result) await connection.open()
  await connection.delete()
  await manager.closeConnection(databaseName, false).catch(() => {})
}
