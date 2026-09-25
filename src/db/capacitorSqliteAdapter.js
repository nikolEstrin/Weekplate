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

  const api = {
    async query(sql, params = []) {
      const result = await connection.query(sql, params)
      return result.values ?? []
    },
    async run(sql, params = []) {
      await connection.run(sql, params, false)
      if (isWeb) await manager.saveToStore(databaseName)
    },
    async transaction(callback) {
      await connection.beginTransaction()
      try {
        const result = await callback(api)
        await connection.commitTransaction()
        if (isWeb) await manager.saveToStore(databaseName)
        return result
      } catch (error) {
        await connection.rollbackTransaction()
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
  await manager.deleteDatabase(databaseName)
}
