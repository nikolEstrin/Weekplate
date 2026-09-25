import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const root = resolve(import.meta.dirname, '..', '..')
const migrationsDirectory = join(root, 'supabase', 'migrations')
const userA = '11111111-1111-4111-8111-111111111111'
const userB = '22222222-2222-4222-8222-222222222222'
const productA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const productB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
let db
let seedSql

async function asUser(userId, sql) {
  await db.exec('set role authenticated')
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
    return await db.query(sql)
  } finally {
    await db.exec('reset role')
  }
}

async function asUserExec(userId, sql) {
  await db.exec('set role authenticated')
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
    return await db.exec(sql)
  } finally {
    await db.exec('reset role')
  }
}

async function asAnon(sql) {
  await db.exec('set role anon')
  try {
    return await db.query(sql)
  } finally {
    await db.exec('reset role')
  }
}

before(async () => {
  db = new PGlite()
  await db.exec(`
    create schema auth;
    create role anon nologin;
    create role authenticated nologin;
    create table auth.users (
      id uuid primary key,
      email text
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    set search_path = ''
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    insert into auth.users (id, email) values
      ('${userA}', 'a@example.com'),
      ('${userB}', 'b@example.com');
  `)

  const files = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = await readFile(join(migrationsDirectory, file), 'utf8')
    await db.exec(sql)
    if (file.includes('seed_global_products')) seedSql = sql
  }
})

after(async () => {
  await db?.close()
})

test('global catalog is readable only by authenticated users and seed is idempotent', async () => {
  const first = await asUser(userA, 'select count(*)::int as count from public.global_products')
  assert.equal(first.rows[0].count, 54)

  await db.exec(seedSql)
  const second = await asUser(userA, 'select count(*)::int as count from public.global_products')
  assert.equal(second.rows[0].count, 54)

  await assert.rejects(() => asAnon('select * from public.global_products'))
  for (const statement of [
    `insert into public.global_products (
      id, name, calories_per_100g, protein_per_100g, carbs_per_100g,
      fat_per_100g, units, sort_order
    ) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'x', 0, 0, 0, 0, '[]', 99)`,
    `update public.global_products set name = 'x'`,
    `delete from public.global_products`,
  ]) {
    await assert.rejects(() => asUser(userA, statement))
  }
})

test('private tables isolate SELECT, UPDATE, and DELETE for every aggregate', async () => {
  await asUserExec(userB, `
    insert into public.products values (
      '${userA}', '${productB}', 'B product', 1, 1, 1, 1, '[]', null,
      '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', now()
    );
    insert into public.meals values (
      '${userA}', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc', 'B meal',
      array['lunch'], '[]', null, '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z', now()
    );
    insert into public.day_plans values (
      '${userA}', '2026-01-01', '{"breakfast":[],"lunch":[],"dinner":[],"snacks":[]}',
      null, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', now()
    );
    insert into public.user_settings values (
      '${userA}', 2000, 100, 200, 60, 100,
      '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', now()
    );
    insert into public.shopping_checks values (
      '${userA}', 'b-selection', '{}', null, '2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z', now()
    );
  `)

  const tables = ['products', 'meals', 'day_plans', 'user_settings', 'shopping_checks']
  for (const table of tables) {
    const selected = await asUser(userA, `select * from public.${table}`)
    assert.equal(selected.rows.length, 0, `${table} leaked another user's row`)
    const updated = await asUser(
      userA,
      `update public.${table} set updated_at = '2027-01-01T00:00:00Z' returning *`,
    )
    assert.equal(updated.rows.length, 0, `${table} updated another user's row`)
    const deleted = await asUser(userA, `delete from public.${table} returning *`)
    assert.equal(deleted.rows.length, 0, `${table} deleted another user's row`)
    await assert.rejects(() => asAnon(`select * from public.${table}`))
  }
})

test('insert ownership is forced to the authenticated user', async () => {
  await asUser(userA, `
    insert into public.products (
      user_id, id, name, calories_per_100g, protein_per_100g,
      carbs_per_100g, fat_per_100g, units, updated_at
    ) values (
      '${userB}', '${productA}', 'A product', 1, 2, 3, 4, '[]',
      '2026-02-01T00:00:00Z'
    )
  `)
  const result = await asUser(
    userA,
    `select user_id::text as user_id from public.products where id = '${productA}'`,
  )
  assert.equal(result.rows[0].user_id, userA)
})

