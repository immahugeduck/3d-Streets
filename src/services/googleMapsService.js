// ── Google Maps Service (Routes API v2 + Roads) ───────────────────────────
// Replaces mapboxService for directions, geometry helpers, and route utilities.

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// ── Encoded Polyline Decoder ──────────────────────────────────────────────
// Google encodes route geometry in a compact string; decode to [[lng,lat]…]
// to match the GeoJSON coordinate convention used throughout the app.
function decodePolyline(encoded) {
  let index = 0, lat = 0, lng = 0
  const coords = []
  while (index < encoded.length) {
    let b, shift = 0, result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : result >> 1
    shift = 0; result = 0
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : result >> 1
    coords.push([lng / 1e5, lat / 1e5])
  }
  return coords
}

// ── Profile translation ───────────────────────────────────────────────────
function profileToGoogle(profile, exclude) {
  const travelMode = profile === 'mapbox/walking'  ? 'WALK'
                   : profile === 'mapbox/cycling'  ? 'BICYCLE'
                   : 'DRIVE'
  const routingPref = profile === 'mapbox/driving' ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE'
  const avoidHighways = typeof exclude === 'string' && /motorway/i.test(exclude)
  const avoidTolls    = typeof exclude === 'string' && /toll/i.test(exclude)
  return { travelMode, routingPref, avoidHighways, avoidTolls }
}

// ── Directions ────────────────────────────────────────────────────────────
export async function getDirections({ origin, destination, waypoints = [], profile = 'mapbox/driving-traffic', exclude = null }) {
  if (!API_KEY) return null

  const { travelMode, routingPref, avoidHighways, avoidTolls } = profileToGoogle(profile, exclude)

  const intermediates = waypoints.map(w => ({
    location: { latLng: { latitude: w.lat, longitude: w.lng } },
  }))

  const body = {
    origin:      { location: { latLng: { latitude: origin.lat,      longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    intermediates,
    travelMode,
    routingPreference:       routingPref,
    computeAlternativeRoutes: true,
    routeModifiers: { avoidTolls, avoidHighways, avoidFerries: false },
    languageCode: 'en-US',
    units:        'IMPERIAL',
  }

  const fieldMask = [
    'routes.duration',
    'routes.staticDuration',
    'routes.distanceMeters',
    'routes.polyline.encodedPolyline',
    'routes.legs.steps.navigationInstruction',
    'routes.legs.steps.distanceMeters',
    'routes.legs.steps.staticDuration',
    'routes.legs.steps.startLocation',
    'routes.legs.steps.polyline.encodedPolyline',
    'routes.legs.steps.travelAdvisory',
  ].join(',')

  try {
    const res  = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Goog-Api-Key':  API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!data.routes?.length) return null
    return data.routes.map((route, i) => parseRoute(route, i))
  } catch {
    return null
  }
}

function parseDurationS(durationStr) {
  // Format: "600s"
  return durationStr ? parseInt(durationStr.replace('s', ''), 10) : 0
}

function parseRoute(route, i) {
  const durationS        = parseDurationS(route.duration)
  const durationTypicalS = parseDurationS(route.staticDuration)
  const coords           = decodePolyline(route.polyline.encodedPolyline)

  return {
    id:              i,
    isRecommended:   i === 0,
    distanceM:       route.distanceMeters,
    durationS,
    durationTypicalS,
    distanceLabel:   formatDist(route.distanceMeters),
    durationLabel:   formatDur(durationS),
    trafficDelayS:   Math.max(0, durationS - durationTypicalS),
    geometry:        { type: 'LineString', coordinates: coords },
    steps:           parseSteps(route),
  }
}

function parseSteps(route) {
  return (route.legs || []).flatMap(leg =>
    (leg.steps || []).map(step => {
      const loc = step.startLocation?.latLng
      const durationS = parseDurationS(step.staticDuration)
      const maneuverRaw = (step.navigationInstruction?.maneuver || '').toLowerCase()
      const { maneuver, modifier } = mapManeuver(maneuverRaw)
      return {
        instruction:      step.navigationInstruction?.instructions || 'Continue',
        street:           extractStreetName(step.navigationInstruction?.instructions || ''),
        distanceM:        step.distanceMeters || 0,
        durationS,
        distanceLabel:    formatDist(step.distanceMeters || 0),
        maneuver,
        modifier,
        location:         loc ? [loc.longitude, loc.latitude] : null,
        bearing:          null,
        voiceInstruction: step.navigationInstruction?.instructions || null,
        bannerInstruction: step.navigationInstruction?.instructions || null,
      }
    })
  )
}

// Map Google maneuver strings to Mapbox-style type + modifier
function mapManeuver(raw) {
  if (/turn_left|left_u_turn/.test(raw))  return { maneuver: 'turn', modifier: 'left' }
  if (/turn_right|right_u_turn/.test(raw)) return { maneuver: 'turn', modifier: 'right' }
  if (/u_turn/.test(raw))                  return { maneuver: 'turn', modifier: 'uturn' }
  if (/merge_left/.test(raw))              return { maneuver: 'merge', modifier: 'left' }
  if (/merge_right/.test(raw))             return { maneuver: 'merge', modifier: 'right' }
  if (/ramp_left/.test(raw))               return { maneuver: 'on ramp', modifier: 'left' }
  if (/ramp_right/.test(raw))              return { maneuver: 'on ramp', modifier: 'right' }
  if (/fork_left/.test(raw))               return { maneuver: 'fork', modifier: 'left' }
  if (/fork_right/.test(raw))              return { maneuver: 'fork', modifier: 'right' }
  if (/roundabout/.test(raw))              return { maneuver: 'roundabout', modifier: 'right' }
  if (/straight/.test(raw))               return { maneuver: 'continue', modifier: 'straight' }
  return { maneuver: 'continue', modifier: 'straight' }
}

function extractStreetName(instruction) {
  // Pull street name after "onto", "on", "along", etc.
  const m = instruction.match(/(?:onto|on|along)\s+(.+?)(?:\.|$)/i)
  return m ? m[1].trim() : instruction
}

// ── Geometry helpers (shared with useNavigationProgress) ─────────────────
export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pointToSegmentDistanceM(point, segStart, segEnd) {
  const [px, py] = [point.lng, point.lat]
  const [ax, ay] = segStart
  const [bx, by] = segEnd
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = 0
  if (lenSq > 0) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return haversineM(py, px, ay + t * dy, ax + t * dx)
}

export function pointToLineDistanceM(point, lineCoords) {
  if (!lineCoords || lineCoords.length < 2) return Infinity
  let min = Infinity
  for (let i = 0; i < lineCoords.length - 1; i++) {
    const d = pointToSegmentDistanceM(point, lineCoords[i], lineCoords[i + 1])
    if (d < min) min = d
  }
  return min
}

// ── Formatting helpers ────────────────────────────────────────────────────
export function formatDist(meters) {
  const miles = meters / 1609.34
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`
  if (miles < 10)  return `${miles.toFixed(1)} mi`
  return `${Math.round(miles)} mi`
}

export function formatDur(seconds) {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), rem = m % 60
  return rem === 0 ? `${h} hr` : `${h} hr ${rem} min`
}
