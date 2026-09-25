import { TABLE_KEYS } from './rowMapping.js'

export function classifyRemoteError(error, responseStatus) {
  const status = Number(responseStatus ?? error?.status ?? error?.statusCode)
  const message = String(error?.message ?? error ?? '')
  const pgCode = typeof error?.code === 'string' ? error.code : ''
  if (status === 401 || pgCode === 'PGRST301' || pgCode === 'PGRST303') {
    return 'auth'
  }
  // A SQLSTATE (e.g. 23514 check violation) means the server answered and rejected the row.
  if (/^[0-9A-Z]{5}$/.test(pgCode) && !pgCode.startsWith('PGRST')) {
    return 'other'
  }
  if (
    status === 401 ||
    status === 403 ||
    /jwt|token|auth|permission denied/i.test(message)
  ) {
    return 'auth'
  }
  if (
    !status ||
    /network|fetch|offline|timeout|connection|failed to fetch/i.test(message)
  ) {
    return 'network'
  }
  return 'other'
}

function remoteError(error, status) {
  const wrapped = new Error(error?.message ?? 'Remote operation failed')
  wrapped.cause = error
  wrapped.code = classifyRemoteError(error, status || undefined)
  return wrapped
}

export function createSupabaseRemote(supabase) {
  return {
    async pull(table, cursor, limit = 200, options = {}) {
      const overlap = cursor
        ? new Date(
            Math.max(
              0,
              Date.parse(cursor) - (options.overlap === false ? 0 : 60_000),
            ),
          ).toISOString()
        : null
      let query = supabase
        .from(table)
        .select('*')
        .order('server_updated_at', { ascending: true })
        .limit(limit)
      if (overlap) query = query.gt('server_updated_at', overlap)
      const { data, error, status } = await query
      if (error) throw remoteError(error, status)
      const rows = data ?? []
      return {
        rows,
        nextCursor:
          rows.at(-1)?.server_updated_at ?? cursor ?? new Date(0).toISOString(),
      }
    },

    async push(table, rows) {
      if (rows.length === 0) return { rows: [] }
      const payload = rows.map(({ user_id: _userId, ...row }) => row)
      const conflict =
        table === 'user_settings'
          ? 'user_id'
          : `user_id,${TABLE_KEYS[table]}`
      const { data, error, status } = await supabase
        .from(table)
        .upsert(payload, { onConflict: conflict })
        .select()
      if (error) throw remoteError(error, status)
      return { rows: data ?? [] }
    },
  }
}
