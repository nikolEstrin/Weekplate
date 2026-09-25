import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import starterProducts from '../../src/data/starterProducts.json' with { type: 'json' }
import {
  isUuid,
  uuidV4,
  uuidV5,
} from '../../src/utils/uuid.js'

const namespace = 'b0d6a3c2-6f1e-4c8a-9a51-8f2c7e1d4a90'

function referenceV5(name) {
  const namespaceBytes = Buffer.from(namespace.replaceAll('-', ''), 'hex')
  const digest = createHash('sha1')
    .update(namespaceBytes)
    .update(name)
    .digest()
    .subarray(0, 16)
  digest[6] = (digest[6] & 0x0f) | 0x50
  digest[8] = (digest[8] & 0x3f) | 0x80
  const hex = digest.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

describe('UUID helpers', () => {
  it('generates RFC 4122 v4 UUIDs', () => {
    assert.match(uuidV4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]/)
  })

  it('matches node crypto and deterministic starter unit IDs', () => {
    const product = starterProducts.products[0]
    const unit = product.units[0]
    const name = `starter-unit:${product.id}:0:${unit.name}`
    assert.equal(uuidV5(name, namespace), referenceV5(name))
    assert.equal(uuidV5(name, namespace), unit.id)
    assert.equal(isUuid(unit.id), true)
  })
})
