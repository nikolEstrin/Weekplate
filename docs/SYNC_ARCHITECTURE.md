# Sync architecture

Local-first: every change is saved on the device first and synchronized to
Supabase in the background. Code: `src/services/localState.js` (local writes),
`src/sync/syncEngine.js` (push/pull), `src/sync/supabaseRemote.js` (network),
`src/sync/rowMapping.js` (row ↔ entity mapping).

## Local writes

```
UI action → storage.js (synchronous, validates) → localState.setItem(key, value)
  → diff against the previous value, per entity
  → one SQLite transaction: upsert changed rows (sync_status='pending', updated_at)
                            + upsert one sync_queue entry per entity
  → debounced sync request (1.5 s)
```

- Writes run on one serialized promise chain, so they apply in order.
- A write is bound to the database of the session that made it; a write can never
  land in the next user's database after logout.
- `updated_at` is `max(now, previous updated_at + 1 ms)`, so an edit always sorts
  after the version it was made from, even on a device whose clock is behind.
- A starter product saved unchanged creates no private row.
- The app flushes pending writes when it moves to the background. The only data at
  risk is a change made in the last few milliseconds before the OS kills the process.
- A failed SQLite write puts the sync status into an error state visible in the UI.

## Outbox (`sync_queue`)

One entry per entity (`UNIQUE(entity_type, entity_id)`): repeated edits collapse
into one entry, and the pushed payload is read from the row at push time. Entries
have `attempt_count`, `last_error`, `next_attempt_at`. The outbox is stored in the
user's SQLite file, so it survives app restarts, offline periods and logout.

## Push

For each table: read due queue entries and their rows, then upsert them in one
batch through PostgREST (`onConflict: 'user_id,<key>'`). For each row the server
returns, the local row is updated with the server version (`sync_status='synced'`)
and the queue entry is removed, **but only if the local `updated_at` did not change
while the request was in flight** (otherwise the newer edit stays queued).

If a batch fails for a reason other than network or auth, rows are retried one at a
time; a row the server permanently rejects (for example a constraint violation) gets
its own backoff (1 min doubling, up to 24 h) and doesn't block the others. The UI
then shows "some changes were not saved to the cloud".

Retries are idempotent: pushing the same row twice is a no-op upsert with the same
`updated_at`, and IDs are client-generated UUIDs, so retries never duplicate data.
Imported files are normalized first (`src/utils/importIds.js`): UUIDs are lowercased
and old non-UUID ids map to deterministic UUID v5 values, with references rewritten.

**Identity guard.** The engine is bound to the user whose database it opened.
Before every push batch and pull page it checks that the current auth session
still belongs to that user, and it rejects any returned row with another `user_id`.
On a mismatch, or once the engine is stopped, the cycle aborts (`user_mismatch` /
`stopped`) and nothing more is sent or applied.

JSON columns are compared with key-order-independent (canonical) JSON, because
Postgres `jsonb` does not keep key order. Otherwise every pulled row would look
changed and be re-uploaded.

## Pull

Order per cycle: push first, then pull `global_products`, `products`, `meals`,
`day_plans`, `user_settings`, `shopping_checks`. Each table is pulled in pages of
200 ordered by `server_updated_at`, starting 60 s before the stored cursor. The
overlap absorbs commit-order skew between concurrent transactions; applying a row
twice is harmless. The cursor is saved in the same transaction as the page's rows.

## Conflict rule (deterministic last-write-wins per aggregate)

The aggregate with the greater `updated_at` wins:

| Situation | Result |
|---|---|
| Local row synced, remote row arrives | Remote applied. |
| Local row pending, remote `updated_at` is newer | Remote applied, local queue entry dropped (the newer edit wins). |
| Local row pending, remote is older or equal | Local kept; it is pushed and the server accepts it. |
| Push carries an older `updated_at` than the server | The server trigger skips it; the next pull brings the newer server version. |
| Device clock far ahead | The server clamps `updated_at` to now + 5 min, so a bad clock can't win forever. |

The unit of conflict is the whole aggregate: one product (with units), one meal
(with ingredients), one day's plan, the goals row, one shopping-selection's checks.
Simultaneous offline edits to the same day on two devices keep the later one.
This is an accepted v1 trade-off for a single-user app.

## Deletions

Deletes are tombstones: `deleted_at` is set and the row syncs like any other change.
Deleted rows disappear from the UI immediately and from other devices on their next pull.
Tombstones are kept indefinitely (they are tiny). They are required forever for
hidden starter products and prevent resurrection by stale devices. Hard deletion
only happens through account deletion (cloud FK cascade + deleting the local file).

## When sync runs

- start of a data session (login or app launch; awaited at most 10 s only on a
  device's first sync, otherwise in the background)
- app returns to the foreground (`appStateChange` active)
- network reconnects (`@capacitor/network`)
- 1.5 s after local changes (debounced)
- "סנכרון עכשיו" in Settings and "נסו שוב" in the error banner
- a final best-effort push (max 3 s) on logout

Only one sync cycle runs at a time; requests during a cycle queue exactly one follow-up.

## Failures and backoff

- Offline: status `offline`; no network calls until connectivity returns.
- Network or server error: exponential backoff 2 s → 5 min with ±25 % jitter; any
  explicit trigger (resume, reconnect, manual) retries immediately. There is no tight loop.
- Auth error: supabase-js refreshes the token; if refresh fails the user is signed
  out, the data session stops, and the queue stays in their database until they sign in again.

## Status shown to the user

`{ state: 'idle'|'syncing'|'offline'|'error', pendingCount, lastSyncedAt, errorCode }`.
A banner appears only when attention is needed (offline with unsynced changes, or
errors, with a retry button). Settings → "הנתונים שלי" always shows the current status.

## Tests

`tests/sync/` uses real SQLite (`node:sqlite`) with an in-memory fake server
(`fakeRemote.js`) that implements the same trigger rules. The tests cover online and
offline create, edit and delete; reconnect upload; server newer vs local newer;
stale push; duplicate delivery; queue coalescing; edit during an in-flight push;
restart with pending queue; logout with pending changes and re-login; second-device
pull; user isolation; starter override and hide; backoff; and clock skew.
The real trigger and RLS behavior is tested against Postgres (PGlite) in `tests/rls/`.
