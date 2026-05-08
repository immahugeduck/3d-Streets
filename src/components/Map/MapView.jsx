import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore, { MAP_STYLES, PHASE } from '../../store/appStore'
import styles from './MapView.module.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// ── Route color constants — change these to retheme the route line ─────────
const ROUTE_COLOR        = '#FF9500'  // neon orange primary line
const ROUTE_CASING_COLOR = '#7A3800'  // dark burnt-orange border (creates depth)
const ROUTE_GLOW_COLOR   = '#FF6600'  // slightly redder for the bloom effect
const ROUTE_ALT_COLOR    = '#5A4030'  // muted brown for alternate routes

// ── Module-level caches ───────────────────────────────────────────────────
let _drawnRoutes      = []
let _routeCoordinates = []

export function setRouteGeometry(coords) {
  _routeCoordinates = Array.isArray(coords) ? coords : []
}

// ── Component ─────────────────────────────────────────────────────────────
export default function MapView() {
  const containerRef        = useRef(null)
  const mapRef              = useRef(null)
  const userMarkerRef       = useRef(null)
  const lastCameraUpdateRef = useRef(0)
  const hasCenteredOnUser = useRef(false)

  const setMapRef       = useStore(s => s.setMapRef)
  const setUserLocation = useStore(s => s.setUserLocation)
  const mapStyle        = useStore(s => s.mapStyle)
  const is3D            = useStore(s => s.is3D)
  const showTraffic     = useStore(s => s.showTraffic)
  const userLocation    = useStore(s => s.userLocation)
  const userHeading     = useStore(s => s.userHeading)
  const phase           = useStore(s => s.phase)
  const drivingView     = useStore(s => s.drivingView)

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

      // Fly to user's GPS position as soon as map is ready
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const { latitude: lat, longitude: lng } = coords
            setUserLocation({ lat, lng })
            map.flyTo({ center: [lng, lat], zoom: 15, pitch: 55, duration: 1800, essential: true })
          },
          (err) => console.warn('[MapView] Geolocation unavailable:', err.message),
          { enableHighAccuracy: true, timeout: 8000 }
        )
      }
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
  }, [mapStyle, showTraffic])

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

  // ── User puck marker ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return

    if (!userMarkerRef.current) {
      const el = createUserPuck()
      userMarkerRef.current = new mapboxgl.Marker({
        element:           el,
        rotationAlignment: 'map',
        pitchAlignment:    'map',
      })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat])
    }

    if (userHeading !== null && userHeading !== undefined) {
      userMarkerRef.current.setRotation(userHeading)
    }

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
  }, [userLocation, userHeading])

  // ── Hide puck in driving view (hood IS the location indicator) ────────
  useEffect(() => {
    if (!userMarkerRef.current) return
    const el = userMarkerRef.current.getElement()
    if (phase === PHASE.NAVIGATING && drivingView) {
      el.style.opacity       = '0'
      el.style.pointerEvents = 'none'
    } else {
      el.style.opacity       = '1'
      el.style.pointerEvents = 'auto'
    }
  }, [phase, drivingView])

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
      // Hood-of-car perspective: project the camera center 80 m ahead along
      // the heading so the device position sits near the bottom of the screen.
      const LOOK_AHEAD_M = 80
      const bearingRad   = bearing * (Math.PI / 180)
      const latRad       = userLocation.lat * (Math.PI / 180)
      const dLat = (LOOK_AHEAD_M * Math.cos(bearingRad)) / 111320
      const dLng = (LOOK_AHEAD_M * Math.sin(bearingRad)) / (111320 * Math.cos(latRad))

      map.easeTo({
        center:   [userLocation.lng + dLng, userLocation.lat + dLat],
        zoom:     18.5,
        pitch:    72,
        bearing,
        duration: 250,
      })
    } else {
      map.easeTo({
        center:   [userLocation.lng, userLocation.lat],
        zoom:     17.5,
        pitch:    is3D ? 70 : 0,
        bearing,
        duration: 500,
      })
    }
  }, [userLocation, userHeading, phase, is3D, drivingView])

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

// ── User puck — orange directional dot ───────────────────────────────────
function createUserPuck() {
  const el = document.createElement('div')
  el.style.cssText = 'width:28px;height:28px;position:relative;'
  el.innerHTML = `
    <div style="
      position:absolute; inset:-6px; border-radius:50%;
      background:rgba(255,149,0,0.15);
      animation:puck-ring 2.2s ease-out infinite;
    "></div>
    <div style="
      position:absolute; inset:0; border-radius:50%;
      background:radial-gradient(circle at 38% 38%, #FF9500, #CC5500);
      border:2.5px solid rgba(255,255,255,0.9);
      box-shadow:0 0 14px rgba(255,149,0,0.85), 0 0 4px rgba(255,149,0,0.5);
    "></div>
    <style>
      @keyframes puck-ring {
        0%   { transform:scale(1);   opacity:.5 }
        100% { transform:scale(2.6); opacity:0  }
      }
    </style>
  `
  return el
}

// ── Exported map utilities ────────────────────────────────────────────────
export function flyToUser() {
  const map   = window._3dstreetsMap
  const store = window._3dstreetsStore
  if (!map || !store) return
  const loc = store.getState().userLocation
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
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
}

export function clearRoute() {
  const map = window._3dstreetsMap
  _drawnRoutes      = []
  _routeCoordinates = []
  if (!map) return
  ;[
    'route-layer', 'route-layer-alt',
    'route-glow',  'route-casing',
    'route-main',  'route-alt',
    'sketch-layer', 'sketch-source',
  ].forEach(id => {
    if (map.getLayer(id))   map.removeLayer(id)
    if (map.getSource(id)) map.removeSource(id)
  })
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

export function drawSketchPreview(coords) {
  const map = window._3dstreetsMap
  if (!map || coords.length < 2) return
  if (map.getLayer('sketch-layer'))   map.removeLayer('sketch-layer')
  if (map.getSource('sketch-source')) map.removeSource('sketch-source')

  map.addSource('sketch-source', {
    type: 'geojson',
    data: {
      type:     'Feature',
      geometry: { type: 'LineString', coordinates: coords.map(c => [c.lng, c.lat]) },
    },
  })
  map.addLayer({
    id: 'sketch-layer', type: 'line', source: 'sketch-source',
    slot: 'top',
    paint: {
      'line-color':     ROUTE_COLOR,
      'line-width':     3,
      'line-dasharray': [5, 4],
      'line-opacity':   0.85,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  })
}
