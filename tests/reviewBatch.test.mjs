import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { reviewScope } from '../src/reviewBatch.ts'

const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const batches = [{ id: 'one', label: 'one', facility_ids: ['c', 'a'] }]
test('normal map retains all facilities; review map cannot leak other facilities', () => {
  assert.deepEqual(reviewScope(all, null, batches).items, all)
  const scope = reviewScope(all, 'one', batches)
  assert.deepEqual(scope.items.map(item => item.id), ['a', 'c'])
  assert.deepEqual(scope.batch.facility_ids, ['c', 'a'])
})
test('unknown or invalid review requests fail closed', () => {
  for (const id of ['', 'missing']) assert.equal(reviewScope(all, id, batches).items.length, 0)
  assert.match(reviewScope(all, 'missing', batches).error, /ありません/)
  assert.equal(reviewScope(all, 'one', [{ ...batches[0], facility_ids: ['missing'] }]).items.length, 0)
  assert.equal(reviewScope(all, 'one', [{ ...batches[0], facility_ids: ['a', 'a'] }]).items.length, 0)
})
test('published manifests match the current dataset and preserve unique numbering', () => {
  const dataset = JSON.parse(readFileSync(new URL('../src/data/museums.json', import.meta.url)))
  const manifests = JSON.parse(readFileSync(new URL('../src/data/reviewBatches.json', import.meta.url)))
  for (const batch of manifests) {
    const scope = reviewScope(dataset.facilities, batch.id, manifests)
    assert.equal(scope.error, '')
    assert.equal(scope.items.length, batch.facility_ids.length)
  }
})
