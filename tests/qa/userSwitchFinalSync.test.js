import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, it } from 'node:test'
import { createNodeSqliteAdapter } from '../../src/db/nodeSqliteAdapter.js'
import { startDataSession, stopDataSession } from '../../src/services/dataSession.js'
import { addProduct } from '../../src/services/storage.js'
import { createFakeRemote } from '../sync/fakeRemote.js'

// Production uses ONE Supabase client (getSupabase() singleton); the JWT used
// for each request is whatever session the client holds at request time.
// When a deep link (exchangeCodeForSession / verifyOtp) switches the client to
// another account, AppRoot remounts DataSessionProvider and the old session's
// cleanup runs stop({ finalSync: true }) through that same client.
function sharedClientRemote(server, identity) {
  return {
    getUserId: async () => identity.userId,
    push: (table, rows) => server.forUser(identity.userId).push(table, rows),
    pull: (table, cursor, limit, options) =>
      server.forUser(identity.userId).pull(table, cursor, limit, options),
  }
}

const USER_A = 'aaaaaaaa-0000-4000-8000-0000000000a1'
const USER_B = 'bbbbbbbb-0000-4000-8000-0000000000b2'

let directory
let server
let net

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'weekplate-qa-switch-'))
  server = createFakeRemote()
  net = { online: true }
})

afterEach(async () => {
  await stopDataSession()
  await rm(directory, { recursive: true, force: true })
})

it('QA: final sync after the client switched accounts must not upload A data into B', async () => {
  const identity = { userId: USER_A }
  net.online = false
  const session = await startDataSession({
    userId: USER_A,
    remote: sharedClientRemote(server, identity),
    platform: { getIsOnline: () => net.online },
    adapterFactory: (name) =>
      createNodeSqliteAdapter(path.join(directory, `${name}.sqlite`)),
  })
  const secret = addProduct({
    name: 'A private product',
    caloriesPer100g: 1,
    proteinPer100g: 1,
    carbsPer100g: 1,
    fatPer100g: 1,
    units: [],
  }).product

  // Deep link for account B is handled: the shared client now holds B's session.
  identity.userId = USER_B
  net.online = true
  await session.stop()

  assert.equal(
    server.rows('products', USER_B).some((row) => row.id === secret.id),
    false,
    "user A's pending product was uploaded into user B's account",
  )
})
