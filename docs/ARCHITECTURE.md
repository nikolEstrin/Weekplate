# Weekplate architecture

Weekplate is an iOS application (Capacitor 8) built from a React 19 + Vite
single-page app. Production is iOS only; there is no production website.

```
             Supabase (Auth, Postgres + RLS, Edge Function delete-account)
                                   ▲
                                   │ HTTPS (supabase-js, user JWT)
                          src/sync/ (sync engine, outbox)
                                   ▲
                 SQLite, one database file per signed-in user (src/db/)
                                   ▲
      src/services/localState.js  (synchronous in-memory facade, hydrated from SQLite)
                                   ▲
      src/services/storage.js     (unchanged business rules + synchronous API)
                                   ▲
      React pages/components      (never talk to SQLite or Supabase directly)
```

## Layers

| Layer | Files | Responsibility |
|---|---|---|
| UI | `src/pages/`, `src/components/`, `src/App.jsx` | Screens. Read and write only through `storage.js` and the data-session context. |
| App shell | `src/main.jsx`, `src/AppRoot.jsx` | Native platform init, auth gate, deep-link auth callbacks, splash hide. |
| Auth | `src/auth/` | Supabase client, Keychain session storage, auth actions, `AuthProvider`/`useAuth`. |
| Data session | `src/components/DataSessionProvider.jsx`, `src/services/dataSession.js` | For the signed-in user: open their SQLite file, hydrate memory, run legacy import, start sync; stop/cleanup on logout and account deletion. |
| Domain | `src/services/storage.js`, `src/utils/` | All validation, planning, copy/swap/balance, nutrition. Synchronous, framework-free. |
| Local state bridge | `src/services/localState.js` | Implements the old `localStorage` key API in memory; turns each write into row-level SQLite changes + outbox entries. |
| Local database | `src/db/` | Adapter over `@capacitor-community/sqlite` (native; `jeep-sqlite` in browser dev), migrations, per-user files. |
| Sync | `src/sync/` | Push outbox, pull by server cursor, conflict rule, retries/backoff. |
| Platform | `src/platform/` | Capacitor wrappers: status bar, keyboard, splash, lifecycle, network, haptics, share. Safe no-ops on web. |
| Cloud | `supabase/` | Migrations (schema, triggers, RLS, global product seed), Edge Function. |

## Why a synchronous facade over SQLite

`storage.js` (≈3,800 lines of proven behavior: nested meals, planner snapshots,
multipliers, copy day/week, week-prep import, balance day, shopping list) has a
fully synchronous API and callers depend on immediate results. Capacitor SQLite
is asynchronous. Instead of rewriting every caller, the app:

1. opens the user's database and loads all their data into memory before the UI renders;
2. keeps `storage.js` reading/writing synchronously against memory;
3. persists each change to SQLite on a single serialized write chain (milliseconds later),
   in one transaction together with its outbox entry;
4. flushes pending writes when the app goes to the background.

Weekplate data is small (hundreds of rows), so holding it in memory is cheap.

## Startup

```
native boot → initPlatform() → React renders → AuthProvider restores session from Keychain
  → signed in: open SQLite for that user → hydrate memory → app usable
  → background sync (awaited, max 10 s, only on a device's very first sync so a new
    install doesn't show an empty account)
```

No network request blocks startup when local data exists.

## Ownership and isolation

- Cloud: every private row has `user_id`, set by a server trigger from `auth.uid()`;
  RLS restricts all operations to the owner. The client is never trusted for ownership.
- Device: one SQLite file per user (`weekplate_<userId>`). Logout stops sync, flushes,
  closes the file and clears all in-memory data; the next user opens a different file.
  The previous user's file stays on the device (so offline edits are not lost) and is
  only reachable by signing in as that user. Account deletion deletes the file.

## Authentication

Supabase email/password with PKCE. Sessions are stored in the iOS Keychain via
`@aparajita/capacitor-secure-storage` (browser dev uses localStorage). Auth emails
redirect to `weekplate://auth/callback`, handled by `AppRoot.jsx` via the Capacitor
`appUrlOpen` event. Account deletion calls the `delete-account` Edge Function, which
verifies the caller's JWT and deletes the auth user with the service role
(server-side only); all private rows cascade.

## Development-only local mode

With no Supabase env vars and `VITE_DEV_LOCAL_ONLY=true`, `npm run dev` runs with a
fixed local user and no sync. The branch is guarded by `import.meta.env.DEV` and is
absent from production bundles (verified by searching `dist/`).

See also: [DATA_CONTRACT.md](DATA_CONTRACT.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md),
[SYNC_ARCHITECTURE.md](SYNC_ARCHITECTURE.md), [LEGACY_DATA_MIGRATION.md](LEGACY_DATA_MIGRATION.md).
