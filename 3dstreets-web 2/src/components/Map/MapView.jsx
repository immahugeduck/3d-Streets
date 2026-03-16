import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import useStore, { MAP_STYLES } from '../../store/appStore'
import styles from './MapView.module.css'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

export default function MapView() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const userMarkerRef = useRef(null)

  const setMapRef   = useStore(s => s.setMapRef)
  const mapStyle    = useStore(s => s.mapStyle)
  const is3D        = useStore(s => s.is3D)
  const showTraffic = useStore(s => s.showTraffic)
  const userLocation = useStore(s => s.userLocation)
  const userHeading  = useStore(s => s.userHeading)

  // ── Init map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLES.dark.uri,
      center: [-98.5795, 39.8283], // Center of US
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
    })

    mapRef.current = map
    setMapRef(map)
    window._3dstreetsMap = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Style changes ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = MAP_STYLES[mapStyle]?.uri ?? MAP_STYLES.dark.uri
    map.setStyle(style)
    map.once('style.load', () => {
      add3DBuildings(map)
      addTerrain(map)
    })
  }, [mapStyle])

  // ── 3D pitch toggle ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch: is3D ? 55 : 0, duration: 500 })
  }, [is3D])

  // ── User location puck ───────────────────────────────────────────────────
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

  return <div ref={containerRef} className={styles.mapContainer} />
}

// ── Helpers ────────────────────────────────────────────────────────────────

function add3DBuildings(map) {
  if (map.getLayer('3d-buildings')) return
  const layers = map.getStyle().layers
  let labelLayerId = layers.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id

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
  // Mapbox traffic source
  if (!map.getSource('mapbox-traffic')) {
    map.addSource('mapbox-traffic', {
      type: 'vector',
      url: 'mapbox://mapbox.mapbox-traffic-v1',
    })
  }
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

// ── Public map helpers (called from other components) ─────────────────────

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
  const sourceId = isAlternate ? 'route-alt' : 'route-main'
  const glowId   = isAlternate ? null : 'route-glow'
  const layerId  = isAlternate ? 'route-layer-alt' : 'route-layer'

  // Remove existing
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
