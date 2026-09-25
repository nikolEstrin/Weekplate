export const migrations = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
      `CREATE TABLE IF NOT EXISTS global_products (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, calories_per_100g REAL NOT NULL,
        protein_per_100g REAL NOT NULL, carbs_per_100g REAL NOT NULL,
        fat_per_100g REAL NOT NULL, units TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL DEFAULT 0, deleted_at TEXT, server_updated_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY, name TEXT, calories_per_100g REAL, protein_per_100g REAL,
        carbs_per_100g REAL, fat_per_100g REAL, units TEXT NOT NULL DEFAULT '[]',
        created_at TEXT, updated_at TEXT, deleted_at TEXT, server_updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      )`,
      `CREATE TABLE IF NOT EXISTS meals (
        id TEXT PRIMARY KEY, name TEXT, tags TEXT NOT NULL DEFAULT '[]',
        ingredients TEXT NOT NULL DEFAULT '[]', created_at TEXT, updated_at TEXT,
        deleted_at TEXT, server_updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      )`,
      `CREATE TABLE IF NOT EXISTS day_plans (
        date_key TEXT PRIMARY KEY, slots TEXT NOT NULL, created_at TEXT,
        updated_at TEXT, deleted_at TEXT, server_updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      )`,
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY CHECK(id=1), calories REAL NOT NULL,
        protein REAL NOT NULL, carbs REAL NOT NULL, fat REAL NOT NULL,
        allowed_calorie_overage INTEGER NOT NULL DEFAULT 100,
        created_at TEXT, updated_at TEXT, server_updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      )`,
      `CREATE TABLE IF NOT EXISTS shopping_checks (
        selection_key TEXT PRIMARY KEY, checked TEXT NOT NULL DEFAULT '{}',
        created_at TEXT, updated_at TEXT, deleted_at TEXT, server_updated_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      )`,
      `CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, operation TEXT NOT NULL, created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
        next_attempt_at TEXT, UNIQUE(entity_type, entity_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sync_queue_next_attempt
        ON sync_queue(next_attempt_at)`,
      `CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at)`,
      `CREATE INDEX IF NOT EXISTS idx_meals_deleted_at ON meals(deleted_at)`,
    ],
  },
]

export async function migrateDatabase(db) {
  const rows = await db.query('PRAGMA user_version')
  const current = Number(rows[0]?.user_version ?? 0)
  for (const migration of migrations) {
    if (migration.version <= current) continue
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) await tx.run(statement)
      await tx.run(`PRAGMA user_version = ${migration.version}`)
    })
  }
}
