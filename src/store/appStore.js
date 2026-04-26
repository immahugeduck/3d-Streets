import { create } from 'zustand'

// ── Phase constants ───────────────────────────────────────────────────────
export const PHASE = {
  IDLE:          'IDLE',
  ROUTE_PREVIEW: 'ROUTE_PREVIEW',
  NAVIGATING:    'NAVIGATING',
  SKETCHING:     'SKETCHING',
  AI_CHAT:       'AI_CHAT',
}

const PHASE_VALUES = new Set(Object.values(PHASE))

function makeNavResetPatch(phase = PHASE.IDLE) {
  return {
    phase,
    routeOptions:       [],
    selectedRoute:      null,
    routeSteps:         [],
    currentStepIndex:   0,
    currentLegIndex:    0,
    legStats:           [],
    eta:                '--:--',
    remainingDist:      '— mi',
    rerouteAvailable:   false,
    rerouteTimeSave:    '',
    showRouteStops:     false,
    showNavSidebar:     false,
    selectedStop:       null,
    routeLocked:        false,
    isReroutingActive:  false,
  }
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
  setPhase:  (phase) => {
    if (!PHASE_VALUES.has(phase)) return
    set({ phase })
  },

  // ── Map config ────────────────────────────────────────────────────────
  mapStyle:    'dark',
  is3D:        true,
  showTraffic: false,
  mapRef:      null,
  drivingView: true,  // First-person driving perspective during navigation
  setMapStyle:    (mapStyle)    => set({ mapStyle }),
  setIs3D:        (is3D)        => set({ is3D }),
  setShowTraffic: (showTraffic) => set({ showTraffic }),
  setMapRef:      (mapRef)      => set({ mapRef }),
  setDrivingView: (drivingView) => set({ drivingView }),
  toggleDrivingView: () => set(s => ({ drivingView: !s.drivingView })),

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
  setDestination:     (destination) => {
    if (!destination || destination.lat == null || destination.lng == null) return
    set({
      ...makeNavResetPatch(PHASE.ROUTE_PREVIEW),
      destination,
    })
  },
  setDestinationOnly: (destination) => {
    if (!destination || destination.lat == null || destination.lng == null) return
    set({ destination })
  },
  setWaypoints:       (waypoints)   => set({
    waypoints: Array.isArray(waypoints) ? waypoints.filter(Boolean) : [],
  }),
  addWaypoint:        (wp)          => {
    if (!wp || wp.lat == null || wp.lng == null) return
    set(s => {
      if (s.waypoints.some(x => x.id && wp.id && x.id === wp.id)) return {}
      if (s.waypoints.length >= 8) return {}
      return { waypoints: [...s.waypoints, wp] }
    })
  },
  removeWaypoint:     (id)          => set(s => ({
    waypoints: s.waypoints.filter(w => w.id !== id),
    selectedStop: s.selectedStop?.id === id ? null : s.selectedStop,
  })),
  setRoutePref:     (routePref)     => set({ routePref }),
  setRouteOptions:  (routeOptions)  => set({ routeOptions: Array.isArray(routeOptions) ? routeOptions : [] }),
  setSelectedRoute: (selectedRoute) => set({
    selectedRoute: selectedRoute ?? null,
    routeSteps: Array.isArray(selectedRoute?.steps) ? selectedRoute.steps : [],
    currentStepIndex: 0,
  }),

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
  setLegStats: (legStats) => set({ legStats: Array.isArray(legStats) ? legStats : [] }),
  advanceLeg: () => {
    const { currentLegIndex, getAllStops } = get()
    const stops = getAllStops()
    const next  = currentLegIndex + 1

    if (next >= stops.length) {
      // Completed all legs — end navigation
      set(makeNavResetPatch(PHASE.IDLE))
    } else {
      set({ currentLegIndex: next })
    }
  },

  // ── Navigation state ──────────────────────────────────────────────────
  routeSteps:       [],
  currentStepIndex: 0,
  eta:              '--:--',
  remainingDist:    '— mi',
  speedMPH:          0,
  speedLimit:        65,
  showSpeedHUD:      true,
  rerouteAvailable:  false,
  rerouteTimeSave:   '',
  isReroutingActive: false,
  setRouteSteps:       (routeSteps)       => set(s => {
    const safeSteps = Array.isArray(routeSteps) ? routeSteps : []
    const maxIndex = Math.max(0, safeSteps.length - 1)
    return {
      routeSteps: safeSteps,
      currentStepIndex: Math.min(s.currentStepIndex, maxIndex),
    }
  }),
  setCurrentStepIndex: (currentStepIndex) => set(s => {
    const maxIndex = Math.max(0, (s.routeSteps?.length || 1) - 1)
    const safeIndex = Number.isFinite(currentStepIndex)
      ? Math.min(Math.max(0, Math.floor(currentStepIndex)), maxIndex)
      : 0
    return { currentStepIndex: safeIndex }
  }),
  setEta:              (eta)              => set({ eta }),
  setRemainingDist:    (remainingDist)    => set({ remainingDist }),
  setSpeedMPH:         (speedMPH)         => set({ speedMPH }),
  setSpeedLimit:       (speedLimit)       => set({ speedLimit }),
  setShowSpeedHUD:     (showSpeedHUD)     => set({ showSpeedHUD }),
  setRerouteAvailable: (rerouteAvailable, rerouteTimeSave = '') =>
    set({ rerouteAvailable, rerouteTimeSave }),
  setIsReroutingActive: (isReroutingActive) => set({ isReroutingActive: Boolean(isReroutingActive) }),

  // ── AI copilot state ─────────────────────────────────────────────────
  aiMessages: [],
  aiThinking: false,
  addAIMessage: (msg) => {
    if (!msg || !msg.role || !msg.content) return
    set(s => ({
      aiMessages: [
        ...s.aiMessages,
        {
          id: msg.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: msg.role,
          content: String(msg.content),
        },
      ],
    }))
  },
  setAIThinking: (aiThinking) => set({ aiThinking: Boolean(aiThinking) }),
  clearAIChat: () => set({ aiMessages: [], aiThinking: false }),

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
  startNavigation: () => {
    const { destination, selectedRoute, routeSteps } = get()
    if (!destination || !selectedRoute) return

    const nextSteps = Array.isArray(routeSteps) && routeSteps.length > 0
      ? routeSteps
      : (Array.isArray(selectedRoute.steps) ? selectedRoute.steps : [])

    set({
      phase:            PHASE.NAVIGATING,
      routeSteps:       nextSteps,
      currentStepIndex: 0,
      currentLegIndex:  0,
      showRouteStops:   false,
      showNavSidebar:   false,
      routeLocked:      false,
      rerouteAvailable: false,
      rerouteTimeSave:  '',
    })
  },

  endNavigation: () => set(makeNavResetPatch(PHASE.IDLE)),

  enterSketch: () => set({ phase: PHASE.SKETCHING }),
  exitSketch:  () => set({ phase: PHASE.IDLE }),

  // Track prevPhase so AICopilot can return to the right state on close
  openAI: () => set(s => ({
    prevPhase: s.phase === PHASE.AI_CHAT ? (s.prevPhase || PHASE.IDLE) : s.phase,
    phase: PHASE.AI_CHAT,
  })),
  closeAI: () => set(s => ({
    phase: s.prevPhase && s.prevPhase !== PHASE.AI_CHAT ? s.prevPhase : PHASE.IDLE,
  })),

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