test('last-write-wins, immutable ownership, and future timestamp clamp work', async () => {
  await asUser(userA, `
    update public.products
    set name = 'stale', updated_at = '2025-01-01T00:00:00Z'
    where id = '${productA}'
  `)
  let result = await asUser(
    userA,
    `select name from public.products where id = '${productA}'`,
  )
  assert.equal(result.rows[0].name, 'A product')

  await asUser(userA, `
    update public.products
    set name = 'newer', user_id = '${userB}', updated_at = '2026-03-01T00:00:00Z'
    where id = '${productA}'
  `)
  result = await asUser(
    userA,
    `select name, user_id::text as user_id from public.products where id = '${productA}'`,
  )
  assert.deepEqual(result.rows[0], { name: 'newer', user_id: userA })

  await asUser(userA, `
    update public.products
    set updated_at = '2999-01-01T00:00:00Z'
    where id = '${productA}'
  `)
  result = await asUser(
    userA,
    `select updated_at <= clock_timestamp() + interval '5 minutes 1 second' as clamped
     from public.products where id = '${productA}'`,
  )
  assert.equal(result.rows[0].clamped, true)
})

test('deleting an auth user cascades all private aggregates', async () => {
  await db.exec(`delete from auth.users where id = '${userB}'`)
  for (const table of ['products', 'meals', 'day_plans', 'user_settings', 'shopping_checks']) {
    const result = await db.query(
      `select count(*)::int as count from public.${table} where user_id = $1`,
      [userB],
    )
    assert.equal(result.rows[0].count, 0, `${table} did not cascade`)
  }
})

test('client upsert path skips stale writes and cannot hijack another user row', async () => {
  const upsert = (name, updatedAt, ownerClaim) => `
    insert into public.meals (user_id, id, name, tags, ingredients, updated_at)
    values ('${ownerClaim}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '${name}',
      array['dinner'], '[]', '${updatedAt}')
    on conflict (user_id, id) do update set
      name = excluded.name, tags = excluded.tags,
      ingredients = excluded.ingredients, updated_at = excluded.updated_at
  `
  await asUser(userA, upsert('v2', '2026-05-02T00:00:00Z', userA))
  await asUser(userA, upsert('v1-stale', '2026-05-01T00:00:00Z', userA))
  let rows = await asUser(userA, `select name from public.meals where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'`)
  assert.equal(rows.rows[0].name, 'v2')

  await asUser(userA, upsert('v3', '2026-05-03T00:00:00Z', userA))
  rows = await asUser(userA, `select name from public.meals where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'`)
  assert.equal(rows.rows[0].name, 'v3')

  const userD = '44444444-4444-4444-8444-444444444444'
  await db.exec(`insert into auth.users (id, email) values ('${userD}', 'd@example.com')`)
  await asUser(userD, upsert('hijack', '2027-01-01T00:00:00Z', userA))
  rows = await asUser(userA, `select name from public.meals where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'`)
  assert.equal(rows.rows[0].name, 'v3', 'another user overwrote A row via upsert')
  const own = await asUser(userD, `select name from public.meals`)
  assert.deepEqual(own.rows.map((row) => row.name), ['hijack'])
})

test('authenticated role without a user claim cannot write or read private rows', async () => {
  await db.exec('set role authenticated')
  try {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    await assert.rejects(() => db.exec(`
      insert into public.products (id, name, calories_per_100g, protein_per_100g,
        carbs_per_100g, fat_per_100g, units, updated_at)
      values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'x', 0, 0, 0, 0, '[]', now())
    `))
    const rows = await db.query('select * from public.products')
    assert.equal(rows.rows.length, 0)
  } finally {
    await db.exec('reset role')
  }
})

test('global product IDs can be overridden independently per user', async () => {
  const global = await db.query(
    'select id::text as id from public.global_products order by sort_order limit 1',
  )
  const globalId = global.rows[0].id
  await asUser(userA, `
    insert into public.products (
      user_id, id, name, calories_per_100g, protein_per_100g,
      carbs_per_100g, fat_per_100g, units, updated_at
    ) values (
      '${userA}', '${globalId}', 'override A', 1, 1, 1, 1, '[]', now()
    )
  `)

  const userC = '33333333-3333-4333-8333-333333333333'
  await db.exec(`insert into auth.users (id, email) values ('${userC}', 'c@example.com')`)
  await asUser(userC, `
    insert into public.products (
      user_id, id, name, calories_per_100g, protein_per_100g,
      carbs_per_100g, fat_per_100g, units, updated_at
    ) values (
      '${userA}', '${globalId}', 'override C', 2, 2, 2, 2, '[]', now()
    )
  `)

  const a = await asUser(userA, `select name from public.products where id = '${globalId}'`)
  const c = await asUser(userC, `select name from public.products where id = '${globalId}'`)
  assert.equal(a.rows[0].name, 'override A')
  assert.equal(c.rows[0].name, 'override C')
})
