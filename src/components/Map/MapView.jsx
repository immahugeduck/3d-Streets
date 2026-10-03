import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore, { MAP_STYLES, PHASE } from '../../store/appStore'
import { chaseCamTarget, resetChaseCam } from '../Navigation/chaseCamera'
import {
  addChaseVehicleLayer,
  removeChaseVehicleLayer,
  updateChaseVehiclePose,
  setChaseVehicleProfile,
} from '../Navigation/ChaseVehicleLayer'
import styles from './MapView.module.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ── Route color constants — change these to retheme the route line ─────────
const ROUTE_COLOR        = '#39D0FF'  // bright cyan primary line
const ROUTE_CASING_COLOR = '#0B2A4A'  // deep navy border for contrast
const ROUTE_GLOW_COLOR   = '#1EA7FF'  // vivid blue bloom
const ROUTE_ALT_COLOR    = '#7A8796'  // subdued slate for alternate routes
const MAX_DRIVING_SPEED_MPH    = 85    // cap camera look-ahead growth at highway speed
const BASE_LOOK_AHEAD_M        = 55    // forward anchor even when near stopped
const SPEED_LOOK_AHEAD_FACTOR  = 0.9   // extra meters of look-ahead per MPH

// ── Module-level caches ───────────────────────────────────────────────────
let _drawnRoutes      = []

