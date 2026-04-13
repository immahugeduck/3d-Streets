import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore, { MAP_STYLES, PHASE } from '../../store/appStore'
import styles from './MapView.module.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

// Module-level cache of drawn routes for redrawing after style changes
let _drawnRoutes = []

export default function MapView() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const userMarkerRef = useRef(null)
  const lastCameraUpdateRef = useRef(0)

  const setMapRef    = useStore(s => s.setMapRef)
  const mapStyle     = useStore(s => s.mapStyle)
  const is3D         = useStore(s => s.is3D)
  const showTraffic  = useStore(s => s.showTraffic)
  const userLocation = useStore(s => s.userLocation)
  const userHeading  = useStore(s => s.userHeading)
  const phase        = useStore(s => s.phase)

  useEffect(() => {
    if (mapRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES.dark.uri,
      center: [-98.5795, 39.8283],
      zoom: 4,
      pitch: 55,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    })

    map.on('load', () => {
      add3DBuildings(map)
      addTerrain(map)
      addTrafficLayers(map)
      syncTrafficVisibility(map, showTraffic)
    })

    mapRef.current = map
    setMapRef(map)
    window._3dstreetsMap = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = MAP_STYLES[mapStyle]?.uri ?? MAP_STYLES.dark.uri
    map.setStyle(style)
    map.once('style.load', () => {
      add3DBuildings(map)
      addTerrain(map)
      // Redraw any previously drawn routes after style reload
      _drawnRoutes.forEach(({ geojson, isAlternate }) => {
        _applyRouteToMap(map, geojson, isAlternate)
      })
      addTrafficLayers(map)
      syncTrafficVisibility(map, showTraffic)
    })
  }, [mapStyle, showTraffic])

  useEffect(() => {
    const map = mapRef.current
    if (!map || phase === PHASE.NAVIGATING) return
    map.easeTo({ pitch: is3D ? 55 : 0, duration: 500 })
  }, [is3D, phase])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) syncTrafficVisibility(map, showTraffic)
    else map.once('style.load', () => syncTrafficVisibility(map, showTraffic))
  }, [showTraffic])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation) return

    if (!userMarkerRef.current) {
      const el = createUserPuck()
      userMarkerRef.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat])
    }

    if (userHeading !== null) {
      userMarkerRef.current.setRotation(userHeading)
    }
  }, [userLocation, userHeading])

  // ── Camera follow during navigation ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !userLocation || phase !== PHASE.NAVIGATING) return

    const now = Date.now()
    if (now - lastCameraUpdateRef.current < 500) return  // throttle to ≤ 2 Hz
    lastCameraUpdateRef.current = now

    const bearing = (userHeading !== null && userHeading !== undefined)
      ? userHeading
      : map.getBearing()
    map.easeTo({
      center:   [userLocation.lng, userLocation.lat],
      zoom:     17.5,
      pitch:    is3D ? 70 : 0,
      bearing,
      duration: 600,
    })
  }, [userLocation, userHeading, phase, is3D])

  return <div ref={containerRef} className={styles.mapContainer} />
}

function add3DBuildings(map) {
  if (map.getLayer('3d-buildings')) return
  const layers = map.getStyle().layers
  const labelLayerId = layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id

  map.addLayer({
    id: '3d-buildings',
    source: 'composite',
    'source-layer': 'building',
    filter: ['==', 'extrude', 'true'],
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['zoom'],
        14, '#111827',
        16, '#1C2333',
      ],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'],
        14, 0,
        14.05, ['get', 'height'],
      ],
      'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'],
        14, 0,
        14.05, ['get', 'min_height'],
      ],
      'fill-extrusion-opacity': 0.75,
      'fill-extrusion-ambient-occlusion-intensity': 0.35,
      'fill-extrusion-ambient-occlusion-radius': 4,
    },
  }, labelLayerId)
}

function addTerrain(map) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    })
  }
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 })
  map.setFog({
    color: 'rgb(10,14,26)',
    'high-color': 'rgb(20,28,50)',
    'horizon-blend': 0.06,
    'space-color': 'rgb(4,8,18)',
    'star-intensity': 0.5,
  })
}

