import { useEffect, useRef, useCallback } from 'react'
import useStore, { PHASE, ROUTE_PREFS } from '../store/appStore'
import { getDirections, haversineM, formatDist, formatDur, pointToLineDistanceM } from '../services/mapboxService'
import { drawRoute, clearRoute } from '../components/Map/MapView'

// ── Constants ─────────────────────────────────────────────────────────────
const STEP_ADVANCE_THRESHOLD_M = 40     // meters to consider step reached
const OFF_ROUTE_THRESHOLD_M = 50        // meters off route before rerouting
const OFF_ROUTE_TICKS_REQUIRED = 3      // consecutive ticks off-route before reroute
const ETA_UPDATE_INTERVAL_MS = 2000     // throttle live ETA updates

export function useNavigationProgress() {
  const phase            = useStore(s => s.phase)
  const userLocation     = useStore(s => s.userLocation)
  const routeSteps       = useStore(s => s.routeSteps)
  const currentStepIndex = useStore(s => s.currentStepIndex)
  const waypoints        = useStore(s => s.waypoints)
  const destination      = useStore(s => s.destination)
  const routePref        = useStore(s => s.routePref)
  const selectedRoute    = useStore(s => s.selectedRoute)
  const speedMPH         = useStore(s => s.speedMPH)
  const routeLocked      = useStore(s => s.routeLocked)

  const setCurrentStepIndex = useStore(s => s.setCurrentStepIndex)
  const setEta              = useStore(s => s.setEta)
  const setRemainingDist    = useStore(s => s.setRemainingDist)
  const setRouteOptions     = useStore(s => s.setRouteOptions)
  const setSelectedRoute    = useStore(s => s.setSelectedRoute)
  const setRouteSteps       = useStore(s => s.setRouteSteps)
  const endNavigation       = useStore(s => s.endNavigation)

  // Refs for state that shouldn't trigger re-renders
  const userLocationRef   = useRef(userLocation)
  const isRerouting       = useRef(false)
  const offRouteCount     = useRef(0)
  const lastEtaUpdate     = useRef(0)

  // Keep location ref fresh
  useEffect(() => {
    userLocationRef.current = userLocation
  }, [userLocation])

  // ── Snapshot of route state at navigation start ─────────────────────────
  const committedRef = useRef(null)

  useEffect(() => {
    if (phase === PHASE.NAVIGATING) {
      committedRef.current = {
        waypointIds: waypoints.map(w => w.id).join(','),
        destKey: destination ? `${destination.lat},${destination.lng}` : null,
      }
      offRouteCount.current = 0
    } else {
      committedRef.current = null
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reusable reroute function ───────────────────────────────────────────
  const triggerReroute = useCallback(async (reason = 'unknown') => {
    if (isRerouting.current) return
    isRerouting.current = true

    const loc = userLocationRef.current
    const dest = useStore.getState().destination
    const wps = useStore.getState().waypoints
    const pref = ROUTE_PREFS[useStore.getState().routePref]

    if (!loc || !dest) {
      isRerouting.current = false
      return
    }

    console.log(`[v0] Rerouting: ${reason}`)

    try {
      const routes = await getDirections({
        origin: loc,
        destination: dest,
        waypoints: wps,
        profile: pref.profile,
        exclude: pref.exclude,
      })

      if (!routes?.length) {
        isRerouting.current = false
        return
      }

      setRouteOptions(routes)
      setSelectedRoute(routes[0])
      setRouteSteps(routes[0].steps)
      setEta(routes[0].durationLabel)
      setRemainingDist(routes[0].distanceLabel)

      // Update committed snapshot
      if (committedRef.current) {
        committedRef.current = {
          waypointIds: wps.map(w => w.id).join(','),
          destKey: `${dest.lat},${dest.lng}`,
        }
      }

      clearRoute()
      routes.forEach((r, i) =>
        drawRoute({ type: 'Feature', geometry: r.geometry }, i > 0)
      )

      offRouteCount.current = 0
    } catch (err) {
      console.error('[v0] Reroute failed:', err)
    }

    isRerouting.current = false
  }, [setRouteOptions, setSelectedRoute, setRouteSteps, setEta, setRemainingDist])

  // ── Step advancement + live ETA/distance + off-route detection ──────────
  useEffect(() => {
    if (phase !== PHASE.NAVIGATING || !userLocation || routeSteps.length === 0) return

    const now = Date.now()

    // ─── Step advancement ─────────────────────────────────────────────────
    const nextStep = routeSteps[currentStepIndex + 1]
    if (nextStep?.location) {
      const dist = haversineM(
        userLocation.lat, userLocation.lng,
        nextStep.location[1], nextStep.location[0]
      )
      if (dist < STEP_ADVANCE_THRESHOLD_M) {
        setCurrentStepIndex(currentStepIndex + 1)
        offRouteCount.current = 0 // back on track
        return
      }
    }

    // ─── Detect arrival at final destination ──────────────────────────────
    const lastStep = routeSteps[routeSteps.length - 1]
    if (currentStepIndex >= routeSteps.length - 1 && lastStep?.location) {
      const dist = haversineM(
        userLocation.lat, userLocation.lng,
        lastStep.location[1], lastStep.location[0]
      )
      if (dist < STEP_ADVANCE_THRESHOLD_M) {
        endNavigation()
        return
      }
    }

    // ─── Off-route detection (only if route not locked) ───────────────────
    if (!routeLocked && selectedRoute?.geometry?.coordinates) {
      const distToRoute = pointToLineDistanceM(
        { lat: userLocation.lat, lng: userLocation.lng },
        selectedRoute.geometry.coordinates
      )

      if (distToRoute > OFF_ROUTE_THRESHOLD_M) {
        offRouteCount.current++
        if (offRouteCount.current >= OFF_ROUTE_TICKS_REQUIRED && !isRerouting.current) {
          triggerReroute('off-route')
          return
        }
      } else {
        offRouteCount.current = 0
      }
    }

    // ─── Live ETA/distance calculation (throttled) ────────────────────────
    if (now - lastEtaUpdate.current < ETA_UPDATE_INTERVAL_MS) return
    lastEtaUpdate.current = now

    // Distance from user to the current step's maneuver point
    const currentStep = routeSteps[currentStepIndex]
    let distToCurrentManeuver = 0
    if (currentStep?.location) {
      distToCurrentManeuver = haversineM(
        userLocation.lat, userLocation.lng,
        currentStep.location[1], currentStep.location[0]
      )
    }

    // Sum remaining steps from currentStepIndex + 1 onward
    const futureSteps = routeSteps.slice(currentStepIndex + 1)
    const futureDistM = futureSteps.reduce((acc, s) => acc + (s.distanceM ?? 0), 0)
    const futureDurS = futureSteps.reduce((acc, s) => acc + (s.durationS ?? 0), 0)

    const totalRemainingM = distToCurrentManeuver + futureDistM

    // Calculate ETA: use current speed if moving, otherwise route estimate
    const speedMS = speedMPH * 0.44704 // mph to m/s
    let etaSeconds
    if (speedMS > 2) {
      // Moving: estimate based on current speed
      etaSeconds = totalRemainingM / speedMS
    } else {
      // Stopped or slow: use route's average estimate
      const currentStepDurS = currentStep?.durationS ?? 0
      const partialDur = currentStepDurS * (distToCurrentManeuver / (currentStep?.distanceM || 1))
      etaSeconds = partialDur + futureDurS
    }

    setRemainingDist(formatDist(totalRemainingM))
    setEta(formatDur(etaSeconds))
  }, [userLocation, phase, currentStepIndex, routeSteps, selectedRoute, speedMPH, routeLocked, triggerReroute, setCurrentStepIndex, endNavigation, setRemainingDist, setEta])

  // ── Re-route when waypoints or destination change during navigation ─────
  useEffect(() => {
    if (phase !== PHASE.NAVIGATING || !destination) return
    if (!committedRef.current) return
    if (isRerouting.current) return

    const currentWaypointIds = waypoints.map(w => w.id).join(',')
    const currentDestKey = `${destination.lat},${destination.lng}`

    const changed =
      currentWaypointIds !== committedRef.current.waypointIds ||
      currentDestKey !== committedRef.current.destKey

    if (!changed) return

    triggerReroute('waypoints/destination changed')
  }, [waypoints, destination, phase, triggerReroute])
}
