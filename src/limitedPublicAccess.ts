import { plannedChangeDate } from './plannedChanges.ts'

type PublicAccessDate = {
  date: string
  end_date?: string
  hours?: string
  kind?: 'confirmed' | 'recurring'
}

export type LimitedPublicAccess = {
  scope: string
  recurring?: string
  dates?: PublicAccessDate[]
  official_url?: string
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function limitedPublicAccessDisplay(access: LimitedPublicAccess, today: string) {
  const next = (access.dates ?? [])
    .filter(({ date, end_date }) => {
      const end = end_date ?? date
      return isValidDate(date) && isValidDate(end) && date <= end && today <= end
    })
    .sort((left, right) => left.date.localeCompare(right.date)
      || Number(left.kind === 'recurring') - Number(right.kind === 'recurring'))[0]

  const label = '公開日程'
  if (!next) return { label, timing: '次回日程未確認', hours: undefined }

  const end = next.end_date ?? next.date
  const firstDay = plannedChangeDate(next.date)
  const period = end === next.date ? firstDay : `${firstDay}〜${plannedChangeDate(end)}`
  const state = next.kind === 'recurring' ? '公開見込み'
    : next.date > today ? '公開予定' : end === next.date ? '公開日' : '公開期間'
  return { label, timing: `${period} ${state}`, hours: next.hours?.trim() || undefined }
}
