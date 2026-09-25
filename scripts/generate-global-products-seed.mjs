import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'src', 'data', 'starterProducts.json')

function timestamp() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14)
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

const requestedName = process.argv[2]
const fileName = requestedName || `${timestamp()}_seed_global_products.sql`
if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(fileName)) {
  throw new Error('Pass a timestamped migration filename, for example 20260925151000_seed_global_products.sql')
}

const outputPath = join(root, 'supabase', 'migrations', fileName)
if (existsSync(outputPath)) {
  throw new Error(`Refusing to overwrite existing migration: ${fileName}`)
}

const catalog = JSON.parse(await readFile(sourcePath, 'utf8'))
if (!Array.isArray(catalog.products)) {
  throw new Error('starterProducts.json must contain a products array')
}

const values = catalog.products.map((product, index) => {
  const units = sqlString(JSON.stringify(product.units ?? []))
  return `  (${sqlString(product.id)}::uuid, ${sqlString(product.name)}, ${Number(product.caloriesPer100g)}, ${Number(product.proteinPer100g)}, ${Number(product.carbsPer100g)}, ${Number(product.fatPer100g)}, ${units}::jsonb, ${index})`
})

const sql = `-- Generated from src/data/starterProducts.json.
-- When that JSON changes, run this script again to create a NEW timestamped migration.
insert into public.global_products (
  id, name, calories_per_100g, protein_per_100g, carbs_per_100g,
  fat_per_100g, units, sort_order
) values
${values.join(',\n')}
on conflict (id) do update set
  name = excluded.name,
  calories_per_100g = excluded.calories_per_100g,
  protein_per_100g = excluded.protein_per_100g,
  carbs_per_100g = excluded.carbs_per_100g,
  fat_per_100g = excluded.fat_per_100g,
  units = excluded.units,
  sort_order = excluded.sort_order,
  deleted_at = null,
  updated_at = clock_timestamp();
`

await writeFile(outputPath, sql, 'utf8')
console.log(`Wrote ${catalog.products.length} products to ${fileName}`)
