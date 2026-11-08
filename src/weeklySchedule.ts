export type WeeklyScheduleRule = {
  days: string[]
  weeks?: number[]
  open: string
  close: string
  last_admission?: string
}

type Schedule = {
  weekly?: WeeklyScheduleRule[]
  valid_from?: string
  valid_through?: string
}

const weekdays = [['mo', '月'], ['tu', '火'], ['we', '水'], ['th', '木'], ['fr', '金'], ['sa', '土'], ['su', '日']] as const

/** Expand the stored weekly pattern without inventing opening days for variable schedules. */
export function weeklyScheduleRows(schedule: Schedule | null | undefined, applicability: string, date: string) {
  if (!schedule?.weekly?.length
    || (schedule.valid_from && date < schedule.valid_from)
    || (schedule.valid_through && date > schedule.valid_through)) return []
  const regular = ['current_baseline', 'current_exhibition'].includes(applicability)
  return weekdays.map(([code, label]) => {
    const rules = schedule.weekly!.filter(rule => rule.days.includes(code))
      .sort((a, b) => a.open.localeCompare(b.open))
    const lines = rules.map(rule => {
      const weeks = rule.weeks?.length ? `第${rule.weeks.join('・')} ` : ''
      const admission = rule.last_admission ? `（最終入館 ${rule.last_admission}）` : ''
      return `${weeks}${rule.open}–${rule.close}${admission}`
    })
    return {
      day: label,
      text: [...new Set(lines)].join('\n') || (regular ? '休館日' : '公式サイトでご確認ください'),
    }
  })
}
