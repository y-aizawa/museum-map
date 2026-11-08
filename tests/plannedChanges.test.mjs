import assert from 'node:assert/strict'
import test from 'node:test'
import { appendPlannedChanges, plannedChangeDate, plannedChangeDisplay } from '../src/plannedChanges.ts'
import { getOpeningPlan, matchesOperationalFilters } from '../src/openingPlans.ts'

const closure = { kind: 'closure', period: '2026-12', function_transfer: true, source_urls: ['https://example.org/notice'], checked_on: '2026-11-08' }
const suspension = { kind: 'suspension', date: '2026-11-24', reopening_date: '2027-01-29', source_urls: ['https://example.org/temporary'], checked_on: '2026-11-08' }

test('closure and suspension retain their dates, precision and separate meanings', () => {
  const display = plannedChangeDisplay(closure, '2026-11-08')
  assert.equal(display.label, '閉館予定')
  assert.equal(display.timing, '2026年12月')
  assert.deepEqual(display.details, ['機能移転を予定しています。', '最終公開日は未確定です。'])
  assert.equal(display.statusNote, '')
  const temporary = plannedChangeDisplay(suspension, '2026-11-08')
  assert.equal(temporary.label, '休館予定')
  assert.equal(temporary.timing, '2026年11月24日から')
  assert.deepEqual(temporary.details, ['2027年1月29日 再開予定'])
  assert.equal(plannedChangeDate('2027年度末'), '2027年度末')
})

test('passing a plan date asks for current confirmation instead of asserting closure or reopening', () => {
  for (const today of ['2026-11-24', '2027-02-01']) {
    assert.match(plannedChangeDisplay(suspension, today).statusNote, /実施状況/)
  }
  assert.equal(plannedChangeDisplay(closure, '2026-12-31').statusNote, '')
  assert.match(plannedChangeDisplay(closure, '2027-01-01').statusNote, /実施状況/)
})

test('a planned closure does not become an opening plan or change current filter visibility', () => {
  for (const operational_status of ['active', 'unknown']) {
    const facility = { operational_status, planned_changes: [closure, suspension] }
    const original = structuredClone(facility)
    assert.equal(getOpeningPlan(facility), null)
    assert.equal(matchesOperationalFilters(facility, ['active'], false), true)
    assert.equal(matchesOperationalFilters(facility, ['closed', 'suspended'], true), false)
    assert.deepEqual(facility, original)
  }
})

test('a known final public day is labeled separately from the closure date', () => {
  const display = plannedChangeDisplay({ ...closure, date: '2026-12-29', last_public_open_date: '2026-12-27' }, '2026-11-08')
  assert.equal(display.timing, '2026年12月29日')
  assert.ok(display.details.includes('最終公開日：2026年12月27日'))
})

test('detail renderer includes separate notices and safe source links, and omits empty sections', () => {
  class Element {
    children = []
    textContent = ''
    append(...children) { this.children.push(...children) }
    get text() { return this.textContent + this.children.map(child => child.text).join('') }
  }
  const originalDocument = globalThis.document
  globalThis.document = { createElement: () => new Element() }
  try {
    const root = new Element()
    appendPlannedChanges(root, [], '2026-11-08')
    assert.equal(root.children.length, 0)
    appendPlannedChanges(root, [closure, suspension], '2026-11-08')
    assert.equal(root.children.length, 1)
    assert.match(root.text, /閉館・休館の予定/)
    assert.match(root.text, /2026年12月 閉館予定/)
    assert.match(root.text, /2026年11月24日から 休館予定/)
    assert.doesNotMatch(root.text, /閉館済み|休館中|12月29日/)
    const sources = root.children[0].children[1].children.at(-1)
    assert.equal(sources.children[0].href, closure.source_urls[0])
    assert.equal(sources.children[0].rel, 'noopener noreferrer')
    assert.match(sources.text, /2026年11月8日確認/)
  } finally {
    globalThis.document = originalDocument
  }
})
