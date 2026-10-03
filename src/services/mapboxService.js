// ── Mapbox GL JS Service ───────────────────────────────────────────────────

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

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

// ── Helpers ───────────────────────────────────────────────────────────────
function formatDist(meters) {
  const miles = meters / 1609.34
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`
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
