export type PlannedChange = {
  kind: 'closure' | 'suspension'
  date?: string
  period?: string
  reopening_date?: string
  last_public_open_date?: string
  function_transfer?: boolean
  source_urls: string[]
  checked_on: string
}

export function plannedChangeDate(value: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (day) return `${Number(day[1])}年${Number(day[2])}月${Number(day[3])}日`
  const month = /^(\d{4})-(\d{2})$/.exec(value)
  if (month) return `${Number(month[1])}年${Number(month[2])}月`
  return value
}

// Dates are notice metadata, never a clock-driven operational-status change.
export function plannedChangeDisplay(plan: PlannedChange, today: string) {
  const label = plan.kind === 'closure' ? '閉館予定' : '休館予定'
  const when = plannedChangeDate(plan.date || plan.period || '時期未定')
  const timing = `${when}${plan.kind === 'suspension' && plan.date ? 'から' : ''}`
  const details: string[] = []
  if (plan.function_transfer) details.push('機能移転を予定しています。')
  if (plan.kind === 'closure') {
    details.push(plan.last_public_open_date
      ? `最終公開日：${plannedChangeDate(plan.last_public_open_date)}`
      : '最終公開日は未確定です。')
  }
  if (plan.reopening_date) details.push(`${plannedChangeDate(plan.reopening_date)} 再開予定`)
  // An exact date has arrived, or an entire month/year has elapsed. Free-form
  // periods keep their original precision and are never converted to a day.
  const due = plan.date ? plan.date <= today
    : /^\d{4}-\d{2}$/.test(plan.period || '') ? plan.period! < today.slice(0, 7)
    : /^\d{4}$/.test(plan.period || '') ? plan.period! < today.slice(0, 4)
    : false
  const statusNote = due ? '公表された予定です。実施状況は公式案内をご確認ください。' : ''
  return { label, timing, details, statusNote }
}

export function appendPlannedChanges(root: HTMLElement, plans: PlannedChange[], today: string) {
  if (!plans.length) return
  const section = document.createElement('section')
  section.className = 'popup-planned-changes'
  const heading = document.createElement('h3')
  heading.textContent = '閉館・休館の予定'
  section.append(heading)
  plans.forEach(plan => {
    const display = plannedChangeDisplay(plan, today)
    const card = document.createElement('div')
    card.className = 'planned-change-notice'
    const title = document.createElement('strong')
    title.textContent = `${display.timing} ${display.label}`
    card.append(title)
    display.details.forEach(text => {
      const detail = document.createElement('p')
      detail.textContent = text
      card.append(detail)
    })
    if (display.statusNote) {
      const status = document.createElement('p')
      status.className = 'planned-change-status-note'
      status.textContent = display.statusNote
      card.append(status)
    }
    const sources = document.createElement('div')
    sources.className = 'planned-change-sources'
    plan.source_urls.forEach((url, index) => {
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = plan.source_urls.length === 1 ? '公式の予定案内' : `公式資料${index + 1}`
      sources.append(link)
    })
    const checked = document.createElement('small')
    checked.textContent = `${plannedChangeDate(plan.checked_on)}確認`
    sources.append(checked)
    card.append(sources)
    section.append(card)
  })
  root.append(section)
}
