import { create } from 'zustand'

export const PHASE = {
  IDLE:          'IDLE',
  ROUTE_PREVIEW: 'ROUTE_PREVIEW',
  NAVIGATING:    'NAVIGATING',
  SKETCHING:     'SKETCHING',
  AI_CHAT:       'AI_CHAT',
}

export const MAP_STYLES = {
  dark: {
    uri:         'mapbox://styles/mapbox/standard',
    label:       'Dark',
    icon:        '🌑',
    isStandard:  true,
    lightPreset: 'night',
  },
  satellite: { uri: 'mapbox://styles/mapbox/satellite-streets-v12', label: 'Satellite', icon: '🛰️' },
  streets:   { uri: 'mapbox://styles/mapbox/streets-v12', label: 'Streets', icon: '🗺️' },
  outdoors:  { uri: 'mapbox://styles/mapbox/outdoors-v12', label: 'Terrain', icon: '⛰️' },
  light:     { uri: 'mapbox://styles/mapbox/light-v11', label: 'Light', icon: '☀️' },
}

export const ROUTE_PREFS = {
  fastest: {
    label:        'Fastest',
    icon:         '⚡',
    profile:      'mapbox/driving-traffic',
    exclude:      null,
    alternatives: true,
    description:  'Shortest ETA with live traffic',
  },
  scenic: {
    label:        'Scenic',
    icon:         '🌿',
    profile:      'mapbox/driving',
    exclude:      'motorway,toll',
    alternatives: true,
    description:  'Quieter roads with less highway bias',
  },
  accessible: {
    label:        'Accessible',
    icon:         '◉',
    profile:      'mapbox/driving-traffic',
    exclude:      null,
    alternatives: true,
    description:  'Favors routes with more fuel, food, and stop options',
  },
}

const PIN_STORAGE_KEY = '3d-streets.saved-pins'

function loadSavedPins() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) : []
  } catch { return [] }
}

function persistPins(pins) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins)) } catch {}
}

function makeNavResetPatch(phase = PHASE.IDLE) {
  return {
    phase,
    routeOptions: [],
    selectedRoute: null,
    routeSteps: [],
    currentStepIndex: 0,
    currentLegIndex: 0,
    legStats: [],
    eta: '--:--',
    remainingDist: '— mi',
    rerouteAvailable: false,
    rerouteTimeSave: '',
    showRouteStops: false,
    showNavSidebar: false,
    selectedStop: null,
    isReroutingActive: false,
    stepDistLabel: '',
    arrivalClockTime: '',
    arrivalVisible: false,
  }
}