// ── Component ─────────────────────────────────────────────────────────────
export default function MapView() {
  const containerRef        = useRef(null)
  const mapRef              = useRef(null)
  const userMarkerRef       = useRef(null)
  const lastCameraUpdateRef = useRef(0)
  const hasCenteredOnUser = useRef(false)
  const savedPinMarkersRef   = useRef([])
  const pendingPinMarkerRef  = useRef(null)

  const setMapRef       = useStore(s => s.setMapRef)
  const mapStyle        = useStore(s => s.mapStyle)
  const is3D            = useStore(s => s.is3D)
  const showTraffic     = useStore(s => s.showTraffic)
  const userLocation    = useStore(s => s.userLocation)
  const userHeading     = useStore(s => s.userHeading)
  const speedMPH        = useStore(s => s.speedMPH)
  const phase           = useStore(s => s.phase)
  const drivingView     = useStore(s => s.drivingView)
  const cockpitMode     = useStore(s => s.cockpitMode)
  const driveCam        = useStore(s => s.driveCam)
  const savedPins        = useStore(s => s.savedPins)
  const pinDropMode      = useStore(s => s.pinDropMode)
  const addSavedPin      = useStore(s => s.addSavedPin)
  const pendingPin       = useStore(s => s.pendingPin)
  const setPendingPin    = useStore(s => s.setPendingPin)
  const setPinDropMode   = useStore(s => s.setPinDropMode)

  // ── Map init ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return
    // Default center: Greencastle, IN (user's home area)
    const map = new mapboxgl.Map({
      container:          containerRef.current,
      style:              MAP_STYLES.dark.uri,
      center:             [-86.8647, 39.6448],
      zoom:               12,
      pitch:              55,
      bearing:            0,
      antialias:          true,
      attributionControl: false,
    })

    map.on('load', () => {
      const styleDef = MAP_STYLES[useStore.getState().mapStyle] ?? MAP_STYLES.dark
      if (styleDef.isStandard) {
        applyStandardConfig(map, styleDef.lightPreset)
      } else {
        add3DBuildings(map)
      }
      addTerrain(map)
      addTrafficLayers(map)
      syncTrafficVisibility(map, showTraffic)
      // First-fix camera flight is handled by the location marker effect
      // (driven by useLocation's watchPosition) — no duplicate geolocation here.
    })

    mapRef.current       = map
    setMapRef(map)
    window._3dstreetsMap = map

    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style switching ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const styleDef = MAP_STYLES[mapStyle] ?? MAP_STYLES.dark
    map.setStyle(styleDef.uri)
    map.once('style.load', () => {
      if (styleDef.isStandard) {
        applyStandardConfig(map, styleDef.lightPreset)
      } else {
        add3DBuildings(map)
      }
      addTerrain(map)
      _drawnRoutes.forEach(({ geojson, isAlternate }) =>
        _applyRouteToMap(map, geojson, isAlternate)
      )
      addTrafficLayers(map)
      syncTrafficVisibility(map, showTraffic)
    })
  }, [mapStyle])

  // ── 3D pitch toggle (not while navigating) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || phase === PHASE.NAVIGATING) return
    map.easeTo({ pitch: is3D ? 55 : 0, duration: 600 })
  }, [is3D, phase])

  // ── Traffic layer sync ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) syncTrafficVisibility(map, showTraffic)
    else map.once('style.load', () => syncTrafficVisibility(map, showTraffic))
  }, [showTraffic])

  // ── User location marker (changeable icon) ────────────────────────────
  // Single effect owns the marker: creates it on first fix, rebuilds it when
  // the icon choice changes, and keeps it glued to GPS + heading.
  const locationIcon = useStore(s => s.locationIcon)
  const markerIconRef = useRef(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return

    if (!userMarkerRef.current || markerIconRef.current !== locationIcon) {
      userMarkerRef.current?.remove()
      const el = createLocationMarker(locationIcon)
      userMarkerRef.current = new mapboxgl.Marker({
        element:           el,
        rotationAlignment: 'map',
        pitchAlignment:    'map',
      })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map)
      markerIconRef.current = locationIcon
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat])
    }

    if (userHeading !== null && userHeading !== undefined) {
      userMarkerRef.current.setRotation(userHeading)
    }

    // Driving view hides the marker (3D car / hood IS the location indicator)
    const hidden = phase === PHASE.NAVIGATING && drivingView
    const mEl = userMarkerRef.current.getElement()
    mEl.style.opacity       = hidden ? '0' : '1'
    mEl.style.pointerEvents = hidden ? 'none' : 'auto'

    // Fly to user's location on the first fix (GPS or IP), skip during active navigation
    if (!hasCenteredOnUser.current && phase !== PHASE.NAVIGATING) {
      hasCenteredOnUser.current = true
      const flyWhenReady = () => {
        map.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14, pitch: 55, duration: 1200 })
      }
      if (map.isStyleLoaded()) {
        flyWhenReady()
      } else {
        map.once('load', flyWhenReady)
      }
    }
  }, [userLocation, userHeading, locationIcon, phase, drivingView])

  // ── Chase vehicle 3D overlay lifecycle ─────────────────────────────────
  const chaseActive = phase === PHASE.NAVIGATING && drivingView && driveCam === 'chase'

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!chaseActive || !userLocation) {
      removeChaseVehicleLayer(map)
      return
    }
    const ensure = () => {
      // Re-verify: navigation may have ended while the style was loading.
      const st = useStore.getState()
      const stillActive =
        st.phase === PHASE.NAVIGATING && st.drivingView &&
        st.driveCam === 'chase' && st.userLocation
      if (!stillActive) return
      setChaseVehicleProfile(st.cockpitMode)
      addChaseVehicleLayer(map)
    }
    if (map.isStyleLoaded()) ensure()
    else map.once('style.load', ensure)
    return () => removeChaseVehicleLayer(map)
  }, [chaseActive, cockpitMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep the 3D car glued to GPS ──────────────────────────────────────
  useEffect(() => {
    if (!chaseActive || !userLocation) return
    updateChaseVehiclePose({
      lng: userLocation.lng,
      lat: userLocation.lat,
      heading: userHeading,
    })
  }, [chaseActive, userLocation, userHeading])

  // Reset chase-cam smoothing whenever the chase view (re)engages so the
  // camera doesn't sweep in from a stale bearing.
  useEffect(() => {
    if (chaseActive) resetChaseCam()
  }, [chaseActive])

  // ── Tap-to-save map pins ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const onMapClick = (evt) => {
      if (!pinDropMode) return
      const { lng, lat } = evt.lngLat
      setPendingPin({ lng, lat, name: `${lat.toFixed(5)}, ${lng.toFixed(5)}` })
      setPinDropMode(false)
    }

    map.on('click', onMapClick)
    return () => map.off('click', onMapClick)
  }, [pinDropMode, setPendingPin, setPinDropMode])

  // ── Saved pin markers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    savedPinMarkersRef.current.forEach(marker => marker.remove())
    savedPinMarkersRef.current = savedPins.map((pin) => {
      const el = document.createElement('div')
      el.className = styles.savedPin
      el.innerHTML = '<span>📍</span>'
      return new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setText(pin.name))
        .addTo(map)
    })

    return () => {
      savedPinMarkersRef.current.forEach(marker => marker.remove())
      savedPinMarkersRef.current = []
    }
  }, [savedPins])

  // ── Pending drop pin marker ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    pendingPinMarkerRef.current?.remove()
    pendingPinMarkerRef.current = null
    if (!map || !pendingPin) return

    const el = document.createElement('div')
    el.className = styles.pendingPin
    el.innerHTML = '<span>📍</span>'
    pendingPinMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([pendingPin.lng, pendingPin.lat])
      .addTo(map)

    map.flyTo({ center: [pendingPin.lng, pendingPin.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 })

    return () => {
      pendingPinMarkerRef.current?.remove()
      pendingPinMarkerRef.current = null
    }
  }, [pendingPin])

  // ── Camera follow during navigation ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation || phase !== PHASE.NAVIGATING) return

    const now = Date.now()
    if (now - lastCameraUpdateRef.current < 250) return  // ≤ 4 Hz
    lastCameraUpdateRef.current = now

    const bearing = (userHeading !== null && userHeading !== undefined)
      ? userHeading
      : map.getBearing()

    if (drivingView) {
      if (driveCam === 'chase') {
        // ── Behind-vehicle chase cam (main nav POV) ─────────────────────
        // Bearing lags the GPS heading for game-style sway; the camera
        // sits behind/above the 3D car with the road ahead in frame.
        const target = chaseCamTarget({
          lng: userLocation.lng,
          lat: userLocation.lat,
          heading: (userHeading !== null && userHeading !== undefined)
            ? userHeading
            : map.getBearing(),
          speedMPH,
          profile: cockpitMode,
        })
        map.easeTo(target)
      } else {
      // Windshield perspective: lower horizon with stronger pitch and
      // speed-aware look-ahead so motion feels like cockpit driving.
      const clampedSpeed = Math.max(0, Math.min(speedMPH ?? 0, MAX_DRIVING_SPEED_MPH))
      const lookAheadM = BASE_LOOK_AHEAD_M + (clampedSpeed * SPEED_LOOK_AHEAD_FACTOR)
      const bearingRad   = bearing * (Math.PI / 180)
      const latRad       = userLocation.lat * (Math.PI / 180)
      const dLat = (lookAheadM * Math.cos(bearingRad)) / 111320
      const dLng = (lookAheadM * Math.sin(bearingRad)) / (111320 * Math.cos(latRad))

      const cockpitTuning = {
        comfort: { zoom: 18.4, pitch: 72, duration: 320 },
        sport:   { zoom: 19.2, pitch: 80, duration: 220 },
        cinematic:{ zoom: 18.8, pitch: 76, duration: 420 },
      }[cockpitMode] || { zoom: 19, pitch: 78, duration: 250 }

      map.easeTo({
        center:   [userLocation.lng + dLng, userLocation.lat + dLat],
        zoom:     cockpitTuning.zoom,
        pitch:    cockpitTuning.pitch,
        bearing,
        duration: cockpitTuning.duration,
      })
      } // end cockpit/hood windshield branch
    } else {
      map.easeTo({
        center:   [userLocation.lng, userLocation.lat],
        zoom:     17.5,
        pitch:    is3D ? 70 : 0,
        bearing,
        duration: 500,
      })
    }

    // Forza suggested line: color the stretch ahead blue/red by maneuver.
    if (phase === PHASE.NAVIGATING) updateRouteSeverity()
  }, [userLocation, userHeading, phase, is3D, drivingView, driveCam, speedMPH, cockpitMode])

  return <div ref={containerRef} className={styles.mapContainer} />
}

