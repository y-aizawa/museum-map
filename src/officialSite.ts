type OfficialSiteFacility = { official_url?: string | null }

// Availability depends only on the registered URL, never on operating status.
export function createOfficialSiteAction(facility: OfficialSiteFacility): HTMLAnchorElement | HTMLButtonElement {
  const url = facility.official_url?.trim()
  if (url) {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = '公式サイト'
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
  return facility.official_url?.trim() ? '公式サイトでご確認ください' : '本日の開館時間は未確認です'
}
