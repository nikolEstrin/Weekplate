import { deleteUserDatabase, openUserDatabase } from '../db/database.js'
import { createSyncEngine } from '../sync/syncEngine.js'
import localState from './localState.js'
import { initializeStorage } from './storage.js'
import {
  importLegacySnapshot,
  readBrowserLegacySnapshot,
} from './legacyMigration.js'

let activeSession = null
let startChain = Promise.resolve()

function timeout(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/** Starts are serialized so one database file is never opened twice. */
export function startDataSession(options) {
  const result = startChain.then(() => startDataSessionNow(options))
  startChain = result.catch(() => {})
  return result
}

async function startDataSessionNow({
  userId,
  remote = null,
  platform = {},
  adapterFactory,
}) {
  if (activeSession) await activeSession.stop()
  const db = await openUserDatabase(userId, { adapterFactory })
  const statusListeners = new Set()
  let status = {
    state: 'idle',
    pendingCount: Number(
      (await db.query(`SELECT COUNT(*) AS count FROM sync_queue`))[0]?.count ?? 0,
    ),
    lastSyncedAt: null,
    errorCode: null,
  }
  const publish = (next) => {
    status = { ...next }
    for (const listener of statusListeners) listener({ ...status })
  }

  await localState.hydrateFromDatabase(db)
  let syncEngine = null
  if (remote) {
    syncEngine = createSyncEngine({
      db,
      remote,
      localState,
      getIsOnline: platform.getIsOnline ?? (() => true),
      onStatus: publish,
    })
  }
  localState.attachDatabase(db, {
    onLocalChange: () => syncEngine?.requestSync('local'),
  })
  initializeStorage()
  await localState.flushWrites()

  if (syncEngine) {
    const hasSyncedBefore =
      (await db.query(`SELECT 1 FROM meta WHERE key LIKE 'cursor:%' LIMIT 1`)).length > 0
    syncEngine.start()
    // Local data is usable immediately; only a device's very first sync is awaited
    // (bounded), so a new install shows the account's data instead of an empty app.
    if (!hasSyncedBefore && (await (platform.getIsOnline?.() ?? true))) {
      await Promise.race([
        syncEngine.requestSync('initial'),
        timeout(platform.initialSyncTimeoutMs ?? 10_000),
      ])
    }
  }

  let legacyReport = null
  const snapshot = readBrowserLegacySnapshot()
  const owner =
    typeof window !== 'undefined'
      ? window.localStorage?.getItem('weekplate_legacy_import_owner')
      : null
  if (snapshot && (!owner || owner === userId)) {
    legacyReport = await importLegacySnapshot(db, localState, snapshot, {
      source: 'browser',
    })
    if (legacyReport.ok) syncEngine?.requestSync('local')
  }

  const cleanups = []
  if (platform.onNetworkChange) {
    const cleanup = platform.onNetworkChange((networkState) => {
      const online =
        typeof networkState === 'boolean'
          ? networkState
          : Boolean(networkState?.connected)
      if (online) syncEngine?.requestSync('network')
      else publish({ ...status, state: 'offline', errorCode: 'offline' })
    })
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }
  if (platform.onResume) {
    const cleanup = platform.onResume(() => syncEngine?.requestSync('resume'))
    if (typeof cleanup === 'function') cleanups.push(cleanup)
  }

  let stopPromise = null
  const session = {
    syncEngine,
    getStatus: () => (syncEngine ? syncEngine.getStatus() : { ...status }),
    subscribeStatus(listener) {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    requestSync(reason = 'manual') {
      return syncEngine?.requestSync(reason) ?? Promise.resolve()
    },
    async flush() {
      await localState.flushWrites()
      if (syncEngine) await syncEngine.requestSync('flush')
    },
    legacyReport,
    stop(options) {
      stopPromise ??= stopNow(options)
      return stopPromise
    },
  }

  async function stopNow({ finalSync = true } = {}) {
    for (const cleanup of cleanups) await cleanup()
    await localState.flushWrites().catch(() => {})
    if (syncEngine && !finalSync) {
      await Promise.race([syncEngine.stop(), timeout(3000)])
    } else if (syncEngine) {
      await Promise.race([
        syncEngine.requestSync('final'),
        timeout(3000),
      ]).catch(() => {})
      await Promise.race([syncEngine.stop(), timeout(3000)])
    }
    localState.reset()
    await db.close().catch(() => {})
    statusListeners.clear()
    if (activeSession === session) activeSession = null
  }
  activeSession = session
  return session
}

export async function stopDataSession() {
  if (activeSession) await activeSession.stop()
}

export async function deleteLocalUserData(userId, options = {}) {
  if (activeSession) await activeSession.stop({ finalSync: false })
  await deleteUserDatabase(userId, options)
}
