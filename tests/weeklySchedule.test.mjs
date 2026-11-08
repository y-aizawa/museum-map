import assert from 'node:assert/strict'
import test from 'node:test'
import { weeklyScheduleRows } from '../src/weeklySchedule.ts'

const rule = (days, open = '10:00', close = '18:00', extra = {}) => ({ days, open, close, ...extra })
const rows = (weekly, applicability = 'current_baseline') => weeklyScheduleRows({ weekly }, applicability, '2026-11-08')

test('one row per weekday, with a weekly closure in its own day', () => {
  const result = rows([rule(['mo', 'we', 'th', 'fr', 'sa', 'su'])])
  assert.deepEqual(result.map(row => row.day), ['月', '火', '水', '木', '金', '土', '日'])
  assert.equal(result[0].text, '10:00–18:00')
  assert.equal(result[1].text, '休館日')
})
test('split sessions and late opening keep their own day and last admission', () => {
  const result = rows([
    rule(['tu'], '13:00', '16:00'), rule(['tu'], '10:30', '12:00'),
    rule(['fr'], '10:00', '20:00', { last_admission: '19:30' }),
  ])
  assert.equal(result[1].text, '10:30–12:00\n13:00–16:00')
  assert.equal(result[4].text, '10:00–20:00（最終入館 19:30）')
})
test('ordinal-week restrictions remain visible on the weekday', () => {
  assert.equal(rows([rule(['th'], '10:00', '16:00', { weeks: [1, 2, 4, 5] })])[3].text,
    '第1・2・4・5 10:00–16:00')
})
test('variable schedules do not turn unspecified days into confirmed closures', () => {
  assert.equal(rows([rule(['th'])], 'reservation_calendar')[0].text, '公式サイトでご確認ください')
})
test('unknown and expired schedules do not produce a current weekly table', () => {
  assert.deepEqual(weeklyScheduleRows(null, 'unconfirmed', '2026-11-08'), [])
  const schedule = { weekly: [rule(['mo'])], valid_from: '2026-11-01', valid_through: '2026-11-30' }
  for (const date of ['2026-10-31', '2026-12-01']) assert.deepEqual(weeklyScheduleRows(schedule, 'current_exhibition', date), [])
  assert.equal(weeklyScheduleRows(schedule, 'current_exhibition', '2026-11-01').length, 7)
})
