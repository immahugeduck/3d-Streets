import { useEffect, useRef, useCallback } from 'react'
import useStore, { PHASE, ROUTE_PREFS } from '../store/appStore'
import { getDirections, haversineM, formatDist, formatDur, pointToLineDistanceM } from '../services/mapboxService'
import { drawRoute, clearRoute } from '../components/Map/MapView'

// ── Constants ─────────────────────────────────────────────────────────────
const STEP_ADVANCE_THRESHOLD_M = 40     // meters to consider step reached
const OFF_ROUTE_THRESHOLD_M    = 60     // meters off route before counting a miss
const OFF_ROUTE_TICKS_REQUIRED = 2      // consecutive ticks off-route before reroute
const ETA_UPDATE_INTERVAL_MS   = 1000   // throttle live ETA updates (1 s)

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

  const setCurrentStepIndex    = useStore(s => s.setCurrentStepIndex)
  const setEta                 = useStore(s => s.setEta)
  const setRemainingDist       = useStore(s => s.setRemainingDist)
  const setRouteOptions        = useStore(s => s.setRouteOptions)
  const setSelectedRoute       = useStore(s => s.setSelectedRoute)
  const setRouteSteps          = useStore(s => s.setRouteSteps)
  const endNavigation          = useStore(s => s.endNavigation)
  const setIsReroutingActive   = useStore(s => s.setIsReroutingActive)
  const setStepDistLabel       = useStore(s => s.setStepDistLabel)
  const setArrivalClockTime    = useStore(s => s.setArrivalClockTime)

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
    setIsReroutingActive(true)

    const loc = userLocationRef.current
    const dest = useStore.getState().destination
    const wps = useStore.getState().waypoints
    const pref = ROUTE_PREFS[useStore.getState().routePref]

    if (!loc || !dest) {
      isRerouting.current = false
      setIsReroutingActive(false)
      return
    }

    console.log(`[nav] Rerouting: ${reason}`)

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
        setIsReroutingActive(false)
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
      lastEtaUpdate.current = 0   // force immediate ETA recalc after reroute
    } catch (err) {
      console.error('[nav] Reroute failed:', err)
    }

    isRerouting.current = false
    setIsReroutingActive(false)
  }, [setRouteOptions, setSelectedRoute, setRouteSteps, setEta, setRemainingDist, setIsReroutingActive])

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

    // Distance to the NEXT maneuver = how far to the upcoming turn.
    // Using the next step's maneuver location rather than the current step's
    // start location (which is behind us) gives a correct decreasing countdown.
    const nextManeuver = routeSteps[currentStepIndex + 1]
    const currentStep  = routeSteps[currentStepIndex]
    let distToNextManeuver = 0
    if (nextManeuver?.location) {
      distToNextManeuver = haversineM(
        userLocation.lat, userLocation.lng,
        nextManeuver.location[1], nextManeuver.location[0]
      )
    } else if (currentStep?.location) {
      // On the last step — measure to the destination maneuver point
      distToNextManeuver = haversineM(
        userLocation.lat, userLocation.lng,
        currentStep.location[1], currentStep.location[0]
      )
    }

    // All steps from currentStepIndex + 1 onward (roads AFTER the next turn)
    const futureSteps = routeSteps.slice(currentStepIndex + 1)
    const futureDistM = futureSteps.reduce((acc, s) => acc + (s.distanceM ?? 0), 0)
    const futureDurS  = futureSteps.reduce((acc, s) => acc + (s.durationS  ?? 0), 0)

    const totalRemainingM = distToNextManeuver + futureDistM

    // ETA: use live speed when moving, route-average when stopped
    const speedMS = speedMPH * 0.44704
    let etaSeconds
    if (speedMS > 2) {
      etaSeconds = totalRemainingM / speedMS
    } else {
      const stepDistM  = Math.max(currentStep?.distanceM ?? 1, 1)
      const partialDur = (currentStep?.durationS ?? 0) * Math.min(distToNextManeuver / stepDistM, 1)
      etaSeconds = partialDur + futureDurS
    }

    // Wall-clock arrival time (e.g. "2:34 PM")
    const arrival = new Date(Date.now() + etaSeconds * 1000)
    const hh = arrival.getHours()
    const mm = arrival.getMinutes()
    const ampm = hh >= 12 ? 'PM' : 'AM'
    const h12  = hh % 12 || 12
    setArrivalClockTime(`${h12}:${String(mm).padStart(2, '0')} ${ampm}`)

    setStepDistLabel(formatDist(distToNextManeuver))
    setRemainingDist(formatDist(totalRemainingM))
    setEta(formatDur(etaSeconds))
  }, [userLocation, phase, currentStepIndex, routeSteps, selectedRoute, speedMPH, routeLocked,
      triggerReroute, setCurrentStepIndex, endNavigation,
      setRemainingDist, setEta, setStepDistLabel, setArrivalClockTime])

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
