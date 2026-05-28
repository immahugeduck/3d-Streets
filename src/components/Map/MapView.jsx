import { useEffect, useRef } from 'react'
import { Loader } from '@googlemaps/js-api-loader'
import useStore, { MAP_STYLES, PHASE } from '../../store/appStore'
import styles from './MapView.module.css'

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

// ── Route visual constants ────────────────────────────────────────────────
const ROUTE_COLOR        = '#39D0FF'
const ROUTE_CASING_COLOR = '#0B2A4A'
const ROUTE_GLOW_COLOR   = '#1EA7FF'
const ROUTE_ALT_COLOR    = '#7A8796'

const MAX_DRIVING_SPEED_MPH   = 85
const BASE_LOOK_AHEAD_M       = 55
const SPEED_LOOK_AHEAD_FACTOR = 0.9

// ── Google Maps dark style ────────────────────────────────────────────────
const DARK_GM_STYLE = [
  { elementType: 'geometry',           stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.icon',        stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#8a9bb2' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative.land_parcel',  stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi',          elementType: 'geometry',      stylers: [{ color: '#131c2e' }] },
  { featureType: 'poi',          elementType: 'labels.text',   stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park',     elementType: 'geometry',      stylers: [{ color: '#0e1d26' }] },
  { featureType: 'poi.park',     elementType: 'labels.text.fill', stylers: [{ color: '#4a6741' }] },
  { featureType: 'road',         elementType: 'geometry',      stylers: [{ color: '#1c2740' }] },
  { featureType: 'road',         elementType: 'geometry.stroke', stylers: [{ color: '#0a1020' }] },
  { featureType: 'road',         elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry',      stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#f3d19c' }] },
  { featureType: 'transit',      elementType: 'geometry',      stylers: [{ color: '#1a2035' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d59563' }] },
  { featureType: 'water',        elementType: 'geometry',      stylers: [{ color: '#071018' }] },
  { featureType: 'water',        elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'water',        elementType: 'labels.text.stroke', stylers: [{ color: '#071018' }] },
]

const LIGHT_GM_STYLE = null // Google default light style

// ── Module-level singletons ───────────────────────────────────────────────
let _googleApi         = null  // { maps } after loader resolves
let _mapInstance       = null  // google.maps.Map
let _routePolylines    = []    // active route polylines on map
let _routeCoordinates  = []    // [[lng,lat]…] for off-route detection
let _trafficLayer      = null
let _loaderPromise     = null

export function setRouteGeometry(coords) {
  _routeCoordinates = Array.isArray(coords) ? coords : []
}

function getLoader() {
  if (_loaderPromise) return _loaderPromise
  _loaderPromise = new Loader({
    apiKey:  API_KEY,
    version: 'weekly',
    libraries: ['maps', 'marker'],
  }).load()
  return _loaderPromise
}

// ── Component ─────────────────────────────────────────────────────────────
export default function MapView() {
  const containerRef        = useRef(null)
  const userMarkerRef       = useRef(null)
  const lastCameraUpdateRef = useRef(0)
  const hasCenteredOnUser   = useRef(false)

  const setMapRef       = useStore(s => s.setMapRef)
  const setUserLocation = useStore(s => s.setUserLocation)
  const mapStyle        = useStore(s => s.mapStyle)
  const is3D            = useStore(s => s.is3D)
  const showTraffic     = useStore(s => s.showTraffic)
  const userLocation    = useStore(s => s.userLocation)
  const userHeading     = useStore(s => s.userHeading)
  const speedMPH        = useStore(s => s.speedMPH)
  const phase           = useStore(s => s.phase)
  const drivingView     = useStore(s => s.drivingView)

  // ── Map init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (_mapInstance) {
      // Map already exists — reattach to new container (StrictMode remount)
      containerRef.current && _mapInstance.setOptions({ mapTypeControl: false })
      return
    }

    getLoader().then(google => {
      _googleApi = google

      const styleDef = MAP_STYLES[useStore.getState().mapStyle] ?? MAP_STYLES.dark

      const map = new google.maps.Map(containerRef.current, {
        center:           { lat: 39.6448, lng: -86.8647 },
        zoom:             12,
        tilt:             55,
        heading:          0,
        mapTypeId:        styleDef.gmType || 'roadmap',
        styles:           styleDef.gmStyle ?? DARK_GM_STYLE,
        disableDefaultUI: true,
        gestureHandling:  'greedy',
        isFractionalZoomEnabled: true,
      })

      _mapInstance         = map
      window._3dstreetsMap = map
      setMapRef(map)

      _trafficLayer = new google.maps.TrafficLayer()
      _trafficLayer.setOptions({ autoRefresh: true })
      if (useStore.getState().showTraffic) _trafficLayer.setMap(map)

      // Fly to user GPS on first load
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          ({ coords: { latitude: lat, longitude: lng } }) => {
            setUserLocation({ lat, lng })
            map.panTo({ lat, lng })
            map.setZoom(15)
          },
          err => console.warn('[MapView] Geolocation unavailable:', err.message),
          { enableHighAccuracy: true, timeout: 8000 },
        )
      }
    })

    return () => {
      // Don't destroy the map on unmount — Google Maps teardown is expensive
      // and StrictMode mounts twice. The module-level singleton persists.
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style switching ──────────────────────────────────────────────────
  useEffect(() => {
    if (!_mapInstance) return
    const styleDef = MAP_STYLES[mapStyle] ?? MAP_STYLES.dark
    _mapInstance.setMapTypeId(styleDef.gmType || 'roadmap')
    _mapInstance.setOptions({ styles: styleDef.gmStyle ?? DARK_GM_STYLE })
  }, [mapStyle])

  // ── 3D pitch toggle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!_mapInstance || phase === PHASE.NAVIGATING) return
    _mapInstance.setTilt(is3D ? 55 : 0)
  }, [is3D, phase])

  // ── Traffic layer sync ───────────────────────────────────────────────
  useEffect(() => {
    if (!_trafficLayer) return
    _trafficLayer.setMap(showTraffic ? _mapInstance : null)
  }, [showTraffic])

  // ── User location puck ───────────────────────────────────────────────
  useEffect(() => {
    if (!_mapInstance || !_googleApi || !userLocation) return

    if (!userMarkerRef.current) {
      const el  = createPuckElement()
      const Adv = _googleApi.maps.marker?.AdvancedMarkerElement
      if (Adv) {
        userMarkerRef.current = new Adv({
          position: { lat: userLocation.lat, lng: userLocation.lng },
          map:      _mapInstance,
          content:  el,
        })
      } else {
        userMarkerRef.current = new _googleApi.maps.Marker({
          position: { lat: userLocation.lat, lng: userLocation.lng },
          map:      _mapInstance,
          icon:     { url: puckSvgUrl(), scaledSize: new _googleApi.maps.Size(28, 28) },
        })
      }
    } else {
      const pos = { lat: userLocation.lat, lng: userLocation.lng }
      userMarkerRef.current.position
        ? (userMarkerRef.current.position = pos)
        : userMarkerRef.current.setPosition(pos)
    }

    if (userHeading != null && userMarkerRef.current.setRotation) {
      userMarkerRef.current.setRotation(userHeading)
    }

    if (!hasCenteredOnUser.current && phase !== PHASE.NAVIGATING) {
      hasCenteredOnUser.current = true
      _mapInstance.panTo({ lat: userLocation.lat, lng: userLocation.lng })
      _mapInstance.setZoom(14)
      _mapInstance.setTilt(is3D ? 55 : 0)
    }
  }, [userLocation, userHeading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hide puck in driving view ────────────────────────────────────────
  useEffect(() => {
    if (!userMarkerRef.current) return
    const el = userMarkerRef.current.content ?? userMarkerRef.current.getIcon?.()
    if (!el) return
    const hide = phase === PHASE.NAVIGATING && (drivingView || is3D)
    if (userMarkerRef.current.content) {
      userMarkerRef.current.content.style.opacity = hide ? '0' : '1'
    }
  }, [phase, drivingView, is3D])

  // ── Camera follow during navigation ─────────────────────────────────
  useEffect(() => {
    if (!_mapInstance || !userLocation || phase !== PHASE.NAVIGATING) return

    const now = Date.now()
    if (now - lastCameraUpdateRef.current < 250) return
    lastCameraUpdateRef.current = now

    const heading = userHeading ?? _mapInstance.getHeading() ?? 0

    if (drivingView) {
      const clampedSpeed = Math.max(0, Math.min(speedMPH ?? 0, MAX_DRIVING_SPEED_MPH))
      const lookAheadM   = BASE_LOOK_AHEAD_M + clampedSpeed * SPEED_LOOK_AHEAD_FACTOR
      const bearingRad   = heading * (Math.PI / 180)
      const latRad       = userLocation.lat * (Math.PI / 180)
      const dLat = (lookAheadM * Math.cos(bearingRad)) / 111320
      const dLng = (lookAheadM * Math.sin(bearingRad)) / (111320 * Math.cos(latRad))

      _mapInstance.moveCamera({
        center:  { lat: userLocation.lat + dLat, lng: userLocation.lng + dLng },
        zoom:    19,
        tilt:    78,
        heading,
      })
    } else {
      _mapInstance.moveCamera({
        center:  { lat: userLocation.lat, lng: userLocation.lng },
        zoom:    17.5,
        tilt:    is3D ? 70 : 0,
        heading,
      })
    }
  }, [userLocation, userHeading, phase, is3D, drivingView, speedMPH])

  return <div ref={containerRef} className={styles.mapContainer} />
}

// ── User puck ─────────────────────────────────────────────────────────────
function createPuckElement() {
  const el = document.createElement('div')
  el.style.cssText = 'width:28px;height:28px;position:relative;'
  el.innerHTML = `
    <div style="
      position:absolute;inset:-6px;border-radius:50%;
      background:rgba(255,149,0,0.15);
      animation:puck-ring 2.2s ease-out infinite;
    "></div>
    <div style="
      position:absolute;inset:0;border-radius:50%;
      background:radial-gradient(circle at 38% 38%,#FF9500,#CC5500);
      border:2.5px solid rgba(255,255,255,0.9);
      box-shadow:0 0 14px rgba(255,149,0,0.85),0 0 4px rgba(255,149,0,0.5);
    "></div>
    <style>
      @keyframes puck-ring{0%{transform:scale(1);opacity:.5}100%{transform:scale(2.6);opacity:0}}
    </style>
  `
  return el
}

function puckSvgUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="12" fill="#FF9500" stroke="white" stroke-width="2.5"/>
  </svg>`
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// ── Exported map utilities (same API as Mapbox version) ───────────────────

export function flyToUser() {
  const loc = useStore.getState().userLocation
  if (!_mapInstance || !loc) return
  _mapInstance.panTo({ lat: loc.lat, lng: loc.lng })
  _mapInstance.setZoom(16)
  _mapInstance.setTilt(55)
}

export function drawRoute(geojson, isAlternate = false) {
  if (!_mapInstance || !_googleApi) return

  // Remove existing polylines for this route slot
  const toRemove = isAlternate
    ? _routePolylines.filter(p => p._isAlternate)
    : _routePolylines.filter(p => !p._isAlternate)
  toRemove.forEach(p => { p.setMap(null); p._layers?.forEach(l => l.setMap(null)) })
  _routePolylines = isAlternate
    ? _routePolylines.filter(p => !p._isAlternate)
    : _routePolylines.filter(p => p._isAlternate)

  const coords = geojson.coordinates.map(([lng, lat]) => ({ lat, lng }))

  if (isAlternate) {
    const alt = new _googleApi.maps.Polyline({
      path:          coords,
      strokeColor:   ROUTE_ALT_COLOR,
      strokeWeight:  5,
      strokeOpacity: 0.55,
      map:           _mapInstance,
    })
    alt._isAlternate = true
    _routePolylines.push(alt)
  } else {
    // Layer 1 — wide soft glow
    const glow = new _googleApi.maps.Polyline({
      path:          coords,
      strokeColor:   ROUTE_GLOW_COLOR,
      strokeWeight:  22,
      strokeOpacity: 0.2,
      map:           _mapInstance,
    })
    // Layer 2 — dark casing
    const casing = new _googleApi.maps.Polyline({
      path:          coords,
      strokeColor:   ROUTE_CASING_COLOR,
      strokeWeight:  14,
      strokeOpacity: 0.9,
      map:           _mapInstance,
    })
    // Layer 3 — bright line
    const line = new _googleApi.maps.Polyline({
      path:          coords,
      strokeColor:   ROUTE_COLOR,
      strokeWeight:  8,
      strokeOpacity: 1.0,
      map:           _mapInstance,
    })
    glow._isAlternate   = false
    casing._isAlternate = false
    line._isAlternate   = false
    _routePolylines.push(glow, casing, line)
  }
}

export function clearRoute() {
  _routePolylines.forEach(p => p.setMap(null))
  _routePolylines   = []
  _routeCoordinates = []
}

export function fitRoute(coordinates) {
  if (!_mapInstance || !_googleApi || !coordinates?.length) return
  const bounds = new _googleApi.maps.LatLngBounds()
  coordinates.forEach(([lng, lat]) => bounds.extend({ lat, lng }))
  _mapInstance.fitBounds(bounds, { top: 120, right: 70, bottom: 320, left: 70 })
  _mapInstance.setTilt(52)
}

export function drawSketchPreview(coords) {
  if (!_mapInstance || !_googleApi || coords.length < 2) return
  clearSketch()
  const sketch = new _googleApi.maps.Polyline({
    path:          coords.map(c => ({ lat: c.lat, lng: c.lng })),
    strokeColor:   ROUTE_COLOR,
    strokeWeight:  3,
    strokeOpacity: 0.85,
    icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '20px' }],
    map: _mapInstance,
  })
  sketch._isSketch = true
  _routePolylines.push(sketch)
}

function clearSketch() {
  const sketches = _routePolylines.filter(p => p._isSketch)
  sketches.forEach(p => p.setMap(null))
  _routePolylines = _routePolylines.filter(p => !p._isSketch)
}
