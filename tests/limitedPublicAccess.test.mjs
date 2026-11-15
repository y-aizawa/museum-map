import assert from 'node:assert/strict'
import test from 'node:test'
import { limitedPublicAccessDisplay } from '../src/limitedPublicAccess.ts'

test('shows the first upcoming date and marks a date inferred from the regular schedule', () => {
  const access = {
    scope: '堂内',
    label: '堂内公開日限定',
    dates: [
      { date: '2027-08-08', kind: 'recurring' },
      { date: '2026-11-03', kind: 'confirmed' },
      { date: '2027-06-13', hours: '11:00〜15:00', kind: 'recurring' },
    ],
  }
  assert.deepEqual(limitedPublicAccessDisplay(access, '2026-11-15'), {
    label: '公開日程',
    timing: '2027年6月13日 公開見込み',
    hours: '11:00〜15:00',
  })
})

test('uses a confirmed date instead of an estimate for the same day', () => {
  const access = {
    scope: '堂内',
    dates: [
      { date: '2027-06-13', kind: 'recurring', hours: '11:00〜15:00' },
      { date: '2027-06-13', kind: 'confirmed', hours: '10:00〜16:00' },
    ],
  }
  assert.deepEqual(limitedPublicAccessDisplay(access, '2026-11-15'), {
    label: '公開日程',
    timing: '2027年6月13日 公開予定',
    hours: '10:00〜16:00',
  })
})

test('retains a published date range through its last day', () => {
  const access = { scope: '保存建物の内部', dates: [{ date: '2027-04-18', end_date: '2027-04-20' }] }
  assert.equal(limitedPublicAccessDisplay(access, '2027-04-17').timing, '2027年4月18日〜2027年4月20日 公開予定')
  assert.equal(limitedPublicAccessDisplay(access, '2027-04-20').timing, '2027年4月18日〜2027年4月20日 公開期間')
  assert.equal(limitedPublicAccessDisplay(access, '2027-04-21').timing, '次回日程未確認')
})

test('treats an elapsed confirmed single day as ended', () => {
  const access = { scope: '収蔵庫', dates: [{ date: '2027-10-10', kind: 'confirmed' }] }
  assert.equal(limitedPublicAccessDisplay(access, '2027-10-10').timing, '2027年10月10日 公開日')
  assert.equal(limitedPublicAccessDisplay(access, '2027-10-11').timing, '次回日程未確認')
})

test('does not show invalid or reversed dates', () => {
  const access = {
    scope: '堂内',
    dates: [
      { date: '2027-02-30' },
      { date: '2027-06-14', end_date: '2027-06-13' },
    ],
  }
  assert.deepEqual(limitedPublicAccessDisplay(access, '2026-11-15'), {
    label: '公開日程', timing: '次回日程未確認', hours: undefined,
  })
})
