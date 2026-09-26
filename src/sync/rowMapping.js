export const SYNC_TABLES = [
  'products',
  'meals',
  'day_plans',
  'user_settings',
  'shopping_checks',
]

export const TABLE_KEYS = {
  global_products: 'id',
  products: 'id',
  meals: 'id',
  day_plans: 'date_key',
  user_settings: 'id',
  shopping_checks: 'selection_key',
}

const TIMESTAMPS = ['created_at', 'updated_at', 'server_updated_at']
const NUTRITION = ['calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g']

/**
 * Columns this app version reads from the cloud. Explicit lists keep installed
 * apps working when a later migration adds columns.
 */
export const REMOTE_COLUMNS = {
  global_products: ['id', 'name', ...NUTRITION, 'units', 'sort_order', 'deleted_at', 'server_updated_at'],
  products: ['user_id', 'id', 'name', ...NUTRITION, 'units', 'deleted_at', ...TIMESTAMPS],
  meals: ['user_id', 'id', 'name', 'tags', 'ingredients', 'deleted_at', ...TIMESTAMPS],
  day_plans: ['user_id', 'date_key', 'slots', 'deleted_at', ...TIMESTAMPS],
  user_settings: ['user_id', 'calories', 'protein', 'carbs', 'fat', 'allowed_calorie_overage', ...TIMESTAMPS],
  shopping_checks: ['user_id', 'selection_key', 'checked', 'deleted_at', ...TIMESTAMPS],
}

const JSON_COLUMNS = {
  global_products: ['units'],
  products: ['units'],
  meals: ['tags', 'ingredients'],
  day_plans: ['slots'],
  shopping_checks: ['checked'],
}

export function parseJsonColumn(value, fallback) {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function decodeLocalRow(table, row) {
  if (!row) return null
  const result = { ...row }
  for (const column of JSON_COLUMNS[table] ?? []) {
    result[column] = parseJsonColumn(
      result[column],
      column === 'checked' ? {} : [],
    )
  }
  return result
}

export function encodeLocalRow(table, row) {
  const result = { ...row }
  delete result.user_id
  for (const column of JSON_COLUMNS[table] ?? []) {
    if (typeof result[column] !== 'string') {
      result[column] = JSON.stringify(
        result[column] ?? (column === 'checked' ? {} : []),
      )
    }
  }
  if (table === 'user_settings') result.id = 1
  return result
}

export function toRemoteRow(table, localRow) {
  const row = decodeLocalRow(table, localRow)
  delete row.id
  if (table !== 'user_settings') {
    const key = TABLE_KEYS[table]
    row[key] = localRow[key]
  }
  delete row.sync_status
  delete row.server_updated_at
  delete row.user_id
  return row
}

export function fromRemoteRow(table, remoteRow) {
  const row = {}
  for (const column of REMOTE_COLUMNS[table] ?? Object.keys(remoteRow)) {
    if (column !== 'user_id' && column in remoteRow) row[column] = remoteRow[column]
  }
  if (table === 'user_settings') row.id = 1
  row.sync_status = 'synced'
  return encodeLocalRow(table, row)
}

export function getEntityId(table, row) {
  if (table === 'user_settings') return '1'
  return String(row[TABLE_KEYS[table]])
}

export function buildUpsertSql(table, row) {
  const encoded = encodeLocalRow(table, row)
  const columns = Object.keys(encoded).filter(
    (column) => column !== 'user_id',
  )
  const key = TABLE_KEYS[table]
  const updates = columns
    .filter((column) => column !== key)
    .map((column) => `${column}=excluded.${column}`)
    .join(', ')
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')})
      ON CONFLICT(${key}) DO UPDATE SET ${updates}`,
    params: columns.map((column) => encoded[column]),
  }
}

export async function upsertLocalRow(tx, table, row) {
  const statement = buildUpsertSql(table, row)
  await tx.run(statement.sql, statement.params)
}
