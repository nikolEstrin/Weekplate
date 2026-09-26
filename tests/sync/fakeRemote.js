import { TABLE_KEYS } from '../../src/sync/rowMapping.js'

function clone(value) {
  return structuredClone(value)
}

// Postgres jsonb stores object keys sorted by length, then bytewise, so rows
// never come back in the key order the client sent.
const JSONB_COLUMNS = ['units', 'ingredients', 'slots', 'checked']

function jsonbOrder(value) {
  if (Array.isArray(value)) return value.map(jsonbOrder)
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) =>
      a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
    )
    return Object.fromEntries(keys.map((key) => [key, jsonbOrder(value[key])]))
  }
  return value
}

function asStored(row) {
  const result = clone(row)
  for (const column of JSONB_COLUMNS) {
    if (result[column] != null) result[column] = jsonbOrder(result[column])
  }
  return result
}

export function createFakeRemote({ now = () => new Date() } = {}) {
  const tables = new Map()
  let sequence = 0

  function tableStore(table) {
    if (!tables.has(table)) tables.set(table, new Map())
    return tables.get(table)
  }

  function keyFor(table, userId, row) {
    if (table === 'global_products') return row.id
    if (table === 'user_settings') return userId
    return `${userId}\0${row[TABLE_KEYS[table]]}`
  }

  function remoteForUser(userId) {
    return {
      async push(table, inputRows) {
        const store = tableStore(table)
        const accepted = []
        for (const input of inputRows) {
          const row = asStored(input)
          const key = keyFor(table, userId, row)
          const previous = store.get(key)
          if (
            previous &&
            Date.parse(row.updated_at) < Date.parse(previous.updated_at)
          ) {
            continue
          }
          const serverNow = now()
          const max = serverNow.getTime() + 5 * 60_000
          if (Date.parse(row.updated_at) > max) {
            row.updated_at = new Date(max).toISOString()
          }
          row.user_id = userId
          row.created_at = previous?.created_at ?? row.created_at ?? serverNow.toISOString()
          sequence += 1
          row.server_updated_at = new Date(
            serverNow.getTime() + sequence,
          ).toISOString()
          store.set(key, row)
          accepted.push(clone(row))
        }
        return { rows: accepted }
      },
      async pull(table, cursor, limit = 200, options = {}) {
        const overlap = cursor
          ? Date.parse(cursor) - (options.overlap === false ? 0 : 60_000)
          : 0
        const rows = [...tableStore(table).values()]
          .filter(
            (row) =>
              table === 'global_products' ||
              row.user_id === userId,
          )
          .filter((row) => Date.parse(row.server_updated_at) > overlap)
          .sort(
            (a, b) =>
              Date.parse(a.server_updated_at) -
              Date.parse(b.server_updated_at),
          )
          .slice(0, limit)
          .map(clone)
        return {
          rows,
          nextCursor:
            rows.at(-1)?.server_updated_at ?? cursor ?? new Date(0).toISOString(),
        }
      },
    }
  }

  return {
    forUser: remoteForUser,
    seed(table, userId, row) {
      tableStore(table).set(keyFor(table, userId, row), asStored(row))
    },
    rows(table, userId) {
      return [...tableStore(table).values()]
        .filter(
          (row) =>
            table === 'global_products' ||
            userId == null ||
            row.user_id === userId,
        )
        .map(clone)
    },
  }
}
