import assert from 'node:assert/strict'
import test from 'node:test'
import { createOfficialSiteAction, todayHoursText } from '../src/officialSite.ts'

test('official-site action depends on URL availability, not facility status', () => {
  const originalDocument = globalThis.document
  globalThis.document = { createElement: tagName => ({ tagName }) }
  try {
    for (const operational_status of ['active', 'unknown', 'suspended', 'closed']) {
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
