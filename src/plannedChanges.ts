export type PlannedChange = {
  kind: 'closure' | 'suspension'
  date?: string
  period?: string
  reopening_date?: string
  last_public_open_date?: string
  function_transfer?: boolean
}

export function plannedChangeDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (day) return `${Number(day[1])}年${Number(day[2])}月${Number(day[3])}日`
  const month = /^(\d{4})-(\d{2})$/.exec(value)
  if (month) return `${Number(month[1])}年${Number(month[2])}月`
  return value
}

// Dates describe announcements, never a clock-driven operational-status change.
export function plannedChangeDisplay(plan: PlannedChange, today: string) {
  const label = plan.kind === 'closure' ? '閉館予定' : '休館予定'
  const when = plannedChangeDate(plan.date || plan.period || '時期未定')
  const timing = `${when}${plan.kind === 'suspension' && plan.date ? 'から' : ''}`
  const lines = [`${timing} ${label}`]
  if (plan.reopening_date) lines.push(`${plannedChangeDate(plan.reopening_date)} 再開予定`)
  const details: string[] = []
  if (plan.function_transfer) details.push('機能移転を予定しています。')
  if (plan.kind === 'closure') {
    details.push(plan.last_public_open_date
      ? `最終公開日：${plannedChangeDate(plan.last_public_open_date)}`
      : '最終公開日は未確定です。')
  }
  // Free-form periods keep their original precision, without guessing a day.
  const due = plan.date ? plan.date <= today
    : /^\d{4}-\d{2}$/.test(plan.period || '') ? plan.period! < today.slice(0, 7)
    : /^\d{4}$/.test(plan.period || '') ? plan.period! < today.slice(0, 4)
    : false
  const statusNote = due ? '公表された予定です。実施状況は公式案内をご確認ください。' : ''
  return { label, timing, lines, details, statusNote }
}

// Opening, reopening, suspension and closure plans share the same presentation.
export function appendPlanLines(hoursBox: HTMLElement, lines: string[]) {
  lines.forEach(text => {
    const line = document.createElement('span')
    line.className = 'popup-status-detail'
    line.textContent = text
    hoursBox.append(line)
  })
}

export function appendPlannedChangeNotes(root: HTMLElement, plans: PlannedChange[], today: string) {
  plans.forEach(plan => {
    const display = plannedChangeDisplay(plan, today)
    const notes = [...display.details, display.statusNote].filter(Boolean)
    if (!notes.length) return
    const note = document.createElement('div')
    note.className = 'popup-notice popup-plan-note'
    note.textContent = notes.join(' ')
    root.append(note)
  })
}
