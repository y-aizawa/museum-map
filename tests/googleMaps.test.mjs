import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { googleMapsUrl, createGoogleMapsAction } from '../src/googleMaps.ts'

const facility = { name: 'Test museum', address: 'Tokyo', latitude: 35.7, longitude: 139.7 }
const original = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Test museum Tokyo 35.7,139.7')}`
const url = 'https://www.google.com/maps/place/Test+museum/data=!4m2!3m1!1sverified'
const reviewed = (review) => ({ ...facility, google_maps: review })

test('unreviewed facilities keep the exact original search fallback', () => {
  assert.equal(googleMapsUrl(facility), original)
  assert.match(googleMapsUrl({ ...facility, address: '' }), /query=Test%20museum%2035.7%2C139.7$/)
})

test('verified destination URL wins over the fallback and optional Place ID', () => {
  assert.equal(googleMapsUrl(reviewed({ verification: 'verified', url, place_id: 'ChIJVerified' })), url)
})

test('verified Place ID without a URL uses the official Maps URL parameter', () => {
  const parsed = new URL(googleMapsUrl(reviewed({ verification: 'verified', place_id: 'ChIJVerified_123' })))
  assert.equal(parsed.searchParams.get('query'), 'Test museum Tokyo')
  assert.equal(parsed.searchParams.get('query_place_id'), 'ChIJVerified_123')
})

test('unverified candidates never replace the fallback even when they include a URL or Place ID', () => {
  for (const verification of ['unconfirmed', 'ambiguous', 'wrong_place', 'not_found', 'unreviewed', '']) {
    assert.equal(googleMapsUrl(reviewed({ verification, url, place_id: 'ChIJCandidate' })), original)
  }
})

test('unsafe and malformed destinations fail closed to the search fallback', () => {
  for (const badUrl of ['javascript:alert(1)', 'https://google.com.evil.test/maps/place/X',
    'https://www.google.com@evil.test/maps/', 'https://evil.test/', 'http://www.google.com/maps/place/X',
    'https://www.google.com/search?q=X', 'https://www.google.com:8080/maps/', 'invalid']) {
    assert.equal(googleMapsUrl(reviewed({ verification: 'verified', url: badUrl })), original)
  }
  assert.equal(googleMapsUrl(reviewed({ verification: 'verified', place_id: 'bad&id' })), original)
  assert.equal(googleMapsUrl(reviewed({ verification: 'verified' })), original)
})

test('published Maps fields contain only explicit link decisions and no audit notes', () => {
  const dataset = JSON.parse(readFileSync(new URL('../src/data/museums.json', import.meta.url)))
  const publicDataset = JSON.parse(readFileSync(new URL('../public/facilities.json', import.meta.url)))
  assert.deepEqual(publicDataset, dataset)
  for (const item of dataset.facilities) {
    const review = item.google_maps
    if (!review) continue
    assert.ok(Object.keys(review).every(key => ['verification', 'checked_on', 'url', 'place_id', 'destination_scope'].includes(key)))
    assert.ok(['verified', 'blocked'].includes(review.verification))
    if (review.verification === 'blocked') {
      assert.equal(googleMapsUrl(item), null)
      assert.equal(review.url, undefined)
      assert.equal(review.place_id, undefined)
      continue
    }
    assert.equal(googleMapsUrl(item), review.url || googleMapsUrl({ ...item, google_maps: { ...review, url: undefined } }))
  }
})

test('known wrong destinations never fall back, regardless of operating status', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: tagName => ({ tagName }) }
  try {
    for (const operational_status of ['active', 'suspended', 'closed']) {
      const item = { ...facility, operational_status, google_maps: { verification: 'blocked' } }
      const before = structuredClone(item)
      for (let i = 0; i < 3; i++) {
        assert.equal(googleMapsUrl(item), null)
        const action = createGoogleMapsAction(item)
        assert.equal(action.tagName, 'button')
        assert.equal(action.disabled, true)
        assert.equal(action.textContent, 'Googleマップ確認中')
        assert.equal(action.href, undefined)
        assert.equal(action.onclick, undefined)
        assert.deepEqual(item, before)
      }
      const action = createGoogleMapsAction({ ...item, google_maps: { verification: 'verified', url } })
      assert.equal(action.href, url)
      assert.equal(action.tagName, 'a')
      assert.equal(action.target, '_blank')
      assert.equal(action.rel, 'noreferrer')
      assert.equal(createGoogleMapsAction({ ...item, google_maps: { verification: 'verified', url, destination_scope: 'building' } }).textContent, 'Googleマップ（建物）')
      assert.equal(createGoogleMapsAction({ ...item, google_maps: { verification: 'verified', url, destination_scope: 'location' } }).textContent, 'Googleマップ（所在地）')
      assert.equal(createGoogleMapsAction({ ...item, google_maps: { verification: 'verified', url, destination_scope: 'historical_location' } }).textContent, 'Googleマップ（旧所在地）')
      assert.equal(createGoogleMapsAction({ ...item, google_maps: undefined }).href, original)
    }
    assert.equal(googleMapsUrl(reviewed({ verification: 'blocked', url, place_id: 'stale' })), null)
  } finally { globalThis.document = originalDocument }
})
