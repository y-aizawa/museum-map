export type GoogleMapsReview = {
  verification: string
  checked_on?: string
  url?: string
  place_id?: string
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
