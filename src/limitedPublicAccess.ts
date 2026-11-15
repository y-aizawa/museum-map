import { plannedChangeDate } from './plannedChanges.ts'

type PublicAccessDate = {
  date: string
  end_date?: string
  hours?: string
  kind?: 'confirmed' | 'recurring'
}

export type LimitedPublicAccess = {
  label?: string
  scope: string
  recurring?: string
  dates?: PublicAccessDate[]
  official_url?: string
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null
}

function displayDate(value: string) {
  const date = parseDate(value)
  return date ? `${plannedChangeDate(value)}（${'日月火水木金土'[date.getUTCDay()]}）` : ''
}

export function limitedPublicAccessDisplay(access: LimitedPublicAccess, today: string) {
  const next = (access.dates ?? [])
    .filter(({ date, end_date }) => {
      const end = end_date ?? date
      return parseDate(date) && parseDate(end) && date <= end && today <= end
    })
    .sort((left, right) => left.date.localeCompare(right.date)
      || Number(left.kind === 'recurring') - Number(right.kind === 'recurring'))[0]

  let timing = '次回日程未確認'
  if (next) {
    const started = next.date <= today
    const prefix = next.kind === 'recurring'
      ? (started ? '定例公開日（見込み）' : '次の定例日（見込み）')
      : (started ? '公開日' : '次回公開日')
    const period = next.end_date && next.end_date !== next.date
      ? `${displayDate(next.date)}〜${displayDate(next.end_date)}`
      : displayDate(next.date)
    timing = [prefix, period, next.hours?.trim()].filter(Boolean).join(' ')
  }

  return { label: access.label?.trim() || '公開日限定', timing }
}
