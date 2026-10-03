/**
 * chaseCamera — behind-the-vehicle ("chase cam") camera math for Mapbox GL.
 *
 * This is the main navigation POV: the camera sits behind and above the car,
 * looking forward along the heading — the same framing as Google Maps / Waze
 * 3D navigation, but tuned with game feel:
 *
 *  - Bearing eases toward the GPS heading with angular lag, so turns produce
 *    the gentle camera sway you feel in Forza's chase view instead of a
 *    rigid snap.
 *  - The map center is pushed ahead of the car so the vehicle sits in the
 *    lower third of the screen, with road stretching to the horizon.
 *  - Zoom breathes with speed (FOV-kick feel): the faster you go, the wider
 *    the view, which sells velocity without touching the map's projection.
 */

let _smoothedBearing = null

export function resetChaseCam() {
  _smoothedBearing = null
}

/** Shortest-arc angular lerp, degrees. */
function lerpAngle(from, to, t) {
  const d = ((to - from + 540) % 360) - 180
  return from + d * t
}

// Meters of road kept ahead of the car on screen
const AHEAD_M = 24
// Base framing; zoom relaxes as speed climbs (FOV-kick feel)
const BASE_ZOOM = 18.6
const ZOOM_PER_MPH = 0.008
const MIN_ZOOM = 17.6

export function chaseCamTarget({ lng, lat, heading, speedMPH, profile }) {
  const targetHeading = Number.isFinite(heading) ? heading : (_smoothedBearing ?? 0)
  _smoothedBearing =
    _smoothedBearing == null ? targetHeading : lerpAngle(_smoothedBearing, targetHeading, 0.25)

  const bearing = _smoothedBearing
  const br = (bearing * Math.PI) / 180
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6

  // Push the center ahead so the car renders in the lower third.
  const cLat = lat + (AHEAD_M * Math.cos(br)) / 111320
  const cLng = lng + (AHEAD_M * Math.sin(br)) / (111320 * cosLat)

  const speed = Math.max(0, speedMPH ?? 0)
  const zoom = Math.max(MIN_ZOOM, BASE_ZOOM - speed * ZOOM_PER_MPH)
  const pitch = profile === 'truck' ? 60 : 64

  return {
    center: [cLng, cLat],
    zoom,
    pitch,
    bearing,
    duration: 260,
    easing: t => t, // linear: we re-ease every tick for buttery motion
  }
}