// ── Mapbox Standard style config ──────────────────────────────────────────
// Standard has built-in 3D buildings with dynamic lighting — configure via
// the config API instead of adding manual fill-extrusion layers.
function applyStandardConfig(map, lightPreset = 'night') {
  try {
    map.setConfigProperty('basemap', 'lightPreset',              lightPreset)
    map.setConfigProperty('basemap', 'showPointOfInterestLabels', true)
    map.setConfigProperty('basemap', 'showTransitLabels',         true)
    map.setConfigProperty('basemap', 'showPlaceLabels',           true)
    map.setConfigProperty('basemap', 'showRoadLabels',            true)
  } catch (_) { /* style may not have fully loaded yet */ }
}

// ── 3D buildings (legacy styles only) ────────────────────────────────────
function add3DBuildings(map) {
  if (map.getLayer('3d-buildings')) return
  const layers       = map.getStyle().layers
  const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id

  map.addLayer({
    id:             '3d-buildings',
    source:         'composite',
    'source-layer': 'building',
    filter:         ['==', 'extrude', 'true'],
    type:           'fill-extrusion',
    minzoom:        14,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['zoom'], 14, '#111827', 16, '#1C2333'],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.05, ['get', 'height']],
      'fill-extrusion-base':   ['interpolate', ['linear'], ['zoom'], 14, 0, 14.05, ['get', 'min_height']],
      'fill-extrusion-opacity':                     0.8,
      'fill-extrusion-ambient-occlusion-intensity': 0.4,
      'fill-extrusion-ambient-occlusion-radius':    4,
    },
  }, labelLayerId)
}

