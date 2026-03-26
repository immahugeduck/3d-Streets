import { create } from 'zustand'

// ── Phase constants ───────────────────────────────────────────────────────
export const PHASE = {
  IDLE:          'IDLE',
  ROUTE_PREVIEW: 'ROUTE_PREVIEW',
  NAVIGATING:    'NAVIGATING',
  SKETCHING:     'SKETCHING',
  AI_CHAT:       'AI_CHAT',
}

// ── Map style definitions ─────────────────────────────────────────────────
export const MAP_STYLES = {
  dark: {
    uri:   'mapbox://styles/mapbox/dark-v11',
    label: 'Dark',
    icon:  '🌑',
  },
  satellite: {
    uri:   'mapbox://styles/mapbox/satellite-streets-v12',
    label: 'Satellite',
    icon:  '🛰️',
  },
  streets: {
    uri:   'mapbox://styles/mapbox/streets-v12',
    label: 'Streets',
    icon:  '🗺️',
  },
  outdoors: {
    uri:   'mapbox://styles/mapbox/outdoors-v12',
    label: 'Terrain',
    icon:  '⛰️',
  },
  light: {
    uri:   'mapbox://styles/mapbox/light-v11',
    label: 'Light',
    icon:  '☀️',
  },
}

// ── Route preference definitions ──────────────────────────────────────────
export const ROUTE_PREFS = {
  fastest: {
    label:   'Fastest',
    icon:    '⚡',
    profile: 'mapbox/driving-traffic',
    exclude: null,
  },
  shortest: {
    label:   'Shortest',
    icon:    '📏',
    profile: 'mapbox/driving',
    exclude: null,
  },
  scenic: {
    label:   'Scenic',
    icon:    '🌿',
    profile: 'mapbox/driving',
    exclude: 'motorway',
  },
  avoid_tolls: {
    label:   'No Tolls',
    icon:    '🚫',
    profile: 'mapbox/driving-traffic',
    exclude: 'toll',
  },
  avoid_highways: {
    label:   'Local',
    icon:    '🏘️',
    profile: 'mapbox/driving-traffic',
    exclude: 'motorway',
  },
}

