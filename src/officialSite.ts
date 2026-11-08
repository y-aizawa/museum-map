type OfficialSiteFacility = { official_url?: string | null; visitor_guide?: { url: string; label: string } | null }

function guide(facility: OfficialSiteFacility) {
  const entry = facility.visitor_guide
  return entry?.url?.trim() && entry?.label?.trim() ? { url: entry.url.trim(), label: entry.label.trim() } : null
}

// Availability depends only on the registered URL, never on operating status.
export function createOfficialSiteAction(facility: OfficialSiteFacility): HTMLAnchorElement | HTMLButtonElement {
  const officialUrl = facility.official_url?.trim()
  const fallback = guide(facility)
  const url = officialUrl || fallback?.url
  if (url) {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = officialUrl ? '公式サイト' : fallback!.label
    return link
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.disabled = true
  button.textContent = '公式サイトなし'
  return button
}

// The fallback concerns today's hours, not the existence of an official site.
export function todayHoursText(facility: OfficialSiteFacility, today: string): string {
  if (today !== '—') return today
  if (facility.official_url?.trim()) return '公式サイトでご確認ください'
  const fallback = guide(facility)
  return fallback ? fallback.label + 'でご確認ください' : '本日の開館時間は未確認です'
}
