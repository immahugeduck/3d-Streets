// ── Google Places API (New) ───────────────────────────────────────────────
// Uses the Places API v1 REST endpoints — no SDK needed.
// Two-call pattern: autocomplete for suggestions, place details for coordinates.

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''
const BASE    = 'https://places.googleapis.com/v1'

// Map Google place types to the same emoji used by the Mapbox path
function typeToEmoji(types = []) {
  const t = types.join(' ')
  if (/gas_station|fuel/.test(t))                return '⛽'
  if (/grocery|supermarket/.test(t))             return '🛒'
  if (/restaurant|food/.test(t))                 return '🍽️'
  if (/cafe|coffee/.test(t))                     return '☕'
  if (/lodging|hotel|motel/.test(t))             return '🏨'
  if (/parking/.test(t))                         return '🅿️'
  if (/hospital|doctor|medical|urgent/.test(t))  return '🏥'
  if (/pharmacy|drugstore/.test(t))              return '💊'
  if (/bank|atm/.test(t))                        return '🏦'
  if (/airport/.test(t))                         return '✈️'
  if (/shopping_mall|department_store/.test(t))  return '🛍️'
  if (/bar|night_club/.test(t))                  return '🍺'
  if (/movie_theater/.test(t))                   return '🎬'
  if (/park/.test(t))                            return '🌳'
  if (/locality|city/.test(t))                   return '🏙️'
  return '📍'
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Autocomplete ──────────────────────────────────────────────────────────
// Returns lightweight suggestion objects. Coordinates are null until the
// user selects a result — call resolvePlaceCoords() then.
export async function searchPlaces(query, proximity = null) {
  if (!API_KEY || !query || query.length < 2) return []

  const body = {
    input:        query,
    languageCode: 'en',
    regionCode:   'us',
    includedPrimaryTypes: [],
  }

  if (proximity) {
    body.locationBias = {
      circle: {
        center: { latitude: proximity.lat, longitude: proximity.lng },
        radius: 80000,
      },
    }
  }

  try {
    const res  = await fetch(`${BASE}/places:autocomplete`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY },
      body:    JSON.stringify(body),
    })
    const data = await res.json()

    return (data.suggestions || []).map(s => {
      const p     = s.placePrediction
      const name  = p.structuredFormat?.mainText?.text  || p.text?.text || ''
      const addr  = p.structuredFormat?.secondaryText?.text || ''
      const types = p.types || []
      return {
        id:           p.placeId,
        placeId:      p.placeId,
        name,
        address:      addr,
        lat:          null,
        lng:          null,
        distance:     null,
        emoji:        typeToEmoji(types),
        category:     types[0] || null,
        placeType:    types[0] || 'address',
        maki:         null,
        needsDetails: true,
      }
    })
  } catch {
    return []
  }
}

// ── Place Details (lat/lng + full address) ────────────────────────────────
// Called once the user picks a suggestion so we can navigate to it.
export async function resolvePlaceCoords(placeId) {
  if (!API_KEY || !placeId) return null
  try {
    const res  = await fetch(
      `${BASE}/places/${placeId}?fields=location,displayName,formattedAddress,types`,
      { headers: { 'X-Goog-Api-Key': API_KEY } },
    )
    const data = await res.json()
    return {
      lat:     data.location?.latitude  ?? null,
      lng:     data.location?.longitude ?? null,
      name:    data.displayName?.text   ?? null,
      address: data.formattedAddress    ?? null,
      types:   data.types               ?? [],
    }
  } catch {
    return null
  }
}

// ── Nearby POI search ─────────────────────────────────────────────────────
// Mirrors the POI panel categories used with Mapbox.
const CATEGORY_TYPES = {
  gas:      ['gas_station'],
  food:     ['restaurant', 'fast_food_restaurant'],
  coffee:   ['cafe', 'coffee_shop'],
  parking:  ['parking'],
  charging: ['electric_vehicle_charging_station'],
  hotel:    ['lodging'],
  hospital: ['hospital', 'urgent_care_facility'],
  restroom: [],
}

export async function searchPOI(category, userLocation, limit = 15) {
  if (!API_KEY) return []
  const types = CATEGORY_TYPES[category] || []

  const body = {
    textQuery:   types.length ? types[0].replace(/_/g, ' ') : category,
    languageCode: 'en',
    maxResultCount: limit,
    locationBias: {
      circle: {
        center: { latitude: userLocation.lat, longitude: userLocation.lng },
        radius: 16000,
      },
    },
  }

  try {
    const res  = await fetch(`${BASE}/places:searchText`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()

    return (data.places || []).map(p => {
      const lat  = p.location?.latitude
      const lng  = p.location?.longitude
      const dist = haversineM(userLocation.lat, userLocation.lng, lat, lng)
      return {
        id:            p.id,
        name:          p.displayName?.text || '',
        address:       p.formattedAddress  || '',
        lat, lng,
        distanceM:     dist,
        distanceLabel: formatDist(dist),
      }
    }).sort((a, b) => a.distanceM - b.distanceM)
  } catch {
    return []
  }
}

function formatDist(meters) {
  const miles = meters / 1609.34
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`
  if (miles < 10)  return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}
