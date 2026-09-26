# Weekplate

Weekplate is a Hebrew-first iOS meal-planning app: products with nutrition values
and custom units, meals and recipes, day/week/month planning, balance day, meal
swaps and shopping lists. It works offline and syncs across the user's devices.

- UI: React 19 + Vite (plain JavaScript), packaged into a native iOS app with Capacitor 8.
- On-device database: SQLite (`@capacitor-community/sqlite`), one file per signed-in user.
- Cloud: Supabase (email/password auth, Postgres with Row Level Security, one Edge Function).
- Sync: local-first writes with an outbox, last-write-wins per record, soft deletes.

There is no production website; production is the iOS app only.

## Development

Requires Node 24 (see `.nvmrc`).

```bash
npm install
cp .env.example .env     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key only)
npm run dev              # browser dev server (SQLite runs via jeep-sqlite/wasm)
```

To work on the UI without a Supabase project, put `VITE_DEV_LOCAL_ONLY=true` in
`.env` and leave the Supabase values empty. The app then runs with a local
development user and no sync. This mode only exists in `npm run dev`; production
builds don't contain it.

| Command | What it does |
|---|---|
| `npm test` | All tests: domain logic, SQLite + sync scenarios, legacy migration, RLS (Postgres via PGlite) |
| `npm run lint` | oxlint |
| `npm run build` | Production web assets in `dist/` |
| `npm run cap:sync` | Build and copy assets + plugins into the iOS project |
| `npm run ios:open` | Open `ios/App/App.xcodeproj` in Xcode (macOS) |

## Supabase setup

1. Create a project; copy the URL and publishable key into `.env`.
2. Apply `supabase/migrations/` (`npx supabase link --project-ref <ref> && npx supabase db push`).
   This creates the schema, RLS policies and the shared starter-product catalog.
3. Add `weekplate://auth/callback` to Auth redirect URLs.
4. Deploy the account-deletion function: `npx supabase functions deploy delete-account`.

The service-role key is only used inside the Edge Function (provided by Supabase)
and must never be put in `.env` or the app.

If you change `src/data/starterProducts.json`, run
`node scripts/generate-global-products-seed.mjs` and save the output as a **new** migration.

## iOS

```bash
npm run cap:sync && npm run ios:open
```

Set your signing Team in Xcode and run. CI (`.github/workflows/ios-build.yml`)
builds the app for the simulator on macOS without signing.
See [docs/IOS_APP_STORE_RELEASE.md](docs/IOS_APP_STORE_RELEASE.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Data contract](docs/DATA_CONTRACT.md) and [database schema](docs/DATABASE_SCHEMA.md)
- [Sync architecture](docs/SYNC_ARCHITECTURE.md)
- [Legacy data migration](docs/LEGACY_DATA_MIGRATION.md) (moving data from the old website)
- [iOS build and release](docs/IOS_APP_STORE_RELEASE.md)
- [Privacy audit](docs/APPLE_PRIVACY_AUDIT.md), [privacy policy draft](docs/PRIVACY_POLICY.md)
- [App Store metadata](docs/APP_STORE_METADATA.md)
- [Owner checklist](docs/APP_STORE_CHECKLIST.md)
