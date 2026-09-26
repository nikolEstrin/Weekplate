# Legacy data migration

Before this migration, Weekplate stored everything in browser `localStorage`
(GitHub Pages website). Code: `src/services/legacyMigration.js`,
`src/services/backup.js`, `src/services/dataSession.js`.
Tests: `tests/migration/`.

## Important: website data does not appear in the iOS app automatically

`localStorage` belongs to a web origin. The iOS app runs at `capacitor://localhost`,
not at the old `github.io` origin, so the app **cannot read the old website's
storage**. Existing data moves in one of these ways:

1. **Full move (recommended):** open the old website in the browser that has the data,
   open the developer console, and run:

   ```js
   (() => {
     const data = {}
     for (const key of Object.keys(localStorage)) {
       if (!key.startsWith('weekplate_')) continue
       try { data[key] = JSON.parse(localStorage.getItem(key)) } catch { /* skip */ }
     }
     const link = document.createElement('a')
     link.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
     link.download = 'weekplate-legacy.json'
     link.click()
   })()
   ```

   Transfer the file to the iPhone (AirDrop, Files, or email). In the app go to
   Settings → "הנתונים שלי" → "שחזור מגיבוי מלא" and choose the file. This moves
   products, units, meals, plans, goals, shopping checks and hidden starter products.
2. **Library only:** the old website's "export library" file (products + meals) can
   be imported with the existing library import in Settings.

The automatic browser path (below) still exists for same-origin cases such as
running the web build locally during development.

## Legacy keys handled

| Key | Content |
|---|---|
| `weekplate_products` | products incl. copied starter products (starter units had random IDs) |
| `weekplate_meals` | meals; old ones may have `tag` (string, `other` → `snack`) instead of `tags` |
| `weekplate_goals` | goals; old ones lack `allowedCalorieOverage` (→ 100) |
| `weekplate_plans` | `{ date: { breakfast, lunch, dinner, snacks } }`; old primary slots may be single objects |
| `weekplate_today` | oldest flat "today" list → converted into today's date plan |
| `weekplate_shopping_purchased` | shopping checks per date selection |
| `weekplate_deleted_starter_products` | starter IDs the user deleted |
| `weekplate_migrations` | old local flags (ignored) |

## What the importer does

All steps run on a validated copy; the source is never modified.

1. **Validate** everything with the same validators as the app (`validateProduct`,
   `validateMeal` including nested-meal tree checks, goals, `normalizeDayPlan`).
   If the snapshot is structurally invalid, **nothing is imported**.
2. **Convert** legacy shapes: `tag` → `tags`, `weekplate_today` → today's plan,
   single-object slots → arrays, missing overage → default.
3. **Stable IDs:** non-UUID IDs (the old `Date.now()` fallback) are replaced by
   deterministic UUID v5 (`legacy:<kind>:<oldId>`), and every reference is rewritten:
   meal ingredients (`productId`, `unitId`, `mealId`), plan ingredients, `sourceMealId`,
   shopping item IDs. The same input always yields the same IDs.
4. **Starter products:**
   - a copied starter identical to the global product (name, nutrition, units by
     name + grams) creates no private row; its random legacy unit IDs are remapped to
     the global unit IDs in all references;
   - an edited starter becomes a private override (same ID);
   - starters missing from the legacy list (deleted, or skipped because a user
     product had the same name) become hidden markers.
   Together these make the visible product list identical to what the user had before.
5. **Insert if absent:** entities whose ID (or date / selection key) already exists in
   the account are left untouched and counted as skipped; goals are imported only if
   the account has none. The import never overwrites newer account data.
6. Everything is written in **one SQLite transaction** together with outbox entries,
   then memory is re-hydrated and a sync is requested. The cloud upload follows the
   normal sync rules (queued safely if offline).

## Idempotency and markers

- Browser source: meta key `legacy_import_v1` stores a hash of the imported
  snapshot; the same snapshot is not imported twice. Re-running with changed data
  only adds what is missing (insert if absent), so duplicates are impossible.
- `localStorage['weekplate_legacy_import_owner']` records which account received the
  browser data, so a second account signing in on the same browser does not import it.
- Legacy `localStorage` keys are **never deleted**. They can be removed in a future
  release once nobody needs them.
- Backup and file imports use the same importer without the marker (insert if absent).

## Failure behavior

If validation fails, nothing is written. If the SQLite transaction fails, it rolls
back completely. In both cases the original legacy data is unchanged and the user
sees an error. The report returned is `{ ok, counts, skipped, errors }`.

## Tests

`tests/migration/legacyFixture.test.js` uses a realistic fixture (starters with random
unit IDs, edited and deleted starters, a name collision, non-UUID custom products,
nested meals, legacy `tag`, legacy today list, single-object slots, snapshots with
multipliers and `baseIngredients`, goals without overage, shopping checks). It
verifies relationships, an identical visible catalog, idempotency, an unmodified
source, and that invalid input imports nothing. `legacyBackup.test.js` covers the
backup round-trip and rejection of malformed backups.
