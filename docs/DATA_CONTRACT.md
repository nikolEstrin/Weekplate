# Weekplate data contract (v1)

This is the binding contract between the cloud schema (Supabase), the local
SQLite database, the sync engine, and the existing React/`storage.js` layer.
Any change to this file must be reflected in all four.

## Decisions

| Topic | Decision |
|---|---|
| Backend | Supabase (Postgres + Auth + RLS + one Edge Function). No other backend exists in the repo. |
| Local DB | SQLite via `@capacitor-community/sqlite` (native iOS; `jeep-sqlite` on web dev). Tests use `node:sqlite`. |
| Local isolation | **One SQLite database file per auth user** (`weekplate_<userId>`). Logout closes it; the next user opens their own file. Account deletion deletes the file. |
| Aggregates | Each synced row is a whole aggregate. Product units, meal ingredients and plan slots are JSON columns inside their parent row. They are always edited atomically with the parent in the UI, so this avoids child-row ordering/FK problems during offline sync. |
| Ownership | Every private cloud row has `user_id uuid` = `auth.uid()`, set **by a server trigger** (client value ignored). RLS enforces `user_id = auth.uid()` for all operations. |
| Primary keys | Private tables: composite `(user_id, <key>)`. Keys are UUIDs (`day_plans` uses `date_key`, `shopping_checks` uses `selection_key`, `user_settings` uses `user_id`). |
| Conflicts | Last-write-wins per aggregate on the client-supplied `updated_at` (logical modification time). The server **ignores** an update whose `updated_at` is older than the stored one, so stale local data never overwrites newer server data. Server clamps `updated_at` to at most `now() + 5 minutes`. |
| Deletes | Soft delete: `deleted_at` is set and the row is upserted like any other change (tombstone). Tombstones are kept (tiny; also required forever for hidden global products). |
| Pull cursor | Server trigger sets `server_updated_at = clock_timestamp()` on every insert/update. Client pulls `server_updated_at > cursor - 60s` (overlap window absorbs commit-order skew; apply is idempotent). |
| Global catalog | `global_products` table, read-only to authenticated users, seeded idempotently from `src/data/starterProducts.json` (same IDs, including unit IDs). The same JSON is bundled in the app as the offline fallback before the first catalog pull. |
| Editing a global product | Creates a **private override**: a `products` row with the **same id** as the global product. The effective catalog shows the override instead of the global. Deleting a global product creates a private tombstone with that id (hides it). This preserves the existing starter-product edit/delete behavior without ever modifying `global_products`. |
| Timestamps | ISO-8601 UTC strings with milliseconds on the client (`new Date().toISOString()`); `timestamptz` in Postgres. Compare with `Date.parse`. |
| IDs | New IDs are RFC 4122 v4 UUIDs (`crypto.randomUUID()`, with a `crypto.getRandomValues` v4 fallback; never the old `Date.now()` fallback). Legacy non-UUID IDs are remapped deterministically during legacy import with UUID v5 (namespace `b0d6a3c2-6f1e-4c8a-9a51-8f2c7e1d4a90`, name `legacy:<kind>:<oldId>`) and every reference is rewritten. |
| Auth | Supabase email/password, PKCE flow. Session stored in iOS Keychain via `@aparajita/capacitor-secure-storage` (web dev: localStorage). |
| Deep link | Custom scheme `weekplate`. Auth redirect URL: `weekplate://auth/callback`. |
| Bundle id | `com.nikolestrin.weekplate` (placeholder until confirmed in Apple Developer account). |
| Env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key only). |

## Cloud schema (Postgres, schema `public`)

Common columns on every **private** table:

```
user_id           uuid        not null references auth.users(id) on delete cascade
updated_at        timestamptz not null   -- client logical modification time (LWW key)
created_at        timestamptz not null default now()  -- client may supply on insert; preserved on update
server_updated_at timestamptz not null default now()  -- set by trigger; pull cursor
```

### `global_products` (shared, read-only)
`id uuid pk, name text not null, calories_per_100g numeric, protein_per_100g numeric,
carbs_per_100g numeric, fat_per_100g numeric, units jsonb not null default '[]',
sort_order integer not null, deleted_at timestamptz null, created_at, updated_at,
server_updated_at`. RLS: `select` for `authenticated` only. No write policies.

### `products` (private; overrides/tombstones for global ids allowed)
`user_id, id uuid, name text, calories_per_100g, protein_per_100g, carbs_per_100g,
fat_per_100g numeric (>= 0), units jsonb not null default '[]', deleted_at timestamptz null`
+ common. PK `(user_id, id)`. Live rows require non-blank name.

### `meals`
`user_id, id uuid, name text, tags text[] not null, ingredients jsonb not null, deleted_at`
+ common. PK `(user_id, id)`. Allowed tags: `breakfast, lunch, dinner, snack, dessert`.

### `day_plans`
`user_id, date_key date, slots jsonb not null, deleted_at` + common. PK `(user_id, date_key)`.
`slots` = `{ breakfast: [], lunch: [], dinner: [], snacks: [] }` of planner-item snapshots
(exact shape as produced by `normalizeDayPlan` in `storage.js`).

### `user_settings`
`user_id pk, calories numeric, protein numeric, carbs numeric, fat numeric,
allowed_calorie_overage integer (0..500)` + common (no `deleted_at`).

### `shopping_checks`
`user_id, selection_key text, checked jsonb not null ('{}' = object itemId -> true), deleted_at`
+ common. PK `(user_id, selection_key)`.

### JSON shapes (camelCase inside JSON, identical to current app)
- `products.units`: `[{ id, name, grams }]`
- `meals.ingredients`: `[{ productId, quantityGrams, unitId?, unitName?, unitGrams? } | { mealId, mealMultiplier }]`
- `day_plans.slots`: planner items `{ id, type:'product'|'meal', name, ingredients[], tags?, sourceMealId?, mealMultiplier?, baseIngredients? }`

