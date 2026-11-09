import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { matchesOperationalFilters, getOpeningPlan } from '../src/openingPlans.ts'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
test('unknown status is separate from open, closed and suspended filters', () => {
  const facility = { operational_status: 'unknown' }
  assert.equal(matchesOperationalFilters(facility, ['active'], false), false)
  assert.equal(matchesOperationalFilters(facility, ['closed', 'suspended'], false), false)
  assert.equal(matchesOperationalFilters(facility, ['unknown'], false), true)
  assert.equal(matchesOperationalFilters(facility, [], false), true)
  assert.equal(getOpeningPlan({ ...facility, opening_plan: { kind: 'opening', date: '2027-01-01' } }), null)
})
test('unknown state has explicit list, detail, filter and accessible pin labels', () => {
  assert.match(app, /unknown: '現況確認中'/)
  assert.match(app, /values=\{\['active', 'suspended', 'closed', 'unknown'\]\}/)
  assert.match(app, /facility.operational_status === 'unknown' \? '現況確認中'/)
  assert.match(app, /<p>\{operationalLabels\[facility.operational_status\]\}<\/p>/)
  assert.match(app, /const inactive = facility.operational_status !== 'active'/)
  assert.match(app, /function conditionTags[\s\S]*?facility.operational_status !== 'active'\) return \[\]/)
})
