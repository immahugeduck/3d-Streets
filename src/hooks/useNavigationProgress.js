import { useEffect, useRef } from 'react'
import useStore, { PHASE, ROUTE_PREFS } from '../store/appStore'
import { getDirections, haversineM, formatDist, formatDur } from '../services/mapboxService'
import { drawRoute, clearRoute } from '../components/Map/MapView'

// Radius (metres) at which the user is considered to have reached the next maneuver point
const STEP_ADVANCE_THRESHOLD_M = 40

export function useNavigationProgress() {
  const phase            = useStore(s => s.phase)
  const userLocation     = useStore(s => s.userLocation)
  const routeSteps       = useStore(s => s.routeSteps)
  const currentStepIndex = useStore(s => s.currentStepIndex)
  const waypoints        = useStore(s => s.waypoints)
  const destination      = useStore(s => s.destination)
  const routePref        = useStore(s => s.routePref)

  const setCurrentStepIndex = useStore(s => s.setCurrentStepIndex)
  const setEta              = useStore(s => s.setEta)
  const setRemainingDist    = useStore(s => s.setRemainingDist)
  const setRouteOptions     = useStore(s => s.setRouteOptions)
  const setSelectedRoute    = useStore(s => s.setSelectedRoute)
  const endNavigation       = useStore(s => s.endNavigation)

  // Refs so re-route effect doesn't re-fire on every location tick
  const userLocationRef  = useRef(userLocation)
  const isRerouting      = useRef(false)

  // Always keep the location ref fresh without adding it as an effect dep
  useEffect(() => {
    userLocationRef.current = userLocation
  }, [userLocation])

  // ── Snapshot of route state at navigation start ─────────────────────────
  // Used to detect genuine changes (not the initial navigation start)
  const committedRef = useRef(null)

  useEffect(() => {
    if (phase === PHASE.NAVIGATING) {
      committedRef.current = {
        waypointIds: waypoints.map(w => w.id).join(','),
        destKey: destination ? `${destination.lat},${destination.lng}` : null,
      }
    } else {
      committedRef.current = null
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step advancement + live ETA / distance updates ──────────────────────
  useEffect(() => {
    if (phase !== PHASE.NAVIGATING || !userLocation || routeSteps.length === 0) return

    // Advance step when user is within threshold of the next step's maneuver point
    const nextStep = routeSteps[currentStepIndex + 1]
    if (nextStep?.location) {
      const dist = haversineM(
        userLocation.lat, userLocation.lng,
        nextStep.location[1], nextStep.location[0],
      )
      if (dist < STEP_ADVANCE_THRESHOLD_M) {
        setCurrentStepIndex(currentStepIndex + 1)
        return
      }
    }

    // Detect arrival at the final destination (last step)
    const lastStep = routeSteps[routeSteps.length - 1]
    if (currentStepIndex >= routeSteps.length - 1 && lastStep?.location) {
      const dist = haversineM(
        userLocation.lat, userLocation.lng,
        lastStep.location[1], lastStep.location[0],
      )
      if (dist < STEP_ADVANCE_THRESHOLD_M) {
        endNavigation()
        return
      }
    }

    // Recalculate remaining distance and ETA from the current step onward
    const remaining     = routeSteps.slice(currentStepIndex)
    const remainingDistM = remaining.reduce((acc, s) => acc + (s.distanceM ?? 0), 0)
    const remainingDurS  = remaining.reduce((acc, s) => acc + (s.durationS  ?? 0), 0)

    setRemainingDist(formatDist(remainingDistM))
    setEta(formatDur(remainingDurS))
  }, [userLocation, phase, currentStepIndex, routeSteps]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-route when waypoints or destination change during navigation ──────
  useEffect(() => {
    if (phase !== PHASE.NAVIGATING || !destination) return
    if (!committedRef.current) return
    if (isRerouting.current) return

    const currentWaypointIds = waypoints.map(w => w.id).join(',')
    const currentDestKey     = `${destination.lat},${destination.lng}`

    const changed =
      currentWaypointIds !== committedRef.current.waypointIds ||
      currentDestKey     !== committedRef.current.destKey

    if (!changed) return

    // Update committed snapshot so we don't re-trigger immediately
    committedRef.current = { waypointIds: currentWaypointIds, destKey: currentDestKey }

    const loc = userLocationRef.current
    if (!loc) return

    isRerouting.current = true
    const pref = ROUTE_PREFS[routePref]

    getDirections({
      origin:      loc,
      destination,
      waypoints,
      profile:     pref.profile,
      exclude:     pref.exclude,
    }).then(routes => {
      isRerouting.current = false
      if (!routes?.length) return

      setRouteOptions(routes)
      setSelectedRoute(routes[0])
      setEta(routes[0].durationLabel)
      setRemainingDist(routes[0].distanceLabel)

      clearRoute()
      routes.forEach((r, i) =>
        drawRoute({ type: 'Feature', geometry: r.geometry }, i > 0),
      )
    }).catch(() => {
      isRerouting.current = false
    })
  }, [waypoints, destination, phase, routePref]) // eslint-disable-line react-hooks/exhaustive-deps
}
