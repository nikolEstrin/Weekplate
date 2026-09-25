import {
  SYNC_TABLES,
  TABLE_KEYS,
  fromRemoteRow,
  getEntityId,
  toRemoteRow,
  upsertLocalRow,
} from './rowMapping.js'

const PULL_TABLES = ['global_products', ...SYNC_TABLES]

function newer(a, b) {
  return Date.parse(a ?? 0) > Date.parse(b ?? 0)
}

export function createSyncEngine({
  db,
  remote,
  localState,
  getIsOnline = () => true,
  onStatus = () => {},
  debounceMs = 1500,
  random = Math.random,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let stopped = true
  let running = null
  let queuedRun = null
  let retryTimer = null
  let debounceTimer = null
  let failureCount = 0
  let rejectedCount = 0
  let status = {
    state: 'idle',
    pendingCount: 0,
    lastSyncedAt: null,
    errorCode: null,
  }

  function update(patch) {
    status = { ...status, ...patch }
    onStatus({ ...status })
  }

  async function refreshPending() {
    const rows = await db.query(`SELECT COUNT(*) AS count FROM sync_queue`)
    status.pendingCount = Number(rows[0]?.count ?? 0)
  }

  /**
   * A row the server permanently rejects (constraint violation) must not block
   * the rest of the queue: on a non-network, non-auth failure, rows are retried
   * one by one and rejected rows get their own growing backoff.
   */
  async function pushSnapshots(table, snapshots) {
    const toRemote = ({ row }) => toRemoteRow(table, row)
    try {
      const result = await remote.push(table, snapshots.map(toRemote))
      return result?.rows ?? []
    } catch (error) {
      if (error?.code === 'network' || error?.code === 'auth') throw error
    }
    const accepted = []
    for (const snapshot of snapshots) {
      try {
        const result = await remote.push(table, [toRemote(snapshot)])
        accepted.push(...(result?.rows ?? []))
      } catch (error) {
        if (error?.code === 'network' || error?.code === 'auth') throw error
        const attempts = Number(snapshot.entry.attempt_count ?? 0) + 1
        const delay = Math.min(86_400_000, 60_000 * 2 ** (attempts - 1))
        await db.run(
          `UPDATE sync_queue SET attempt_count=?, last_error=?, next_attempt_at=?
           WHERE id=?`,
          [
            attempts,
            'rejected',
            new Date(Date.now() + delay).toISOString(),
            snapshot.entry.id,
          ],
        )
        rejectedCount += 1
      }
    }
    return accepted
  }

  async function push() {
    const now = new Date().toISOString()
    const queued = await db.query(
      `SELECT * FROM sync_queue
       WHERE next_attempt_at IS NULL OR next_attempt_at <= ?
       ORDER BY id`,
      [now],
    )
    for (const table of SYNC_TABLES) {
      const entries = queued.filter((entry) => entry.entity_type === table)
      if (entries.length === 0) continue
      const key = TABLE_KEYS[table]
      const snapshots = []
      for (const entry of entries) {
        const rows = await db.query(
          `SELECT * FROM ${table} WHERE ${key} = ?`,
          [table === 'user_settings' ? 1 : entry.entity_id],
        )
        if (rows[0]) snapshots.push({ entry, row: rows[0] })
      }
      if (snapshots.length === 0) continue
      const acceptedRows = await pushSnapshots(table, snapshots)
      const accepted = new Map(
        acceptedRows.map((row) => [
          getEntityId(table, fromRemoteRow(table, row)),
          row,
        ]),
      )
      await db.transaction(async (tx) => {
        for (const { entry, row } of snapshots) {
          const remoteRow = accepted.get(String(entry.entity_id))
          if (!remoteRow) continue
          const current = (
            await tx.query(`SELECT updated_at FROM ${table} WHERE ${key} = ?`, [
              table === 'user_settings' ? 1 : entry.entity_id,
            ])
          )[0]
          if (current?.updated_at !== row.updated_at) continue
          await upsertLocalRow(tx, table, fromRemoteRow(table, remoteRow))
          await tx.run(
            `DELETE FROM sync_queue WHERE entity_type=? AND entity_id=?
             AND id=?`,
            [table, entry.entity_id, entry.id],
          )
        }
      })
    }
  }

  async function pullTable(table) {
    const cursorKey = `cursor:${table}`
    const cursorRows = await db.query(`SELECT value FROM meta WHERE key=?`, [
      cursorKey,
    ])
    const storedCursor = cursorRows[0]?.value ?? null
    let pageCursor = storedCursor
    let firstPage = true
    for (;;) {
      const page = await remote.pull(table, pageCursor, 200, {
        overlap: firstPage,
      })
      await db.transaction(async (tx) => {
        for (const remoteRow of page.rows) {
        if (table === 'global_products') {
          await upsertLocalRow(tx, table, {
            id: remoteRow.id,
            name: remoteRow.name,
            calories_per_100g: remoteRow.calories_per_100g,
            protein_per_100g: remoteRow.protein_per_100g,
            carbs_per_100g: remoteRow.carbs_per_100g,
            fat_per_100g: remoteRow.fat_per_100g,
            units: remoteRow.units,
            sort_order: remoteRow.sort_order,
            deleted_at: remoteRow.deleted_at,
            server_updated_at: remoteRow.server_updated_at,
          })
            continue
        }
        const localRow = fromRemoteRow(table, remoteRow)
        const id = getEntityId(table, localRow)
        const key = TABLE_KEYS[table]
        const existing = (
          await tx.query(`SELECT * FROM ${table} WHERE ${key}=?`, [
            table === 'user_settings' ? 1 : id,
          ])
        )[0]
        if (
          existing?.sync_status === 'pending' &&
          !newer(remoteRow.updated_at, existing.updated_at)
        ) {
          continue
        }
        await upsertLocalRow(tx, table, localRow)
        if (existing?.sync_status === 'pending') {
          await tx.run(
            `DELETE FROM sync_queue WHERE entity_type=? AND entity_id=?`,
            [table, id],
          )
        }
        }
        if (page.nextCursor) {
          await tx.run(
            `INSERT INTO meta(key,value) VALUES (?,?)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            [cursorKey, page.nextCursor],
          )
        }
      })
      if (page.rows.length < 200 || page.nextCursor === pageCursor) break
      pageCursor = page.nextCursor
      firstPage = false
    }
  }

  function scheduleRetry(error) {
    failureCount += 1
    const base = Math.min(300_000, 2000 * 2 ** (failureCount - 1))
    const delay = Math.round(base * (0.75 + random() * 0.5))
    clearTimer(retryTimer)
    retryTimer = setTimer(() => {
      retryTimer = null
      requestSync('retry')
    }, delay)
    update({
      state: error?.code === 'network' ? 'offline' : 'error',
      errorCode: error?.code ?? 'other',
    })
  }

  async function cycle() {
    if (stopped) return
    if (!(await getIsOnline())) {
      await refreshPending()
      update({ state: 'offline', errorCode: 'offline' })
      return
    }
    update({ state: 'syncing', errorCode: null })
    try {
      rejectedCount = 0
      await localState.flushWrites()
      await push()
      for (const table of PULL_TABLES) await pullTable(table)
      await localState.rehydrate()
      failureCount = 0
      await refreshPending()
      update({
        state: rejectedCount > 0 ? 'error' : 'idle',
        lastSyncedAt: new Date().toISOString(),
        errorCode: rejectedCount > 0 ? 'rejected' : null,
      })
    } catch (error) {
      await refreshPending().catch(() => {})
      if (!stopped) scheduleRetry(error)
      throw error
    }
  }

  /** Resolves only after a cycle that started after this call has finished. */
  function launch() {
    if (stopped) return Promise.resolve()
    if (!running) {
      running = cycle()
        .catch(() => {})
        .finally(() => {
          running = null
        })
      return running
    }
    if (!queuedRun) {
      queuedRun = running.then(() => {
        queuedRun = null
        return launch()
      })
    }
    return queuedRun
  }

  function requestSync(reason = 'manual') {
    if (stopped) return Promise.resolve()
    if (reason === 'local') {
      clearTimer(debounceTimer)
      debounceTimer = setTimer(() => {
        debounceTimer = null
        launch()
      }, debounceMs)
      return Promise.resolve()
    }
    clearTimer(retryTimer)
    retryTimer = null
    return launch()
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      requestSync('start')
    },
    async stop() {
      stopped = true
      clearTimer(retryTimer)
      clearTimer(debounceTimer)
      retryTimer = null
      debounceTimer = null
      if (running) await running
      if (queuedRun) await queuedRun
    },
    requestSync,
    retryNow() {
      failureCount = 0
      return requestSync('manual')
    },
    getStatus() {
      return { ...status }
    },
  }
}
