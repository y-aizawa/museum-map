import assert from 'node:assert/strict'
import test from 'node:test'
import { createOfficialSiteAction, todayHoursText } from '../src/officialSite.ts'

test('official-site action depends on URL availability, not facility status', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: tagName => ({ tagName }) }
  try {
    for (const operational_status of ['active', 'suspended', 'closed']) {
      for (const official_url of [undefined, null, '', '  ', '\t\n']) {
        const facility = { operational_status, official_url }
        const before = structuredClone(facility)
        const action = createOfficialSiteAction(facility)
        assert.equal(action.tagName, 'button')
        assert.equal(action.type, 'button')
        assert.equal(action.disabled, true)
        assert.equal(action.textContent, '公式サイトなし')
        assert.equal(action.href, undefined)
        assert.equal(action.onclick, undefined)
        assert.deepEqual(facility, before)
        assert.equal(todayHoursText(facility, '—'), '本日の開館時間は未確認です')
        for (const today of ['10:00–17:00', '休館日', '休館中', '閉館済み']) assert.equal(todayHoursText(facility, today), today)
      }
      for (const official_url of ['https://example.org/museum/?q=1#visit', 'http://example.org/closed', '  https://example.org/  ']) {
        const action = createOfficialSiteAction({ operational_status, official_url })
        assert.equal(action.tagName, 'a')
        assert.equal(action.href, official_url.trim())
        assert.equal(action.textContent, '公式サイト')
        assert.equal(action.target, '_blank')
        assert.equal(action.rel, 'noreferrer')
        assert.equal(todayHoursText({ operational_status, official_url }, '—'), '公式サイトでご確認ください')
        assert.equal(todayHoursText({ operational_status, official_url }, '10:00–17:00'), '10:00–17:00')
      }
    }
  } finally {
    globalThis.document = originalDocument
  }
})

test('reviewed visitor guides retain their source label and official links take priority', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: tagName => ({ tagName }) }
  try {
    const visitor_guide = { url: ' https://example.org/visit/ ', label: ' 地域観光ガイド ' }
    for (const operational_status of ['active', 'unknown', 'suspended', 'closed']) {
      const facility = { official_url: '', visitor_guide, operational_status }
      const before = structuredClone(facility)
      for (let i = 0; i < 3; i++) {
        const action = createOfficialSiteAction(facility)
        assert.equal(action.tagName, 'a')
        assert.equal(action.href, 'https://example.org/visit/')
        assert.equal(action.textContent, '地域観光ガイド')
        assert.equal(action.target, '_blank')
        assert.equal(action.rel, 'noreferrer')
        assert.equal(todayHoursText(facility, '—'), '地域観光ガイドでご確認ください')
        for (const today of ['10:00–17:00', '休館日', '休館中', '閉館済み']) assert.equal(todayHoursText(facility, today), today)
      }
      assert.deepEqual(facility, before)
      const official = { ...facility, official_url: 'https://museum.example/' }
      assert.equal(createOfficialSiteAction(official).textContent, '公式サイト')
      assert.equal(createOfficialSiteAction(official).href, official.official_url)
      assert.equal(todayHoursText(official, '—'), '公式サイトでご確認ください')
    }
    for (const visitor_guide of [null, {url: '', label: '案内'}, {url: 'https://example.org/', label: ' '}]) {
      assert.equal(createOfficialSiteAction({visitor_guide}).disabled, true)
      assert.equal(todayHoursText({visitor_guide}, '—'), '本日の開館時間は未確認です')
    }
  } finally { globalThis.document = originalDocument }
})

test('Kojima published guide preserves group-only admission without fixed opening hours', async () => {
  const { readFile } = await import('node:fs/promises')
  const payload = JSON.parse(await readFile(new URL('../public/facilities.json', import.meta.url), 'utf8'))
  const facility = payload.facilities.find(row => row.id === 'facility:75332f24285904c5')
  assert.equal(facility.official_url, '')
  assert.deepEqual(facility.visitor_guide, {url: 'https://machida-guide.or.jp/post-875/', label: '町田市観光ガイド'})
  assert.equal(facility.reservation, 'required_group_only')
  assert.equal(facility.schedule_applicability, 'reservation_calendar')
  assert.deepEqual(facility.schedule?.weekly || [], [])
  assert.match(facility.schedule_summary, /申込制・団体のみ受付/)
  assert.doesNotMatch(facility.schedule_summary, /13:00|17:00/)
})
