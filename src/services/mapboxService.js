// ── Mapbox GL JS Service ───────────────────────────────────────────────────

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ── Geocoding / Search ────────────────────────────────────────────────────
export async function searchPlaces(query, proximity = null) {
  if (!query || query.length < 2) return []
  const encoded = encodeURIComponent(query)
  
  // Detect if query looks like a full address (has numbers + street indicators)
  const looksLikeAddress = /\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|ct|court|pl|place)/i.test(query)
  // Detect if query includes explicit city/state (e.g., "Nashville TN", "New York")
  const hasExplicitLocation = /,\s*[A-Z]{2}$/i.test(query.trim()) || /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i.test(query)
  
  // ALWAYS use proximity for POI-style queries (Walmart, parks, restaurants)
  // Only skip proximity if it's clearly a full address or has explicit city/state
  const useProximity = proximity && !looksLikeAddress && !hasExplicitLocation
  const prox = useProximity ? `&proximity=${proximity.lng},${proximity.lat}` : ''
  
  // Prioritize POI for short queries, include address/place for longer ones
  const types = query.trim().split(/\s+/).length <= 3 ? 'poi,place,address' : 'address,poi,place'
  
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${TOKEN}&limit=8&types=${types}${prox}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    
    // Calculate distance for each result if we have user location
    return (data.features || []).map(f => {
      const lat = f.geometry.coordinates[1]
      const lng = f.geometry.coordinates[0]
      const dist = proximity ? haversineM(proximity.lat, proximity.lng, lat, lng) : null
      return {
        id: f.id,
        name: f.text,
        address: f.place_name,
        lat,
        lng,
        distance: dist,
        category: f.properties?.category ?? null,
      }
    }).sort((a, b) => {
      // For POI queries with proximity, sort by distance
      if (useProximity && a.distance != null && b.distance != null) {
        return a.distance - b.distance
      }
      return 0 // keep Mapbox relevance order otherwise
    })
  } catch {
    return []
  }
}

// ── Directions ────────────────────────────────────────────────────────────
export async function getDirections({ origin, destination, waypoints = [], profile = 'mapbox/driving-traffic', exclude = null }) {
  const coords = [
    origin,
    ...waypoints,
    destination,
  ].map(c => `${c.lng},${c.lat}`).join(';')

  const excl = exclude ? `&exclude=${exclude}` : ''
  const url = `https://api.mapbox.com/directions/v5/${profile}/${coords}?access_token=${TOKEN}&alternatives=true&geometries=geojson&steps=true&banner_instructions=true&voice_instructions=true&overview=full${excl}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    return parseDirectionsResponse(data)
  } catch {
    return null
  }
}

function parseDirectionsResponse(data) {
  if (!data.routes || data.routes.length === 0) return null

  return data.routes.map((route, i) => ({
    id: i,
    isRecommended: i === 0,
    distanceM: route.distance,
    durationS: route.duration,
    durationTypicalS: route.duration_typical ?? route.duration,
    distanceLabel: formatDist(route.distance),
    durationLabel: formatDur(route.duration),
    trafficDelayS: Math.max(0, route.duration - (route.duration_typical ?? route.duration)),
    geometry: route.geometry,
    steps: parseSteps(route),
  }))
}

function parseSteps(route) {
  return route.legs.flatMap(leg =>
    leg.steps.map(step => ({
      instruction: step.maneuver.instruction,
      street: step.name || step.ref || 'Continue',
      distanceM: step.distance,
      durationS: step.duration,
      distanceLabel: formatDist(step.distance),
      maneuver: step.maneuver.type,
      modifier: step.maneuver.modifier,
      location: step.maneuver.location, // [lng, lat] of maneuver point
      bearing: step.maneuver.bearing_after,
      voiceInstruction: step.voiceInstructions?.[0]?.announcement ?? null,
      bannerInstruction: step.bannerInstructions?.[0]?.primary?.text ?? null,
    }))
  )
}

// ── Map Matching (Sketch → Roads) ─────────────────────────────────────────
export async function matchRoute(coords) {
  if (coords.length < 2) return null
  // Mapbox Map Matching allows max 100 points, sample down
  const sampled = sampleArray(coords, 80)
  const coordStr = sampled.map(c => `${c.lng},${c.lat}`).join(';')
  const radii = sampled.map(() => '25').join(';')

  const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coordStr}?access_token=${TOKEN}&geometries=geojson&steps=true&tidy=true&radiuses=${radii}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    if (!data.matchings || data.matchings.length === 0) return null

    const matching = data.matchings[0]
    return {
      geometry: matching.geometry,
      distanceM: matching.distance,
      durationS: matching.duration,
      distanceLabel: formatDist(matching.distance),
      durationLabel: formatDur(matching.duration),
      confidence: matching.confidence,
    }
  } catch {
    return null
  }
}

// ── POI Search ────────────────────────────────────────────────────────────
export async function searchPOI(category, userLocation, limit = 15) {
  const queries = {
    gas:      'gas station fuel',
    food:     'restaurant',
    coffee:   'coffee cafe',
    parking:  'parking',
    charging: 'ev charging electric vehicle',
    hotel:    'hotel motel inn',
    hospital: 'hospital urgent care',
    restroom: 'public restroom',
  }

  const q = encodeURIComponent(queries[category] || category)
  const prox = `${userLocation.lng},${userLocation.lat}`
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${TOKEN}&proximity=${prox}&limit=${limit}&country=US&types=poi`

  try {
    const res = await fetch(url)
    const data = await res.json()
    return (data.features || []).map(f => {
      const lat = f.geometry.coordinates[1]
      const lng = f.geometry.coordinates[0]
      const dist = haversineM(userLocation.lat, userLocation.lng, lat, lng)
      return {
        id: f.id,
        name: f.text,
        address: f.place_name,
        lat, lng,
        distanceM: dist,
        distanceLabel: formatDist(dist),
      }
    }).sort((a, b) => a.distanceM - b.distanceM)
  } catch {
    return []
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────
function formatDist(meters) {
  const miles = meters / 1609.34
  if (miles < 0.1) return `${Math.round(meters)} ft`
  if (miles < 10) return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

function formatDur(seconds) {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function sampleArray(arr, maxLen) {
  if (arr.length <= maxLen) return arr
  const step = arr.length / maxLen
  return Array.from({ length: maxLen }, (_, i) => arr[Math.floor(i * step)])
}

// ── Point-to-line distance for off-route detection ────────────────────────
// Returns the minimum perpendicular distance (meters) from a point to any segment of a polyline
function pointToSegmentDistanceM(point, segStart, segEnd) {
  const [px, py] = [point.lng, point.lat]
  const [ax, ay] = segStart // [lng, lat]
  const [bx, by] = segEnd   // [lng, lat]

  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  let t = 0
  if (lenSq > 0) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  }

  const closestLng = ax + t * dx
  const closestLat = ay + t * dy

  return haversineM(py, px, closestLat, closestLng)
}

export function pointToLineDistanceM(point, lineCoords) {
  if (!lineCoords || lineCoords.length < 2) return Infinity
  let minDist = Infinity
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const dist = pointToSegmentDistanceM(point, lineCoords[i], lineCoords[i + 1])
    if (dist < minDist) minDist = dist
  }
  return minDist
}

export { formatDist, formatDur, haversineM }