// ── Store ─────────────────────────────────────────────────────────────────
const useStore = create((set, get) => ({

  // ── App phase ─────────────────────────────────────────────────────────
  phase:     PHASE.IDLE,
  prevPhase: PHASE.IDLE,
  setPhase:  (phase) => set({ phase }),

  // ── Map config ────────────────────────────────────────────────────────
  mapStyle:    'dark',
  is3D:        true,
  showTraffic: false,
  mapRef:      null,
  setMapStyle:    (mapStyle)    => set({ mapStyle }),
  setIs3D:        (is3D)        => set({ is3D }),
  setShowTraffic: (showTraffic) => set({ showTraffic }),
  setMapRef:      (mapRef)      => set({ mapRef }),

  // ── User location ─────────────────────────────────────────────────────
  userLocation: null,
  userHeading:  null,
  setUserLocation: (userLocation) => set({ userLocation }),
  setUserHeading:  (userHeading)  => set({ userHeading }),

  // ── Route planning ────────────────────────────────────────────────────
  destination:   null,
  waypoints:     [],
  routePref:     'fastest',
  routeOptions:  [],
  selectedRoute: null,
  setDestination:     (destination) => set({ destination, phase: PHASE.ROUTE_PREVIEW }),
  setDestinationOnly: (destination) => set({ destination }),
  setWaypoints:       (waypoints)   => set({ waypoints }),
  addWaypoint:        (wp)          => set(s => ({ waypoints: [...s.waypoints, wp] })),
  removeWaypoint:     (id)          => set(s => ({
    waypoints: s.waypoints.filter(w => w.id !== id),
  })),
  setRoutePref:     (routePref)     => set({ routePref }),
  setRouteOptions:  (routeOptions)  => set({ routeOptions }),
  setSelectedRoute: (selectedRoute) => set({ selectedRoute }),

  // ── Route locking ─────────────────────────────────────────────────────
  // When locked: deviation warnings are suppressed, no auto-reroute prompt
  routeLocked: false,
  setRouteLocked:  (routeLocked) => set({ routeLocked }),
  toggleRouteLock: () => set(s => ({
    routeLocked:      !s.routeLocked,
    // Dismiss any pending reroute banner when user locks the route
    rerouteAvailable: s.routeLocked ? s.rerouteAvailable : false,
    rerouteTimeSave:  s.routeLocked ? s.rerouteTimeSave  : '',
  })),

  // ── Multi-leg navigation ──────────────────────────────────────────────
  // currentLegIndex: which stop we're currently heading toward (0 = first stop/destination)
  // legStats: per-leg distance + ETA breakdown set when route loads
  currentLegIndex: 0,
  legStats: [],       // [{ distanceLabel, durationLabel, distance, duration }]
  setLegStats: (legStats) => set({ legStats }),
  advanceLeg: () => {
    const { currentLegIndex, getAllStops } = get()
    const stops = getAllStops()
    const next  = currentLegIndex + 1

    if (next >= stops.length) {
      // Completed all legs — end navigation
      set({
        phase:            PHASE.IDLE,
        routeSteps:       [],
        currentStepIndex: 0,
        currentLegIndex:  0,
        legStats:         [],
        rerouteAvailable: false,
        showRouteStops:   false,
        showNavSidebar:   false,
        selectedStop:     null,
        routeLocked:      false,
      })
    } else {
      set({ currentLegIndex: next })
    }
  },

  // ── Navigation state ──────────────────────────────────────────────────
  routeSteps:       [],
  currentStepIndex: 0,
  eta:              '--:--',
  remainingDist:    '— mi',
  speedMPH:         0,
  speedLimit:       65,
  showSpeedHUD:     true,
  rerouteAvailable: false,
  rerouteTimeSave:  '',
  setRouteSteps:       (routeSteps)       => set({ routeSteps }),
  setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex }),
  setEta:              (eta)              => set({ eta }),
  setRemainingDist:    (remainingDist)    => set({ remainingDist }),
  setSpeedMPH:         (speedMPH)         => set({ speedMPH }),
  setSpeedLimit:       (speedLimit)       => set({ speedLimit }),
  setShowSpeedHUD:     (showSpeedHUD)     => set({ showSpeedHUD }),
  setRerouteAvailable: (rerouteAvailable, rerouteTimeSave = '') =>
    set({ rerouteAvailable, rerouteTimeSave }),

  // ── Panel visibility ──────────────────────────────────────────────────
  showPOI:        false,
  showSettings:   false,
  showWaypoints:  false,
  showRouteStops: false,
  showNavSidebar: false,
  poiCategory:    'food',
  setShowPOI:        (showPOI)        => set({ showPOI }),
  setShowSettings:   (showSettings)   => set({ showSettings }),
  setShowWaypoints:  (showWaypoints)  => set({ showWaypoints }),
  setShowRouteStops: (showRouteStops) => set({ showRouteStops }),
  setShowNavSidebar: (showNavSidebar) => set({ showNavSidebar }),
  setPoiCategory:    (poiCategory)    => set({ poiCategory }),

  // ── Selected stop (for preview/highlight) ────────────────────────────
  selectedStop: null,
  setSelectedStop: (selectedStop) => set({ selectedStop }),

  // ── Navigation lifecycle ──────────────────────────────────────────────
  startNavigation: () => set({
    phase:            PHASE.NAVIGATING,
    currentStepIndex: 0,
    currentLegIndex:  0,
    showRouteStops:   false,
    showNavSidebar:   false,
    routeLocked:      false,
  }),

  endNavigation: () => set({
    phase:            PHASE.IDLE,
    routeSteps:       [],
    currentStepIndex: 0,
    currentLegIndex:  0,
    legStats:         [],
    rerouteAvailable: false,
    showRouteStops:   false,
    showNavSidebar:   false,
    selectedStop:     null,
    routeLocked:      false,
  }),

  enterSketch: () => set({ phase: PHASE.SKETCHING }),
  exitSketch:  () => set({ phase: PHASE.IDLE }),

  // Track prevPhase so AICopilot can return to the right state on close
  openAI: () => set(s => ({ prevPhase: s.phase, phase: PHASE.AI_CHAT })),
  closeAI: () => set(s => ({ phase: s.prevPhase || PHASE.IDLE })),

  // ── Saved route (Compass bookmark) ───────────────────────────────────
  savedRoute: null,
  saveCurrentRoute: () => {
    const { destination, waypoints } = get()
    if (!destination) return
    set({ savedRoute: { destination, waypoints: [...waypoints] } })
  },
  restoreSavedRoute: () => {
    const { savedRoute } = get()
    if (!savedRoute) return
    set({
      destination: savedRoute.destination,
      waypoints:   savedRoute.waypoints,
      phase:       PHASE.ROUTE_PREVIEW,
    })
  },
  clearSavedRoute: () => set({ savedRoute: null }),

  // ── Helper: get all stops in order ───────────────────────────────────
  // Returns [waypoint1, waypoint2, ..., destination]
  getAllStops: () => {
    const { waypoints, destination } = get()
    const stops = waypoints.map((wp, i) => ({
      ...wp,
      index:   i + 1,
      isFinal: false,
    }))
    if (destination) {
      stops.push({
        ...destination,
        id:      destination.id ?? 'destination',
        index:   stops.length + 1,
        isFinal: true,
      })
    }
    return stops
  },
}))

export default useStore

cat > src/components/Map/MapView.jsx