function addTrafficLayers(map) {
  if (!map.getSource('mapbox-traffic')) {
    map.addSource('mapbox-traffic', {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-traffic-v1',
    })
  }

  if (!map.getLayer('traffic-line')) {
    map.addLayer({
      id: 'traffic-line',
      type: 'line',
      source: 'mapbox-traffic',
      'source-layer': 'traffic',
      minzoom: 8,
      paint: {
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 4.5, 18, 8],
        'line-opacity': 0.85,
        'line-color': [
          'match',
          ['get', 'congestion'],
          'low', '#22c55e',
          'moderate', '#f59e0b',
          'heavy', '#ef4444',
          'severe', '#b91c1c',
          '#64748b',
        ],
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
        visibility: 'none',
      },
    })
  }
}

function syncTrafficVisibility(map, showTraffic) {
  if (!map.getLayer('traffic-line')) return
  map.setLayoutProperty('traffic-line', 'visibility', showTraffic ? 'visible' : 'none')
}

function createUserPuck() {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 22px; height: 22px;
    position: relative;
  `
  el.innerHTML = `
    <div style="
      position:absolute; inset:0;
      border-radius:50%;
      background:rgba(0,212,255,0.2);
      animation: pulse-puck 2s ease-out infinite;
    "></div>
    <div style="
      position:absolute; inset:3px;
      border-radius:50%;
      background:#00D4FF;
      border:2px solid white;
      box-shadow:0 0 12px rgba(0,212,255,0.8);
    "></div>
    <style>
      @keyframes pulse-puck {
        0%   { transform:scale(1); opacity:.6; }
        100% { transform:scale(2.8); opacity:0; }
      }
    </style>
  `
  return el
}

export function flyToUser() {
  const map = window._3dstreetsMap
  const store = window._3dstreetsStore
  if (!map || !store) return
  const loc = store.getState().userLocation
  if (!loc) return
  map.flyTo({ center: [loc.lng, loc.lat], zoom: 16, pitch: 55, duration: 1200 })
}

export function drawRoute(geojson, isAlternate = false) {
  const map = window._3dstreetsMap
  if (!map) return

  // Update the cached routes list:
  // - Primary route clears everything and becomes the sole cached entry
  // - Alternate routes are appended after removing any previous alternates
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

function _applyRouteToMap(map, geojson, isAlternate = false) {
  const sourceId = isAlternate ? 'route-alt' : 'route-main'
  const glowId   = isAlternate ? null : 'route-glow'
  const layerId  = isAlternate ? 'route-layer-alt' : 'route-layer'

  ;[layerId, glowId].filter(Boolean).forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id)
  })
  if (map.getSource(sourceId)) map.removeSource(sourceId)

  map.addSource(sourceId, { type: 'geojson', data: geojson })

  if (!isAlternate && glowId) {
    map.addLayer({
      id: glowId, type: 'line', source: sourceId,
      paint: {
        'line-color': '#00D4FF',
        'line-width': 18,
        'line-blur': 8,
        'line-opacity': 0.25,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    })
  }

  map.addLayer({
    id: layerId, type: 'line', source: sourceId,
    paint: {
      'line-color': isAlternate ? '#3D4A5C' : '#00D4FF',
      'line-width': isAlternate ? 4 : 6,
      'line-opacity': isAlternate ? 0.6 : 1,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' }
  })
}

export function clearRoute() {
  const map = window._3dstreetsMap
  _drawnRoutes = []
  if (!map) return
  ;['route-layer', 'route-layer-alt', 'route-glow', 'route-main', 'route-alt',
    'sketch-layer', 'sketch-source'].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id)
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
    padding: { top: 100, right: 60, bottom: bottomPad, left: 60 },
    pitch: 50,
    duration: 900,
  })
}

export function drawSketchPreview(coords) {
  const map = window._3dstreetsMap
  if (!map || coords.length < 2) return
  if (map.getLayer('sketch-layer')) map.removeLayer('sketch-layer')
  if (map.getSource('sketch-source')) map.removeSource('sketch-source')

  map.addSource('sketch-source', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords.map(c => [c.lng, c.lat]) }
    }
  })
  map.addLayer({
    id: 'sketch-layer', type: 'line', source: 'sketch-source',
    paint: {
      'line-color': '#00D4FF',
      'line-width': 3,
      'line-dasharray': [6, 4],
      'line-opacity': 0.8,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' }
  })
}