const useStore = create((set, get) => ({
  phase: PHASE.IDLE,
  prevPhase: PHASE.IDLE,
  setPhase: (phase) => set({ phase }),

  mapStyle: 'dark',
  is3D: true,
  showTraffic: false,
  mapRef: null,
  drivingView: true,
  cockpitMode: 'sport',
  cockpitView: 'cockpit',
  setMapStyle: (mapStyle) => set({ mapStyle }),
  setIs3D: (is3D) => set({ is3D }),
  setShowTraffic: (showTraffic) => set({ showTraffic }),
  setMapRef: (mapRef) => set({ mapRef }),
  setDrivingView: (drivingView) => set({ drivingView }),
  toggleDrivingView: () => set(s => ({ drivingView: !s.drivingView })),
  setCockpitMode: (cockpitMode) => set({ cockpitMode }),
  setCockpitView: (cockpitView) => set({ cockpitView }),

  userLocation: null,
  userHeading: null,
  setUserLocation: (userLocation) => set({ userLocation }),
  setUserHeading: (userHeading) => set({ userHeading }),

  destination: null,
  waypoints: [],
  routePref: 'fastest',
  routeOptions: [],
  selectedRoute: null,
  routeLocked: false,
  setDestination: (destination) => set({ destination, phase: PHASE.ROUTE_PREVIEW }),
  setDestinationOnly: (destination) => set({ destination }),
  setWaypoints: (waypoints) => set({ waypoints: Array.isArray(waypoints) ? waypoints.filter(Boolean) : [] }),
  addWaypoint: (wp) => {
    if (!wp || wp.lat == null || wp.lng == null) return
    set(s => {
      if (s.waypoints.some(x => x.id && wp.id && x.id === wp.id)) return {}
      if (s.waypoints.length >= 8) return {}
      return { waypoints: [...s.waypoints, wp] }
    })
  },
  removeWaypoint: (id) => set(s => ({ waypoints: s.waypoints.filter(w => w.id !== id), selectedStop: s.selectedStop?.id === id ? null : s.selectedStop })),
  setRoutePref: (routePref) => set({ routePref }),
  setRouteOptions: (routeOptions) => set({ routeOptions: Array.isArray(routeOptions) ? routeOptions : [] }),
  setSelectedRoute: (selectedRoute) => set({ selectedRoute: selectedRoute ?? null, routeSteps: Array.isArray(selectedRoute?.steps) ? selectedRoute.steps : [], currentStepIndex: 0 }),
  setRouteLocked: (routeLocked) => set({ routeLocked }),
  toggleRouteLock: () => set(s => ({ routeLocked: !s.routeLocked, rerouteAvailable: s.routeLocked ? s.rerouteAvailable : false, rerouteTimeSave: s.routeLocked ? s.rerouteTimeSave : '' })),

  currentLegIndex: 0,
  legStats: [],
  setLegStats: (legStats) => set({ legStats: Array.isArray(legStats) ? legStats : [] }),
  advanceLeg: () => {
    const { currentLegIndex, getAllStops } = get()
    const stops = getAllStops()
    const next = currentLegIndex + 1
    if (next >= stops.length) set({ ...makeNavResetPatch(PHASE.IDLE), arrivalVisible: true })
    else set({ currentLegIndex: next })
  },

  routeSteps: [],
  currentStepIndex: 0,
  eta: '--:--',
  remainingDist: '— mi',
  speedMPH: 0,
  speedLimit: 65,
  showSpeedHUD: true,
  rerouteAvailable: false,
  rerouteTimeSave: '',
  isReroutingActive: false,
  stepDistLabel: '',
  arrivalClockTime: '',
  arrivalVisible: false,
  setRouteSteps: (routeSteps) => set(s => {
    const safeSteps = Array.isArray(routeSteps) ? routeSteps : []
    const maxIndex = Math.max(0, safeSteps.length - 1)
    return { routeSteps: safeSteps, currentStepIndex: Math.min(s.currentStepIndex, maxIndex) }
  }),
  setCurrentStepIndex: (currentStepIndex) => set(s => {
    const maxIndex = Math.max(0, (s.routeSteps?.length || 1) - 1)
    const safeIndex = Number.isFinite(currentStepIndex) ? Math.min(Math.max(0, Math.floor(currentStepIndex)), maxIndex) : 0
    return { currentStepIndex: safeIndex }
  }),
  setEta: (eta) => set({ eta }),
  setRemainingDist: (remainingDist) => set({ remainingDist }),
  setSpeedMPH: (speedMPH) => set({ speedMPH }),
  setSpeedLimit: (speedLimit) => set({ speedLimit }),
  setShowSpeedHUD: (showSpeedHUD) => set({ showSpeedHUD }),
  setRerouteAvailable: (rerouteAvailable, rerouteTimeSave = '') => set({ rerouteAvailable, rerouteTimeSave }),
  setIsReroutingActive: (isReroutingActive) => set({ isReroutingActive: Boolean(isReroutingActive) }),
  setStepDistLabel: (stepDistLabel) => set({ stepDistLabel }),
  setArrivalClockTime: (arrivalClockTime) => set({ arrivalClockTime }),
  setArrivalVisible: (arrivalVisible) => set({ arrivalVisible }),

  aiMessages: [],
  aiThinking: false,
  addAIMessage: (msg) => {
    if (!msg || !msg.role || !msg.content) return
    set(s => ({ aiMessages: [...s.aiMessages, { id: msg.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: msg.role, content: String(msg.content) }] }))
  },
  setAIThinking: (aiThinking) => set({ aiThinking: Boolean(aiThinking) }),
  clearAIChat: () => set({ aiMessages: [], aiThinking: false }),

  showPOI: false,
  showSettings: false,
  showWaypoints: false,
  showRouteStops: false,
  showNavSidebar: false,
  poiCategory: 'food',
  setShowPOI: (showPOI) => set({ showPOI }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setShowWaypoints: (showWaypoints) => set({ showWaypoints }),
  setShowRouteStops: (showRouteStops) => set({ showRouteStops }),
  setShowNavSidebar: (showNavSidebar) => set({ showNavSidebar }),
  setPoiCategory: (poiCategory) => set({ poiCategory }),

  selectedStop: null,
  setSelectedStop: (selectedStop) => set({ selectedStop }),

  startNavigation: () => {
    const { destination, selectedRoute, routeSteps } = get()
    if (!destination || !selectedRoute) return
    const nextSteps = Array.isArray(routeSteps) && routeSteps.length > 0 ? routeSteps : (Array.isArray(selectedRoute.steps) ? selectedRoute.steps : [])
    set({ phase: PHASE.NAVIGATING, routeSteps: nextSteps, currentStepIndex: 0, currentLegIndex: 0, showRouteStops: false, showNavSidebar: false, rerouteAvailable: false, rerouteTimeSave: '', stepDistLabel: '', arrivalClockTime: '', arrivalVisible: false })
  },
  endNavigation: () => set(makeNavResetPatch(PHASE.IDLE)),
  enterSketch: () => set({ phase: PHASE.SKETCHING }),
  exitSketch: () => set({ phase: PHASE.IDLE }),
  openAI: () => set(s => ({ prevPhase: s.phase === PHASE.AI_CHAT ? (s.prevPhase || PHASE.IDLE) : s.phase, phase: PHASE.AI_CHAT })),
  closeAI: () => set(s => ({ phase: s.prevPhase && s.prevPhase !== PHASE.AI_CHAT ? s.prevPhase : PHASE.IDLE })),

  savedPins: loadSavedPins(),
  pinDropMode: false,
  setPinDropMode: (pinDropMode) => set({ pinDropMode: Boolean(pinDropMode) }),
  addSavedPin: (pin) => set(s => {
    if (!pin || !Number.isFinite(pin.lat) || !Number.isFinite(pin.lng)) return {}
    const safePin = { id: pin.id ?? `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: String(pin.name || `Pinned spot ${s.savedPins.length + 1}`), lat: pin.lat, lng: pin.lng, createdAt: pin.createdAt ?? new Date().toISOString() }
    const pins = [safePin, ...s.savedPins].slice(0, 25)
    persistPins(pins)
    return { savedPins: pins, pinDropMode: false }
  }),
  removeSavedPin: (id) => set(s => {
    const pins = s.savedPins.filter(p => p.id !== id)
    persistPins(pins)
    return { savedPins: pins }
  }),

  savedRoute: null,
  saveCurrentRoute: () => {
    const { destination, waypoints } = get()
    if (!destination) return
    set({ savedRoute: { destination, waypoints: [...waypoints] } })
  },
  restoreSavedRoute: () => {
    const { savedRoute } = get()
    if (!savedRoute) return
    set({ destination: savedRoute.destination, waypoints: savedRoute.waypoints, phase: PHASE.ROUTE_PREVIEW })
  },
  clearSavedRoute: () => set({ savedRoute: null }),

  getAllStops: () => {
    const { waypoints, destination } = get()
    const stops = waypoints.map((wp, i) => ({ ...wp, index: i + 1, isFinal: false }))
    if (destination) stops.push({ ...destination, id: destination.id ?? 'destination', index: stops.length + 1, isFinal: true })
    return stops
  },
}))

export default useStore
