import assert from 'node:assert/strict'
import test from 'node:test'
import { getOpeningPlan, matchesOperationalFilters, openingPlanDate } from '../src/openingPlans.ts'

const defaults = ['active']
const opening = { operational_status: 'unknown', opening_plan: { kind: 'opening', period: '2027年春' } }
const reopening = { operational_status: 'suspended', opening_plan: { kind: 'reopening', date: '2027-04-23' } }

test('an announced first opening stays out of default unknown facilities', () => {
  assert.equal(matchesOperationalFilters(opening, defaults, false), false)
  assert.equal(matchesOperationalFilters(opening, defaults, true), true)
})

test('the shortcut adds announced reopenings without adding every inactive facility', () => {
  assert.equal(matchesOperationalFilters(reopening, defaults, false), false)
  assert.equal(matchesOperationalFilters(reopening, defaults, true), true)
  assert.equal(matchesOperationalFilters({ operational_status: 'suspended' }, defaults, true), false)
  assert.equal(matchesOperationalFilters({ operational_status: 'closed' }, defaults, true), false)
})

test('explicit suspension selection includes both known and unknown reopening dates', () => {
  assert.equal(matchesOperationalFilters(reopening, ['suspended'], false), true)
  assert.equal(matchesOperationalFilters({ operational_status: 'suspended' }, ['suspended'], false), true)
})

test('normal operating and unresolved facilities retain their previous default visibility', () => {
  for (const operational_status of ['active', 'unknown']) {
    assert.equal(matchesOperationalFilters({ operational_status }, defaults, false), true)
  }
})

test('passing a planned date never confirms opening or overrides an explicit closure', () => {
  const oldPlan = { ...opening, opening_plan: { kind: 'opening', date: '2000-01-01' } }
  assert.equal(matchesOperationalFilters(oldPlan, defaults, false), false)
  assert.equal(getOpeningPlan(oldPlan)?.kind, 'opening')
  assert.equal(getOpeningPlan({ ...reopening, operational_status: 'closed' }), null)
  assert.equal(getOpeningPlan({ ...reopening, operational_status: 'active' }), null)
})

test('periods keep their precision while exact dates get Japanese formatting', () => {
  assert.equal(openingPlanDate(opening.opening_plan), '2027年春')
  assert.equal(openingPlanDate(reopening.opening_plan), '2027年4月23日')
})

test('unconfirmed facilities share the open filter without appearing under closures', () => {
  const facility = { operational_status: 'unknown' }
  assert.equal(matchesOperationalFilters(facility, ['active'], false), true)
  assert.equal(matchesOperationalFilters(facility, ['suspended', 'closed'], false), false)
})
