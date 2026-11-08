import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { currentComponentScheduleNotes, appendComponentScheduleNotes } from '../src/componentSchedule.ts'

const note = { scope: '3階ギャラリー', text: '平日9:00〜19:00。他階は未確認。' }
test('supplement remains independent of unknown whole-facility hours', () => {
  const facility = { operational_status: 'active', schedule_applicability: 'unconfirmed', schedule: null, component_schedule_notes: [note] }
  const before = structuredClone(facility)
  assert.deepEqual(currentComponentScheduleNotes(facility, '2026-11-09'), [note])
  assert.deepEqual(facility, before)
  for (const operational_status of ['suspended', 'closed']) {
    assert.deepEqual(currentComponentScheduleNotes({ ...facility, operational_status }, '2026-11-09'), [])
  }
  assert.deepEqual(currentComponentScheduleNotes({ ...facility, opening_plan: { kind: 'opening' } }, '2026-11-09'), [])
})
test('component periods include boundaries but not stale or future hours', () => {
  const facility = { operational_status: 'active', component_schedule_notes: [{ ...note, valid_from: '2026-11-01', valid_through: '2026-11-30' }] }
  for (const date of ['2026-11-01', '2026-11-30']) assert.equal(currentComponentScheduleNotes(facility, date).length, 1)
  for (const date of ['2026-10-31', '2026-12-01']) assert.deepEqual(currentComponentScheduleNotes(facility, date), [])
  assert.deepEqual(currentComponentScheduleNotes({ operational_status: 'active' }, '2026-11-09'), [])
})
test('component scope and guidance render as text with no disclosure interaction', () => {
  const previous = globalThis.document
  const element = tag => ({ tag, children: [], append(...nodes) { this.children.push(...nodes) } })
  globalThis.document = { createElement: element }
  try {
    const root = element('root')
    appendComponentScheduleNotes(root, [note])
    assert.equal(root.children[0].children[0].textContent, note.scope)
    assert.equal(root.children[0].children[1].textContent, note.text)
    assert.equal(root.children[0].tag, 'div')
  } finally { globalThis.document = previous }
})
test('News Art uses official-site confirmation without publishing individual floor hours', async () => {
  const payload = JSON.parse(await readFile(new URL('../public/facilities.json', import.meta.url), 'utf8'))
  const facility = payload.facilities.find(row => row.id === 'facility:8b5992f1046691c7')
  assert.equal(facility.schedule_applicability, 'unconfirmed')
  assert.equal(facility.schedule, null)
  assert.equal(facility.schedule_display, 'official_site_only')
  assert.equal(facility.schedule_summary, '開館時間は公式サイトでご確認ください')
  assert.equal(facility.component_schedule_notes, undefined)
  assert.deepEqual(currentComponentScheduleNotes(facility, '2026-11-09'), [])
  assert.deepEqual(currentComponentScheduleNotes({ ...facility, component_schedule_notes: [note] }, '2026-11-09'), [])
})