### Triggers (every private table)
- `BEFORE INSERT`: `new.user_id := auth.uid()` (raise if null); `new.created_at := coalesce(new.created_at, now())`;
  clamp `updated_at`; `new.server_updated_at := clock_timestamp()`.
- `BEFORE UPDATE`: `new.user_id := old.user_id`; `new.created_at := old.created_at`; clamp;
  **if `new.updated_at < old.updated_at` then `return null`** (stale write silently skipped);
  `new.server_updated_at := clock_timestamp()`.

Client writes use PostgREST upsert: `from(table).upsert(rows, { onConflict: 'user_id,<key>' })`.
Clients never send `user_id` meaningfully (the trigger overrides it) and never hard-delete.

### Account deletion
Edge Function `delete-account` (POST, user JWT). Verifies the caller with `auth.getUser(jwt)`,
then `auth.admin.deleteUser(user.id)` using the function's built-in service-role env var.
All private rows cascade. The service-role key never ships in the app.

## Local SQLite schema (per-user file)

Versioned with `PRAGMA user_version` and an ordered migrations list (never drop user data on upgrade).

```
meta(key TEXT PRIMARY KEY, value TEXT)              -- user_id, sync cursors ('cursor:<table>'), legacy_import_v1, ...
global_products(id TEXT PK, name, calories_per_100g REAL, protein_per_100g REAL, carbs_per_100g REAL,
                fat_per_100g REAL, units TEXT(json), sort_order INTEGER, deleted_at TEXT, server_updated_at TEXT)
products(id TEXT PK, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g,
         units TEXT(json), created_at TEXT, updated_at TEXT, deleted_at TEXT, server_updated_at TEXT,
         sync_status TEXT NOT NULL DEFAULT 'pending')          -- 'pending' | 'synced'
meals(id TEXT PK, name, tags TEXT(json), ingredients TEXT(json), created_at, updated_at, deleted_at,
      server_updated_at, sync_status)
day_plans(date_key TEXT PK, slots TEXT(json), created_at, updated_at, deleted_at, server_updated_at, sync_status)
user_settings(id INTEGER PK CHECK(id=1), calories, protein, carbs, fat, allowed_calorie_overage,
              created_at, updated_at, server_updated_at, sync_status)
shopping_checks(selection_key TEXT PK, checked TEXT(json), created_at, updated_at, deleted_at,
                server_updated_at, sync_status)
sync_queue(id INTEGER PK AUTOINCREMENT, entity_type TEXT, entity_id TEXT, operation TEXT,
           created_at TEXT, attempt_count INTEGER DEFAULT 0, last_error TEXT, next_attempt_at TEXT,
           UNIQUE(entity_type, entity_id))   -- coalesces repeated edits; payload read from row at push time
```

Indexes: `sync_queue(next_attempt_at)`, `products(deleted_at)`, `meals(deleted_at)`.

## Bridge to `storage.js` (sync API preserved)

`storage.js` keeps all business logic and its synchronous API. Its `localStorage` calls are
replaced by a synchronous in-memory key/value facade (`src/services/localState.js`) exposing
`getItem/setItem/removeItem` for the **same legacy key names**:

| Key | Hydrated from |
|---|---|
| `weekplate_products` | effective catalog: live globals by `sort_order` (replaced in place by a private override with the same id; omitted if privately tombstoned), then live private non-global products by `created_at, id` |
| `weekplate_deleted_starter_products` | ids of private tombstones that match a global id |
| `weekplate_meals` | live meals by `created_at, id` |
| `weekplate_goals` | `user_settings` (absent -> storage.js defaults) |
| `weekplate_plans` | live `day_plans` as `{ date_key: slots }` |
| `weekplate_shopping_purchased` | live `shopping_checks` as `{ selection_key: checked }` |
| `weekplate_migrations` | constant `{ meals_tags_v1: true, today_to_plans_v1: true }` (legacy migrations happen in the importer) |

`setItem(key, json)` diffs the new value against the previous in-memory value **per entity**
and, for each changed entity, writes the SQLite row (`updated_at = now`, `sync_status='pending'`)
and upserts a `sync_queue` entry inside one transaction on a single serialized write chain.
A product equal to its global counterpart with no existing private row is **not** written.
Removed entities become tombstones. After a remote pull, the facade re-hydrates affected keys
from SQLite (without enqueueing) and notifies subscribers so React pages re-read.

Import-time side effects in `storage.js` (`ensureMigrations(); ensureStarterProducts();`)
are removed; the data session calls the needed initialization explicitly after hydration.

## Sync rules

- Push: read queued rows (due by `next_attempt_at`), batch per table, upsert. On success
  remove queue entries **only if the row's `updated_at` is unchanged since it was read**
  (otherwise keep it queued), set `sync_status='synced'`.
- Pull (per table, paged): for each remote row, if no local row or local is `synced` ->
  apply. If local is `pending`: apply remote and drop the queue entry only when
  `remote.updated_at > local.updated_at`; otherwise keep local (it will be pushed).
- Order per cycle: push, then pull `global_products`, `products`, `meals`, `day_plans`,
  `user_settings`, `shopping_checks`.
- Triggers: data session start (login/launch), app resume, network regained, after local
  writes (debounced ~1.5 s), manual retry. Failures: exponential backoff 2 s -> 5 min with
  jitter; never a tight loop. Auth errors -> session refresh; if refresh fails -> signed out.
- Status exposed to UI: `{ state: 'idle'|'syncing'|'offline'|'error', pendingCount, lastSyncedAt, errorCode }`.
