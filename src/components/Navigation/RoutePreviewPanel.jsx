import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import useStore, { ROUTE_PREFS, PHASE } from '../../store/appStore'
import { getDirections } from '../../services/mapboxService'
import { generateTripSummary } from '../../services/anthropicService'
import { drawRoute, fitRoute, clearRoute } from '../Map/MapView'
import styles from './RoutePreviewPanel.module.css'

export default function RoutePreviewPanel() {
  const [loading, setLoading]     = useState(true)
  const [aiSummary, setAiSummary] = useState('')

  const destination    = useStore(s => s.destination)
  const userLocation   = useStore(s => s.userLocation)
  const waypoints      = useStore(s => s.waypoints)
  const routePref      = useStore(s => s.routePref)
  const setRoutePref   = useStore(s => s.setRoutePref)
  const routeOptions   = useStore(s => s.routeOptions)
  const setRouteOptions = useStore(s => s.setRouteOptions)
  const selectedRoute  = useStore(s => s.selectedRoute)
  const setSelectedRoute = useStore(s => s.setSelectedRoute)
  const setRouteSteps  = useStore(s => s.setRouteSteps)
  const setEta         = useStore(s => s.setEta)
  const setRemainingDist = useStore(s => s.setRemainingDist)
  const setPhase       = useStore(s => s.setPhase)
  const setShowWaypoints = useStore(s => s.setShowWaypoints)
  const enterSketch    = useStore(s => s.enterSketch)
  const startNavigation = useStore(s => s.startNavigation)

  useEffect(() => {
    if (destination && userLocation) loadRoute()
  }, [destination, routePref, waypoints.length])

  async function loadRoute() {
    setLoading(true)
    const pref = ROUTE_PREFS[routePref]
    const origin = userLocation

    const routes = await getDirections({
      origin,
      destination,
      waypoints,
      profile: pref.profile,
      exclude: pref.exclude,
    })

    setLoading(false)
    if (!routes?.length) return

    setRouteOptions(routes)
    setSelectedRoute(routes[0])
    setRouteSteps(routes[0].steps)
    setEta(routes[0].durationLabel)
    setRemainingDist(routes[0].distanceLabel)

    // Draw routes on map
    clearRoute()
    routes.forEach((r, i) => drawRoute({ type: 'Feature', geometry: r.geometry }, i > 0))
    fitRoute(routes[0].geometry.coordinates)

    // AI trip summary
    const summary = await generateTripSummary({
      distance: routes[0].distanceLabel,
      duration: routes[0].durationLabel,
      destination: destination.name,
    })
    if (summary) setAiSummary(summary)
  }

  function go() {
    startNavigation()
  }

  function cancel() {
    clearRoute()
    setPhase(PHASE.IDLE)
    setRouteOptions([])
    setSelectedRoute(null)
  }

  return (
    <motion.div
      className={styles.panel}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 40 }}
    >
      {/* Handle */}
      <div className={styles.handle} />

      {/* Destination header */}
      <div className={styles.header}>
        <div className={styles.destInfo}>
          <div className={styles.destName}>{destination?.name ?? 'Destination'}</div>
          <div className={styles.destAddr}>{destination?.address}</div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.stopBtn} onClick={() => setShowWaypoints(true)}>
            + Stop
          </button>
          <button className={styles.cancelBtn} onClick={cancel}>✕</button>
        </div>
      </div>

      {/* Route preference tabs */}
      <div className={styles.prefScroll}>
        {Object.entries(ROUTE_PREFS).map(([key, pref]) => (
          <button
            key={key}
            className={`${styles.prefTab} ${routePref === key ? styles.active : ''}`}
            onClick={() => setRoutePref(key)}
          >
            <span>{pref.icon}</span>
            <span>{pref.label}</span>
          </button>
        ))}
      </div>

      {/* Route cards */}
      <div className={styles.routeScroll}>
        {loading ? (
          <>
            <div className={`${styles.routeCard} ${styles.shimmer}`} />
            <div className={`${styles.routeCard} ${styles.shimmer}`} />
          </>
        ) : routeOptions.map((route, i) => (
          <button
            key={route.id}
            className={`${styles.routeCard} ${selectedRoute?.id === route.id ? styles.selected : ''}`}
            onClick={() => {
              setSelectedRoute(route)
              setRouteSteps(route.steps)
              drawRoute({ type: 'Feature', geometry: route.geometry }, i > 0)
            }}
          >
            {route.isRecommended && <div className={styles.bestBadge}>BEST</div>}
            <div className={styles.routeEta}>{route.durationLabel}</div>
            <div className={styles.routeDist}>{route.distanceLabel}</div>
            {route.trafficDelayS > 60 && (
              <div className={styles.trafficDelay}>
                +{Math.round(route.trafficDelayS / 60)}m traffic
              </div>
            )}
            {route.aiDescription && (
              <div className={styles.aiDesc}>✦ {route.aiDescription}</div>
            )}
          </button>
        ))}
      </div>

{/* AI summary */}
  {(aiSummary || selectedRoute?.aiDescription) && (
  <div className={styles.aiSummary}>
  <span className={styles.aiSummaryIcon}>✦</span>
  <span>{selectedRoute?.aiDescription || aiSummary}</span>
  </div>
  )}

      {/* Action buttons */}
      <div className={styles.actions}>
        <button className={styles.sketchBtn} onClick={enterSketch}>
          ✏️ Draw Route
        </button>
        <button className={styles.goBtn} onClick={go} disabled={loading || !selectedRoute}>
          ▶ Start
        </button>
      </div>
    </motion.div>
  )
}
