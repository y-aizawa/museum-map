export type GoogleMapsReview = {
  verification: string
  checked_on?: string
  url?: string
  place_id?: string
  destination_scope?: 'facility' | 'building' | 'location' | 'historical_location'
}

type MapFacility = {
  name: string
  address: string
  latitude: number
  longitude: number
  google_maps?: GoogleMapsReview
}

// A valid Maps URL alone is not evidence of the correct destination.
function safeMapsUrl(value: string | undefined) {
  if (!value || value !== value.trim() || /[\u0000-\u0020\\]/.test(value)) return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (['www.google.com', 'google.com', 'www.google.co.jp', 'google.co.jp'].includes(url.hostname)) {
      return url.pathname === '/maps' || url.pathname.startsWith('/maps/')
    }
    return ['maps.google.com', 'maps.google.co.jp', 'maps.app.goo.gl'].includes(url.hostname)
  } catch {
    return false
  }
}

export function googleMapsUrl(facility: MapFacility) {
  const review = facility.google_maps
  // A known wrong/old destination must never fall back to the same name search.
  if (review?.verification === 'blocked') return null
  if (review?.verification === 'verified') {
    if (review.url && safeMapsUrl(review.url)) return review.url
    if (review.place_id && /^[A-Za-z0-9_-]{1,256}$/.test(review.place_id)) {
      const query = [facility.name, facility.address].filter(Boolean).join(' ')
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(review.place_id)}`
    }
  }
  const query = [facility.name, facility.address, `${facility.latitude},${facility.longitude}`].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// Link availability is independent of whether the facility is open or closed.
export function createGoogleMapsAction(facility: MapFacility): HTMLAnchorElement | HTMLButtonElement {
  const url = googleMapsUrl(facility)
  if (url) {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.textContent = facility.google_maps?.destination_scope === 'historical_location' ? 'Googleマップ（旧所在地）'
      : facility.google_maps?.destination_scope === 'location' ? 'Googleマップ（所在地）'
      : facility.google_maps?.destination_scope === 'building' ? 'Googleマップ（建物）'
      : 'Googleマップで開く'
    return link
  }
  const button = document.createElement('button')
  button.type = 'button'
  button.disabled = true
  button.textContent = 'Googleマップ確認中'
  return button
}
