import { create } from 'zustand'

// App phases
export const PHASE = {
  IDLE:          'idle',
  SEARCHING:     'searching',
  ROUTE_PREVIEW: 'route_preview',
  NAVIGATING:    'navigating',
  SKETCHING:     'sketching',
  AI_CHAT:       'ai_chat',
}

export const MAP_STYLES = {
  dark:      { label: 'Dark',      uri: 'mapbox://styles/mapbox/dark-v11',                icon: '🌑' },
  streets:   { label: 'Streets',   uri: 'mapbox://styles/mapbox/streets-v12',             icon: '🗺️' },
  satellite: { label: 'Satellite', uri: 'mapbox://styles/mapbox/satellite-streets-v12',   icon: '🛰️' },
  terrain:   { label: 'Terrain',   uri: 'mapbox://styles/mapbox/outdoors-v12',            icon: '⛰️' },
  nav:       { label: 'Nav Night', uri: 'mapbox://styles/mapbox/navigation-night-v1',     icon: '🚗' },
}

export const ROUTE_PREFS = {
  fastest:    { label: 'Fastest',     icon: '⚡', profile: 'mapbox/driving-traffic' },
  scenic:     { label: 'Scenic',      icon: '🌿', profile: 'mapbox/driving' },
  noHighways: { label: 'No Highways', icon: '🛣️', profile: 'mapbox/driving', exclude: 'motorway' },
  noTolls:    { label: 'No Tolls',    icon: '💰', profile: 'mapbox/driving', exclude: 'toll' },
  walking:    { label: 'Walking',     icon: '🚶', profile: 'mapbox/walking' },
}

const useStore = create((set, get) => ({
  // ── Phase ──────────────────────────────────
  phase: PHASE.IDLE,
  setPhase: (phase) => set({ phase }),

  // ── Map ────────────────────────────────────
  mapStyle: 'dark',
  setMapStyle: (mapStyle) => set({ mapStyle }),
  is3D: true,
  setIs3D: (is3D) => set({ is3D }),
  showTraffic: true,
  setShowTraffic: (showTraffic) => set({ showTraffic }),
  mapRef: null,
  setMapRef: (mapRef) => set({ mapRef }),

  // ── User location ──────────────────────────
  userLocation: null,
  setUserLocation: (userLocation) => set({ userLocation }),
  userHeading: 0,
  setUserHeading: (userHeading) => set({ userHeading }),
  speedMPH: 0,
  setSpeedMPH: (speedMPH) => set({ speedMPH }),

  // ── Search ─────────────────────────────────
  destination: null,
  setDestination: (destination) => set({ destination }),
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  // ── Route ──────────────────────────────────
  routePref: 'fastest',
  setRoutePref: (routePref) => set({ routePref }),
  routeOptions: [],
  setRouteOptions: (routeOptions) => set({ routeOptions }),
  selectedRoute: null,
  setSelectedRoute: (selectedRoute) => set({ selectedRoute }),
  routeSteps: [],
  setRouteSteps: (routeSteps) => set({ routeSteps }),
  currentStepIndex: 0,
  setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }),

  // ── Navigation HUD ─────────────────────────
  eta: '--',
  setEta: (eta) => set({ eta }),
  remainingDist: '--',
  setRemainingDist: (remainingDist) => set({ remainingDist }),
  speedLimit: 55,
  setSpeedLimit: (speedLimit) => set({ speedLimit }),
  showSpeedHUD: true,
  setShowSpeedHUD: (showSpeedHUD) => set({ showSpeedHUD }),

  // ── Reroute ────────────────────────────────
  rerouteAvailable: false,
  setRerouteAvailable: (rerouteAvailable) => set({ rerouteAvailable }),
  rerouteTimeSave: '',
  setRerouteTimeSave: (rerouteTimeSave) => set({ rerouteTimeSave }),

  // ── Waypoints ──────────────────────────────
  waypoints: [],
  addWaypoint: (wp) => set(s => ({ waypoints: [...s.waypoints, { ...wp, id: Date.now() }] })),
  removeWaypoint: (id) => set(s => ({ waypoints: s.waypoints.filter(w => w.id !== id) })),
  clearWaypoints: () => set({ waypoints: [] }),
  reorderWaypoints: (waypoints) => set({ waypoints }),

  // ── Sketch ─────────────────────────────────
  sketchPoints: [],
  addSketchPoint: (pt) => set(s => ({ sketchPoints: [...s.sketchPoints, pt] })),
  clearSketch: () => set({ sketchPoints: [] }),
  sketchProcessing: false,
  setSketchProcessing: (sketchProcessing) => set({ sketchProcessing }),

  // ── AI Co-pilot ────────────────────────────
  aiMessages: [],
  addAIMessage: (msg) => set(s => ({ aiMessages: [...s.aiMessages, { ...msg, id: Date.now() }] })),
  clearAIMessages: () => set({ aiMessages: [] }),
  aiThinking: false,
  setAIThinking: (aiThinking) => set({ aiThinking }),

  // ── UI Panels ──────────────────────────────
  showSettings: false,
  setShowSettings: (showSettings) => set({ showSettings }),
  showWaypoints: false,
  setShowWaypoints: (showWaypoints) => set({ showWaypoints }),
  showPOI: false,
  setShowPOI: (showPOI) => set({ showPOI }),
  poiCategory: 'food',
  setPoiCategory: (poiCategory) => set({ poiCategory }),
  showStylePicker: false,
  setShowStylePicker: (showStylePicker) => set({ showStylePicker }),

  // ── Computed helpers ───────────────────────
  isNavigating: () => get().phase === PHASE.NAVIGATING,
  isSketching:  () => get().phase === PHASE.SKETCHING,
  isAIOpen:     () => get().phase === PHASE.AI_CHAT,

  startNavigation: () => set({ phase: PHASE.NAVIGATING }),
  endNavigation: () => set({
    phase: PHASE.IDLE,
    destination: null,
    waypoints: [],
    routeSteps: [],
    currentStepIndex: 0,
    eta: '--',
    remainingDist: '--',
    rerouteAvailable: false,
  }),
  enterSketch: () => set({ phase: PHASE.SKETCHING, sketchPoints: [] }),
  exitSketch:  () => set({ phase: PHASE.IDLE, sketchPoints: [] }),
  openAI:      () => set({ phase: PHASE.AI_CHAT }),
  closeAI:     () => set({ phase: PHASE.IDLE }),
}))

export default useStore