// ── Terrain + atmosphere ──────────────────────────────────────────────────
function addTerrain(map) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type:     'raster-dem',
      url:      'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom:  14,
    })
  }
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.3 })
  map.setFog({
    color:            'rgb(8, 12, 22)',
    'high-color':     'rgb(18, 24, 46)',
    'horizon-blend':  0.05,
    'space-color':    'rgb(3, 6, 16)',
    'star-intensity': 0.6,
  })
}

// ── Traffic layer ─────────────────────────────────────────────────────────
function addTrafficLayers(map) {
  if (!map.getSource('mapbox-traffic')) {
    map.addSource('mapbox-traffic', { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' })
  }
  if (!map.getLayer('traffic-line')) {
    map.addLayer({
      id:             'traffic-line',
      type:           'line',
      source:         'mapbox-traffic',
      'source-layer': 'traffic',
      slot:           'top',
      minzoom:        8,
      paint: {
        'line-width':   ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 4.5, 18, 8],
        'line-opacity': 0.85,
        'line-color': [
          'match', ['get', 'congestion'],
          'low',      '#22c55e',
          'moderate', '#f59e0b',
          'heavy',    '#ef4444',
          'severe',   '#b91c1c',
          '#64748b',
        ],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    })
  }
}

function syncTrafficVisibility(map, showTraffic) {
  if (!map.getLayer('traffic-line')) return
  map.setLayoutProperty('traffic-line', 'visibility', showTraffic ? 'visible' : 'none')
}

// ── User location marker — changeable icon ──────────────────────────────
// 'arrow' = classic nav arrow; 'car'/'truck'/'suv'/'van' = top-down vehicle
// avatars. All point up; the Mapbox marker rotation handles heading.
function createLocationMarker(icon = 'arrow') {
  const el = document.createElement('div')
  el.style.cssText = 'width:44px;height:44px;position:relative;'

  const ring = (inner) => `
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55));">${inner}</div>`

  if (icon === 'arrow') {
    el.innerHTML = ring(`
      <svg width="34" height="34" viewBox="0 0 34 34">
        <path d="M17 3 L27 24 L17 19.5 L7 24 Z"
          fill="#ffffff" stroke="#0b2a4a" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M17 3 L27 24 L17 19.5 L7 24 Z"
          fill="none" stroke="rgba(0,212,255,0.9)" stroke-width="1" stroke-linejoin="round"
          transform="translate(0,0) scale(0.82) translate(3.7,3.7)"/>
      </svg>`)
    return el
  }

  // Vehicle avatars: top-down silhouette in a dark disc with cyan trim.
  const bodies = {
    car:   `<rect x="11" y="5" width="12" height="24" rx="4" fill="#dfe6f2"/>
            <rect x="12.5" y="10" width="9" height="6" rx="1.5" fill="#0b1626"/>
            <rect x="12.5" y="18.5" width="9" height="4" rx="1.5" fill="#16283f"/>`,
    truck: `<rect x="10" y="4" width="14" height="10" rx="2" fill="#dfe6f2"/>
            <rect x="12" y="6" width="10" height="4" rx="1" fill="#0b1626"/>
            <rect x="11" y="15" width="12" height="15" rx="2" fill="#b9c6da"/>
            <rect x="11" y="15" width="12" height="3" fill="#8fa0b8"/>`,
    suv:   `<rect x="10" y="5" width="14" height="24" rx="5" fill="#dfe6f2"/>
            <rect x="12" y="9" width="10" height="7" rx="2" fill="#0b1626"/>
            <rect x="12" y="18" width="10" height="5" rx="2" fill="#16283f"/>`,
    van:   `<rect x="9" y="4" width="16" height="26" rx="4" fill="#dfe6f2"/>
            <rect x="11.5" y="7" width="11" height="5" rx="1.5" fill="#0b1626"/>
            <rect x="11.5" y="14" width="11" height="12" rx="1.5" fill="#b9c6da"/>`,
  }
  const body = bodies[icon] || bodies.car
  el.innerHTML = ring(`
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="18" fill="rgba(6,10,18,0.88)"
        stroke="rgba(0,212,255,0.55)" stroke-width="1.5"/>
      <g transform="translate(3,3)">${body}</g>
    </svg>`)
  return el
}

// ── Exported map utilities ────────────────────────────────────────────────
export function flyToUser() {
  const map = window._3dstreetsMap
  if (!map) return
  const loc = useStore.getState().userLocation
  if (!loc) return
  map.flyTo({ center: [loc.lng, loc.lat], zoom: 16, pitch: 55, duration: 1200 })
}

export function drawRoute(geojson, isAlternate = false) {
  const map = window._3dstreetsMap
  if (!map) return

  if (!isAlternate) {
    _drawnRoutes = [{ geojson, isAlternate: false }]
  } else {
    _drawnRoutes = [
      ..._drawnRoutes.filter(r => !r.isAlternate),
      { geojson, isAlternate: true },
    ]
  }
  _applyRouteToMap(map, geojson, isAlternate)
}

// Premium route rendering — 3 layers: glow bloom → dark casing → bright line
function _applyRouteToMap(map, geojson, isAlternate = false) {
  const sourceId = isAlternate ? 'route-alt'      : 'route-main'
  const glowId   = isAlternate ? null              : 'route-glow'
  const casingId = isAlternate ? null              : 'route-casing'
  const layerId  = isAlternate ? 'route-layer-alt' : 'route-layer'

  ;[layerId, casingId, glowId].filter(Boolean).forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(sourceId)) map.removeSource(sourceId)

  map.addSource(sourceId, { type: 'geojson', data: geojson })

  if (!isAlternate) {
    // Layer 1 — wide soft bloom
    map.addLayer({
      id: glowId, type: 'line', source: sourceId,
      slot: 'top',
      paint: {
        'line-color':   ROUTE_GLOW_COLOR,
        'line-width':   ['interpolate', ['linear'], ['zoom'], 10, 12, 16, 22],
        'line-blur':    10,
        'line-opacity': 0.3,
        'line-emissive-strength': 0.75,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
    // Layer 2 — dark casing border
    map.addLayer({
      id: casingId, type: 'line', source: sourceId,
      slot: 'top',
      paint: {
        'line-color':   ROUTE_CASING_COLOR,
        'line-width':   ['interpolate', ['linear'], ['zoom'], 10, 10, 16, 14],
        'line-opacity': 0.9,
        'line-emissive-strength': 0.2,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
  }

  // Layer 3 — main bright route line
  map.addLayer({
    id: layerId, type: 'line', source: sourceId,
    slot: 'top',
    paint: {
      'line-color':   isAlternate ? ROUTE_ALT_COLOR : ROUTE_COLOR,
      'line-width':   isAlternate
        ? ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 5]
        : ['interpolate', ['linear'], ['zoom'], 10, 6, 16, 9],
      'line-opacity': isAlternate ? 0.55 : 1,
      'line-emissive-strength': isAlternate ? 0.1 : 0.95,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
}

export function clearRoute() {
  const map = window._3dstreetsMap
  _drawnRoutes      = []
  if (!map) return
  ;[
    'route-layer', 'route-layer-alt',
    'route-glow',  'route-casing',
    'route-main',  'route-alt',
    'sketch-layer', 'sketch-source',
    'route-severity', 'route-severity-src',
  ].forEach(id => {
    if (map.getLayer(id))   map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  })
}

// ── Forza suggested driving line ─────────────────────────────────────────
// Colors the upcoming stretch of the current step like Forza's suggested
// line: blue (#2E9BFF) = accelerate/keep going, red (#FF2A1A) = brake
// ahead (sharp turn, uturn, roundabout, arrival). Updated at nav tick rate.
const SEVERITY_SRC = 'route-severity-src'
const SEVERITY_LYR = 'route-severity'
const SUGGEST_BLUE = '#2E9BFF'
const SUGGEST_RED  = '#FF2A1A'

function _suggestColor(step) {
  if (!step) return SUGGEST_BLUE
  const mod  = String(step.modifier || '').toLowerCase()
  const type = String(step.maneuver || '').toLowerCase()
  const brake =
    mod.includes('sharp') || mod.includes('uturn') ||
    ['roundabout', 'rotary', 'arrive', 'exit roundabout', 'exit rotary'].includes(type)
  return brake ? SUGGEST_RED : SUGGEST_BLUE
}

function _nearestCoordIdx(coords, lng, lat) {
  let bi = 0, bd = Infinity
  for (let i = 0; i < coords.length; i += 4) {
    const dx = coords[i][0] - lng, dy = coords[i][1] - lat
    const d = dx * dx + dy * dy
    if (d < bd) { bd = d; bi = i }
  }
  for (let i = Math.max(0, bi - 4); i < Math.min(coords.length, bi + 5); i++) {
    const dx = coords[i][0] - lng, dy = coords[i][1] - lat
    const d = dx * dx + dy * dy
    if (d < bd) { bd = d; bi = i }
  }
  return bi
}

export function updateRouteSeverity() {
  const map = window._3dstreetsMap
  if (!map || !map.getLayer('route-layer')) return
  const st = useStore.getState()
  const coords = st.selectedRoute?.geometry?.coordinates
  const loc = st.userLocation

  if (st.phase !== PHASE.NAVIGATING || !loc || !Array.isArray(coords) || coords.length < 2) {
    if (map.getSource(SEVERITY_SRC)) {
      map.getSource(SEVERITY_SRC).setData({ type: 'FeatureCollection', features: [] })
    }
    return
  }

  if (!map.getSource(SEVERITY_SRC)) {
    map.addSource(SEVERITY_SRC, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: SEVERITY_LYR, type: 'line', source: SEVERITY_SRC, slot: 'top',
      paint: {
        'line-color': SUGGEST_BLUE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 10],
        'line-opacity': 0.95,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    })
  }

  const next = st.routeSteps?.[st.currentStepIndex + 1]
  const a = _nearestCoordIdx(coords, loc.lng, loc.lat)
  let b = Math.min(coords.length - 1, a + 60)
  if (next?.location) {
    const mb = _nearestCoordIdx(coords, next.location[0], next.location[1])
    b = Math.max(a + 2, mb + 1)
  }
  const seg = coords.slice(a, b)
  seg[0] = [loc.lng, loc.lat] // start exactly at the car

  map.getSource(SEVERITY_SRC).setData({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: seg },
    properties: {},
  })
  map.setPaintProperty(SEVERITY_LYR, 'line-color', _suggestColor(next))
}

export function fitRoute(coordinates, bottomPad = 320) {
  const map = window._3dstreetsMap
  if (!map || !coordinates?.length) return
  const bounds = coordinates.reduce(
    (b, c) => b.extend(c),
    new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
  )
  map.fitBounds(bounds, {
    padding:  { top: 120, right: 70, bottom: bottomPad, left: 70 },
    pitch:    52,
    duration: 1000,
  })
}

